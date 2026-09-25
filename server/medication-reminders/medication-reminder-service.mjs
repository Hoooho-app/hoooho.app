import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { validTimeZone, localDateKey } from '../time/local-calendar.mjs'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const modes = new Set(['daily', 'interval', 'once'])
const medicationTypes = new Set(['drops', 'syrup', 'tablet', 'spray', 'ointment', 'other'])
const routes = new Set(['oral', 'topical', 'inhaled', 'nasal', 'ophthalmic', 'other'])

export class MedicationReminderError extends Error {
  constructor(message, status = 400, code = 'INVALID_MEDICATION_REMINDER') { super(message); this.status = status; this.code = code }
}

function validDate(value) {
  if (!datePattern.test(value ?? '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
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

function zonedParts(value, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).map((part) => [part.type, part.value]))
}

export function zonedDateTime(day, time, timeZone) {
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
  return guess
}

function occurrenceId(reminderId, scheduledAt) {
  return `occ-${createHash('sha256').update(`${reminderId}:${scheduledAt}`).digest('hex').slice(0, 24)}`
}

function normalizePlan(input, fallbackTimeZone = 'Asia/Shanghai') {
  const medicationName = typeof input?.medicationName === 'string' ? input.medicationName.trim() : ''
  const medicationType = String(input?.medicationType ?? '')
  const amount = Number(input?.amount)
  const unit = typeof input?.unit === 'string' ? input.unit.trim() : ''
  const route = String(input?.route ?? '')
  const mode = String(input?.mode ?? '')
  const startDate = String(input?.startDate ?? '')
  const timezone = validTimeZone(input?.timezone) ?? validTimeZone(fallbackTimeZone)
  const times = [...new Set((Array.isArray(input?.times) ? input.times : []).map(String).filter((value) => timePattern.test(value)))].sort()
  if (!medicationName || medicationName.length > 120 || !medicationTypes.has(medicationType)) throw new MedicationReminderError('药品信息无效')
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || !unit || unit.length > 20 || !routes.has(route)) throw new MedicationReminderError('每次用量或使用方式无效')
  if (!modes.has(mode) || !validDate(startDate) || !times.length || !timezone) throw new MedicationReminderError('提醒规律无效')
  if (mode === 'once' && times.length !== 1) throw new MedicationReminderError('单次提醒只能设置一个时间')
  const intervalHours = mode === 'interval' ? Number(input?.intervalHours) : undefined
  if (mode === 'interval' && (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168 || times.length !== 1)) throw new MedicationReminderError('间隔小时数无效')
  const longTerm = input?.longTerm === true
  const durationDays = input?.durationDays === undefined || input?.durationDays === null ? undefined : Number(input.durationDays)
  const endDate = typeof input?.endDate === 'string' && input.endDate ? input.endDate : undefined
  if (!longTerm && endDate && (!validDate(endDate) || endDate < startDate)) throw new MedicationReminderError('结束日期无效')
  if (!longTerm && !endDate && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) throw new MedicationReminderError('持续天数无效')
  const reminderTargets = [...new Set((Array.isArray(input?.reminderTargets) ? input.reminderTargets : []).map(String).map((value) => value.trim()).filter(Boolean))].slice(0, 12)
  return { medicationName, medicationType, amount, unit, route, mode, times, ...(intervalHours ? { intervalHours } : {}), startDate, ...(endDate ? { endDate } : {}), ...(durationDays ? { durationDays } : {}), ...(longTerm ? { longTerm: true } : {}), reminderTargets: reminderTargets.length ? reminderTargets : ['我'], timezone }
}

function planEndDate(plan, now = new Date()) {
  if (plan.mode === 'once') return plan.startDate
  if (plan.endDate) return plan.endDate
  if (plan.durationDays) return addDays(plan.startDate, plan.durationDays - 1)
  // Long-term plans expose a bounded rolling projection while next occurrence
  // selection still begins at the original plan start.
  return addDays(localDateKey(now, plan.timezone), 28)
}

export function buildOccurrences(reminderId, plan, now = new Date()) {
  const endDate = planEndDate(plan, now)
  const occurrences = []
  if (plan.mode === 'interval') {
    const first = zonedDateTime(plan.startDate, plan.times[0], plan.timezone)
    const end = zonedDateTime(addDays(endDate, 1), '00:00', plan.timezone).getTime()
    const step = plan.intervalHours * 3_600_000
    for (let value = first.getTime(), guard = 0; value < end && guard < 100000; value += step, guard += 1) {
      const scheduledAt = new Date(value).toISOString()
      const day = localDateKey(new Date(value), plan.timezone)
      occurrences.push({ id: occurrenceId(reminderId, scheduledAt), scheduledAt, day })
    }
  } else {
    const dayCount = Math.max(1, dayDifference(plan.startDate, endDate) + 1)
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      const day = addDays(plan.startDate, dayIndex)
      for (const time of plan.times) {
        const scheduledAt = zonedDateTime(day, time, plan.timezone).toISOString()
        occurrences.push({ id: occurrenceId(reminderId, scheduledAt), scheduledAt, day })
        if (plan.mode === 'once') break
      }
      if (plan.mode === 'once') break
    }
  }
  const slotsByDay = new Map()
  return occurrences.map((occurrence) => {
    const slotIndex = slotsByDay.get(occurrence.day) ?? 0
    slotsByDay.set(occurrence.day, slotIndex + 1)
    return { ...occurrence, dayIndex: dayDifference(plan.startDate, occurrence.day), weekIndex: Math.floor(dayDifference(plan.startDate, occurrence.day) / 7), slotIndex }
  })
}

function publicReminder(reminder, now = new Date()) {
  const occurrenceList = buildOccurrences(reminder.id, reminder.plan, now)
  const activeCompletions = new Map(reminder.completions.filter((item) => !item.undoneAt).map((item) => [item.occurrenceId, item]))
  const occurrences = occurrenceList.map((item) => ({ ...item, completed: activeCompletions.has(item.id), completion: activeCompletions.get(item.id) ?? null }))
  const nextOccurrence = occurrences.find((item) => !item.completed) ?? null
  const totalDays = reminder.plan.longTerm ? null : Math.max(1, dayDifference(reminder.plan.startDate, planEndDate(reminder.plan, now)) + 1)
  return { ...reminder, occurrences, nextOccurrence, totalDays }
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
      const record = await this.records.create(accountId, event.id, {
        type: 'medication', content: `已服用${reminder.plan.medicationName} ${reminder.plan.amount}${reminder.plan.unit}`, occurredAt: now.toISOString(), sourceType: 'user_record', sourceText: `已服用${reminder.plan.medicationName} ${reminder.plan.amount}${reminder.plan.unit}`,
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
