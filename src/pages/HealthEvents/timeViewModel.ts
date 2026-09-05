import type { HealthEventApiDto, HealthEventRecordApiDto, EventAttachmentApiDto, HealthEventStage } from '../../types'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import type { JournalCategory, JournalMetadata } from '../../types/journal'
export type { JournalCategory, JournalMetadata } from '../../types/journal'

export const journalCategoryGroups: readonly { label: string; items: readonly (readonly [JournalCategory, string])[] }[] = [
  { label: '日常生活', items: [['diet', '饮食'], ['sleep', '睡眠'], ['elimination', '排泄'], ['activity', '运动']] },
  { label: '健康事件', items: [['symptom', '症状'], ['injury', '意外受伤']] },
  { label: '照护处理', items: [['medication', '用药'], ['care', '护理干预'], ['vaccination', '疫苗'], ['visit', '就医']] }
] as const
export const journalCategoryLabels: Record<JournalCategory, string> = {
  diet: '饮食', sleep: '睡眠', elimination: '排泄', activity: '运动', emotion: '情绪', social: '社交',
  symptom: '症状', measurement: '测量', growth: '生长发育', injury: '意外受伤', medication: '用药',
  care: '护理干预', vaccination: '疫苗', environment: '接触环境', visit: '就医', examination: '检查报告', other: '其他'
}
export interface JournalEntry extends JournalMetadata {
  id: string
  eventId: string
  content: string
  occurredAt: string
  createdAt: string
  attachmentCount: number
  status: HealthEventStage
}

export function shiftJournalDate(day: string, amount: number) {
  const parts = parsePlainDate(day)
  if (!parts) return day
  return getLocalDateKey(new Date(parts.year, parts.month - 1, parts.day + amount, 12))!
}

export function flattenJournal(events: readonly HealthEventApiDto[], records: ReadonlyMap<string, readonly HealthEventRecordApiDto[]>, attachments: ReadonlyMap<string, readonly EventAttachmentApiDto[]>, memberId: string): JournalEntry[] {
  return events.filter((event) => event.memberId === memberId).flatMap<JournalEntry>((event) => {
    const rows = (records.get(event.id) ?? []).filter((record) => record.eventId === event.id && record.accountId === event.accountId)
    const files = (attachments.get(event.id) ?? []).filter((file) => file.eventId === event.id && file.accountId === event.accountId)
    if (!rows.length) return [{ id: `event:${event.id}`, eventId: event.id, content: event.title, occurredAt: event.startTime, createdAt: event.createdAt, categories: ['other'] as JournalCategory[], timePrecision: 'exact' as const, attachmentCount: files.length, status: event.status }]
    return rows.map((record) => ({
      id: record.id, eventId: event.id, content: record.content, occurredAt: record.journal?.occurredAt ?? record.occurredAt, createdAt: record.createdAt,
      categories: record.journal?.categories?.length ? record.journal.categories.filter((category) => category in journalCategoryLabels) : [record.type in journalCategoryLabels ? record.type as JournalCategory : 'other' as const],
      timePrecision: record.journal?.timePrecision ?? (['user_record', 'measurement', 'doctor_confirmation'].includes(record.sourceType ?? '') ? 'exact' : 'unknown'),
      timeLabel: record.journal?.timeLabel,
      attachmentCount: files.filter((file) => file.recordId === record.id).length + (record === rows[0] ? files.filter((file) => !file.recordId).length : 0),
      status: event.status
    }))
  })
}

export function journalTime(entry: JournalEntry) {
  if (entry.timePrecision === 'period') return { group: entry.timeLabel || '时段未明确', label: entry.timeLabel || '时段未明确' }
  if (!Number.isFinite(Date.parse(entry.occurredAt))) return { group: '', label: '' }
  const date = new Date(entry.occurredAt)
  return { group: `${date.getHours()}时`, label: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
}

export function journalDayGroups(entries: readonly JournalEntry[], day: string, order: 'desc' | 'asc' = 'desc') {
  const direction = order === 'desc' ? -1 : 1
  const sorted = entries.filter((entry) => getLocalDateKey(entry.occurredAt) === day).sort((left, right) => direction * (Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)))
  const groups = new Map<string, JournalEntry[]>()
  for (const entry of sorted) {
    const key = journalTime(entry).group
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return [...groups].map(([label, items]) => ({ label, items }))
}
