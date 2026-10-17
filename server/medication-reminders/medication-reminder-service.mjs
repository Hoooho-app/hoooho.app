import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { validTimeZone, localDateKey } from '../time/local-calendar.mjs'
import { validCalendarDate } from '../time/strict-date.mjs'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const modes = new Set(['daily', 'interval', 'once'])
const medicationTypes = new Set(['drops', 'syrup', 'tablet', 'spray', 'ointment', 'other'])
const routes = new Set(['oral', 'topical', 'inhaled', 'nasal', 'ophthalmic', 'other'])

export class MedicationReminderError extends Error {
  constructor(message, status = 400, code = 'INVALID_MEDICATION_REMINDER') { super(message); this.status = status; this.code = code }
}

function validDate(value) { return validCalendarDate(value) }
function numericField(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim())) ? Number(value) : NaN
}

function addDays(day, amount) {
  const [year, month, date] = day.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, date + amount))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function dayDifference(start, end) {
  const parse = (day) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((parse(end) - parse(start)) / 86_400_000)
}

const zoneFormatters = new Map()
function zoneFormatter(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null
  const cached = zoneFormatters.get(timeZone)
  if (cached) return cached
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    })
    const entry = { formatter }
    // Bound process memory even when requests use many valid timezone aliases.
    if (zoneFormatters.size >= 32) zoneFormatters.delete(zoneFormatters.keys().next().value)
    zoneFormatters.set(timeZone, entry)
    return entry
  } catch { return null }
}

function zonedParts(value, timeZone) {
  return Object.fromEntries(zoneFormatter(timeZone).formatter.formatToParts(value).map((part) => [part.type, part.value]))
}

function zonedDateKey(value, timeZone) {
  const parts = zonedParts(value, timeZone)
  return parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day
}

export function zonedDateTime(day, time, timeZone) {
  const zone = zoneFormatter(timeZone)
  if (!validDate(day) || typeof time !== 'string' || !timePattern.test(time) || !zone) return null
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(year, month - 1, date, hour, minute)
  let guess = new Date(target)
  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(guess, timeZone)
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const adjustment = target - represented
    if (!adjustment) break
    guess = new Date(guess.getTime() + adjustment)
  }
  const actual = zonedParts(guess, timeZone)
  if (Number(actual.year) !== year || Number(actual.month) !== month || Number(actual.day) !== date || Number(actual.hour) !== hour || Number(actual.minute) !== minute) return null
  return guess
}

function occurrenceId(reminderId, scheduledAt) {
  return `occ-${createHash('sha256').update(`${reminderId}:${scheduledAt}`).digest('hex').slice(0, 24)}`
}

