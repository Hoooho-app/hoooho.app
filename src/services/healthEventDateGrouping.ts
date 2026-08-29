import type { HealthEventListItemViewModel } from '../types'
import { getLocalDateKey } from '../utils/localCalendarDate'
import { compareHealthChronologyDesc } from './healthChronology'

export interface HealthEventDateGroup {
  date: string
  events: HealthEventListItemViewModel[]
}

export function groupHealthEventsByLocalDate(
  events: readonly HealthEventListItemViewModel[],
  timeZone?: string
): HealthEventDateGroup[] {
  const dates = new Map<string, HealthEventListItemViewModel[]>()
  for (const event of [...events].sort(compareHealthChronologyDesc)) {
    const date = getLocalDateKey(event.occurredAt, timeZone)
    if (!date) continue
    dates.set(date, [...(dates.get(date) ?? []), event])
  }
  return [...dates].map(([date, groupedEvents]) => ({ date, events: groupedEvents }))
}
