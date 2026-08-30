import type { TimelineEntry } from '../types'
import { formatHealthTimelineDate } from '../utils/formatHealthTimePeriod'
import { getLocalCalendarParts } from '../utils/localCalendarDate'
import { compareHealthChronologyAsc, compareHealthChronologyDesc } from './healthChronology'

export type TimelineOrder = 'desc' | 'asc'

export interface TimelineDateGroup {
  date: string
  entries: TimelineEntry[]
}

export interface TimelineYearGroup {
  year: number
  dates: TimelineDateGroup[]
}

function chronologyItem(entry: TimelineEntry) {
  return {
    id: entry.id,
    occurredAt: entry.time,
    createdAt: entry.createdAt ?? entry.time
  }
}

export function sortTimelineEntries(
  timeline: readonly TimelineEntry[],
  order: TimelineOrder
): TimelineEntry[] {
  const compare = order === 'desc' ? compareHealthChronologyDesc : compareHealthChronologyAsc

  return [...timeline].sort((left, right) => compare(chronologyItem(left), chronologyItem(right)))
}

export function sortAndGroupTimeline(
  timeline: readonly TimelineEntry[],
  order: TimelineOrder,
  timeZone?: string
): TimelineYearGroup[] {
  const dateDirection = order === 'desc' ? -1 : 1
  const sorted = [...timeline].sort((left, right) => {
    const leftParts = getLocalCalendarParts(left.time, timeZone)
    const rightParts = getLocalCalendarParts(right.time, timeZone)
    const leftDate = leftParts ? leftParts.year * 10_000 + leftParts.month * 100 + leftParts.day : 0
    const rightDate = rightParts ? rightParts.year * 10_000 + rightParts.month * 100 + rightParts.day : 0
    if (leftDate !== rightDate) return (leftDate - rightDate) * dateDirection
    return compareHealthChronologyAsc(chronologyItem(left), chronologyItem(right))
  })
  return groupTimelineByYearAndDate(sorted, timeZone)
}

export function groupTimelineByYearAndDate(timeline: TimelineEntry[], timeZone?: string): TimelineYearGroup[] {
  return timeline.reduce<TimelineYearGroup[]>((years, entry) => {
    const parts = getLocalCalendarParts(entry.time, timeZone)
    if (!parts) return years
    const year = parts.year
    const date = formatHealthTimelineDate(entry.time, timeZone)
    const currentYear = years[years.length - 1]

    if (currentYear?.year !== year) {
      years.push({ year, dates: [{ date, entries: [entry] }] })
      return years
    }

    const currentDate = currentYear.dates[currentYear.dates.length - 1]
    if (currentDate?.date === date) currentDate.entries.push(entry)
    else currentYear.dates.push({ date, entries: [entry] })

    return years
  }, [])
}