function normalizePlan(input, fallbackTimeZone = 'Asia/Shanghai') {
  const medicationName = typeof input?.medicationName === 'string' ? input.medicationName.trim() : ''
  const medicationType = input?.medicationType
  const amount = numericField(input?.amount)
  const unit = typeof input?.unit === 'string' ? input.unit.trim() : ''
  const route = input?.route
  const mode = input?.mode
  const startDate = input?.startDate
  const timezone = input?.timezone === undefined ? validTimeZone(fallbackTimeZone) : validTimeZone(input.timezone)
  if (!Array.isArray(input?.times) || input.times.some(value => typeof value !== 'string' || !timePattern.test(value))) throw new MedicationReminderError('提醒时间无效')
  const times = [...new Set(input.times)].sort()
  if (!medicationName || medicationName.length > 120 || !medicationTypes.has(medicationType)) throw new MedicationReminderError('药品信息无效')
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || !unit || unit.length > 20 || !routes.has(route)) throw new MedicationReminderError('每次用量或使用方式无效')
  if (!modes.has(mode) || !validDate(startDate) || !times.length || !timezone) throw new MedicationReminderError('提醒规律无效')
  if (times.some(time => !zonedDateTime(startDate, time, timezone))) throw new MedicationReminderError('这个当地提醒时间不存在，请调整时间')
  if (mode === 'once' && times.length !== 1) throw new MedicationReminderError('单次提醒只能设置一个时间')
  const intervalHours = mode === 'interval' ? numericField(input?.intervalHours) : undefined
  if (mode === 'interval' && (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168 || times.length !== 1)) throw new MedicationReminderError('间隔小时数无效')
  const longTerm = input?.longTerm === true
  const durationDays = longTerm || input?.durationDays === undefined || input?.durationDays === null ? undefined : numericField(input.durationDays)
  const endDate = longTerm || input?.endDate === undefined || input?.endDate === null || input?.endDate === '' ? undefined : input.endDate
  if (endDate !== undefined && (!validDate(endDate) || endDate < startDate)) throw new MedicationReminderError('结束日期无效')
  if (endDate !== undefined && (dayDifference(startDate, endDate) + 1 < 1 || dayDifference(startDate, endDate) + 1 > 3650)) throw new MedicationReminderError('持续天数应为1至3650天')
  if (!longTerm && endDate === undefined && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) throw new MedicationReminderError('持续天数无效')
  const reminderTargets = [...new Set((Array.isArray(input?.reminderTargets) ? input.reminderTargets : []).map(String).map((value) => value.trim()).filter(Boolean))].slice(0, 12)
  return { medicationName, medicationType, amount, unit, route, mode, times, ...(intervalHours ? { intervalHours } : {}), startDate, ...(endDate ? { endDate } : {}), ...(durationDays ? { durationDays } : {}), ...(longTerm ? { longTerm: true } : {}), reminderTargets: reminderTargets.length ? reminderTargets : ['我'], timezone }
}

function planEndDate(plan, now = new Date()) {
  if (plan.mode === 'once') return plan.startDate
  if (plan.longTerm) return addDays(localDateKey(now, plan.timezone), 28)
  if (plan.endDate) return plan.endDate
  if (plan.durationDays) return addDays(plan.startDate, plan.durationDays - 1)
  // Long-term plans expose a bounded rolling projection while next occurrence
  // selection still begins at the original plan start.
  return addDays(localDateKey(now, plan.timezone), 28)
}

const PROJECTION_BUDGET = 100000
function scheduleBudgetIssue(plan, now) {
  const endDate = planEndDate(plan, now)
  let exceeds
  if (plan.mode === 'interval') {
    const first = zonedDateTime(plan.startDate, plan.times[0], plan.timezone)
    const step = plan.intervalHours * 3_600_000
    if (!first || !Number.isFinite(step) || step <= 0) return null
    // The next occurrence after the existing 100000-slot guard proves whether
    // truncation would occur, without constructing the preceding occurrences.
    const afterBudget = localDateKey(new Date(first.getTime() + PROJECTION_BUDGET * step), plan.timezone)
    exceeds = afterBudget !== null && dayDifference(afterBudget, endDate) >= 0
  } else {
    const days = Math.max(1, dayDifference(plan.startDate, endDate) + 1)
    const slots = days * (plan.mode === 'once' ? Math.min(1, plan.times.length) : plan.times.length)
    exceeds = !Number.isFinite(slots) || slots > PROJECTION_BUDGET
  }
  return exceeds ? { code: 'SCHEDULE_TOO_LARGE', day: plan.startDate, time: plan.times[0] ?? '', reason: '这份计划的提醒次数超过100000次，请缩短疗程、调整开始日期或减少提醒时刻后重新设置；原计划和已有记录保留。' } : null
}

