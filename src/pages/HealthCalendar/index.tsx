import { Navigate, useLocation } from 'react-router-dom'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { calendarNavigationParams, normalizeCalendarNavigation } from './navigation'
import type { CalendarReturnState } from './useCalendarNavigation'
import { useAppStore } from '../../store/useAppStore'

// Historical links retain business query parameters and return context, without a second page shell.
export function HealthCalendarPage() {
  const location = useLocation(), params = new URLSearchParams(location.search)
  const identity = useAppStore(state => `${state.authUser?.id ?? ''}:${state.currentMemberId}`)
  const returned = (location.state as { journalReturn?: CalendarReturnState } | null)?.journalReturn
  params.set('view', 'month')
  const state = normalizeCalendarNavigation(params, getLocalDateKey(new Date())!, !returned?.identity || returned.identity === identity ? returned : undefined)
  return <Navigate replace to={`/health-events?${calendarNavigationParams(state, params)}${location.hash}`} state={location.state}/>
}
