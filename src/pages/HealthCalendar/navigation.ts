import { parsePlainDate } from '../../utils/localCalendarDate'
import { calendarCategories } from './presentation'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import { getLocalDateKey } from '../../utils/localCalendarDate'

export interface CalendarNavigation {
  view: 'day' | 'month'
  day: string
  month: string
  category: string
  sort: 'asc' | 'desc'
}
export function normalizeCalendarNavigation(params: URLSearchParams, today: string, fallback?: Partial<CalendarNavigation>): CalendarNavigation {
  const requestedDay = params.get('day') ?? fallback?.day ?? today
  const day = parsePlainDate(requestedDay) && requestedDay <= today ? requestedDay : today
  const requestedMonth = params.get('month') ?? (params.has('day') ? day.slice(0, 7) : fallback?.month) ?? day.slice(0, 7)
  const month = parsePlainDate(`${requestedMonth}-01`) && requestedMonth <= today.slice(0, 7) ? requestedMonth : day.slice(0, 7)
  const category = params.get('category') ?? fallback?.category ?? ''
  return {
    view: (params.get('view') ?? fallback?.view) === 'month' ? 'month' : 'day', day, month,
    category: calendarCategories.includes(category as typeof calendarCategories[number]) ? category : '',
    sort: (params.get('sort') ?? fallback?.sort) === 'asc' ? 'asc' : 'desc',
  }
}
export function calendarNavigationParams(state: CalendarNavigation, original = new URLSearchParams()) {
  const params = new URLSearchParams(original)
  for (const [key, value] of Object.entries(state)) params.set(key, value)
  return params
}
export function switchCalendarView(state: CalendarNavigation, view: CalendarNavigation['view'], today: string): CalendarNavigation {
  if (view === 'month') return { ...state, view, month: state.day.slice(0, 7) }
  const candidate = state.day.startsWith(state.month) ? state.day : `${state.month}-01`
  return { ...state, view, day: candidate > today ? today : candidate }
}
export function shiftCalendarMonth(month: string, amount: number) {
  const parts = parsePlainDate(`${month}-01`)
  if (!parts) return month
  return getLocalDateKey(new Date(parts.year, parts.month - 1 + amount, 1, 12))!.slice(0, 7)
}
// Both projections use the saved fact's occurrence, never its audit timestamp or a planned instance.
export function monthOccurrenceEntries(entries: readonly JournalEntry[], month: string) {
  const days = new Map<string, JournalEntry[]>()
  for (const entry of entries) {
    if (entry.timePrecision === 'unknown') continue
    const day = getLocalDateKey(journalOccurrenceAt(entry, entry.occurredAt))
    if (!day?.startsWith(`${month}-`)) continue
    const items = days.get(day) ?? []
    if (!items.some(item => item.id === entry.id)) items.push(entry)
    days.set(day, items)
  }
  for (const items of days.values()) items.sort((a, b) => Date.parse(journalOccurrenceAt(b, b.occurredAt)) - Date.parse(journalOccurrenceAt(a, a.occurredAt)))
  return days
}