function projectSchedule(reminderId, plan, now = new Date()) {
  const budgetIssue = scheduleBudgetIssue(plan, now)
  if (budgetIssue) return { occurrences: [], scheduleIssues: [budgetIssue] }
  const endDate = planEndDate(plan, now)
  const occurrences = []
  const scheduleIssues = []
  const missingTime = (day, time) => ({ day, time, reason: `当地时间不存在（${plan.timezone}），请核对这次用药安排` })
  if (plan.mode === 'interval') {
    const first = zonedDateTime(plan.startDate, plan.times[0], plan.timezone)
    const step = plan.intervalHours * 3_600_000
    if (!first) return { occurrences: [], scheduleIssues: [missingTime(plan.startDate, plan.times[0])] }
    if (!Number.isFinite(step) || step <= 0) return { occurrences: [], scheduleIssues: [] }
    for (let value = first.getTime(), guard = 0; dayDifference(zonedDateKey(new Date(value), plan.timezone), endDate) >= 0 && guard < PROJECTION_BUDGET; value += step, guard += 1) {
      const scheduledAt = new Date(value).toISOString()
      const day = zonedDateKey(new Date(value), plan.timezone)
      occurrences.push({ id: occurrenceId(reminderId, scheduledAt), scheduledAt, day })
    }
  } else {
    const dayCount = Math.max(1, dayDifference(plan.startDate, endDate) + 1)
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      const day = addDays(plan.startDate, dayIndex)
      for (const time of plan.times) {
        const instant = zonedDateTime(day, time, plan.timezone)
        // A recurring plan can encounter a DST gap after creation. Never move a
        // nonexistent slot onto another dose; keep the remaining projection usable.
        if (!instant) { scheduleIssues.push(missingTime(day, time)); continue }
        const scheduledAt = instant.toISOString()
        occurrences.push({ id: occurrenceId(reminderId, scheduledAt), scheduledAt, day })
        if (plan.mode === 'once') break
      }
      if (plan.mode === 'once') break
    }
  }
  const slotsByDay = new Map()
  const indexed = occurrences.map((occurrence) => {
    const slotIndex = slotsByDay.get(occurrence.day) ?? 0
    slotsByDay.set(occurrence.day, slotIndex + 1)
    return { ...occurrence, dayIndex: dayDifference(plan.startDate, occurrence.day), weekIndex: Math.floor(dayDifference(plan.startDate, occurrence.day) / 7), slotIndex }
  })
  return { occurrences: indexed, scheduleIssues }
}

// Preserve the existing array contract for record matching and integrations.
export function buildOccurrences(reminderId, plan, now = new Date()) {
  return projectSchedule(reminderId, plan, now).occurrences
}

function publicReminder(reminder, now = new Date()) {
  const { occurrences: occurrenceList, scheduleIssues } = projectSchedule(reminder.id, reminder.plan, now)
  const activeCompletions = new Map(reminder.completions.filter((item) => !item.undoneAt).map((item) => [item.occurrenceId, item]))
  const occurrences = occurrenceList.map((item) => ({ ...item, completed: activeCompletions.has(item.id), completion: activeCompletions.get(item.id) ?? null }))
  const nextOccurrence = occurrences.find((item) => !item.completed) ?? null
  const totalDays = reminder.plan.longTerm ? null : Math.max(1, dayDifference(reminder.plan.startDate, planEndDate(reminder.plan, now)) + 1)
  return { ...reminder, occurrences, nextOccurrence, totalDays, ...(scheduleIssues.length ? { scheduleIssues } : {}) }
}

export class MedicationReminderService {
  constructor(options = {}) {
    this.dataDirectory = options.dataDirectory
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.events = options.events ?? new HealthEventService(options)
    this.records = options.records ?? new HealthEventRecordService(options)
    this.store = new JsonStore(path.join(options.dataDirectory, 'medication-reminders.json'), { reminders: [] })
  }

  async assertMember(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new MedicationReminderError('未找到当前记录对象', 404, 'MEMBER_NOT_FOUND')
    return member
  }

  async owned(accountId, id, { includeDeleted = false } = {}) {
    const data = await this.store.read()
    const reminder = data.reminders.find((item) => item.id === id && item.accountId === accountId && (includeDeleted || item.status !== 'deleted'))
    if (!reminder) throw new MedicationReminderError('未找到这条用药提醒', 404, 'MEDICATION_REMINDER_NOT_FOUND')
    return reminder
  }

