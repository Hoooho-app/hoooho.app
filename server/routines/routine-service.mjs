import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const itemDefinitions = {
  nightSleep: { title: '夜间睡眠', category: 'sleep' },
  breakfast: { title: '早餐', category: 'diet', meal: '早餐' },
  lunch: { title: '午餐', category: 'diet', meal: '午餐' },
  dinner: { title: '晚餐', category: 'diet', meal: '晚餐' }
}

export class RoutineError extends Error {
  constructor(message, status = 400, code = 'INVALID_ROUTINE') { super(message); this.status = status; this.code = code }
}

const dateKey = (value, timeZone) => new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(value))

const cleanItems = (input) => Object.entries(itemDefinitions).flatMap(([key, definition]) => {
  const item = input?.[key]
  if (!item?.enabled) return []
  if (!timePattern.test(item.time ?? '')) throw new RoutineError(`${definition.title}时间无效`)
  if (key === 'nightSleep' && !timePattern.test(item.endTime ?? '')) throw new RoutineError('夜间睡眠结束时间无效')
  return [{ key, title: definition.title, category: definition.category, ...(definition.meal ? { meal: definition.meal } : {}), time: item.time, ...(key === 'nightSleep' ? { endTime: item.endTime } : {}) }]
})

export class RoutineService {
  constructor(options = {}) {
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.quickRecords = options.quickRecords ?? null
    this.records = options.records ?? this.quickRecords?.records
    this.events = options.events ?? this.quickRecords?.events
    this.preferences = new JsonStore(path.join(options.dataDirectory, 'routine-preferences.json'), { preferences: [] })
    this.templates = new JsonStore(path.join(options.dataDirectory, 'routine-templates.json'), { templates: [] })
    this.overrides = new JsonStore(path.join(options.dataDirectory, 'routine-overrides.json'), { overrides: [] })
  }

  async assertMember(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new RoutineError('未找到当前记录对象', 404, 'MEMBER_NOT_FOUND')
    return member
  }

  async preference(accountId, memberId) {
    const data = await this.preferences.read()
    return data.preferences.find((item) => item.accountId === accountId && item.memberId === memberId) ?? null
  }

  async setPreference(accountId, memberId, status, now = new Date(), timeZone = 'Asia/Shanghai') {
    await this.assertMember(accountId, memberId)
    if (!['declined', 'disabled'].includes(status)) throw new RoutineError('作息设置状态无效')
    let saved
    await this.preferences.update((data) => {
      const previous = data.preferences.find((item) => item.accountId === accountId && item.memberId === memberId)
      saved = { ...previous, id: previous?.id ?? randomUUID(), accountId, memberId, status, firstEnabledOn: previous?.firstEnabledOn ?? null, updatedAt: now.toISOString(), createdAt: previous?.createdAt ?? now.toISOString() }
      return { ...data, preferences: previous ? data.preferences.map((item) => item === previous ? saved : item) : [...data.preferences, saved] }
    })
    if (status === 'disabled') await this.saveTemplateVersion(accountId, memberId, { effectiveFrom: dateKey(now, timeZone), enabled: false, items: [] }, now)
    return saved
  }

  async saveTemplateVersion(accountId, memberId, input, now = new Date()) {
    await this.assertMember(accountId, memberId)
    const effectiveFrom = String(input?.effectiveFrom ?? '')
    if (!datePattern.test(effectiveFrom)) throw new RoutineError('作息生效日期无效')
    const enabled = input.enabled !== false
    const items = enabled ? cleanItems(input.items) : []
    if (enabled && !items.length) throw new RoutineError('请至少设置一项日常作息')
    let saved
    await this.templates.update((data) => {
      const previous = data.templates.find((item) => item.accountId === accountId && item.memberId === memberId && item.effectiveFrom === effectiveFrom)
      saved = { id: previous?.id ?? randomUUID(), accountId, memberId, effectiveFrom, enabled, items, createdAt: previous?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() }
      return { ...data, templates: previous ? data.templates.map((item) => item === previous ? saved : item) : [...data.templates, saved] }
    })
    await this.preferences.update((data) => {
      const previous = data.preferences.find((item) => item.accountId === accountId && item.memberId === memberId)
      const next = { ...previous, id: previous?.id ?? randomUUID(), accountId, memberId, status: enabled ? 'enabled' : 'disabled', firstEnabledOn: previous?.firstEnabledOn ?? (enabled ? effectiveFrom : null), createdAt: previous?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() }
      return { ...data, preferences: previous ? data.preferences.map((item) => item === previous ? next : item) : [...data.preferences, next] }
    })
    return saved
  }

  async activeTemplate(accountId, memberId, day) {
    const data = await this.templates.read()
    return data.templates.filter((item) => item.accountId === accountId && item.memberId === memberId && item.effectiveFrom <= day)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  }

  async actualMatches(accountId, memberId, day, item, timeZone) {
    if (!this.records || !this.events) return []
    const records = await this.records.repository.findByAccountId(accountId)
    const matches = []
    for (const record of records) {
      if (await this.recordMatchesTrack(accountId, memberId, day, item, timeZone, record)) matches.push(record)
    }
    return matches
  }

  async recordMatchesTrack(accountId, memberId, day, item, timeZone, record) {
    if (!record || record.accountId !== accountId || !this.events) return null
    const event = await this.events.repository.findById(record.eventId)
    if (!event || event.memberId !== memberId) return null
    if (item.category === 'diet' && record.journal?.diet?.meal === item.meal && dateKey(record.occurredAt, timeZone) === day) return event
    if (item.category === 'sleep' && record.journal?.sleep?.kind === 'night' && record.journal.sleep.sleepAt && dateKey(record.journal.sleep.sleepAt, timeZone) === day) return event
    return null
  }

