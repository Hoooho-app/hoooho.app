import { formatLocalMonthDay } from './localCalendarDate'

const periods = [
  { start: 0, end: 6, label: '凌晨 00:00–06:00' },
  { start: 6, end: 9, label: '早上 06:00–09:00' },
  { start: 9, end: 12, label: '上午 09:00–12:00' },
  { start: 12, end: 13, label: '中午 12:00–13:00' },
  { start: 13, end: 18, label: '下午 13:00–18:00' },
  { start: 18, end: 21, label: '晚上 18:00–21:00' },
  { start: 21, end: 24, label: '夜间 21:00–24:00' }
] as const

const spokenPeriodMatchers = [
  { pattern: /凌晨|半夜/, label: periods[0].label },
  { pattern: /早上|今早/, label: periods[1].label },
  { pattern: /上午/, label: periods[2].label },
  { pattern: /中午/, label: periods[3].label },
  { pattern: /下午/, label: periods[4].label },
  { pattern: /晚上/, label: '晚上 18:00–24:00' },
  { pattern: /夜里|夜间/, label: periods[6].label }
] as const

export function formatHealthTimePeriod(spokenTime: string | undefined, occurredAt: string) {
  const spoken = spokenTime?.trim() ?? ''
  const matchedSpokenPeriod = spokenPeriodMatchers.find(({ pattern }) => pattern.test(spoken))
  if (matchedSpokenPeriod) return matchedSpokenPeriod.label

  const explicitTime = spoken.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/)
  const date = new Date(occurredAt)
  const hour = explicitTime ? Number(explicitTime[1]) : date.getHours()
  return periods.find((period) => hour >= period.start && hour < period.end)?.label ?? periods[0].label
}

export function formatHealthTimelineDate(value: string, timeZone?: string) {
  return formatLocalMonthDay(value, timeZone)
}
