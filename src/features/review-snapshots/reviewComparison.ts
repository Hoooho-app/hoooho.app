import { flattenJournal, journalListSummary, type JournalEntry } from '../../pages/HealthEvents/timeViewModel'
import { reviewZone, type ReviewSources, type ReviewRow } from '../../pages/RecentReview/reviewModel'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'

export const comparisonColumns = [
  { id: 'symptom', label: '症状' }, { id: 'diet', label: '喂养与饮食' },
  { id: 'sleep', label: '睡眠' }, { id: 'medication', label: '用药' }, { id: 'other', label: '其他记录' },
] as const
export type ComparisonColumn = typeof comparisonColumns[number]['id']
export type ComparisonRow = ReviewRow & { createdAt: string }
export interface ReviewComparisonDay { day: string; columns: Record<ComparisonColumn, ComparisonRow[]> }

export function isVoucherReviewRange(start: string, end: string, now = new Date()) {
  return Boolean(parsePlainDate(start) && parsePlainDate(end) && end <= getLocalDateKey(now, reviewZone)! && Date.parse(end) - Date.parse(start) === 6 * 86_400_000)
}

export function buildReviewComparison(data: ReviewSources, memberId: string, start: string, end: string, now = new Date()): ReviewComparisonDay[] {
  if (!parsePlainDate(start) || !parsePlainDate(end) || start > end || end > getLocalDateKey(now, reviewZone)!) throw new Error('请选择有效的时间范围')
  const events = data.index.events.filter(event => event.memberId === memberId)
  const owners = new Map(events.map(event => [event.id, event.accountId]))
  const records = new Map(events.map(event => [event.id, data.index.records.filter(record => record.eventId === event.id && record.accountId === owners.get(event.id))]))
  const entries = flattenJournal(events, records, new Map(), memberId)
  const result = new Map<string, ReviewComparisonDay>()
  for (const entry of entries) {
    if (entry.timePrecision === 'unknown' || entry.caseContext?.timeUnknown || entry.aiProvenance?.time?.precision === 'unknown' || ['pending', 'external_ai'].includes(entry.caseContext?.identity ?? '')) continue
    const at = entry.firstOccurredAt ?? entry.occurredAt, date = getLocalDateKey(at, reviewZone)
    if (!date || date < start || date > end || Date.parse(at) > now.getTime()) continue
    let item = result.get(date)
    if (!item) { item = { day: date, columns: { symptom: [], diet: [], sleep: [], medication: [], other: [] } }; result.set(date, item) }
    const row: ComparisonRow = { id: entry.id, at, createdAt: entry.createdAt, title: journalListSummary(entry), detail: entry.content, eventId: entry.eventId, recordId: entry.id.startsWith('event:') ? undefined : entry.id }
    const keys = comparisonKeys(entry)
    for (const key of keys) item.columns[key].push(row)
  }
  for (const item of result.values()) for (const rows of Object.values(item.columns)) rows.sort((a, b) => b.at.localeCompare(a.at) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  return [...result.values()].sort((a, b) => b.day.localeCompare(a.day))
}

function comparisonKeys(entry: JournalEntry): ComparisonColumn[] {
  const keys: ComparisonColumn[] = []
  if (entry.symptom || entry.categories?.includes('symptom')) keys.push('symptom')
  if (entry.diet || entry.categories?.includes('diet')) keys.push('diet')
  if (entry.sleep || entry.categories?.includes('sleep')) keys.push('sleep')
  if (entry.medication || entry.categories?.includes('medication')) keys.push('medication')
  return keys.length ? keys : ['other']
}
