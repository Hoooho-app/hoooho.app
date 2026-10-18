import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { JsonStore } from '../auth/storage/json-store.mjs';
import { CareJourneyService, CareJourneyError, activeCareOwnership } from '../care-journey/service.mjs';
import { JournalIndexService } from '../events/journal-index-service.mjs';
import { QuickRecordService } from '../events/quick-record-service.mjs';
import { activeAllergyRecords } from '../health-profile/profile-section-store.mjs';
const DAY = 86400000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyOf = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
const fail = (message, status = 400, code = 'OBSERVATION_INVALID') => { throw new CareJourneyError(message, status, code); };
const validDays = value => { if (!Number.isInteger(value) || value < 1 || value > 365) fail('观察时间请选择1至365天'); return value; };
const requestId = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) fail('请重新确认本次操作'); return value; };
const foodName = value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 40 || /[\n\r<>]/.test(value)) fail('请输入40字以内的一种食物'); return value.normalize('NFKC').trim(); };
const newestFirst = (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
const formal = (r, now) => !r.deletedAt && r.status !== 'pending' && r.confirmationStatus !== 'pending' && r.confirmed !== false && !['pending', 'external_ai'].includes(r.caseContext?.identity) && r.journal?.timePrecision !== 'unknown' && Number.isFinite(Date.parse(r.occurredAt)) && Date.parse(r.occurredAt) <= now && Number.isFinite(Date.parse(r.createdAt)) && Date.parse(r.createdAt) <= now;
// Only explicit food fields in confirmed diet records qualify. Never derive ingredients
// from product names, pictures, recipes, maternal intake or AI-only previews.
export function observedFoods(record) {
  const diet = record.journal?.diet;
  if (!record.journal?.categories?.includes('diet') || !['feeding', 'complementary', 'meal', 'snack'].includes(diet?.kind) || !Array.isArray(diet.foods)) return [];
  if (diet.kind === 'feeding' && ['breast', 'expressed', 'mixed'].includes(diet.feedingMethod)) return [];
  const original = String(record.sourceText ?? record.rawText ?? record.content ?? '');
  const clauses = (original.match(/[^。！？!?；;，,\n]+[。！？!?；;，,\n]?/g) ?? []).map(x => x.trim()).filter(Boolean);
  return [...new Set(diet.foods.filter(value => typeof value === 'string' && value.trim() && value.length <= 40))].filter(name => {
    const relevant = clauses.filter(clause => clause.includes(name));
    if (!relevant.length) return false;
    return relevant.some(clause => !/[？?]/.test(clause) && !/(?:妈妈|母亲|母乳妈妈|宝妈).{0,12}(?:吃|喝)|(?:打算|准备|计划|要吃|要喝|想吃|想喝|能吃吗|能喝吗|要不要|能否|明天|下次|还没|未曾|从未|没(?:有)?吃|没(?:有)?喝|不吃|不喝|不能吃|没有加|未食用|未进食|未吃|未喝|没碰|不含|无添加|忌口|避免|如果|能不能|可以吃吗)/.test(clause) && !/(?:吃|喝).{0,8}(?:了吗|了没|？|\?)/.test(clause));
  });
}
const sourceOf = r => ({ id: r.id, eventId: r.eventId, occurredAt: r.occurredAt, createdAt: r.createdAt, content: r.content ?? '', amount: r.journal?.diet?.amount ?? '', foodForm: r.journal?.diet?.foodForm ?? '' });
const intakeLabels = { daily: '几乎每天都吃', sometimes: '又吃过几次', none: '之后没有再吃', unknown: '记不清是否继续吃' };
const symptomLabels = { none: '未观察到新增或加重', yes: '有新增或加重', unknown: '不确定是否新增或加重' };
const familyKey = name => /牛奶|牛乳|乳制品|奶酪|酸奶|配方奶/.test(name) ? 'milk' : /鸡蛋|蛋白|蛋黄|全蛋/.test(name) ? 'egg' : /花生/.test(name) ? 'peanut' : /大豆|黄豆|豆腐|豆浆/.test(name) ? 'soy' : keyOf(name);
export class FoodObservationService {
  constructor(options) {
    this.directory = options.dataDirectory;
    this.now = options.now ?? (() => new Date());
    this.care = options.care ?? new CareJourneyService(options);
    this.journal = options.journal ?? new JournalIndexService(options);
    this.quick = options.quickRecords ?? new QuickRecordService(options);
    this.store = new JsonStore(path.join(this.directory, 'food-observations.json'), { preferences: [], observations: [] });
    this.profile = new JsonStore(path.join(this.directory, 'health-profile-sections.json'), { sections: [] });
    this.pending = new Map();
  }
  async entitlement(accountId, account) {
    const grant = activeCareOwnership(account, 'food-observation', this.now());
    const included = Boolean(await this.care.isIncluded(accountId, 'food-observation'));
    return { active: this.care.enabled.has('food-observation') && Boolean(grant || included), included, expiresAt: included ? null : grant?.expiresAt ?? null, balance: account.wallet - account.reservations.filter(r => r.status === 'reserved').reduce((n, r) => n + r.cost, 0), cost: 30, durationDays: 30, available: this.care.enabled.has('food-observation') };
  }
  async cautions(accountId, memberId) {
    const sections = (await this.profile.read()).sections.filter(s => s.accountId === accountId && s.memberId === memberId);
    const allergies = activeAllergyRecords(sections.find(s => s.sectionId === 'allergy')?.records ?? [], memberId).filter(r => (r.category === 'food' || String(r.category ?? r.type ?? '').includes('食')) && !['excluded', 'tolerated', '已排除', '曾经有，目前已耐受'].includes(r.currentStatus ?? r.certainty));
    const avoided = (sections.find(s => s.sectionId === 'dietary-card')?.records ?? []).flatMap(r => r.items ?? []).filter(r => r.visible !== false && ['avoid', 'temporary'].includes(r.group));
    return [...allergies.map(r => r.name ?? r.subject), ...avoided.map(r => r.name)].filter(Boolean);
  }
  async context(accountId, memberId) {
    await this.care.ownedMember(accountId, memberId);
    const [index, cautionNames] = await Promise.all([this.journal.list(accountId, memberId, 'Asia/Shanghai'), this.cautions(accountId, memberId)]);
    const records = index.records.filter(r => formal(r, this.now().getTime()));
    return { records, foods: records.flatMap(record => observedFoods(record).map(name => ({ name, key: keyOf(name), record }))), cautionNames };
  }
  candidates(item, context) {
    if (!item.activated && context.accessActive === false && !item.activationDeadline) return [];
    return context.foods.filter(f => (item.activated || context.accessActive !== false || Date.parse(f.record.createdAt) < Date.parse(item.activationDeadline)) && f.key === item.foodKey && Date.parse(f.record.createdAt) >= Date.parse(item.recordedAfter) && (!item.notBefore || Date.parse(f.record.occurredAt) >= Date.parse(item.notBefore))).map(f => f.record).filter((r, i, rows) => rows.findIndex(x => x.id === r.id) === i).sort((a, b) => -newestFirst(a, b));
  }
  evidence(item, context, snapshot = null) {
    const matching = this.candidates(snapshot ? { ...item, recordedAfter: snapshot.recordedAfter, notBefore: snapshot.notBefore, activated: true } : item, context);
    const startAt = snapshot?.startAt ?? matching[0]?.occurredAt ?? null;
    const dueAt = snapshot?.dueAt ?? (startAt ? new Date(Date.parse(startAt) + item.days * DAY).toISOString() : null);
    const end = dueAt ? Math.min(Date.parse(dueAt), this.now().getTime()) : 0;
    const sources = matching.filter(r => Date.parse(r.occurredAt) >= Date.parse(startAt) && Date.parse(r.occurredAt) <= end).map(sourceOf).sort(newestFirst);
    const symptoms = startAt ? context.records.filter(r => Date.parse(r.occurredAt) >= Date.parse(startAt) && Date.parse(r.occurredAt) <= end && (r.journal?.categories?.includes('symptom') || r.journal?.diet?.reactions?.length)).map(sourceOf).sort(newestFirst) : [];
    return { startAt, dueAt, sources, symptoms, fingerprint: hash({ startAt, dueAt, sources, symptoms }) };
  }
  view(item, context) {
    const latest = item.reviews.at(-1), completed = latest?.round === item.round;
    const evidence = this.evidence(item, context, completed ? latest : null);
    const elapsedDays = evidence.startAt ? Math.min(item.days, Math.max(0, Math.floor((this.now().getTime() - Date.parse(evidence.startAt)) / DAY))) : 0;
    const caution = context.cautionNames.find(name => familyKey(name) === familyKey(item.name));
    const status = item.archived ? 'archived' : completed ? 'complete' : !evidence.startAt ? 'waiting' : Date.parse(evidence.dueAt) <= this.now().getTime() ? 'due' : 'observing';
    const { accountId, requests, ...safe } = item;
    return { ...safe, ...evidence, elapsedDays, status, caution: caution ? `档案已有${caution}相关安排，请按既有安排记录与核对。` : null, reviews: item.reviews.map(review => ({ ...review, sourceChanged: this.evidence(item, context, review).fingerprint !== review.fingerprint })) };
  }
  newItem(accountId, memberId, name, days, recordedAfter, origin, request = null, notBefore = null) {
    return { id: randomUUID(), accountId, memberId, name, foodKey: keyOf(name), days, recordedAfter, notBefore, origin, round: 1, version: 1, archived: false, createdAt: this.now().toISOString(), reviews: [], requests: request ? [request] : [] };
  }
  async reconcile(data, accountId, memberId, context, access) {
    const preference = data.preferences.find(p => p.accountId === accountId && p.memberId === memberId);
    if (preference?.enabled && access.active) {
      const known = new Set(data.observations.filter(o => o.accountId === accountId && o.memberId === memberId).map(o => o.foodKey));
      for (const food of [...context.foods].sort((a, b) => Date.parse(a.record.createdAt) - Date.parse(b.record.createdAt))) {
        if (known.has(food.key) || preference.baseline.includes(food.key) || Date.parse(food.record.createdAt) < Date.parse(preference.enabledAt)) continue;
        if (context.cautionNames.some(n => familyKey(n) === familyKey(food.name))) { preference.baseline.push(food.key); continue; }
        data.observations.push({ ...this.newItem(accountId, memberId, food.name, 7, preference.enabledAt, 'automatic'), activationDeadline: access.expiresAt });
        known.add(food.key);
      }
    }
    for (const item of data.observations.filter(o => o.accountId === accountId && o.memberId === memberId)) {
      if (item.reviews.at(-1)?.round === item.round) continue;
      if (!item.activated && this.candidates(item, context).length) item.activated = true;
      const fingerprint = this.evidence(item, context).fingerprint;
      if (item.evidenceFingerprint && item.evidenceFingerprint !== fingerprint) item.version++;
      item.evidenceFingerprint = fingerprint;
    }
  }
  async run(accountId, memberId, operation) {
    return this.care.transaction(accountId, null, async account => {
      const access = await this.entitlement(accountId, account), context = await this.context(accountId, memberId);
      context.accessActive = access.active;
      const before = await this.store.read(), data = structuredClone(before);
      await this.reconcile(data, accountId, memberId, context, access);
      const result = await operation({ data, context, access, account });
      if (JSON.stringify(before) !== JSON.stringify(data)) await this.store.update(() => data);
      return result;
    }, { reconcile: false });
  }
  response(data, accountId, memberId, context, access) {
    const preference = data.preferences.find(p => p.accountId === accountId && p.memberId === memberId);
    const items = data.observations.filter(o => o.accountId === accountId && o.memberId === memberId).map(item => this.view(item, context)).sort((a, b) => ({ due: 0, observing: 1, waiting: 2, complete: 3, archived: 4 }[a.status] - { due: 0, observing: 1, waiting: 2, complete: 3, archived: 4 }[b.status]) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { now: this.now().toISOString(), memberId, entitlement: access, automatic: Boolean(preference?.enabled), items, dueCount: items.filter(x => x.status === 'due').length };
  }
  async list(accountId, memberId) { return this.run(accountId, memberId, ({ data, context, access }) => this.response(data, accountId, memberId, context, access)); }
  requireAccess(access) { if (!access.active) fail('请先解锁排敏观察；已有观察仍可继续完成', 403, 'OBSERVATION_LOCKED'); }
  async automatic(accountId, input) {
    return this.run(accountId, input.memberId, async ({ data, context, access }) => {
      if (typeof input.enabled !== 'boolean') fail('请选择是否开启自动观察');
      if (input.enabled) this.requireAccess(access);
      let pref = data.preferences.find(p => p.accountId === accountId && p.memberId === input.memberId);
      if (!pref) { pref = { accountId, memberId: input.memberId, enabled: false }; data.preferences.push(pref); }
      if (input.enabled && !pref.enabled) { pref.enabledAt = this.now().toISOString(); pref.baseline = [...new Set(context.foods.map(f => f.key))]; }
      pref.enabled = input.enabled;
      return this.response(data, accountId, input.memberId, context, access);
    });
  }
  async create(accountId, input) {
    const name = foodName(input.name), days = validDays(input.days ?? 7), id = requestId(input.requestId);
    const fingerprint = hash({ memberId: input.memberId, name, days, hasEaten: input.hasEaten, occurredAt: input.occurredAt, amount: input.amount });
    return this.run(accountId, input.memberId, async ({ data, context, access }) => {
      const previous = data.observations.find(o => o.accountId === accountId && o.requests.some(r => r.id === id));
      if (previous) {
        if (previous.requests.find(r => r.id === id).fingerprint !== fingerprint) fail('本次操作内容已改变，请重新提交', 409, 'REQUEST_CONFLICT');
        return this.response(data, accountId, input.memberId, context, access);
      }
      this.requireAccess(access);
      if (data.observations.some(o => o.accountId === accountId && o.memberId === input.memberId && o.foodKey === keyOf(name))) fail('这种食物已经在观察列表，可打开原观察继续', 409, 'OBSERVATION_EXISTS');
      if (context.cautionNames.some(n => familyKey(n) === familyKey(name))) fail('档案已有相关过敏或忌口安排，请在原安排中跟进；实际误食可照常记入健康随记', 409, 'EXISTING_CARE_ARRANGEMENT');
      if (typeof input.hasEaten !== 'boolean') fail('请确认是否已经吃过');
      let recordedAfter = this.now().toISOString();
      if (input.hasEaten) {
        const at = Date.parse(input.occurredAt);
        if (!Number.isFinite(at) || at > this.now().getTime()) fail('进食时间不能晚于现在', 400, 'FUTURE_HEALTH_TIME');
        if (input.amount !== undefined && (typeof input.amount !== 'string' || input.amount.length > 100)) fail('食用量请填写100字以内');
        await this.quick.create(accountId, { idempotencyKey: `observation-${id}`, memberId: input.memberId, title: `${name}饮食记录`, content: `吃了${name}${input.amount?.trim() ? `，食用量：${input.amount.trim()}` : ''}`, inputChannel: 'text', occurredAt: new Date(at).toISOString(), journal: { categories: ['diet'], timePrecision: 'exact', diet: { kind: 'complementary', foods: [name], ...(input.amount?.trim() ? { amount: input.amount.trim() } : {}) } } }, this.now());
      }
      const item = this.newItem(accountId, input.memberId, name, days, recordedAfter, 'manual', { id, fingerprint });
      item.activationDeadline = access.expiresAt;
      data.observations.push(item);
      const updated = input.hasEaten ? await this.context(accountId, input.memberId) : context;
      updated.accessActive = access.active;
      await this.reconcile(data, accountId, input.memberId, updated, access);
      return this.response(data, accountId, input.memberId, updated, access);
    });
  }
  async change(accountId, observationId, action, input) {
    return this.run(accountId, input.memberId, async ({ data, context, access }) => {
      const item = data.observations.find(o => o.id === observationId && o.accountId === accountId && o.memberId === input.memberId);
      if (!item) fail('未找到这份观察', 404, 'OBSERVATION_NOT_FOUND');
      const id = requestId(input.requestId), fingerprint = hash({ action, ...input });
      const previous = item.requests.find(r => r.id === id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('本次操作内容已改变，请重新提交', 409, 'REQUEST_CONFLICT');
        return this.response(data, accountId, input.memberId, context, access);
      }
      if (item.version !== input.version) fail('记录已更新，请重新读取后核对；尚未保存本次修改', 409, 'OBSERVATION_CHANGED');
      const current = this.view(item, context);
      if (action === 'duration') {
        if (['complete', 'archived'].includes(current.status)) fail('本轮已经结束，可在需要时开启新一轮', 409);
        item.days = validDays(input.days);
      } else if (action === 'review') {
        if (current.status !== 'due') fail('本轮尚未到回访时间，或已经结束', 409);
        if (!Object.hasOwn(intakeLabels, input.intake) || !Object.hasOwn(symptomLabels, input.symptoms)) fail('请分别确认食用情况和症状情况');
        if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 1000)) fail('补充说明请填写1000字以内');
        if (input.intake === 'none' && current.sources.some(s => Date.parse(s.occurredAt) > Date.parse(current.startAt))) fail('这段时间有后续食用记录，请先核对原记录或选择「又吃过几次」', 409, 'INTAKE_CONFLICT');
        if (input.symptoms === 'none' && current.symptoms.length && input.acknowledgeSymptoms !== true) fail('这段时间有症状记录，请先查看，再确认是否属于新增或加重', 409, 'SYMPTOM_REVIEW_REQUIRED');
        const outcome = input.symptoms === 'yes' ? '有情况，待进一步核对' : input.intake === 'unknown' || input.symptoms === 'unknown' ? '信息不足，保留观察' : input.intake === 'none' ? '未继续食用，不能总结持续食用情况' : '本轮观察已汇总';
        item.reviews.push({ id: randomUUID(), round: item.round, reviewedAt: this.now().toISOString(), days: item.days, recordedAfter: item.recordedAfter, notBefore: item.notBefore, ...this.evidence(item, context), intake: input.intake, intakeLabel: intakeLabels[input.intake], symptomsAnswer: input.symptoms, symptomsLabel: symptomLabels[input.symptoms], acknowledgedSymptoms: Boolean(input.acknowledgeSymptoms), note: input.note?.trim() ?? '', outcome });
      } else if (action === 'next-round') {
        this.requireAccess(access);
        if (!['complete', 'archived'].includes(current.status)) fail('请先完成或结束本轮观察', 409);
        if (current.caution) fail('档案已有相关安排，请在原安排中继续跟进', 409);
        item.round++; item.days = validDays(input.days ?? item.days); item.archived = false;
        item.recordedAfter = this.now().toISOString(); item.notBefore = item.recordedAfter; item.activated = false; item.activationDeadline = access.expiresAt;
      } else if (action === 'archive') {
        item.archived = true;
      } else fail('请求方法不支持', 405);
      item.version++;
      item.requests.push({ id, fingerprint });
      item.evidenceFingerprint = this.evidence(item, context).fingerprint;
      return this.response(data, accountId, input.memberId, context, access);
    });
  }
  scheduleAccount(accountId) {
    // Coalesce writes while preserving a trailing reconciliation if another save
    // finishes during a running scan. No timers, model calls or duplicate records.
    let state = this.pending.get(accountId);
    if (state) { state.dirty = true; return state.promise; }
    state = { dirty: true, promise: null };
    state.promise = (async () => {
      while (state.dirty) {
        state.dirty = false;
        const members = await this.care.members.findByAccountId(accountId);
        const data = await this.store.read();
        for (const member of members) if (data.preferences.some(p => p.accountId === accountId && p.memberId === member.id && p.enabled) || data.observations.some(o => o.accountId === accountId && o.memberId === member.id && !o.archived)) await this.list(accountId, member.id);
      }
    })().catch(() => { console.warn('[food-observations] deferred sync unavailable; next open will retry'); }).finally(() => this.pending.delete(accountId));
    this.pending.set(accountId, state);
    return state.promise;
  }
}
