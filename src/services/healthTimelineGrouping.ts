import type { TimelineEntry } from '../types'
import { formatHealthTimelineDate } from '../utils/formatHealthTimePeriod'

export interface TimelineDateGroup {
  date: string
  entries: TimelineEntry[]
}

export interface TimelineYearGroup {
  year: number
  dates: TimelineDateGroup[]
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