  async list(accountId, memberId, now = new Date()) {
    await this.assertMember(accountId, memberId)
    const data = await this.store.read()
    return data.reminders.filter((item) => item.accountId === accountId && item.memberId === memberId && item.status !== 'deleted').map((item) => publicReminder(item, now))
  }

  async create(accountId, rawInput, now = new Date(), fallbackTimeZone = 'Asia/Shanghai') {
    const memberId = typeof rawInput?.memberId === 'string' ? rawInput.memberId.trim() : ''
    await this.assertMember(accountId, memberId)
    const plan = normalizePlan(rawInput?.plan, fallbackTimeZone)
    const budgetIssue = scheduleBudgetIssue(plan, now)
    if (budgetIssue) throw new MedicationReminderError(budgetIssue.reason, 400, budgetIssue.code)
    if (!plan.longTerm) {
      const issue = projectSchedule('schedule-validation', plan, now).scheduleIssues[0]
      if (issue) throw new MedicationReminderError(`${issue.day} ${issue.time}：${issue.reason}`, 400, 'INVALID_MEDICATION_SCHEDULE')
    }
    const clientId = typeof rawInput?.clientId === 'string' ? rawInput.clientId.trim().slice(0, 180) : ''
    let saved
    await this.store.update((data) => {
      const previous = clientId ? data.reminders.find((item) => item.accountId === accountId && item.memberId === memberId && item.clientId === clientId && item.status !== 'deleted') : null
      saved = previous ? previous : { id: randomUUID(), accountId, memberId, clientId: clientId || null, status: 'active', plan, completions: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }
      return previous ? data : { ...data, reminders: [...data.reminders, saved] }
    })
    return publicReminder(saved, now)
  }

  async complete(accountId, id, occurrenceIdValue, input, now = new Date()) {
    return accountTransaction(this.dataDirectory, async () => {
      const reminder = await this.owned(accountId, id)
      if (reminder.status !== 'active') throw new MedicationReminderError('这条提醒当前不能记录', 409, 'MEDICATION_REMINDER_INACTIVE')
      const occurrence = buildOccurrences(reminder.id, reminder.plan, now).find((item) => item.id === occurrenceIdValue)
      if (!occurrence) throw new MedicationReminderError('这次计划已经失效', 404, 'MEDICATION_OCCURRENCE_NOT_FOUND')
      if (Date.parse(occurrence.scheduledAt) > now.getTime()) throw new MedicationReminderError('还没到计划时间', 409, 'MEDICATION_OCCURRENCE_NOT_DUE')
      const existing = reminder.completions.find((item) => item.occurrenceId === occurrence.id && !item.undoneAt)
      if (existing) return { ...publicReminder(reminder, now), idempotent: true }
      const completedIds = new Set(reminder.completions.filter((item) => !item.undoneAt).map((item) => item.occurrenceId))
      const currentOccurrence = buildOccurrences(reminder.id, reminder.plan, now).find((item) => !completedIds.has(item.id))
      if (currentOccurrence?.id !== occurrence.id) throw new MedicationReminderError('请先处理更早的计划服用', 409, 'MEDICATION_OCCURRENCE_OUT_OF_ORDER')
      const event = await this.events.create(accountId, { memberId: reminder.memberId, title: reminder.plan.medicationName, category: 'other', startTime: now.toISOString() }, now)
      const useText = `${reminder.plan.route === 'oral' ? '已服用' : '已使用'}${reminder.plan.medicationName} ${reminder.plan.amount}${reminder.plan.unit}`
      const record = await this.records.create(accountId, event.id, {
        type: 'medication', content: useText, occurredAt: now.toISOString(), sourceType: 'user_record', sourceText: useText,
        journal: { categories: ['medication'], timePrecision: 'exact', medication: { medicationName: reminder.plan.medicationName, amountValue: reminder.plan.amount, amountUnit: reminder.plan.unit, administrationRoute: reminder.plan.route, medications: [{ id: randomUUID(), medicationName: reminder.plan.medicationName, amountValue: reminder.plan.amount, amountUnit: reminder.plan.unit, dosageStep: 1 }] } }
      }, now)
      const completion = { id: randomUUID(), occurrenceId: occurrence.id, scheduledAt: occurrence.scheduledAt, actualTakenAt: now.toISOString(), completedAt: now.toISOString(), sequence: Math.max(0, ...reminder.completions.map((item) => Number(item.sequence) || 0)) + 1, completedBy: typeof input?.actorId === 'string' ? input.actorId.slice(0, 180) : null, eventId: event.id, recordId: record.id, undoneAt: null }
      let saved
      await this.store.update((data) => ({ ...data, reminders: data.reminders.map((item) => {
        if (item.id !== reminder.id) return item
        const duplicate = item.completions.find((entry) => entry.occurrenceId === occurrence.id && !entry.undoneAt)
        saved = duplicate ? item : { ...item, completions: [...item.completions, completion], updatedAt: now.toISOString() }
        return saved
      }) }))
      return { ...publicReminder(saved, now), idempotent: false }
    })
  }