  async getDay(accountId, memberId, day, timeZone = 'Asia/Shanghai') {
    await this.assertMember(accountId, memberId)
    if (!datePattern.test(day)) throw new RoutineError('日期无效')
    const preference = await this.preference(accountId, memberId)
    const template = preference?.firstEnabledOn && day >= preference.firstEnabledOn ? await this.activeTemplate(accountId, memberId, day) : null
    if (!template?.enabled) return { consent: preference?.status ?? 'unset', template: template ?? null, tracks: [] }
    const overrideData = await this.overrides.read()
    const dayOverrides = overrideData.overrides.filter((item) => item.accountId === accountId && item.memberId === memberId && item.day === day)
    const tracks = []
    for (const item of template.items) {
      const override = dayOverrides.find((entry) => entry.itemKey === item.key)
      let status = override?.status ?? 'routine'
      let recordId = override?.recordId ?? null
      let eventId = null
      if (status === 'confirmed' && recordId) {
        const record = await this.records?.repository.findById(recordId)
        const event = await this.recordMatchesTrack(accountId, memberId, day, item, timeZone, record)
        if (!event) { status = 'routine'; recordId = null }
        else eventId = event.id
      }
      if (status === 'routine') {
        const matches = await this.actualMatches(accountId, memberId, day, item, timeZone)
        if (matches.length === 1) { status = 'confirmed'; recordId = matches[0].id; eventId = matches[0].eventId }
      }
      tracks.push({ trackKey: `${template.id}:${day}:${item.key}`, templateId: template.id, day, itemKey: item.key, title: item.title, category: item.category, meal: item.meal, time: item.time, endTime: item.endTime, status, recordId, eventId })
    }
    return { consent: preference?.status ?? 'unset', template, tracks }
  }

  async setOverride(accountId, memberId, day, itemKey, input, now = new Date(), timeZone = 'Asia/Shanghai') {
    const result = await this.getDay(accountId, memberId, day, timeZone)
    const track = result.tracks.find((item) => item.itemKey === itemKey)
    if (!track) throw new RoutineError('这条日常轨迹已经失效', 404, 'ROUTINE_TRACK_NOT_FOUND')
    if (input.action === 'reset') { await this.removeOverride(accountId, memberId, day, itemKey); return { ...track, status: 'routine', recordId: null } }
    if (input.action === 'skipped') return this.saveOverride(accountId, memberId, day, itemKey, { status: 'skipped', recordId: null }, now)
    if (input.action !== 'confirm' || !this.quickRecords) throw new RoutineError('操作无效')
    if (track.status === 'confirmed' && track.recordId) return { ...track, idempotent: true }
    const scheduled = new Date(track.category === 'sleep' ? input.sleepAt : input.occurredAt)
    if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() > now.getTime()) throw new RoutineError('尚未到达这个时间，请调整为实际发生时间后保存', 400, 'FUTURE_ROUTINE_CONFIRMATION')
    let journal
    let content
    let occurredAt = scheduled.toISOString()
    if (track.category === 'diet') {
      const foods = Array.isArray(input.foods) ? input.foods.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12) : []
      journal = { categories: ['diet'], occurredAt, timePrecision: 'exact', diet: { kind: 'meal', meal: track.meal, ...(foods.length ? { foods } : {}) } }
      content = foods.length ? `${track.title} · ${foods.join('、')}` : track.title
    } else {
      const sleepAt = new Date(input.sleepAt)
      const wakeAt = new Date(input.wakeAt)
      if ([sleepAt, wakeAt].some((value) => Number.isNaN(value.getTime())) || wakeAt <= sleepAt || wakeAt > now) throw new RoutineError('请填写已经结束的真实睡眠时间', 400, 'INVALID_ROUTINE_SLEEP')
      occurredAt = wakeAt.toISOString()
      journal = { categories: ['sleep'], occurredAt, timePrecision: 'exact', sleep: { sleepAt: sleepAt.toISOString(), wakeAt: wakeAt.toISOString(), durationMinutes: Math.round((wakeAt - sleepAt) / 60000), kind: 'night', status: 'completed' } }
      content = '夜间睡眠'
    }
    const saved = await this.quickRecords.create(accountId, { memberId, content, occurredAt, inputChannel: 'text', title: content, idempotencyKey: String(input.idempotencyKey ?? ''), journal }, now)
    await this.saveOverride(accountId, memberId, day, itemKey, { status: 'confirmed', recordId: saved.recordId }, now)
    return { ...track, status: 'confirmed', recordId: saved.recordId, eventId: saved.eventId, idempotent: saved.idempotent }
  }

  async saveOverride(accountId, memberId, day, itemKey, changes, now) {
    let saved
    await this.overrides.update((data) => {
      const previous = data.overrides.find((item) => item.accountId === accountId && item.memberId === memberId && item.day === day && item.itemKey === itemKey)
      saved = { ...previous, id: previous?.id ?? randomUUID(), accountId, memberId, day, itemKey, ...changes, createdAt: previous?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() }
      return { ...data, overrides: previous ? data.overrides.map((item) => item === previous ? saved : item) : [...data.overrides, saved] }
    })
    return saved
  }

  async removeOverride(accountId, memberId, day, itemKey) {
    await this.overrides.update((data) => ({ ...data, overrides: data.overrides.filter((item) => !(item.accountId === accountId && item.memberId === memberId && item.day === day && item.itemKey === itemKey)) }))
    return { success: true }
  }
}
