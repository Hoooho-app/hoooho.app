import { randomUUID, createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { accountTransaction, withStorageLock } from '../auth/storage/transaction.mjs'
import { localDateKey, validTimeZone } from '../time/local-calendar.mjs'
import { validateJournal } from '../events/journal-metadata.mjs'

const kinds = new Set(['feeding', 'complementary', 'meal', 'snack', 'supplement', 'sleep', 'bowel', 'topical', 'medication'])
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/
const idPattern = /^[A-Za-z0-9_-]{8,128}$/
const fieldKeys = {
  feeding: ['feedingMethod', 'bottleMl'], complementary: ['foods', 'amount'], meal: ['foods', 'amount'], snack: ['foods', 'amount'],
  supplement: ['names', 'amount', 'unit'], sleep: ['kind', 'endTime'], bowel: [],
  topical: ['kind', 'productName', 'bodyLocations', 'amount'], medication: ['mode', 'medicationName', 'amountValue', 'amountUnit', 'administrationRoute', 'endDate', 'untilClosed']
}
function safeFields(kind, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('请核对每天记录内容')
  return Object.fromEntries(fieldKeys[kind].filter(key => source[key] !== undefined).map(key => {
    const value = source[key]
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)) || String(value).length > 1000) fail('每天记录字段无效')
    return [key, typeof value === 'string' ? value.trim() : value]
  }))
}
function matchesKind(kind, journal) {
  return journal && (['feeding', 'complementary', 'meal', 'snack', 'supplement'].includes(kind) ? journal.diet?.kind === kind : ({ sleep: 'sleep', bowel: 'elimination', topical: 'care', medication: 'medication' }[kind] === journal.categories?.[0]))
}
function actualContent(name, journal) {
  const d = journal.diet, m = journal.medication, c = journal.topical, s = journal.sleep
  return [name, d?.feedingMethod && ({ breast: '母乳', formula: '配方奶', expressed: '瓶喂母乳', mixed: '混合喂养' }[d.feedingMethod]), d?.bottleMl && `${d.bottleMl}毫升`, d?.foods?.join('、'), d?.amount, d?.supplementNames?.join('、'), d?.supplementAmount && `${d.supplementAmount}${d.supplementUnit}`, m?.medicationName, m?.amountValue && `${m.amountValue}${m.amountUnit}`, c?.productName, c?.bodyLocations?.join('、'), c?.amount, s && `实际入睡：${s.sleepAt}`, s?.status === 'completed' && `实际醒来：${s.wakeAt}`].filter(Boolean).join(' · ')
}
export class DailyRecordError extends Error {
  constructor(message, status = 400, code = 'INVALID_DAILY_RECORD') { super(message); this.status = status; this.code = code }
}
const fail = (message) => { throw new DailyRecordError(message) }
export const shiftDay = (day, days = 1) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
// Resolve a wall clock in the rule's zone, not the browser/server zone. Reject
// nonexistent DST clocks rather than silently shifting an occurrence.
export function zonedInstant(day, clock, zone) {
  const target = Date.parse(`${day}T${clock}:00Z`)
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let instant = target
  for (let i = 0; i < 3; i++) instant += target - Date.parse(formatter.format(new Date(instant)).replace(' ', 'T') + 'Z')
  return formatter.format(new Date(instant)).slice(0, 16) === `${day} ${clock}` ? new Date(instant).toISOString() : null
}
const pick = (source, keys) => Object.fromEntries(keys.filter(key => source?.[key] !== undefined).map(key => [key, source[key]]))
export function dailySnapshot(kind, fields, day = '2026-01-01', time = '00:00', zone = 'Asia/Shanghai') {
  if (!kinds.has(kind)) fail('记录类型无效')
  fields = safeFields(kind, fields)
  const occurredAt = zonedInstant(day, time, zone)
  if (!occurredAt) fail('这个当地时间不存在，请调整时间')
  let journal
  if (kind === 'feeding') {
    if (!['breast', 'formula', 'expressed', 'mixed'].includes(fields.feedingMethod)) fail('请选择喂养方式')
    if (fields.feedingMethod !== 'breast' && !(Number(fields.bottleMl) > 0)) fail('请填写奶量')
    journal = { categories: ['diet'], diet: { kind, feedingMethod: fields.feedingMethod, ...(fields.bottleMl ? { bottleMl: Number(fields.bottleMl) } : {}) } }
  } else if (['complementary', 'meal', 'snack'].includes(kind)) {
    const foods = String(fields.foods ?? '').split(/[、，,]/).map(value => value.trim()).filter(Boolean)
    if (!foods.length) fail('请填写食物内容')
    journal = { categories: ['diet'], diet: { kind, foods, ...pick(fields, ['amount']) } }
  } else if (kind === 'supplement') {
    if (!String(fields.names ?? '').trim() || !String(fields.amount ?? '').trim() || !fields.unit) fail('请填写补剂名称、用量和单位')
    journal = { categories: ['diet'], diet: { kind, supplementNames: String(fields.names).split(/[、，,]/).map(s => s.trim()).filter(Boolean), supplementAmount: fields.amount, supplementUnit: fields.unit } }
  } else if (kind === 'sleep') {
    if (!['night', 'nap'].includes(fields.kind) || !clockPattern.test(fields.endTime ?? '')) fail('请选择睡眠类型和通常醒来时间')
    const wakeAt = zonedInstant(fields.endTime <= time ? shiftDay(day) : day, fields.endTime, zone)
    if (!wakeAt || wakeAt <= occurredAt) fail('请核对睡眠时间段')
    journal = { categories: ['sleep'], sleep: { kind: fields.kind, sleepAt: occurredAt, wakeAt, status: 'ongoing', timeZone: zone } }
  } else if (kind === 'bowel') journal = { categories: ['elimination'], bowel: { shapes: [], observations: [] } }
  else if (kind === 'topical') {
    if (!String(fields.productName ?? '').trim()) fail('请填写涂抹产品')
    journal = { categories: ['care'], topical: { kind: fields.kind || 'skincare', productName: fields.productName, bodyLocations: String(fields.bodyLocations ?? '').split(/[、，,]/).map(s => s.trim()).filter(Boolean), ...pick(fields, ['amount']) } }
  } else if (kind === 'medication') {
    if (fields.mode !== 'fixed') fail('按需用药不能开启每天自动记录')
    if (!String(fields.medicationName ?? '').trim() || !(Number(fields.amountValue) > 0) || !String(fields.amountUnit ?? '').trim()) fail('请填写药名、剂量和单位')
    if (!fields.endDate && fields.untilClosed !== true) fail('请选择用药结束日期或持续至关闭')
    if (fields.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.endDate) || !Number.isFinite(Date.parse(`${fields.endDate}T00:00:00Z`)) || new Date(`${fields.endDate}T00:00:00Z`).toISOString().slice(0, 10) !== fields.endDate || fields.endDate < day)) fail('请核对用药结束日期，不得早于生效日期')
    journal = { categories: ['medication'], medication: { medicationName: fields.medicationName, amountValue: Number(fields.amountValue), amountUnit: fields.amountUnit, administrationRoute: fields.administrationRoute || 'oral' } }
  } else fail('记录类型无效')
  // Whitelisted reconstruction excludes observations, photos, transcripts,
  // nurse metadata, reminders and previous actual interval endpoints.
  return validateJournal(journal)
}

