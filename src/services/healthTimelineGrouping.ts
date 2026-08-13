import type { TimelineEntry } from '../types'
import { formatHealthTimelineDate } from '../utils/formatHealthTimePeriod'
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
  order: TimelineOrder
): TimelineYearGroup[] {
  return groupTimelineByYearAndDate(sortTimelineEntries(timeline, order))
}

export function groupTimelineByYearAndDate(timeline: TimelineEntry[]): TimelineYearGroup[] {
  return timeline.reduce<TimelineYearGroup[]>((years, entry) => {
    const parsedTime = new Date(entry.time)
    const year = parsedTime.getFullYear()
    const date = formatHealthTimelineDate(entry.time)
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
