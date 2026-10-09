import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types'
import type { JournalCategory } from '../../types/journal'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import { journalCategoryLabels, type JournalEntry } from '../HealthEvents/timeViewModel'

export const calendarCategories = ['symptom', 'medication', 'sleep', 'diet', 'elimination', 'care', 'vaccination', 'visit', 'examination', 'measurement', 'growth', 'injury', 'activity', 'emotion', 'social', 'environment', 'other'] as const
export const calendarBoundary = '这里呈现记录的先后顺序。时间上的关联不等于过敏原因，是否过敏需结合医生评估。'
export interface CalendarEntry extends JournalEntry { eventTitle: string; originalText: string; sourceLabel: string }
export interface CalendarItem { entry: CalendarEntry; at: string; label: string; precision: 'exact' | 'period' | 'day' | 'unknown'; key: string }
export type CalendarOrder = 'desc' | 'asc'
const valid = (at?: string) => Boolean(at && Number.isFinite(Date.parse(at)))

// Keep every saved occurrence, including supplements. Never fold history into its latest update.
export function calendarEntries(events: readonly HealthEventApiDto[], records: ReadonlyMap<string, readonly HealthEventRecordApiDto[]>, memberId: string): CalendarEntry[] {
  return events.filter(event => event.memberId === memberId).flatMap(event => (records.get(event.id) ?? [])
    .filter(record => record.eventId === event.id && record.accountId === event.accountId)
    .map(record => {
      const journal = record.journal
      const occurredAt = journal?.occurredAt ?? record.occurredAt
      const categories = journal?.categories?.filter(category => category in journalCategoryLabels)
      const inferred: JournalCategory[] = journal?.diet ? ['diet'] : journal?.sleep ? ['sleep'] : journal?.symptom ? ['symptom'] : journal?.medication ? ['medication'] : [record.type in journalCategoryLabels ? record.type as JournalCategory : 'other']
      return { ...journal, id: record.id, eventId: event.id, eventTitle: event.title, content: record.content, occurredAt, createdAt: record.createdAt,
        categories: categories?.length ? categories : inferred,
        timePrecision: record.caseContext?.timeUnknown || !valid(occurredAt) ? 'unknown' : journal?.timePrecision ?? (!record.sourceType || ['user_record', 'measurement', 'doctor_confirmation'].includes(record.sourceType) ? 'exact' : 'unknown'),
        attachmentCount: record.caseContext?.attachmentIds?.length ?? 0, status: event.status,
        originalText: record.caseContext?.originalText || record.sourceText || record.content,
        sourceLabel: record.caseContext?.identity === 'external_ai' ? '外部 AI 内容' : record.caseContext?.identity === 'medical_consultation' || record.sourceType === 'doctor_confirmation' ? '就医记录' : record.caseContext?.identity === 'examination_report' ? '检查资料' : '家庭记录'
      }
    }))
}
export function scopeEntries(entries: readonly CalendarEntry[], eventId: string, category: string) {
  const roots = entries.filter(entry => entry.eventId === eventId)
  const rootIds = new Set(roots.map(entry => entry.id))
  const explicitLinks = new Set(roots.flatMap(entry => [
    ...Object.values(entry.symptom?.linkedRecordIds ?? {}).flat(),
    ...(entry.medication?.linkedSymptomRecordIds ?? []),
    ...(entry.visit?.linkedSymptomRecordIds ?? []),
    ...(entry.visit?.linkedMedicationRecordIds ?? []),
  ]))
  return entries.filter(entry => (!eventId || entry.eventId === eventId || explicitLinks.has(entry.id) || entry.medication?.linkedSymptomRecordIds?.some(id => rootIds.has(id))) && (!category || entry.categories?.includes(category as JournalCategory)))
}
export function calendarTime(at: string, timeZone?: string) {
  return valid(at) ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, ...(timeZone ? { timeZone } : {}) }).format(new Date(at)) : '时间不详'
}
function fullTime(at: string, timeZone?: string) { return `${getLocalDateKey(at, timeZone)} ${calendarTime(at, timeZone)}` }
function interval(entry: CalendarEntry) {
  const sleep = entry.sleep
  if (sleep && valid(sleep.sleepAt)) return { start: sleep.sleepAt, end: sleep.status === 'ongoing' ? '' : valid(sleep.wakeAt) ? sleep.wakeAt : '', startLabel: '入睡', endLabel: '醒来', ongoing: sleep.status === 'ongoing' }
  const diet = entry.diet
  if (diet && valid(diet.startedAt)) return { start: diet.startedAt!, end: diet.status === 'ongoing' ? '' : valid(diet.endedAt) ? diet.endedAt! : '', startLabel: '开始进食', endLabel: '结束进食', ongoing: diet.status === 'ongoing' }
  return null
}
export function calendarIntervalLabel(entry: CalendarEntry, timeZone?: string) {
  const range = interval(entry)
  if (!range || entry.timePrecision !== 'exact') return ''
  return `${fullTime(range.start, timeZone)} → ${range.end ? fullTime(range.end, timeZone) : range.ongoing ? '持续中' : '结束时间未记录'}`
}
export function calendarItems(entries: readonly CalendarEntry[], day: string, order: CalendarOrder = 'desc', now = new Date(), timeZone?: string): CalendarItem[] {
  if (!parsePlainDate(day)) return []
  const items = entries.flatMap<CalendarItem>(entry => {
    const precision = entry.timePrecision ?? 'unknown'
    if (precision === 'unknown') return []
    const range = precision === 'exact' ? interval(entry) : null
    if (range && (!range.end || Date.parse(range.end) >= Date.parse(range.start))) {
      const startDay = getLocalDateKey(range.start, timeZone)!, endDay = getLocalDateKey(range.end || (range.ongoing ? now : range.start), timeZone)!
      if (day < startDay || day > endDay) return []
      const milestones: CalendarItem[] = []
      if (day === startDay) milestones.push({ entry, at: range.start, label: range.startLabel, precision: 'exact', key: `${entry.id}:start` })
      if (range.end && day === endDay) milestones.push({ entry, at: range.end, label: range.endLabel, precision: 'exact', key: `${entry.id}:end` })
      if (!milestones.length) milestones.push({ entry, at: range.start, label: '跨日持续记录', precision: 'day', key: `${entry.id}:continuing` })
      return milestones
    }
    if (getLocalDateKey(entry.occurredAt, timeZone) !== day) return []
    return [{ entry, at: entry.occurredAt, label: precision === 'day' ? '当天，具体时间未记录' : precision === 'period' ? entry.timeLabel || '时段记录，具体时间未记录' : '', precision, key: entry.id }]
  })
  const direction = order === 'desc' ? -1 : 1
  return items.sort((a, b) => {
    const precise = Number(b.precision === 'exact') - Number(a.precision === 'exact')
    return precise || direction * (Date.parse(a.at) - Date.parse(b.at) || a.entry.createdAt.localeCompare(b.entry.createdAt) || a.key.localeCompare(b.key))
  })
}

