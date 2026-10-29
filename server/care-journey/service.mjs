import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { JsonStore } from '../auth/storage/json-store.mjs';
import { accountTransaction } from '../auth/storage/transaction.mjs';
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs';
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs';
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs';
import { UserRepository } from '../auth/repositories/user-repository.mjs';
import { localDateKey, validTimeZone } from '../time/local-calendar.mjs';
import { SUPPORT_ARTICLES } from '../../shared/help-center.mjs';
const DAY = 86400000;
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const requestKey = x => {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw new CareJourneyError('请重新确认本次操作', 400, 'INVALID_REQUEST_ID');
  return x;
};
export class CareJourneyError extends Error {
  constructor(message, status = 400, code = 'CARE_JOURNEY_INVALID') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const LEVELS = [{
  id: 1,
  value: 1,
  name: '相伴',
  threshold: 0
}, {
  id: 2,
  value: 2,
  name: '同行',
  threshold: 20
}, {
  id: 3,
  value: 3,
  name: '累积',
  threshold: 60
}, {
  id: 4,
  value: 4,
  name: '增长',
  threshold: 150
}, {
  id: 5,
  value: 5,
  name: '守望',
  threshold: 300
}];
// Timed grants remain in the ledger after expiry; only active grants unlock new work.
export function activeCareOwnership(account, productId, now = new Date()) {
  return (account.owned ?? []).filter(item => item.productId === productId &&
    (item.kind !== 'term' || Date.parse(item.expiresAt) > now.getTime()))
    .sort((a, b) => (Date.parse(b.expiresAt) || 0) - (Date.parse(a.expiresAt) || 0))[0] ?? null;
}
export const PRODUCTS = [{
  id: 'food-observation',
  title: '排敏观察 · 30天',
  description: '30天内为食物开启独立观察与自动跟进；已开启的观察到期后仍可完成回访、查看汇总。',
  cost: 30,
  type: 'term',
  kind: 'term',
  durationDays: 30,
  version: 'food-observation-v1',
  path: '/food-observations'
}, {
  id: 'theme-mist-blue',
  title: '晨雾蓝主题',
  description: '预览后收藏一个主题，账号长期拥有，随时切回默认。',
  cost: 30,
  type: 'permanent',
  kind: 'permanent',
  version: 'mist-blue-v1',
  path: '/care-journey/themes'
}, {
  id: 'review-once',
  title: '近期回顾单次券',
  description: '一个孩子连续7天的图表与同日对照快照；未使用券不单独到期。',
  cost: 15,
  type: 'voucher',
  kind: 'single',
  minLevel: 2,
  path: '/recent-review'
}, {
  id: 'growth-comparison',
  title: '多参考对照包',
  description: '长期使用WHO与成熟适龄CDC参考的并排对照；不包含尚未验收参考。',
  cost: 30,
  type: 'permanent',
  kind: 'permanent',
  version: 'who-cdc-v1',
  path: '/health-profile/basic'
}, {
  id: 'handoff-enhanced',
  title: '忌口交接增强版',
  description: '一份经家长核对的新增场景交接结果。',
  cost: 10,
  type: 'service',
  kind: 'single',
  path: '/care-tools/handoff'
}, {
  id: 'food-comparison',
  title: '食品标签并排对照',
  description: '最多3个食品，至少2个成功可读才消费；不判断绝对安全。',
  cost: 5,
  type: 'service',
  kind: 'single',
  path: '/care-tools/food-comparison'
}, {
  id: 'medication-templates',
  title: '常用用药安排模板包',
  description: '长期复用本人核对的安排字段；不自动生成剂量或医嘱。',
  cost: 20,
  type: 'permanent',
  kind: 'permanent',
  version: 'personal-templates-v1',
  path: '/care-tools/medication-templates'
}];
const BADGES = [{
  id: 'first-record',
  title: '第一份记录',
  description: '首次保存一条真实正式记录',
  reward: 1,
  target: 1
}, {
  id: 'first-organized',
  title: '第一次整理',
  description: '首次核对并保存一份整理成果',
  reward: 1,
  target: 1
}, {
  id: 'seven-care',
  title: '七次呵护',
  description: '累计七次每日呵护，不要求连续',
  reward: 3,
  target: 7
}, {
  id: 'first-journey',
  title: '初程完成',
  description: '累计七个完整参与日，每天两项都完成',
  reward: 3,
  target: 7
}];
const fresh = (accountId, timeZone, now) => ({
  accountId,
  timeZone,
  createdAt: now,
  wallet: 0,
  lifetime: 0,
  theme: 'paper',
  ledger: [],
  days: [],
  achievements: [],
  owned: [],
  vouchers: [],
  redemptions: [],
  reservations: [],
  snapshots: [],
  materials: []
});
const levelFor = value => {
  const level = [...LEVELS].reverse().find(l => value >= l.threshold) ?? LEVELS[0];
  const next = LEVELS[level.id];
  return {
    ...level,
    nextThreshold: next?.threshold ?? null,
    nextName: next?.name ?? null
  };
};
const reserved = a => a.reservations.filter(r => r.status === 'reserved').reduce((n, r) => n + r.cost, 0);
const usable = a => a.wallet - reserved(a);
function reward(a, key, amount, label, now) {
  if (a.ledger.some(r => r.key === key)) return;
  a.wallet += amount;
  a.lifetime += amount;
  a.ledger.push({
    id: randomUUID(),
    key,
    kind: 'reward',
    amount,
    label,
    title: label,
    createdAt: now
  });
}
function debit(a, key, amount, label, now) {
  if (a.ledger.some(r => r.key === key)) return;
  if (usable(a) < amount) throw new CareJourneyError('可用树芽不足', 409, 'INSUFFICIENT_SPROUTS');
  a.wallet -= amount;
  a.ledger.push({
    id: randomUUID(),
    key,
    kind: 'spend',
    amount: -amount,
    label,
    title: label,
    createdAt: now
  });
}
const dateRange = (start, end) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '')) throw new CareJourneyError('请选择完整日期范围');
  const left = Date.parse(start + 'T00:00:00Z'),
    right = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(left) || !Number.isFinite(right) || new Date(left).toISOString().slice(0, 10) !== start || new Date(right).toISOString().slice(0, 10) !== end || right < left) throw new CareJourneyError('日期范围无效');
  return (right - left) / DAY + 1;
};
export class CareJourneyService {
  constructor(options = {}) {
    this.options = options;
    this.directory = options.dataDirectory;
    this.now = options.now ?? (() => new Date());
    this.store = new JsonStore(path.join(this.directory, 'care-journey.json'), {
      accounts: []
    });
    this.users = options.users ?? new UserRepository(this.directory);
    this.members = options.members ?? new FamilyMemberRepository(this.directory);
    this.events = options.events ?? new HealthEventRepository(this.directory);
    this.records = options.records ?? new HealthEventRecordRepository(this.directory);
    this.reports = new JsonStore(path.join(this.directory, 'visit-sheets.json'), {
      reports: []
    });
    this.enabled = new Set(['theme-mist-blue', ...(options.enabledProducts ?? [])]);
    if (options.reviewVoucherEnabled) this.enabled.add('review-once');
    this.isIncluded = options.isIncluded ?? (async () => false);
  }
  async ownedMember(accountId, memberId) {
    const m = await this.members.findById(memberId);
    if (!m || m.accountId !== accountId) throw new CareJourneyError('未找到该孩子的资料', 404, 'MEMBER_NOT_FOUND');
    return m;
  }
  async facts(accountId) {
    const [members, events, records, reports] = await Promise.all([this.members.findByAccountId(accountId), this.events.findByAccountId(accountId), this.records.findByAccountId(accountId), this.reports.read()]);
    const mids = new Set(members.map(m => m.id));
    const eids = new Set(events.filter(e => mids.has(e.memberId) && e.accountId === accountId).map(e => e.id));
    const now = this.now().getTime();
    return {
      members,
      records: records.filter(r => r.accountId === accountId && eids.has(r.eventId) && !r.deletedAt && r.status !== 'pending' && r.confirmationStatus !== 'pending' && r.confirmed !== false && !['pending', 'external_ai'].includes(r.caseContext?.identity) && Number.isFinite(Date.parse(r.occurredAt)) && Date.parse(r.occurredAt) <= now && Number.isFinite(Date.parse(r.createdAt)) && Date.parse(r.createdAt) <= now),
      organized: reports.reports.some(r => r.accountId === accountId && mids.has(r.memberId) && r.current?.version)
    };
  }
  day(a) {
    const date = localDateKey(this.now(), a.timeZone);
    let day = a.days.find(d => d.date === date);
    if (!day) {
      const mode = a.days.length % 3 === 1 ? 'profile' : a.days.length % 3 === 2 ? 'knowledge' : 'record';
      day = {
        date,
        checkedIn: false,
        taskCompleted: false,
        mode
      };
      a.days.push(day);
    }
    return day;
  }
  expire(a) {
    const now = this.now().getTime();
    for (const r of a.reservations) if (r.status === 'reserved' && Date.parse(r.expiresAt) <= now) {
      r.status = 'released';
      r.releasedAt = this.now().toISOString();
    }
  }
  async reconcile(a, facts) {
    const day = this.day(a),
      at = this.now().toISOString();
    this.expire(a);
    const todayRecord = facts.records.find(r => localDateKey(new Date(r.createdAt), a.timeZone) === day.date);
    if (todayRecord) {
      day.taskCompleted = true;
      day.evidence = {
        type: 'record',
        id: todayRecord.id
      };
      reward(a, 'task:' + day.date, 2, '今日任务', at);
    }
    const progress = {
      'first-record': facts.records.length ? 1 : 0,
      'first-organized': facts.organized || a.snapshots.length ? 1 : 0,
      'seven-care': a.days.filter(d => d.checkedIn).length,
      'first-journey': a.days.filter(d => d.checkedIn && d.taskCompleted).length
    };
    for (const badge of BADGES) {
      if (progress[badge.id] >= badge.target && !a.achievements.some(b => b.id === badge.id)) {
        a.achievements.push({
          id: badge.id,
          achievedAt: at
        });
        reward(a, 'badge:' + badge.id, badge.reward, badge.title, at);
      }
    }
    return progress;
  }
  async transaction(accountId, timeZone, operation, {
    reconcile = true
  } = {}) {
    if (typeof accountId !== 'string' || !accountId) throw new CareJourneyError('请先登录', 401, 'UNAUTHORIZED');
    return accountTransaction(this.directory, async () => {
      const user = await this.users.findById(accountId);
      if (!user || user.mergedInto) throw new CareJourneyError('登录状态无效', 401, 'UNAUTHORIZED');
      const data = structuredClone(await this.store.read());
      let a = data.accounts.find(a => a.accountId === accountId);
      if (!a) {
        a = fresh(accountId, validTimeZone(timeZone) || 'Asia/Shanghai', this.now().toISOString());
        data.accounts.push(a);
      }
      const facts = reconcile ? await this.facts(accountId) : null;
      if (reconcile) await this.reconcile(a, facts);else this.expire(a);
      const result = await operation(a, facts);
      await this.store.update(() => data);
      return result;
    });
  }
  state(a, facts) {
    const d = this.day(a);
    const progress = {
      'first-record': facts?.records.length ? 1 : 0,
      'first-organized': facts?.organized || a.snapshots.length ? 1 : 0,
      'seven-care': a.days.filter(d => d.checkedIn).length,
      'first-journey': a.days.filter(d => d.checkedIn && d.taskCompleted).length
    };
    const taskTitle = {
      record: '记录一件真实发生的照顾',
      profile: '核对一下孩子档案',
      knowledge: '读一条操作小知识'
    };
    return {
      currency: '树芽',
      balance: usable(a),
      walletBalance: a.wallet,
      reserved: reserved(a),
      lifetime: a.lifetime,
      totalEarned: a.lifetime,
      careDays: a.days.filter(day => day.checkedIn).length,
      level: levelFor(a.lifetime),
      today: {
        date: d.date,
        checkedIn: d.checkedIn,
        complete: d.checkedIn && d.taskCompleted,
        task: {
          id: 'daily-care',
          title: taskTitle[d.mode],
          description: '没有新情况时，也可核对已有档案或阅读小知识；每天仅结算一个任务。',
          path: d.mode === 'record' ? '/health-events' : d.mode === 'profile' ? '#verify-profile' : '#read-knowledge',
          reward: 2,
          completed: d.taskCompleted,
          alternatives: ['profile', 'knowledge']
        }
      },
      achievements: BADGES.map(b => ({
        ...b,
        progress: a.achievements.some(x => x.id === b.id) ? b.target : Math.min(b.target, progress[b.id]),
        earned: a.achievements.some(x => x.id === b.id),
        achievedAt: a.achievements.find(x => x.id === b.id)?.achievedAt ?? null
      })),
      owned: a.owned,
      vouchers: a.vouchers.map(v => ({
        ...v,
        path: '/recent-review?voucherId=' + v.id
      })),
      ledger: [...a.ledger].reverse().slice(0, 100),
      theme: {
        active: a.theme,
        owned: ['paper', ...(a.owned.some(p => p.productId === 'theme-mist-blue') ? ['mist-blue'] : [])]
      },
      timeZone: a.timeZone
    };
  }
  async get(accountId, input = {}) {
    return this.transaction(accountId, input.timeZone, (a, f) => this.state(a, f));
  }
  async checkIn(accountId, input = {}) {
    return this.transaction(accountId, input.timeZone, async (a, f) => {
      const d = this.day(a);
      d.checkedIn = true;
      reward(a, 'check-in:' + d.date, 1, '每日呵护', this.now().toISOString());
      await this.reconcile(a, f);
      return this.state(a, f);
    });
  }
  async verifyTask(accountId, input = {}) {
    if (input.completed !== undefined || input.reward !== undefined) throw new CareJourneyError('任务需要核对实际完成记录');
    return this.get(accountId, input);
  }
  async growthEligible(accountId) {
    const today = Date.parse(localDateKey(this.now(), 'Asia/Shanghai') + 'T00:00:00Z');
    return (await this.members.findByAccountId(accountId)).some(member => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(member.birthday ?? '')) return false;
      const birth = new Date(member.birthday + 'T00:00:00Z');
      if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== member.birthday) return false;
      const second = Date.UTC(birth.getUTCFullYear() + 2, birth.getUTCMonth(), birth.getUTCDate());
      const fifth = Date.UTC(birth.getUTCFullYear() + 5, birth.getUTCMonth(), birth.getUTCDate());
      return today >= second && today <= fifth;
    });
  }
  async catalogue(accountId) {
    return this.transaction(accountId, null, async a => ({
      items: await Promise.all(PRODUCTS.map(async p => {
        const grant = activeCareOwnership(a, p.id, this.now());
        const owned = Boolean(grant);
        const included = p.id !== 'theme-mist-blue' && (await this.isIncluded(accountId, p.id));
        let reason = !this.enabled.has(p.id) ? p.id === 'review-once' ? '当前回顾可直接使用，无需兑换' : '完成数据与功能验收后开放' : owned ? '已拥有' : included ? '会员已包含' : p.minLevel && levelFor(a.lifetime).id < p.minLevel ? '达到Lv.' + p.minLevel + '后可兑换' : null;
        if (p.id === 'growth-comparison' && !reason && !(await this.growthEligible(accountId))) reason = '目前没有2至5岁共同适龄孩子，无需兑换';
        if (p.id === 'review-once' && !reason) {
          if (a.vouchers.some(v => v.status === 'unused')) reason = '已有待用券';else if (a.vouchers.some(v => v.usedAt && this.now().getTime() - Date.parse(v.usedAt) < 30 * DAY)) reason = '成功使用后30天可再次兑换';
        }
        return {
          ...p,
          owned,
          expiresAt: grant?.expiresAt ?? null,
          included,
          available: !reason,
          reason,
          destination: p.path
        };
      }))
    }));
  }
  async entitlements(accountId) {
    const c = await this.catalogue(accountId);
    return {
      products: Object.fromEntries(c.items.map(p => [p.id, {
        owned: p.owned,
        included: p.included,
        available: this.enabled.has(p.id),
        version: p.version ?? null,
        expiresAt: p.expiresAt ?? null
      }])),
      commercializationReady: Boolean(this.options.commercializationReady)
    };
  }
  async redeem(accountId, input = {}) {
    const id = requestKey(input.requestId);
    const product = PRODUCTS.find(p => p.id === input.productId);
    if (!product) throw new CareJourneyError('该商品暂不可兑换', 404, 'PRODUCT_NOT_FOUND');
    if (product.type === 'service') throw new CareJourneyError('请先在功能页选择要整理的资料', 409, 'SERVICE_SCOPE_REQUIRED');
    return this.transaction(accountId, null, async (a, f) => {
      const previous = a.redemptions.find(r => r.requestId === id);
      if (previous) {
        if (previous.productId !== product.id) throw new CareJourneyError('本次操作已用于其他商品', 409, 'REQUEST_CONFLICT');
        return {
          ...this.state(a, f),
          redemption: previous
        };
      }
      if (!this.enabled.has(product.id)) throw new CareJourneyError('该功能尚未开放兑换', 409, 'PRODUCT_UNAVAILABLE');
      if (product.id !== 'theme-mist-blue' && (await this.isIncluded(accountId, product.id))) throw new CareJourneyError('当前会员已包含，无需兑换', 409, 'ALREADY_INCLUDED');
      if (activeCareOwnership(a, product.id, this.now())) throw new CareJourneyError('你已拥有此项目', 409, 'ALREADY_OWNED');
      if (product.id === 'growth-comparison' && !(await this.growthEligible(accountId))) throw new CareJourneyError('目前没有WHO与CDC共同适龄的2至5岁孩子，无需兑换', 409, 'GROWTH_NOT_APPLICABLE');
      if (product.minLevel && levelFor(a.lifetime).id < product.minLevel) throw new CareJourneyError('达到Lv.' + product.minLevel + '后可兑换', 409, 'LEVEL_REQUIRED');
      if (product.id === 'review-once') {
        if (a.vouchers.some(v => v.status === 'unused')) throw new CareJourneyError('已有待用券，请先使用', 409, 'UNUSED_VOUCHER');
        if (a.vouchers.some(v => v.usedAt && this.now().getTime() - Date.parse(v.usedAt) < 30 * DAY)) throw new CareJourneyError('成功使用后30天可再次兑换', 409, 'VOUCHER_COOLDOWN');
      }
      const at = this.now().toISOString();
      debit(a, 'redeem:' + id, product.cost, product.title, at);
      const redemption = {
        id: randomUUID(),
        requestId: id,
        productId: product.id,
        title: product.title,
        cost: product.cost,
        createdAt: at
      };
      a.redemptions.push(redemption);
      if (product.type === 'voucher') a.vouchers.push({
        id: randomUUID(),
        productId: product.id,
        title: product.title,
        status: 'unused',
        createdAt: at
      });else a.owned.push({
        ...redemption,
        kind: product.kind === 'term' ? 'term' : 'permanent',
        ...(product.kind === 'term' ? { expiresAt: new Date(this.now().getTime() + product.durationDays * DAY).toISOString() } : {}),
        version: product.version,
        path: product.path
      });
      return {
        ...this.state(a, f),
        redemption
      };
    });
  }
  // Server-only: the protected Ops feedback mutation first persists an explicit
  // verification marker in the same transaction. Public care routes never expose
  // this method and user feedback input cannot set the marker.
  async rewardFeedback(feedbackId, actorAccountId, now = this.now()) {
    if (typeof feedbackId !== 'string' || typeof actorAccountId !== 'string' || !actorAccountId) throw new CareJourneyError('缺少反馈审核信息');
    const feedbackStore = new JsonStore(path.join(this.directory, 'feedback', 'records.json'), { feedback: [], statusHistory: [] });
    return accountTransaction(this.directory, async () => {
      const source = await feedbackStore.read();
      const item = source.feedback.find(row => row.id === feedbackId);
      if (!item || item.rewardReview?.verifiedNewIssue !== true || item.rewardReview?.verifiedBy !== actorAccountId) throw new CareJourneyError('请先核实新的有效问题', 409, 'FEEDBACK_NOT_VERIFIED');
      const month = localDateKey(now, 'Asia/Shanghai').slice(0, 7);
      return this.transaction(item.accountId, null, a => {
        const key = 'feedback:' + feedbackId;
        const existing = a.ledger.find(row => row.key === key);
        if (existing) return { status: 'granted', amount: 2, ledgerId: existing.id, grantedAt: existing.createdAt, month: localDateKey(new Date(existing.createdAt), 'Asia/Shanghai').slice(0, 7), idempotent: true };
        if (item.status === 'merged' || item.mergedIntoId || (source.statusHistory ?? []).some(row => row.feedbackId === feedbackId && row.status === 'merged')) return { status: 'not_eligible', amount: 0, month, reason: 'duplicate' };
        const earned = a.ledger.filter(row => row.kind === 'reward' && row.key.startsWith('feedback:') && localDateKey(new Date(row.createdAt), 'Asia/Shanghai')?.slice(0, 7) === month).reduce((total, row) => total + row.amount, 0);
        if (earned + 2 > 10) return { status: 'monthly_limit', amount: 0, month };
        reward(a, key, 2, '有效问题反馈', now.toISOString());
        const entry = a.ledger.find(row => row.key === key);
        Object.assign(entry, { feedbackId, verifiedBy: actorAccountId });
        return { status: 'granted', amount: 2, ledgerId: entry.id, grantedAt: entry.createdAt, month, idempotent: false };
      }, { reconcile: false });
    });
  }
  async getTheme(accountId) {
    return this.transaction(accountId, null, a => {
      const owned = ['paper', ...(a.owned.some(p => p.productId === 'theme-mist-blue') ? ['mist-blue'] : [])];
      return {
        active: owned.includes(a.theme) ? a.theme : 'paper',
        owned
      };
    }, {
      reconcile: false
    });
  }
  async setTheme(accountId, input = {}) {
    const theme = input.themeId ?? input.theme;
    if (!['paper', 'mist-blue'].includes(theme)) throw new CareJourneyError('请选择已有主题');
    return this.transaction(accountId, null, (a, f) => {
      if (theme === 'mist-blue' && !a.owned.some(o => o.productId === 'theme-mist-blue')) throw new CareJourneyError('请先预览并收藏主题', 403, 'THEME_NOT_OWNED');
      a.theme = theme;
      return this.state(a, f);
    });
  }
  async openMaterial(accountId, input = {}) {
    return this.transaction(accountId, null, async (a, f) => {
      const day = this.day(a);
      const m = input.memberId ? await this.ownedMember(accountId, input.memberId) : f.members.find(m => !m.isSelf);
      const type = input.type === 'knowledge' || !m ? 'knowledge' : 'profile';
      const published = SUPPORT_ARTICLES.filter(x => x.status === 'published');
      const article = published.find(x => x.id === 'record') ?? published[0];
      const content = type === 'profile' ? [`姓名：${m.name}`, `出生日期：${m.birthday ?? '未填写'}`, `性别：${m.gender ?? '未填写'}`, `身高：${m.heightCm ?? '未填写'}`, `体重：${m.weightKg ?? '未填写'}`] : [article.summary ?? article.description ?? article.title, ...(article.steps ?? []), article.result ?? '', ...(article.sections ?? []).map(x => typeof x === 'string' ? x : [x.title, x.content, ...(x.steps ?? [])].filter(Boolean).join('\n'))];
      const at = this.now().toISOString();
      const material = {
        id: randomUUID(),
        type,
        title: type === 'profile' ? '核对孩子档案' : article.title,
        content,
        memberId: m?.id ?? null,
        sourceId: type === 'profile' ? m.id : article.id,
        fingerprint: digest(type === 'profile' ? m : article),
        date: day.date,
        openedAt: at
      };
      a.materials = a.materials.filter(x => x.date === day.date).slice(-19);
      a.materials.push(material);
      return material;
    });
  }
  async confirmMaterial(accountId, input = {}) {
    return this.transaction(accountId, null, async (a, f) => {
      const day = this.day(a),
        m = a.materials.find(x => x.id === input.materialId && x.date === day.date);
      if (!m) throw new CareJourneyError('请重新打开今日核对资料', 404, 'MATERIAL_NOT_FOUND');
      if (this.now().getTime() - Date.parse(m.openedAt) < 3000) throw new CareJourneyError('请先阅读并核对资料', 409, 'READ_BEFORE_CONFIRM');
      if (m.type === 'profile') {
        const current = await this.ownedMember(accountId, m.memberId);
        if (digest(current) !== m.fingerprint) throw new CareJourneyError('档案已有变化，请重新核对', 409, 'MATERIAL_CHANGED');
      }
      day.taskCompleted = true;
      day.evidence = {
        type: m.type,
        id: m.sourceId
      };
      reward(a, 'task:' + day.date, 2, '今日任务', this.now().toISOString());
      await this.reconcile(a, f);
      return this.state(a, f);
    });
  }
  async runService(accountId, input, executor) {
    const key = requestKey(input.requestId),
      p = PRODUCTS.find(p => p.id === input.productId);
    if (!p || p.type !== 'service') throw new CareJourneyError('该服务暂未开放', 404, 'PRODUCT_NOT_FOUND');
    const fp = digest(input);
    const reservation = await this.transaction(accountId, null, async a => {
      if (input.memberId) await this.ownedMember(accountId, input.memberId);
      if (!this.enabled.has(p.id)) throw new CareJourneyError('该服务尚未开放', 409, 'PRODUCT_UNAVAILABLE');
      let r = a.reservations.find(r => r.requestId === key);
      if (r) {
        if (r.fingerprint !== fp) throw new CareJourneyError('操作范围与原请求不同', 409, 'REQUEST_CONFLICT');
        if (r.status === 'completed') return r;
        if (r.status === 'reserved') throw new CareJourneyError('本次整理正在进行，请稍后查看', 409, 'SERVICE_IN_PROGRESS');
      }
      const cost = (await this.isIncluded(accountId, p.id)) ? 0 : p.cost;
      if (usable(a) < cost) throw new CareJourneyError('可用树芽不足', 409, 'INSUFFICIENT_SPROUTS');
      const at = this.now();
      r = {
        id: r?.id ?? randomUUID(),
        requestId: key,
        productId: p.id,
        memberId: input.memberId ?? null,
        fingerprint: fp,
        cost,
        status: 'reserved',
        createdAt: at.toISOString(),
        expiresAt: new Date(at.getTime() + 15 * 60000).toISOString()
      };
      a.reservations = a.reservations.filter(x => x.requestId !== key);
      a.reservations.push(r);
      return r;
    });
    if (reservation.status === 'completed') return reservation.result;
    try {
      const result = await executor();
      if (!result || result.valid !== true) throw new CareJourneyError('尚未得到有效结果，请补全资料再试', 409, 'NO_VALID_RESULT');
      return await this.transaction(accountId, null, async a => {
        if (input.memberId) await this.ownedMember(accountId, input.memberId);
        if (result.memberId !== undefined && result.memberId !== input.memberId) throw new CareJourneyError('整理结果与所选孩子不一致', 409, 'SERVICE_MEMBER_MISMATCH');
        const r = a.reservations.find(r => r.id === reservation.id);
        if (r?.status !== 'reserved') throw new CareJourneyError('本次整理已结束，请重试', 409, 'RESERVATION_EXPIRED');
        r.status = 'completed';
        if (r.cost) debit(a, 'service:' + r.id, r.cost, p.title, this.now().toISOString());
        r.completedAt = this.now().toISOString();
        r.result = result;
        return result;
      });
    } catch (error) {
      await this.transaction(accountId, null, a => {
        const r = a.reservations.find(r => r.id === reservation.id);
        if (r?.status === 'reserved') {
          r.status = 'released';
          r.releasedAt = this.now().toISOString();
        }
      });
      throw error;
    }
  }
  async createSnapshot(accountId, input = {}) {
    const key = requestKey(input.requestId);
    const days = dateRange(input.start, input.end);
    if (days > 366) throw new CareJourneyError('请缩小回顾范围');
    if (input.model !== undefined || input.sources !== undefined || input.data !== undefined) throw new CareJourneyError('回顾资料由服务端核对读取');
    return this.transaction(accountId, null, async (a, f) => {
      await this.ownedMember(accountId, input.memberId);
      if (input.end > localDateKey(this.now(), a.timeZone)) throw new CareJourneyError('不能回顾未来日期');
      const fp = digest({
        memberId: input.memberId,
        start: input.start,
        end: input.end,
        voucherId: input.voucherId ?? null
      });
      const old = a.snapshots.find(s => s.requestId === key);
      if (old) {
        if (old.fingerprint !== fp) throw new CareJourneyError('回顾范围与原请求不同', 409, 'REQUEST_CONFLICT');
        return old;
      }
      let voucher;
      if (this.options.commercializationReady && !input.voucherId && !(await this.isIncluded(accountId, 'review-once'))) throw new CareJourneyError('请使用已有回顾券或有效会员', 403, 'REVIEW_PERMISSION_REQUIRED');
      if (input.voucherId) {
        voucher = a.vouchers.find(v => v.id === input.voucherId);
        if (!voucher || voucher.status !== 'unused') throw new CareJourneyError('这张券不可使用', 409, 'VOUCHER_UNAVAILABLE');
        if (days !== 7) throw new CareJourneyError('单次券用于连续7天回顾');
        if (a.vouchers.some(v => v.usedAt && this.now().getTime() - Date.parse(v.usedAt) < 30 * DAY)) throw new CareJourneyError('成功使用后30天可再次使用', 409, 'VOUCHER_COOLDOWN');
      }
      const builder = this.options.reviewBuilder ?? (await import('./review-snapshot-builder.mjs')).buildReviewSnapshot;
      const data = await builder({
        accountId,
        memberId: input.memberId,
        start: input.start,
        end: input.end,
        now: this.now(),
        dataDirectory: this.directory
      });
      if (!data || data.valid === false) throw new CareJourneyError('暂无可整理的已确认记录', 409, 'NO_VALID_RESULT');
      const at = this.now().toISOString();
      const snapshot = {
        id: randomUUID(),
        requestId: key,
        fingerprint: fp,
        memberId: input.memberId,
        start: input.start,
        end: input.end,
        createdAt: at,
        data
      };
      a.snapshots.push(snapshot);
      snapshot.voucherConsumed = Boolean(voucher && this.options.commercializationReady && !(await this.isIncluded(accountId, 'review-once')));
      if (snapshot.voucherConsumed) {
        voucher.status = 'used';
        voucher.usedAt = at;
        voucher.snapshotId = snapshot.id;
      }
      await this.reconcile(a, f);
      return snapshot;
    });
  }
  async snapshots(accountId, id) {
    return this.transaction(accountId, null, async a => {
      if (id) {
        const s = a.snapshots.find(s => s.id === id);
        if (!s) throw new CareJourneyError('未找到回顾快照', 404, 'SNAPSHOT_NOT_FOUND');
        await this.ownedMember(accountId, s.memberId);
        return s;
      }
      const members = new Set((await this.members.findByAccountId(accountId)).map(m => m.id));
      return {
        snapshots: a.snapshots.filter(s => members.has(s.memberId)).map(({
          data,
          fingerprint,
          ...s
        }) => s).reverse()
      };
    });
  }
}
