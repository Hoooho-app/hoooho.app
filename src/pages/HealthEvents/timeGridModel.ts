import type { RoutineTrack } from '../../services/routineTracks'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import type { JournalEntry } from './timeViewModel'

export const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour)

export function minutePosition(minute: number) {
  return Math.max(0, Math.min(59, minute)) / 60 * 100
}

export function hourForEntry(entry: JournalEntry) {
  return new Date(entry.occurredAt).getHours()
}

export function hourForTrack(track: RoutineTrack) {
  return Number(track.time.slice(0, 2))
}

export function entriesForDay(entries: readonly JournalEntry[], day: string) {
  return entries.filter((entry) => getLocalDateKey(new Date(entry.occurredAt)) === day)
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
}

export function orderedHours(order: 'asc' | 'desc') {
  return order === 'asc' ? DAY_HOURS : [...DAY_HOURS].reverse()
}
