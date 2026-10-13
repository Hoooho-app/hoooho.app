import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { calendarNavigationParams, normalizeCalendarNavigation, type CalendarNavigation } from './navigation'
import { normalizeCalendarCategory } from './presentation'

export interface CalendarReturnState extends Partial<CalendarNavigation> { scrollTop?: number; identity?: string; search?: string; hash?: string; documentTimeOrigin?: number }
export function useCalendarNavigation(identity: string, today: string) {
  const location = useLocation(), navigate = useNavigate()
  const key = `hoooho:health-calendar-navigation:${identity}`
  const viewKey = `hoooho:health-calendar-view:${identity}`
  const entryKey = useRef(location.key)
  const returned = (location.state as { journalReturn?: CalendarReturnState } | null)?.journalReturn
  const isReturn = Boolean(returned && returned.documentTimeOrigin === performance.timeOrigin && (!returned.identity || returned.identity === identity))
  const owner = (location.state as { calendarIdentity?: string } | null)?.calendarIdentity
  const initial = useRef<Partial<CalendarNavigation>>()
  if (!initial.current) {
    let saved: Partial<CalendarNavigation> = {}
    try { saved = JSON.parse(sessionStorage.getItem(key) ?? '{}') } catch { /* Optional restore only. */ }
    try { const preferred = localStorage.getItem(viewKey); if (preferred === 'day' || preferred === 'month') saved.view = preferred } catch { /* Optional preference. */ }
    saved.category = ''
    initial.current = returned && isReturn && !owner ? { ...saved, ...returned } : saved
    // Keep the established sort/day preference on first migration without changing any saved records.
    try {
      const legacyDay = sessionStorage.getItem(`hoooho:journal-day:${identity}`)
      initial.current.day ??= legacyDay ?? undefined
      initial.current.sort ??= legacyDay && sessionStorage.getItem('hoooho:journal-sort') === 'asc' ? 'asc' : 'desc'
    } catch { /* Storage can be unavailable in private browsing. */ }
  }
  const differentOwner = Boolean(owner && owner !== identity)
  const original = new URLSearchParams(location.search)
  // A new visit resets the filter; a search/detail return restores its own state.
  if (location.key === entryKey.current && !isReturn) original.delete('category')
  const [legacyNotice, setLegacyNotice] = useState(() => Boolean(original.get('category') && !normalizeCalendarCategory(original.get('category')!)))
  useEffect(() => { if (!legacyNotice) return; const timer = window.setTimeout(() => setLegacyNotice(false), 5000); return () => window.clearTimeout(timer) }, [legacyNotice])
  if (differentOwner) { original.delete('eventId'); original.delete('recordId') }
  const state = normalizeCalendarNavigation(differentOwner ? new URLSearchParams() : original, today, initial.current)
  const canonical = calendarNavigationParams(state, original).toString()
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(state)); sessionStorage.setItem('hoooho:journal-sort', state.sort); localStorage.setItem(viewKey, state.view) } catch { /* Navigation works without storage. */ }
    if (location.search.slice(1) !== canonical || owner !== identity || (isReturn && state.view === 'month')) navigate(`${location.pathname}?${canonical}${location.hash}`, { replace: true, state: { ...location.state, ...(state.view === 'month' ? { journalReturn: undefined } : {}), calendarIdentity: identity } })
  }, [canonical, key, location.pathname, location.search, location.hash, location.state, navigate])
  const change = (next: CalendarNavigation, flushSync = true) => {
    const validated = normalizeCalendarNavigation(calendarNavigationParams(next), today)
    navigate(`${location.pathname}?${calendarNavigationParams(validated, new URLSearchParams(location.search))}${location.hash}`, { flushSync, state: { ...location.state, journalReturn: undefined, calendarIdentity: identity } })
  }
  return { state, change, legacyNotice }
}
