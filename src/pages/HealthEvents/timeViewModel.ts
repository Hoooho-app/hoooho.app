import type { HealthEventApiDto, HealthEventRecordApiDto, EventAttachmentApiDto, HealthEventStage } from '../../types'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import type { JournalCategory, JournalMetadata } from '../../types/journal'
export type { JournalCategory, JournalMetadata } from '../../types/journal'

export const journalCategoryGroups: readonly { label: string; items: readonly (readonly [JournalCategory, string])[] }[] = [
  { label: '日常生活', items: [['diet', '进食'], ['sleep', '睡眠'], ['elimination', '排便'], ['activity', '活动']] },
  { label: '健康事件', items: [['symptom', '症状'], ['medication', '用药'], ['vaccination', '疫苗'], ['visit', '就医']] }
] as const
export const journalCategoryLabels: Record<JournalCategory, string> = {
  diet: '饮食', sleep: '睡眠', elimination: '排便', activity: '户外活动', emotion: '情绪', social: '社交',
  symptom: '症状', measurement: '测量', growth: '生长发育', injury: '意外受伤', medication: '用药',
  care: '护理干预', vaccination: '疫苗接种', environment: '接触环境', visit: '就医', examination: '检查报告', other: '其他'
}
export interface JournalEntry extends JournalMetadata {
  id: string
  eventId: string
  content: string
  occurredAt: string
  createdAt: string
  attachmentCount: number
  status: HealthEventStage
  firstOccurredAt?: string
  latestOccurredAt?: string
  updateCount?: number
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
    const updatePrefix = 'event-update:'
    const updates = rows.filter((record) => record.note?.startsWith(updatePrefix))
    const roots = rows.filter((record) => !record.note?.startsWith(updatePrefix))
    return (roots.length ? roots : rows).map((first) => {
      const ordered = [first, ...updates.filter((record) => record.note === `${updatePrefix}${first.id}`)].sort((left, right) => Date.parse(left.journal?.occurredAt ?? left.occurredAt) - Date.parse(right.journal?.occurredAt ?? right.occurredAt) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      const latest = ordered[ordered.length - 1]
      const firstOccurredAt = first.journal?.occurredAt ?? first.occurredAt
      const latestOccurredAt = latest.journal?.occurredAt ?? latest.occurredAt
      return {
      id: first.id, eventId: event.id, content: first.content, occurredAt: latestOccurredAt, createdAt: latest.createdAt,
      categories: first.journal?.categories?.length ? first.journal.categories.filter((category) => category in journalCategoryLabels) : [first.type in journalCategoryLabels ? first.type as JournalCategory : 'other' as const],
      timePrecision: latest.journal?.timePrecision ?? first.journal?.timePrecision ?? (['user_record', 'measurement', 'doctor_confirmation'].includes(first.sourceType ?? '') ? 'exact' : 'unknown'),
      timeLabel: latest.journal?.timeLabel ?? first.journal?.timeLabel,
      diet: first.journal?.diet,
      sleep: first.journal?.sleep,
      outdoorActivity: first.journal?.outdoorActivity,
      medication: first.journal?.medication,
      vaccination: first.journal?.vaccination,
      attachmentCount: files.filter((file) => !file.recordId || ordered.some((record) => record.id === file.recordId)).length,
      status: event.status,
      firstOccurredAt,
      latestOccurredAt,
      updateCount: ordered.length - 1
      }
    })
  })
}

const feedingMethodLabels = { breast: '母乳', formula: '配方奶', expressed: '瓶喂母乳', mixed: '混合喂养' } as const

export function journalListSummary(entry: JournalEntry) {
  if (entry.categories?.includes('medication') && entry.medication) {
    const names = entry.medication.medications?.map((item) => item.medicationName.trim()).filter(Boolean)
      ?? [entry.medication.medicationName.trim()].filter(Boolean)
    if (names.length) return [...new Set(names)].join('、')
  }
  if (entry.categories?.includes('diet') && entry.diet?.kind === 'feeding') {
    const parts: string[] = [feedingMethodLabels[entry.diet.feedingMethod ?? 'breast']]
    if (entry.diet.breastSeconds) parts.push(`${Math.max(1, Math.round(entry.diet.breastSeconds.total / 60))}分钟`)
    if (entry.diet.bottleMl) parts.push(`${entry.diet.bottleMl}毫升`)
    return parts.join(' · ')
  }
  return entry.content
}

export function journalUpdateLabel(entry: JournalEntry) {
  if (!entry.updateCount || !entry.firstOccurredAt || !entry.latestOccurredAt) return ''
  const formatTime = (value: string) => {
    const date = new Date(value)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  const first = formatTime(entry.firstOccurredAt)
  return entry.updateCount === 1 ? `${first} 首次记录 · ${formatTime(entry.latestOccurredAt)} 有更新` : `${first} 首次记录 · 已更新${entry.updateCount}次`
}

export type JournalDayPeriod = '凌晨' | '早上' | '下午' | '夜间'

export function journalDayPeriod(hour: number): JournalDayPeriod {
  if (hour < 6) return '凌晨'
  if (hour < 12) return '早上'
  if (hour < 18) return '下午'
  return '夜间'
}

export function journalTime(entry: JournalEntry) {
  if (!Number.isFinite(Date.parse(entry.occurredAt))) return { group: '', label: '' }
  const date = new Date(entry.occurredAt)
  const group = journalDayPeriod(date.getHours())
  return { group, label: entry.timePrecision === 'period' ? group : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
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

export function bowelOccurrenceNumber(entries: readonly JournalEntry[], target: JournalEntry) {
  if (!target.categories?.includes('elimination')) return null
  const day = getLocalDateKey(target.occurredAt)
  const bowel = entries.filter((entry) => entry.categories?.includes('elimination') && getLocalDateKey(entry.occurredAt) === day)
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  const index = bowel.findIndex((entry) => entry.id === target.id)
  return index < 0 ? null : index + 1
}