export class DailyRecordService {
  constructor(routines, options) { this.routines = routines; this.directory = options.dataDirectory; this.dbPromise = null }
  async database() {
    if (!this.dbPromise) this.dbPromise = (async () => {
      await mkdir(this.directory, { recursive: true })
      const db = new DatabaseSync(path.join(this.directory, 'routine-instances.sqlite'))
      db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS instances (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, member_id TEXT NOT NULL, rule_id TEXT NOT NULL, slot_id TEXT NOT NULL, day TEXT NOT NULL, planned_at TEXT NOT NULL, generated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unconfirmed', payload TEXT NOT NULL, UNIQUE(account_id,member_id,rule_id,slot_id,day));
        CREATE TABLE IF NOT EXISTS generation_cursors (rule_id TEXT PRIMARY KEY, last_day TEXT NOT NULL);`)
      return db
    })()
    return this.dbPromise
  }
  async versions(accountId, memberId) {
    await this.routines.assertMember(accountId, memberId)
    const versions = ((await this.routines.templates.read()).dailyRules ?? []).filter(rule => rule.accountId === accountId && rule.memberId === memberId)
    // The established guest merge transaction transfers members and rules in
    // JSON. Reconcile proposals to that canonical ownership (also crash-safe).
    if (versions.length) { const db = await this.database(); for (const id of new Set(versions.map(rule => rule.id))) db.prepare('UPDATE instances SET account_id=? WHERE rule_id=? AND member_id=? AND account_id<>?').run(accountId, id, memberId, accountId) }
    return versions
  }
  async settings(accountId, memberId) {
    const versions = await this.versions(accountId, memberId), latest = new Map()
    for (const rule of versions) if (!latest.has(rule.kind) || latest.get(rule.kind).revision < rule.revision) latest.set(rule.kind, rule)
    return [...latest.values()]
  }
  async saveSettings(accountId, memberId, input, now = new Date(), operationKey = '') {
    return accountTransaction(this.directory, async () => {
      if (!input || !kinds.has(input.kind)) fail('每天记录类型无效')
      if (typeof input.enabled !== 'boolean' || !Number.isInteger(input.revision) || input.revision < 0) fail('请核对每天设置状态与版本')
      const current = (await this.settings(accountId, memberId)).find(rule => rule.kind === input.kind)
      const zone = validTimeZone(input.timeZone)
      if (!zone) fail('请核对记录时区')
      const data = await this.routines.templates.read()
      if (operationKey && data.dailyOperations?.some(op => op.accountId === accountId && op.key === operationKey)) return current
      if (Number(input.revision ?? 0) !== (current?.revision ?? 0)) throw new DailyRecordError('每天设置已更新，请重新加载后再修改', 409, 'DAILY_SETTINGS_CONFLICT')
      const tomorrow = shiftDay(localDateKey(now, zone))
      if (!Array.isArray(input.slots) || input.slots.length > 12) fail('每天最多设置12项')
      if (input.enabled && !input.slots.some(slot => slot?.enabled === true)) fail('请添加并启用至少一项')
      const seenIds = new Set(), seenTimes = new Set()
      const slots = input.slots.map(slot => {
        if (!slot || typeof slot.enabled !== 'boolean' || typeof slot.name !== 'string' || typeof slot.time !== 'string') fail('请核对时段内容')
        if (!idPattern.test(slot.id ?? '') || seenIds.has(slot.id)) fail('时段标识无效或重复')
        seenIds.add(slot.id)
        const name = String(slot.name ?? '').trim()
        if (name.length > 20 || (!name && input.enabled !== false && slot.enabled !== false)) fail('请填写1至20字的名称')
        if (input.enabled !== false && slot.enabled !== false) {
          if (!clockPattern.test(slot.time ?? '')) fail(`${name}：请填写时间`)
          if (seenTimes.has(slot.time)) fail('同一规则不能设置两个相同时间，请合并或修改')
          seenTimes.add(slot.time)
          try { dailySnapshot(input.kind, slot.fields ?? {}, tomorrow, slot.time, zone) } catch (error) { fail(`${name}：${error.message}`) }
        }
        return { id: slot.id, name, time: slot.time || '', enabled: slot.enabled !== false, fields: safeFields(input.kind, slot.fields ?? {}) }
      })
      const rule = { id: current?.id ?? randomUUID(), accountId, memberId, kind: input.kind, revision: (current?.revision ?? 0) + 1, timeZone: zone, enabled: input.enabled !== false && slots.some(slot => slot.enabled), slots, effectiveFrom: tomorrow, effectiveAt: input.enabled === false ? now.toISOString() : zonedInstant(tomorrow, '00:00', zone), createdAt: current?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() }
      if (current && current.enabled === rule.enabled && current.timeZone === rule.timeZone && JSON.stringify(current.slots) === JSON.stringify(slots)) return current
      await this.routines.templates.update(state => ({ ...state, dailyRules: [...(state.dailyRules ?? []), rule], dailyOperations: [...(state.dailyOperations ?? []), ...(operationKey ? [{ accountId, key: operationKey }] : [])] }))
      return rule
    })
  }
  async saveWithRecord(accountId, input, now = new Date()) {
    return withStorageLock(async () => {
    if (input.dailySettings && !matchesKind(input.dailySettings.kind, input.journal)) fail('每天设置必须对应本次记录类型')
    if (input.automaticInstanceId) {
      const instance = await this.instance(accountId, input.memberId, input.automaticInstanceId)
      if (instance.status === 'skipped' || instance.plannedAt > now.toISOString()) fail('本次未发生或尚未到达时间，不能关联')
      if (!matchesKind(instance.kind, input.journal)) fail('请选择对应类型的自动记录')
      const existingRequest = await this.routines.quickRecords.requests?.find(accountId, input.idempotencyKey)
      if (instance.status === 'confirmed') {
        if (existingRequest?.recordId !== instance.recordId) throw new DailyRecordError('本次已关联实际记录，请打开原记录', 409)
        return { recordId: instance.recordId, eventId: instance.eventId, idempotent: true }
      }
      if (instance.claimKey === input.idempotencyKey && existingRequest?.recordId) {
        await this.link(accountId, input.memberId, instance.id, existingRequest, now)
        return { recordId: existingRequest.recordId, eventId: existingRequest.eventId, idempotent: true }
      }
      await this.claim(accountId, input.memberId, instance, input.idempotencyKey, now)
    }
    let saved
    try { saved = await accountTransaction(this.directory, async () => {
      if (input.dailySettings) await this.saveSettings(accountId, input.memberId, input.dailySettings, now, input.idempotencyKey)
      return this.routines.quickRecords.create(accountId, input, now)
    }) } catch (error) { if (input.automaticInstanceId) await this.release(input.automaticInstanceId, input.idempotencyKey); throw error }
    if (input.automaticInstanceId) {
      try { await this.link(accountId, input.memberId, input.automaticInstanceId, saved, now) }
      catch { throw new DailyRecordError('记录及每天设置已保存，自动条目关联待重试；再次保存不会重复记录', 503, 'DAILY_LINK_PENDING') }
    }
    return saved
    })
  }
  async materialize(now = new Date()) {
    const data = await this.routines.templates.read(), versions = data.dailyRules ?? [], groups = new Map()
    for (const rule of versions) { const list = groups.get(rule.id) ?? []; list.push(rule); groups.set(rule.id, list) }
    const db = await this.database()
    for (const history of groups.values()) {
      history.sort((a, b) => a.revision - b.revision)
      const first = history[0], today = localDateKey(now, first.timeZone)
      const member = await this.routines.members.findById(first.memberId)
      if (member?.accountId !== first.accountId) continue
      db.prepare('UPDATE instances SET account_id=? WHERE rule_id=? AND member_id=? AND account_id<>?').run(first.accountId, first.id, first.memberId, first.accountId)
      const cursor = db.prepare('SELECT last_day FROM generation_cursors WHERE rule_id=?').get(first.id)
      for (let day = cursor ? shiftDay(cursor.last_day) : first.effectiveFrom; day <= today; day = shiftDay(day)) {
        const candidates = new Map()
        for (const version of history) for (const slot of version.slots) candidates.set(`${slot.id}:${slot.time}`, slot)
        for (const slot of candidates.values()) {
          if (!clockPattern.test(slot.time)) continue
          const at = zonedInstant(day, slot.time, first.timeZone)
          if (!at || at > now.toISOString()) continue
          const active = history.filter(version => version.effectiveAt <= at).at(-1)
          const selected = active?.slots.find(value => value.id === slot.id && value.time === slot.time)
          if (!active?.enabled || !selected?.enabled || (selected.fields.endDate && day > selected.fields.endDate)) continue
          // Removing/pausing an individual slot stops future proposals immediately;
          // resuming or changing its contents still takes effect the next local day.
          if (history.some(version => version.revision > active.revision && version.updatedAt <= at && (!version.enabled || !version.slots.some(value => value.id === slot.id && value.enabled)))) continue
          const identity = `${first.accountId}:${first.memberId}:${first.id}:${slot.id}:${day}`
          const payload = { id: createHash('sha256').update(identity).digest('hex'), ruleId: first.id, slotId: slot.id, revision: active.revision, day, kind: active.kind, name: selected.name, plannedAt: at, generatedAt: now.toISOString(), timeZone: active.timeZone, fields: selected.fields, journal: dailySnapshot(active.kind, selected.fields, day, slot.time, active.timeZone) }
          db.prepare('INSERT OR IGNORE INTO instances (id,account_id,member_id,rule_id,slot_id,day,planned_at,generated_at,payload) VALUES (?,?,?,?,?,?,?,?,?)').run(payload.id, first.accountId, first.memberId, first.id, slot.id, day, at, now.toISOString(), JSON.stringify(payload))
        }
        if (day < today) db.prepare('INSERT INTO generation_cursors (rule_id,last_day) VALUES (?,?) ON CONFLICT(rule_id) DO UPDATE SET last_day=MAX(last_day,excluded.last_day)').run(first.id, day)
      }
    }
  }
  async instances(accountId, memberId, day) {
    await this.versions(accountId, memberId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('日期无效')
    const db = await this.database()
    return db.prepare('SELECT * FROM instances WHERE account_id=? AND member_id=? AND day=? ORDER BY planned_at DESC,id DESC').all(accountId, memberId, day).map(row => ({ ...JSON.parse(row.payload), status: row.status }))
  }
  async instance(accountId, memberId, id) {
    await this.versions(accountId, memberId)
    const row = (await this.database()).prepare('SELECT * FROM instances WHERE id=? AND account_id=? AND member_id=?').get(id, accountId, memberId)
    if (!row) throw new DailyRecordError('未找到本次自动记录', 404)
    return { ...JSON.parse(row.payload), status: row.status }
  }
  async source(accountId, memberId, recordId) {
    await this.versions(accountId, memberId)
    const row = (await this.database()).prepare("SELECT payload FROM instances WHERE account_id=? AND member_id=? AND status='confirmed' AND json_extract(payload,'$.recordId')=?").get(accountId, memberId, recordId)
    return row ? { ...JSON.parse(row.payload), status: 'confirmed' } : null
  }
  async link(accountId, memberId, id, saved, now = new Date()) {
    const instance = await this.instance(accountId, memberId, id)
    if (instance.plannedAt > now.toISOString()) fail('尚未到达本次时间')
    if (instance.recordId && instance.recordId !== saved.recordId) throw new DailyRecordError('本次已经关联另一条实际记录', 409)
    const db = await this.database()
    db.prepare("UPDATE instances SET status='confirmed',payload=? WHERE id=?").run(JSON.stringify({ ...instance, ...saved, confirmedAt: now.toISOString() }), id)
  }
  async claim(accountId, memberId, instance, key, now) {
    const db = await this.database()
    if (instance.status === 'confirming' && Date.parse(instance.claimedAt) + 120_000 > now.getTime()) throw new DailyRecordError('本次正在确认，请稍后刷新', 409)
    const row = db.prepare('SELECT payload FROM instances WHERE id=? AND account_id=? AND member_id=?').get(instance.id, accountId, memberId)
    const claimed = { ...JSON.parse(row.payload), claimKey: key, claimedAt: now.toISOString() }
    const result = db.prepare("UPDATE instances SET status='confirming',payload=? WHERE id=? AND account_id=? AND member_id=? AND status IN ('unconfirmed','confirming') AND payload=?").run(JSON.stringify(claimed), instance.id, accountId, memberId, row.payload)
    if (!result.changes) throw new DailyRecordError('本次状态已变化，请刷新', 409)
  }
  async release(id, key) {
    const db = await this.database(), row = db.prepare('SELECT payload,status FROM instances WHERE id=?').get(id)
    if (row?.status === 'confirming' && JSON.parse(row.payload).claimKey === key) db.prepare("UPDATE instances SET status='unconfirmed' WHERE id=? AND payload=?").run(id, row.payload)
  }
  async act(accountId, memberId, id, input, now = new Date()) {
    return withStorageLock(async () => {
      const instance = await this.instance(accountId, memberId, id)
      if (instance.plannedAt > now.toISOString()) fail('尚未到达本次时间')
      const db = await this.database()
      if (input.action === 'skip') { if (instance.status === 'confirmed' || instance.status === 'confirming') fail('本次已确认或正在确认，请在详情中处理'); db.prepare("UPDATE instances SET status='skipped' WHERE id=? AND status='unconfirmed'").run(id); return { ...instance, status: 'skipped' } }
      if (input.action !== 'confirm') fail('操作无效')
      if (instance.status === 'confirmed') return instance
      if (instance.status === 'skipped') fail('本次已标记未发生，不会生成实际记录')
      const prior = await this.routines.quickRecords.requests?.find(accountId, `daily_${id}`)
      if (prior?.recordId) { await this.link(accountId, memberId, id, prior, now); return { ...instance, recordId: prior.recordId, eventId: prior.eventId, status: 'confirmed' } }
      const occurredAt = input.occurredAt ?? instance.plannedAt
      if (!Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > now.getTime()) fail('请填写已经发生的真实时间')
      const localClock = new Intl.DateTimeFormat('sv-SE', { timeZone: instance.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(occurredAt))
      let journal = input.journal ? validateJournal(input.journal) : dailySnapshot(instance.kind, input.fields ?? instance.fields, localDateKey(new Date(occurredAt), instance.timeZone), localClock, instance.timeZone)
      if (!matchesKind(instance.kind, journal)) fail('当次调整不能更换记录类型')
      if (journal.diet) journal = validateJournal({ ...journal, diet: { ...journal.diet, name: instance.name } })
      if (instance.kind === 'sleep') {
        journal.sleep.sleepAt = occurredAt
        if (input.sleepStatus === 'completed') {
          if (!input.wakeAt || Date.parse(input.wakeAt) <= Date.parse(occurredAt) || Date.parse(input.wakeAt) > now.getTime()) fail('请填写真实醒来时间，且晚于入睡时间')
          journal.sleep = { ...journal.sleep, status: 'completed', wakeAt: input.wakeAt }
        } else journal.sleep = { kind: journal.sleep.kind, sleepAt: occurredAt, timeZone: instance.timeZone, status: 'ongoing' }
        journal = validateJournal(journal)
      }
      if (instance.kind === 'sleep') {
        const records = await this.routines.records.repository.findByAccountId(accountId)
        for (const record of records) if (record.journal?.sleep?.status === 'ongoing' && (await this.routines.events.repository.findById(record.eventId))?.memberId === memberId) throw new DailyRecordError('已有正在睡眠的记录，请在原记录确认，或明确关联本次自动记录', 409)
      }
      // Recoverable bridge: QuickRecord's persistent idempotency key prevents a
      // crash between the actual write and instance linking from duplicating it.
      const recordInput = { memberId, title: instance.name, content: actualContent(instance.name, journal), occurredAt, inputChannel: 'text', idempotencyKey: `daily_${id}`, journal }
      await this.claim(accountId, memberId, instance, recordInput.idempotencyKey, now)
      const duplicate = await this.routines.quickRecords.checkDuplicate?.(accountId, recordInput, now)
      if (duplicate?.duplicate) Object.assign(recordInput, { duplicateAction: 'create', duplicateEventId: duplicate.duplicate.eventId })
      let saved
      try { saved = await accountTransaction(this.directory, () => this.routines.quickRecords.create(accountId, recordInput, now)) }
      catch (error) { await this.release(id, recordInput.idempotencyKey); throw error }
      try { await this.link(accountId, memberId, id, saved, now) }
      catch { throw new DailyRecordError('实际记录已保存，关联待重试；再次确认不会重复记录', 503, 'DAILY_LINK_PENDING') }
      return { ...instance, ...saved, status: 'confirmed' }
    })
  }
}