export function calendarFacts(entry: CalendarEntry): string[] {
  const facts: string[] = []
  if (entry.diet) {
    const d = entry.diet
    const method = d.feedingMethod ? ({breast:'母乳',formula:'配方奶',expressed:'瓶喂母乳',mixed:'混合喂养'} as const)[d.feedingMethod] : ''
    const line = [method, d.foods?.join('、'), d.amount, d.bottleMl ? `${d.bottleMl}mL` : '', d.supplementNames?.join('、'), d.supplementAmount ? `${d.supplementAmount}${d.supplementUnit ?? ''}` : '', d.note].filter(Boolean).join(' · ')
    if (line) facts.push(`饮食记录：${line}`)
  }
  if (entry.medication) {
    const m = entry.medication
    const drugs = m.medications?.length ? m.medications.map(d => `${d.medicationName} ${d.amountValue}${d.amountUnit}`) : [ [m.medicationName, m.amountValue != null ? `${m.amountValue}${m.amountUnit ?? ''}` : ''].filter(Boolean).join(' ') ]
    const route = ({oral:'口服',topical:'外用',nebulized:'雾化',inhaled:'吸入',nasal:'鼻用',ophthalmic:'眼用',other:'其他途径'} as const)[m.administrationRoute]
    facts.push(`用药记录：${drugs.filter(Boolean).join('、')}${route ? ` · ${route}` : ''}${m.note ? ` · ${m.note}` : ''}`)
  }
  if (entry.symptom?.triggerText) facts.push(`记录者填写的诱因 / 怀疑：${entry.symptom.triggerText}`)
  return facts
}

