import { FUTURE_OCCURRED_AT_MESSAGE, localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'

export type OccurrenceTimeMode = 'now' | 'specified'

function localValueForDay(day: string, now = new Date()) {
  return `${day}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function occurrenceInitialState(selectedDay: string, today: string, initialOccurredAt?: string, now = new Date()) {
  if (initialOccurredAt) return { mode: 'specified' as const, value: localDateTimeValue(new Date(initialOccurredAt)) }
  return selectedDay === today
    ? { mode: 'now' as const, value: localDateTimeValue(now) }
    : { mode: 'specified' as const, value: localValueForDay(selectedDay, now) }
}

export function captureOccurrenceTime(mode: OccurrenceTimeMode, specifiedValue: string, now = new Date()) {
  if (mode === 'now') return now.toISOString()
  const value = localDateTimeToIso(specifiedValue)
  if (new Date(value).getTime() > now.getTime()) throw new Error(FUTURE_OCCURRED_AT_MESSAGE)
  return value
}
