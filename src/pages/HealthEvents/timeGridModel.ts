import type { RoutineTrack } from '../../services/routineTracks'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import type { JournalEntry } from './timeViewModel'

export const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour)

export function minutePosition(minute: number) {
  return Math.max(0, Math.min(59, minute)) / 60 * 100
}

export function hourForEntry(entry: JournalEntry, day?: string) {
  const started = new Date(entry.sleep?.sleepAt ?? entry.occurredAt)
  const startedDay = getLocalDateKey(started)
  return day && entry.sleep && startedDay && startedDay < day ? 0 : started.getHours()
}

export function hourForTrack(track: RoutineTrack) {
  return Number(track.time.slice(0, 2))
}

export function entriesForDay(entries: readonly JournalEntry[], day: string) {
  return entries.filter((entry) => {
    if (!entry.sleep) return getLocalDateKey(new Date(entry.occurredAt)) === day
    const startDay = getLocalDateKey(new Date(entry.sleep.sleepAt))
    const endDay = getLocalDateKey(new Date(entry.sleep.wakeAt ?? Date.now()))
    return Boolean(startDay && endDay && day >= startDay && day <= endDay)
  })
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
}

export function orderedHours(order: 'asc' | 'desc') {
  return order === 'asc' ? DAY_HOURS : [...DAY_HOURS].reverse()
}