export function calendarCounts(items: readonly CalendarItem[]) {
  return Object.fromEntries(calendarCategories.map(category => [category, new Set(items.filter(item => item.entry.categories?.includes(category)).map(item => item.entry.id)).size])) as Record<typeof calendarCategories[number], number>
}
export function calendarMonthDays(month: string) {
  const first = parsePlainDate(`${month}-01`)
  if (!first) return []
  const offset = (new Date(first.year, first.month - 1, 1, 12).getDay() + 6) % 7
  const count = new Date(first.year, first.month, 0, 12).getDate()
  return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)] as (string | null)[]
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
export function calendarExport(entries: readonly CalendarEntry[], input: { memberName: string; from: string; to: string; scope: string; timeZone: string; includeUnknown: boolean; now?: Date }) {
  if (!parsePlainDate(input.from) || !parsePlainDate(input.to) || input.from > input.to || input.to > getLocalDateKey(input.now ?? new Date(), input.timeZone)!) throw new Error('请选择有效的回看日期范围')
  const selected = entries.filter(entry => {
    if (entry.timePrecision === 'unknown') return input.includeUnknown
    const range = entry.timePrecision === 'exact' ? interval(entry) : null
    const first = getLocalDateKey(range?.start || entry.occurredAt, input.timeZone)!
    const last = getLocalDateKey(range?.end || (range?.ongoing ? input.now ?? new Date() : range?.start) || entry.occurredAt, input.timeZone)!
    return first <= input.to && last >= input.from
  })
  const known = selected.filter(entry => entry.timePrecision !== 'unknown').sort((a,b) => Date.parse(interval(a)?.start || a.occurredAt) - Date.parse(interval(b)?.start || b.occurredAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const exact = known.filter(entry => entry.timePrecision === 'exact')
  const imprecise = known.filter(entry => entry.timePrecision !== 'exact')
  const unknown = selected.filter(entry => entry.timePrecision === 'unknown')
  const row = (entry: CalendarEntry) => {
    const label = entry.timePrecision === 'unknown' ? '发生日期 / 时间不详（不归入所选日期）' : entry.timePrecision === 'exact' ? calendarIntervalLabel(entry, input.timeZone) || fullTime(entry.occurredAt, input.timeZone) : `${getLocalDateKey(entry.occurredAt, input.timeZone)} · ${entry.timePrecision === 'day' ? '具体时间未记录' : entry.timeLabel || '时段记录'}`
    return `<article><h3>${escape(label)}</h3><p>${escape((entry.categories ?? ['other']).map(c => journalCategoryLabels[c]).join(' / '))} · ${escape(entry.eventTitle)} · ${escape(entry.sourceLabel)}</p><pre>${escape(entry.content)}</pre>${calendarFacts(entry).map(fact => `<p>${escape(fact)}</p>`).join('')}${entry.originalText !== entry.content ? `<details open><summary>保留的原话 / 来源原文</summary><pre>${escape(entry.originalText)}</pre></details>` : ''}</article>`
  }
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoooho 健康月历回看</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:760px;margin:auto;padding:24px;color:#18312f}article{border-top:1px solid #dce5e2;padding:12px 0}h1{font-size:24px}h2{font-size:20px}h3{font-size:16px}p{color:#526966}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}button{padding:10px}@media print{button{display:none}article{break-inside:avoid}}</style><h1>${escape(input.memberName)} · 健康月历回看</h1><p>${escape(input.from)} 至 ${escape(input.to)} · ${escape(input.scope)}<br>显示时区：${escape(input.timeZone)} · 按发生时间回看（较早在前）</p><p>${escape(calendarBoundary)} 未记录不代表没有发生。家长怀疑和来源原文保留原有表达，不构成系统确认。</p><button onclick="window.print()">打印 / 保存 PDF</button><h2>日期明确的记录 · ${known.length}条</h2>${exact.length ? exact.map(row).join('') : '<p>所选范围暂无精确时间记录。</p>'}${imprecise.length ? `<h2>日期明确，具体时间未明确 · ${imprecise.length}条</h2><p>仅知道日期或时段，无法与精确时间记录确定先后。</p>${imprecise.map(row).join('')}` : ''}${input.includeUnknown ? `<h2>日期 / 时间不详 · ${unknown.length}条</h2><p>以下记录属于所选筛选范围，但无法确认是否发生在所选日期内，不参与时间排序。</p>${unknown.map(row).join('')}` : '<p>未包含日期 / 时间不详的记录。</p>'}<p>Hoooho · 导出时间 ${escape(fullTime((input.now ?? new Date()).toISOString(), input.timeZone))}</p></html>`
}
