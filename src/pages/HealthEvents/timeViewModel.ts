import type { HealthEventApiDto, HealthEventRecordApiDto, EventAttachmentApiDto, HealthEventStage } from '../../types'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import type { JournalCategory, JournalMetadata } from '../../types/journal'
import { compactDuration, journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
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
  searchContents?: string[]
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
      const latestOccurredAt = journalOccurrenceAt(first.journal, latest.journal?.occurredAt ?? latest.occurredAt)
      return {
      id: first.id, eventId: event.id, content: first.content, occurredAt: latestOccurredAt, createdAt: latest.createdAt,
      categories: first.journal?.categories?.length ? first.journal.categories.filter((category) => category in journalCategoryLabels) : [first.type in journalCategoryLabels ? first.type as JournalCategory : 'other' as const],
      timePrecision: latest.journal?.timePrecision ?? first.journal?.timePrecision ?? (!first.sourceType || ['user_record', 'measurement', 'doctor_confirmation'].includes(first.sourceType) ? 'exact' : 'unknown'),
      timeLabel: latest.journal?.timeLabel ?? first.journal?.timeLabel,
      diet: first.journal?.diet,
      sleep: first.journal?.sleep,
      outdoorActivity: first.journal?.outdoorActivity,
      medication: first.journal?.medication,
      vaccination: first.journal?.vaccination,
      symptom: first.journal?.symptom,
      attachmentCount: files.filter((file) => !file.recordId || ordered.some((record) => record.id === file.recordId)).length,
      status: event.status,
      firstOccurredAt,
      latestOccurredAt,
      updateCount: ordered.length - 1,
      searchContents: ordered.map((record) => record.content)
      }
    })
  })
}

const feedingMethodLabels = { breast: '母乳', formula: '配方奶', expressed: '瓶喂母乳', mixed: '混合喂养' } as const

export function journalListSummary(entry: JournalEntry) {
  if (entry.sleep) {
    if (entry.sleep.status === 'ongoing') return '睡眠 · 持续中'
    const duration = compactDuration((Date.parse(entry.sleep.wakeAt) - Date.parse(entry.sleep.sleepAt)) / 60_000)
    return ['睡眠', '已醒', duration].filter(Boolean).join(' · ')
  }
  if (entry.diet?.startedAt || entry.diet?.kind === 'feeding') {
    const diet = entry.diet
    const title = diet.name || diet.meal || (diet.kind === 'feeding' ? '喂养' : '用餐')
    if (diet.status === 'ongoing') return `${title} · 持续中`
    const minutes = diet.startedAt && diet.endedAt ? (Date.parse(diet.endedAt) - Date.parse(diet.startedAt)) / 60_000 : diet.breastSeconds?.total ? diet.breastSeconds.total / 60 : NaN
    const duration = compactDuration(minutes)
    return duration ? `${title} · ${minutes < 60 ? '共' : ''}${duration}` : diet.bottleMl ? `${title} · ${diet.bottleMl}mL` : title
  }
  if (entry.categories?.includes('symptom') && entry.symptom) return entry.symptom.generatedSummary?.trim() || entry.symptom.narrative?.trim() || entry.content
  if (entry.categories?.includes('medication') && entry.medication) {
    const names = entry.medication.medications?.map((item) => item.medicationName.trim()).filter(Boolean)
      ?? [entry.medication.medicationName.trim()].filter(Boolean)
    if (names.length) return [...new Set(names)].join('、')
  }

  return entry.content
}

function textValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(textValues)
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues)
  return []
}

export function normalizeJournalSearch(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase('zh-CN')
}

export function journalSearchFields(entry: JournalEntry) {
  return [
    journalListSummary(entry),
    entry.content,
    ...(entry.searchContents ?? []),
    ...(entry.categories ?? ['other']).map((category) => journalCategoryLabels[category]),
    ...textValues(entry.diet),
    ...textValues(entry.sleep),
    ...textValues(entry.outdoorActivity),
    ...textValues(entry.medication),
    ...textValues(entry.vaccination),
    ...textValues(entry.symptom?{...entry.symptom,linkedRecordIds:undefined}:undefined),
  ].map((value) => value.trim()).filter(Boolean)
}

export function searchJournalEntries(entries: readonly JournalEntry[], query: string, now = new Date()) {
  let raw=query.trim(),from:number|null=null,to:number|null=null
  const midnight=new Date(now);midnight.setHours(0,0,0,0)
  if(/上个?月/.test(raw)){const end=new Date(midnight);end.setDate(1);to=end.getTime();const start=new Date(end);start.setMonth(start.getMonth()-1);from=start.getTime();raw=raw.replace(/上个?月/g,'')}
  else if(/上周|上星期/.test(raw)){const end=new Date(midnight);end.setDate(end.getDate()-((end.getDay()+6)%7));to=end.getTime();const start=new Date(end);start.setDate(start.getDate()-7);from=start.getTime();raw=raw.replace(/上周|上星期/g,'')}
  else if(/昨天|昨日|今天|今日/.test(raw)){const start=new Date(midnight);if(/昨天|昨日/.test(raw))start.setDate(start.getDate()-1);from=start.getTime();to=from+86400000;raw=raw.replace(/昨天|昨日|今天|今日/g,'')}
  const latest=/最近一次|上次/.test(raw)
  raw=raw.replace(/的检查/g,'检查').replace(/最近一次|上次|的记录|的随记|记录|随记|帮我找|查找|搜索|什么时候|有没有|出现过|过的|的|喝|吃|后|了/g,' ').trim()
  const exclusions=[...raw.matchAll(/(?:不含|排除|不要)([^\s，,]+)/g)].map(m=>normalizeJournalSearch(m[1]));raw=raw.replace(/(?:不含|排除|不要)[^\s，,]+/g,'')
  const synonyms:Record<string,string[]>={发烧:['发烧','发热'],起疹子:['疹','红疹','皮疹'],奶:['奶','milk'],检查:['检查','报告','examination'],呕吐:['呕吐','吐']}
  const needle = normalizeJournalSearch(raw)
  if (!needle) return []
  const terms=raw.split(/[\s，,]+/).filter(Boolean).map(term=>synonyms[term]??[term])
  const scopedById=new Map(entries.map(e=>[e.id,e]))
  const results=entries.filter(entry=>{const linked=Object.values(entry.symptom?.linkedRecordIds??{}).flat().flatMap(id=>scopedById.has(id)?[scopedById.get(id)!]:[]),values=[...journalSearchFields(entry),...linked.flatMap(journalSearchFields)].map(normalizeJournalSearch),at=Date.parse(entry.occurredAt)
    if(from!==null&&(entry.timePrecision==='unknown'||at<from||at>=to!))return false
    if(exclusions.some(term=>values.some(v=>v.includes(term))))return false
    return values.some(v=>v.includes(needle))||terms.every(alternatives=>alternatives.some(term=>values.some(v=>v.includes(normalizeJournalSearch(term)))))})
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
  return latest?results.slice(0,1):results
}

export function journalSearchResultSummary(entry: JournalEntry, query: string) {
  const needle = normalizeJournalSearch(query)
  return journalSearchFields(entry).find((value) => normalizeJournalSearch(value).includes(needle)) ?? journalListSummary(entry)
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
  if(entry.timePrecision==='unknown')return {group:'时间未明确',label:'时间未明确'}
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