  async undo(accountId, id, now = new Date()) {
    return accountTransaction(this.dataDirectory, async () => {
      const reminder = await this.owned(accountId, id)
      const latest = reminder.completions.filter((item) => !item.undoneAt).sort((left, right) => (Number(right.sequence) || 0) - (Number(left.sequence) || 0) || right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id))[0]
      if (!latest) throw new MedicationReminderError('没有可撤回的服用记录', 409, 'NO_MEDICATION_COMPLETION_TO_UNDO')
      const record = await this.records.repository.findById(latest.recordId)
      if (record?.accountId === accountId) await this.records.repository.delete(latest.recordId)
      const event = await this.events.repository.findById(latest.eventId)
      if (event?.accountId === accountId) await this.events.repository.delete(latest.eventId)
      let saved
      await this.store.update((data) => ({ ...data, reminders: data.reminders.map((item) => {
        if (item.id !== reminder.id) return item
        saved = { ...item, completions: item.completions.map((entry) => entry.id === latest.id ? { ...entry, undoneAt: now.toISOString() } : entry), updatedAt: now.toISOString() }
        return saved
      }) }))
      return publicReminder(saved, now)
    })
  }

  async archive(accountId, id, now = new Date()) {
    const reminder = await this.owned(accountId, id)
    if (reminder.status === 'archived') return publicReminder(reminder, now)
    let saved
    await this.store.update((data) => ({ ...data, reminders: data.reminders.map((item) => item.id === id ? (saved = { ...item, status: 'archived', archivedAt: now.toISOString(), updatedAt: now.toISOString() }) : item) }))
    return publicReminder(saved, now)
  }

  async delete(accountId, id) {
    return accountTransaction(this.dataDirectory, async () => {
      const data = await this.store.read()
      const reminder = data.reminders.find((item) => item.id === id)
      if (!reminder) return { deleted: true, idempotent: true }
      if (reminder.accountId !== accountId) throw new MedicationReminderError('未找到这条用药提醒', 404, 'MEDICATION_REMINDER_NOT_FOUND')
      for (const completion of reminder.completions) {
        const record = await this.records.repository.findById(completion.recordId)
        if (record?.accountId === accountId) await this.records.repository.delete(completion.recordId)
        const event = await this.events.repository.findById(completion.eventId)
        if (event?.accountId === accountId) await this.events.repository.delete(completion.eventId)
      }
      await this.store.update((current) => ({ ...current, reminders: current.reminders.filter((item) => item.id !== id) }))
      return { deleted: true, idempotent: false }
    })
  }
}
