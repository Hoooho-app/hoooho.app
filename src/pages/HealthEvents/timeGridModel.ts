import type { RoutineTrack } from '../../services/routineTracks'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import type { JournalEntry } from './timeViewModel'

export const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour)
export const MAX_ACTIVE_SLEEP_MINUTES = 24 * 60

export interface SleepProjectionPoint {
  at: Date
  hour: number
  key: string
  kind: 'segment' | 'summary'
  minute: number
}

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

export function isCurrentOngoingSleep(entry: JournalEntry, now = new Date()) {
  if (entry.sleep?.status !== 'ongoing') return false
  const elapsed = Math.floor((now.getTime() - Date.parse(entry.sleep.sleepAt)) / 60_000)
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= MAX_ACTIVE_SLEEP_MINUTES
}

function localDayBounds(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  const start = new Date(year, month - 1, date)
  const end = new Date(year, month - 1, date + 1)
  return { start, end }
}

export function projectSleepInterval(startValue: string | Date, endValue: string | Date, day: string, includeSummary = true): SleepProjectionPoint[] {
  const startedAt = new Date(startValue)
  const endedAt = new Date(endValue)
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime()) || endedAt <= startedAt) return []
  const bounds = localDayBounds(day)
  if (endedAt < bounds.start || startedAt >= bounds.end) return []
  const segmentStart = new Date(Math.max(startedAt.getTime(), bounds.start.getTime()))
  const segmentEnd = new Date(Math.min(endedAt.getTime(), bounds.end.getTime()))
  const points: SleepProjectionPoint[] = []
  const pushSegment = (at: Date) => points.push({ at, hour: at.getHours(), key: `segment:${at.toISOString()}`, kind: 'segment', minute: at.getMinutes() })
  pushSegment(segmentStart)
  const cursor = new Date(segmentStart)
  cursor.setMinutes(0, 0, 0)
  cursor.setHours(cursor.getHours() + 1)
  while (cursor < segmentEnd) {
    pushSegment(new Date(cursor))
    cursor.setHours(cursor.getHours() + 1)
  }
  if (includeSummary && endedAt >= bounds.start && endedAt < bounds.end) {
    points.push({ at: endedAt, hour: endedAt.getHours(), key: `summary:${endedAt.toISOString()}`, kind: 'summary', minute: endedAt.getMinutes() })
  }
  return points
}

export function entriesForDay(entries: readonly JournalEntry[], day: string, now = new Date()) {
  return entries.filter((entry) => {
    if (!entry.sleep) return getLocalDateKey(new Date(entry.occurredAt)) === day
    const startDay = getLocalDateKey(new Date(entry.sleep.sleepAt))
    if (!startDay) return false
    if (entry.sleep.status === 'ongoing') {
      if (day === startDay) return true
      const today = getLocalDateKey(now)
      return isCurrentOngoingSleep(entry, now) && Boolean(today && day === today && day >= startDay)
    }
    const endDay = getLocalDateKey(new Date(entry.sleep.wakeAt))
    return Boolean(endDay && day >= startDay && day <= endDay)
  })
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
}

export function orderedHours(order: 'asc' | 'desc') {
  return order === 'asc' ? DAY_HOURS : [...DAY_HOURS].reverse()
}
