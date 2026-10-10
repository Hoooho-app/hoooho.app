import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { calendarNavigationParams, normalizeCalendarNavigation, type CalendarNavigation } from './navigation'

export interface CalendarReturnState extends Partial<CalendarNavigation> { scrollTop?: number; identity?: string; search?: string; hash?: string }
export function useCalendarNavigation(identity: string, today: string) {
  const location = useLocation(), navigate = useNavigate()
  const key = `hoooho:health-calendar-navigation:${identity}`
  const owner = (location.state as { calendarIdentity?: string } | null)?.calendarIdentity
  const initial = useRef<Partial<CalendarNavigation>>()
  if (!initial.current) {
    let saved: Partial<CalendarNavigation> = {}
    try { saved = JSON.parse(sessionStorage.getItem(key) ?? '{}') } catch { /* Optional restore only. */ }
    const returned = (location.state as { journalReturn?: CalendarReturnState } | null)?.journalReturn
    initial.current = returned && !owner && (!returned.identity || returned.identity === identity) ? { ...saved, ...returned } : saved
    // Keep the established sort/day preference on first migration without changing any saved records.
    try {
      const legacyDay = sessionStorage.getItem(`hoooho:journal-day:${identity}`)
      initial.current.day ??= legacyDay ?? undefined
      initial.current.sort ??= legacyDay && sessionStorage.getItem('hoooho:journal-sort') === 'asc' ? 'asc' : 'desc'
    } catch { /* Storage can be unavailable in private browsing. */ }
  }
  const differentOwner = Boolean(owner && owner !== identity)
  const original = new URLSearchParams(location.search)
  if (differentOwner) { original.delete('eventId'); original.delete('recordId') }
  const state = normalizeCalendarNavigation(differentOwner ? new URLSearchParams() : original, today, initial.current)
  const canonical = calendarNavigationParams(state, original).toString()
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(state)); sessionStorage.setItem('hoooho:journal-sort', state.sort) } catch { /* Navigation works without storage. */ }
    if (location.search.slice(1) !== canonical || owner !== identity) navigate(`${location.pathname}?${canonical}${location.hash}`, { replace: true, state: { ...location.state, calendarIdentity: identity } })
  }, [canonical, key, location.pathname, location.search, location.hash, location.state, navigate])
  const change = (next: CalendarNavigation, flushSync = true) => {
    const validated = normalizeCalendarNavigation(calendarNavigationParams(next), today)
    navigate(`${location.pathname}?${calendarNavigationParams(validated, new URLSearchParams(location.search))}${location.hash}`, { flushSync, state: { ...location.state, journalReturn: undefined, calendarIdentity: identity } })
  }
  return { state, change }
}
