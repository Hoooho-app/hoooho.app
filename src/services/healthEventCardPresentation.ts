import type { HealthEventStage, HealthEventSummaryResult, HealthEventSummaryTag } from '../types'
import { getLocalCalendarDaySerial } from '../utils/localCalendarDate'

const millisecondsPerDay = 86_400_000

const statusPresentations: Record<HealthEventStage, { label: string; tone: 'primary' | 'warning' | 'success' }> = {
  observing: { label: '观察中', tone: 'primary' },
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

export function getHealthEventDefinitionTitle(summary?: HealthEventSummaryResult | null) {
  const confirmedDiagnosis = (summary?.tags ?? []).find((tag) => (
    tag.kind === 'diagnosis'
    && tag.certainty === 'confirmed'
    && tag.label.trim().length > 0
  ))
  return confirmedDiagnosis?.label.trim() ?? '未定性'
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
