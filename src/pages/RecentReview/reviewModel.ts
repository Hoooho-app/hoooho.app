import type { EventAttachmentApiDto, HealthEventApiDto, HealthEventRecordApiDto } from '../../types'
import type { CasesData } from '../../features/case-continuity/types'
import type { MedicationReminderDto } from '../../services/medicationReminders'
import { flattenJournal, type JournalEntry } from '../HealthEvents/timeViewModel'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'

export const reviewZone = 'Asia/Shanghai'
export interface ReviewIndex { events: HealthEventApiDto[]; records: HealthEventRecordApiDto[]; attachments: EventAttachmentApiDto[] }
export interface ReviewSources { index: ReviewIndex; cases: CasesData; profiles: { memberId: string; sectionId: string; records: unknown[] }[]; reminders: MedicationReminderDto[] }
export interface ReviewRow { id: string; at: string; title: string; detail: string; eventId?: string; recordId?: string }
export interface ReviewBucket { day: string; label: string; rows: ReviewRow[]; value: number | null }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const day = (value: string) => value ? getLocalDateKey(value, reviewZone) : null
const known = (entry: JournalEntry) => entry.timePrecision !== 'unknown' && !entry.caseContext?.timeUnknown && entry.aiProvenance?.time?.precision !== 'unknown'
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const median = (values: number[]) => { const a = [...values].sort((x, y) => x - y); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : null }
export function reviewRange(preset: string, now = new Date()) {
  const end = getLocalDateKey(now, reviewZone)!, [y, m, d] = end.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (preset === '7' || preset === '30') date.setUTCDate(date.getUTCDate() - Number(preset) + 1)
  else { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - (preset === '365' ? 12 : 6)); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(d, last) + 1) }
  return { start: date.toISOString().slice(0, 10), end }
}
function makeBuckets(start: string, end: string) {
  const n = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1, monthly = n > 31, buckets: ReviewBucket[] = []
  let cursor = new Date(`${start}T12:00:00Z`)
  while (cursor.toISOString().slice(0, 10) <= end) {
    const date = cursor.toISOString().slice(0, 10)
    buckets.push({ day: date, label: monthly ? `${date.slice(2, 4)}/${Number(date.slice(5, 7))}` : `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`, rows: [], value: null })
    if (monthly) { cursor.setUTCDate(1); cursor.setUTCMonth(cursor.getUTCMonth() + 1) } else cursor.setUTCDate(cursor.getUTCDate() + (n <= 7 ? 1 : 5))
  }
  return buckets
}
function series(buckets: ReviewBucket[], rows: ReviewRow[], values: Map<string, number> | null = null, reduce: 'sum' | 'median' | 'mean' = 'sum', zero = false) {
  return buckets.map((b, i) => {
    const rr = rows.filter(r => { const dt = day(r.at); return dt && dt >= b.day && (!buckets[i + 1] || dt < buckets[i + 1].day) })
    const vv = rr.flatMap(r => values?.has(r.id) ? [values.get(r.id)!] : values ? [] : [1])
    const value = !vv.length ? zero ? 0 : null : reduce === 'median' ? median(vv) : reduce === 'mean' ? mean(vv) : vv.reduce((a, v) => a + v, 0)
    return { ...b, rows: rr, value }
  })
}
function source(entry: JournalEntry, at = entry.firstOccurredAt ?? entry.occurredAt): ReviewRow { return { id: entry.id, at, title: entry.symptom?.keywords?.join('、') || entry.diet?.name || entry.medication?.medicationName || entry.content.slice(0, 32), detail: entry.content, eventId: entry.eventId, recordId: entry.id.startsWith('event:') ? undefined : entry.id } }
export function buildReview(data: ReviewSources, memberId: string, start: string, end: string, now = new Date()) {
  if (!parsePlainDate(start) || !parsePlainDate(end) || start > end || end > getLocalDateKey(now, reviewZone)!) throw new Error('请选择有效的时间范围')
  const events = data.index.events.filter(e => e.memberId === memberId), eventIds = new Set(events.map(e => e.id))
  const grouped = new Map<string, HealthEventRecordApiDto[]>(events.map(e => [e.id, []])), accounts = new Map(events.map(e => [e.id, e.accountId]))
  for (const record of data.index.records) if (accounts.get(record.eventId) === record.accountId) grouped.get(record.eventId)?.push(record)
  const entries = flattenJournal(events, grouped, new Map(), memberId)
  const inRange = (at: string) => { const dt = day(at); return Boolean(dt && dt >= start && dt <= end && Date.parse(at) <= now.getTime()) }
  const ranged = entries.filter(e => known(e) && inRange(e.firstOccurredAt ?? e.occurredAt))
  const buckets = makeBuckets(start, end), totalDays = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
  const groupIds = new Map<string, string>()
  for (const item of [...data.cases.active, ...data.cases.archived]) for (const id of new Set([item.event.id, ...(item.sourceEventIds ?? [])])) groupIds.set(id, item.event.id)
  const symptomEntries = entries.filter(e => (e.symptom || e.categories?.includes('symptom')) && e.caseContext?.result !== 'not_observed' && !['external_ai', 'pending'].includes(e.caseContext?.identity ?? '')), unknownSymptoms = symptomEntries.filter(e => !known(e)).length
  const symptomGroups = new Map<string, JournalEntry>()
  for (const e of symptomEntries.filter(known)) { const key = groupIds.get(e.eventId) ?? e.eventId, current = symptomGroups.get(key); if (!current || Date.parse(e.firstOccurredAt ?? e.occurredAt) < Date.parse(current.firstOccurredAt ?? current.occurredAt)) symptomGroups.set(key, e) }
  const symptoms = [...symptomGroups.values()].filter(e => inRange(e.firstOccurredAt ?? e.occurredAt)).map(e => source(e))
  const symptomLabels: Record<string, string> = { skin: '皮肤', fever: '发热', respiratory: '呼吸', ent: '鼻眼耳咽', gastrointestinal: '消化', pain: '疼痛', other: '其他' }
  const kinds = [...new Set([...symptomGroups.values()].map(e => e.symptom?.symptomCategory ?? 'other'))].map(kind => ({ label: symptomLabels[kind] ?? '其他', rows: [...symptomGroups.values()].filter(e => (e.symptom?.symptomCategory ?? 'other') === kind && inRange(e.firstOccurredAt ?? e.occurredAt)).map(e => source(e)) })).filter(k => k.rows.length)
  const confirmed = new Map<string, ReviewRow>(), pending = new Map<string, ReviewRow>()
  const ownRecords = new Map([...grouped.values()].flat().map(r => [r.id, r]))
  for (const section of data.profiles.filter(p => p.memberId === memberId && p.sectionId === 'allergy')) {
    const items = section.records.flatMap(raw => { const r = object(raw); return r.profileListDeletedAt ? [] : Array.isArray(object(r._allergyArchive).items) ? list(object(r._allergyArchive).items) : [r] })
    for (const raw of items) {
      const item = object(raw); if (item.profileListDeletedAt || item.memberId && item.memberId !== memberId) continue
      const status = text(item.currentStatus ?? item.certainty), sure = ['confirmed', '已明确', '已确诊', '医生确认', '医生明确'].includes(status)
      if (['excluded', 'tolerated', '已排除', '曾经有，目前已耐受'].includes(status)) continue
      for (const reactionRaw of list(item.reactions)) {
        const reaction = object(reactionRaw), at = text(reaction.occurredAt), linkedRecord = text(reaction.linkedHealthRecordId), linkedEvent = text(reaction.linkedHealthEventId)
        if (reaction.active === false || reaction.memberId && reaction.memberId !== memberId || !at || !inRange(at) || linkedRecord && !ownRecords.has(linkedRecord) || linkedEvent && !eventIds.has(linkedEvent) || linkedRecord && linkedEvent && ownRecords.get(linkedRecord)?.eventId !== linkedEvent) continue
        const key = linkedRecord || `${text(item.id)}:${text(reaction.id)}`
        if (!linkedRecord && (!text(reaction.id) || !text(item.id))) continue
        const row: ReviewRow = { id: key, at, title: `${text(item.name ?? item.subject)} · ${sure ? '已明确项目' : '待排查项目'}`, detail: text(reaction.symptoms) || text(reaction.notes), eventId: linkedEvent || ownRecords.get(linkedRecord)?.eventId, recordId: linkedRecord || undefined }
        if (sure) { confirmed.set(key, row); pending.delete(key) } else if (!confirmed.has(key)) pending.set(key, row)
      }
    }
  }
  const sleepRows: ReviewRow[] = [], bedValues = new Map<string, number>(), durationValues = new Map<string, number>()
  for (const e of entries) {
    const sleep = e.sleep; if (!known(e) || !sleep || sleep.kind !== 'night' || sleep.status === 'ongoing' || !inRange(sleep.sleepAt)) continue
    const duration = (Date.parse(sleep.wakeAt) - Date.parse(sleep.sleepAt)) / 3_600_000
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 || Date.parse(sleep.wakeAt) > now.getTime()) continue
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: reviewZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(sleep.sleepAt)), hours = Number(parts.find(p => p.type === 'hour')?.value), minutes = Number(parts.find(p => p.type === 'minute')?.value), value = hours + minutes / 60
    const row = { ...source(e, sleep.sleepAt), title: '夜间睡眠', detail: `${sleep.sleepAt} — ${sleep.wakeAt} · ${Math.round(duration * 10) / 10}小时` }; sleepRows.push(row); bedValues.set(e.id, value < 12 ? value + 24 : value); durationValues.set(e.id, duration)
  }
  const milkEntries = ranged.filter(e => typeof e.diet?.bottleMl === 'number' && e.diet.bottleMl > 0 && e.diet.status !== 'ongoing'), milk = milkEntries.map(e => source(e)), milkValues = new Map(milkEntries.map(e => [e.id, e.diet!.bottleMl!]))
  const supplements = ranged.filter(e => e.diet?.kind === 'supplement').map(e => source(e)), topical = ranged.filter(e => Boolean(e.topical)).map(e => source(e))
  const medicationDone: ReviewRow[] = [], medicationUnrecorded: ReviewRow[] = [], seenOccurrences = new Set<string>()
  for (const reminder of data.reminders.filter(r => r.memberId === memberId)) for (const o of reminder.occurrences) {
    const key = `${reminder.id}:${o.id}`
    if (seenOccurrences.has(key) || !inRange(o.scheduledAt) || reminder.archivedAt && Date.parse(o.scheduledAt) > Date.parse(reminder.archivedAt)) continue
    seenOccurrences.add(key)
    const complete = o.completed && o.completion && !o.completion.undoneAt
    const row = { id: key, at: o.scheduledAt, title: reminder.plan.medicationName, detail: complete ? '已确认完成' : '尚无执行记录', eventId: complete ? o.completion!.eventId : undefined, recordId: complete ? o.completion!.recordId : undefined }
    ;(complete ? medicationDone : medicationUnrecorded).push(row)
  }
  const sortedBeds = [...bedValues.values()].sort((a, b) => a - b)
  const quantile = (q: number) => { const at = (sortedBeds.length - 1) * q, low = Math.floor(at); return sortedBeds[low] + (sortedBeds[Math.ceil(at)] - sortedBeds[low]) * (at - low) }
  const sleepSpreadMinutes = sortedBeds.length >= 2 ? Math.round((quantile(.75) - quantile(.25)) * 60) : null
  const sleepDays = new Set(sleepRows.map(r => day(r.at))).size
  return { start, end, totalDays, recordCount: ranged.length, unknownSymptoms, symptoms, kinds, symptomSeries: series(buckets, symptoms, null, 'sum', true), allergy: [{ label: '已明确项目', rows: [...confirmed.values()] }, { label: '待排查项目', rows: [...pending.values()] }], sleepRows, sleepDays, sleepSpreadMinutes, bedtime: series(buckets, sleepRows, bedValues, 'median'), sleepDuration: series(buckets, sleepRows, durationValues, 'mean'), milk, milkTotal: [...milkValues.values()].reduce((a, v) => a + v, 0), milkSeries: series(buckets, milk, milkValues), supplements, topical, medicationDone, medicationUnrecorded, medicationTotal: seenOccurrences.size, medicationPercent: seenOccurrences.size ? Math.round(medicationDone.length / seenOccurrences.size * 100) : null }
}
export type ReviewModel = ReturnType<typeof buildReview>
export function timeLabel(hours: number) { const minutes = Math.round(hours * 60); return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
