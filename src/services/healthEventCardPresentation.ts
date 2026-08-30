import type { HealthEventCardSummaryFragment, HealthEventStage, HealthEventSummaryResult, HealthEventSummaryTag } from '../types'
import { formatLocalWeekday, getLocalCalendarDaySerial, getLocalCalendarParts } from '../utils/localCalendarDate'

const millisecondsPerDay = 86_400_000

const statusPresentations: Record<HealthEventStage, { label: string; tone: 'info' | 'warning' | 'success' }> = {
  observing: { label: '观察中', tone: 'info' },
  handling: { label: '处理中', tone: 'warning' },
  recovered: { label: '已康复', tone: 'success' }
}

function comparableLabel(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s，。；;、：:·]/g, '')
}

function semanticKey(value: string) {
  const comparable = comparableLabel(value)
  if (/^(?:发热|发烧|高烧|低烧|体温升高)$/.test(comparable)) return 'fever-symptom'
  if (/^(?:头痛|头疼|脑袋疼)$/.test(comparable)) return 'headache'
  return comparable
}

function uniqueLabels(values: readonly string[]) {
  const seen = new Set<string>()
  return values.map((value) => value.trim()).filter((value) => {
    const key = semanticKey(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getHealthEventDayLabel(startTime: string | null | undefined, now = new Date(), timeZone?: string) {
  if (!startTime) return null
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(now.getTime())) return null
  const startDay = getLocalCalendarDaySerial(start, timeZone)
  const currentDay = getLocalCalendarDaySerial(now, timeZone)
  if (startDay === null || currentDay === null) return null
  const elapsedCalendarDays = Math.round((currentDay - startDay) / millisecondsPerDay)
  if (elapsedCalendarDays < 0) return null
  return `第${elapsedCalendarDays + 1}天`
}

export function getHealthEventStartDate(startTime: string | null | undefined, recordTimes: readonly string[] = []) {
  if (startTime && !Number.isNaN(new Date(startTime).getTime())) return startTime
  return recordTimes
    .filter((value) => !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null
}

interface HealthEventDurationInput {
  startTime?: string | null
  recoveredAt?: string | null
  status: HealthEventStage
  now?: Date
  timeZone?: string
}

export function getHealthEventDuration({ startTime, recoveredAt, status, now = new Date(), timeZone }: HealthEventDurationInput) {
  const start = startTime ? new Date(startTime) : null
  const end = status === 'recovered' ? (recoveredAt ? new Date(recoveredAt) : null) : now
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const startDay = getLocalCalendarDaySerial(start, timeZone)
  const endDay = getLocalCalendarDaySerial(end, timeZone)
  if (startDay === null || endDay === null || endDay < startDay) return null
  return Math.round((endDay - startDay) / millisecondsPerDay) + 1
}

export function formatHealthEventDuration(input: HealthEventDurationInput) {
  const days = getHealthEventDuration(input)
  if (days === null) return null
  return `${input.status === 'recovered' ? '持续' : '已持续'}${days}天`
}

export function formatHealthEventDate(startTime: string | null | undefined, now = new Date(), timeZone?: string) {
  if (!startTime) return null
  const startParts = getLocalCalendarParts(startTime, timeZone)
  const currentParts = getLocalCalendarParts(now, timeZone)
  if (!startParts) return null
  const yearPrefix = currentParts && currentParts.year === startParts.year ? '' : `${startParts.year}年`
  return `开始于 ${yearPrefix}${startParts.month}月${startParts.day}日 ${formatLocalWeekday(startTime, timeZone)}`
}

export function getHealthEventDefinitionTitle(summary?: HealthEventSummaryResult | null) {
  const confirmedDiagnosis = (summary?.tags ?? []).find((tag) => (
    tag.kind === 'diagnosis'
    && tag.certainty === 'confirmed'
    && tag.label.trim().length > 0
  ))
  return confirmedDiagnosis?.label.trim() ?? '未定性'
}

const placeholderTitles = new Set(['', '未定性', '未明确', '未确诊', '健康情况', '身体不适'])

export function getHealthEventDisplayTitle(title: string | null | undefined, summary?: HealthEventSummaryResult | null) {
  const explicitTitle = title?.trim() ?? ''
  if (!placeholderTitles.has(explicitTitle)) return explicitTitle
  const symptoms = uniqueLabels((summary?.tags ?? [])
    .filter((tag) => tag.kind === 'symptom')
    .sort((left, right) => right.priority - left.priority)
    .map((tag) => tag.label))
    .slice(0, 2)
  if (!symptoms.length) return '未定性'
  const fever = symptoms.find((label) => semanticKey(label) === 'fever-symptom')
  const companion = symptoms.find((label) => label !== fever)
  return fever && companion ? `${fever}伴${companion}` : symptoms.join('伴')
}

export function getHealthEventStatusPresentation(status: HealthEventStage) {
  return statusPresentations[status]
}

interface BuildQuickFactsInput {
  startTime?: string | null
  summary?: HealthEventSummaryResult | null
  fallbackFeature?: string | null
  now?: Date
  timeZone?: string
}

export function buildHealthEventQuickFacts({
  startTime,
  summary,
  fallbackFeature,
  now = new Date(),
  timeZone
}: BuildQuickFactsInput) {
  const dayLabel = getHealthEventDayLabel(startTime, now, timeZone)
  const supportedTags = (summary?.tags ?? [])
    .filter((tag) => ['symptom', 'measurement', 'change'].includes(tag.kind))
    .sort((left, right) => right.priority - left.priority)
    .map((tag) => tag.label)
  const dataLabels = uniqueLabels(supportedTags.length ? supportedTags : [fallbackFeature ?? '']).slice(0, 2)
  return [...(dayLabel ? [dayLabel] : []), ...dataLabels].slice(0, 3)
}

interface BuildSummaryFragmentsInput {
  status: HealthEventStage
  summary?: HealthEventSummaryResult | null
  fallbackFeature?: string | null
  fallbackRecordId?: string | null
}

function summaryTagRank(tag: HealthEventSummaryTag, status: HealthEventStage) {
  if (status === 'recovered') {
    if (tag.kind === 'measurement' && tag.label.startsWith('最高')) return 500
    if (['medication', 'visit', 'examination'].includes(tag.kind)) return 400
    if (tag.kind === 'change') return 300
    if (tag.kind === 'symptom') return 200
    return 0
  }
  if (tag.kind === 'measurement' && tag.label.startsWith('当前')) return 500
  if (tag.kind === 'symptom') return 400
  if (tag.kind === 'change') return 300
  if (['medication', 'visit', 'examination'].includes(tag.kind)) return 200
  if (tag.kind === 'measurement') return 100
  return 0
}

export function getHealthEventSummaryFragments({
  status,
  summary,
  fallbackFeature,
  fallbackRecordId
}: BuildSummaryFragmentsInput): HealthEventCardSummaryFragment[] {
  const tags = (summary?.tags ?? [])
    .filter((tag) => summaryTagRank(tag, status) > 0)
    .sort((left, right) => (
      summaryTagRank(right, status) - summaryTagRank(left, status)
      || right.priority - left.priority
      || String(right.occurredAt ?? '').localeCompare(String(left.occurredAt ?? ''))
    ))
  const seen = new Set<string>()
  const fragments: HealthEventCardSummaryFragment[] = []
  for (const tag of tags) {
    const key = semanticKey(tag.label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    fragments.push({ label: tag.label.trim(), sourceRecordId: tag.sourceRecordId ?? null, kind: tag.kind })
    if (fragments.length === 3) break
  }
  if (!fragments.length && fallbackFeature?.trim()) {
    fragments.push({ label: fallbackFeature.trim(), sourceRecordId: fallbackRecordId ?? null, kind: 'legacy' })
  }
  return fragments
}
