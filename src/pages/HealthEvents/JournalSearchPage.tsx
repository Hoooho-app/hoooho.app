import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { RecordFinder } from '../NurseStation/RecordFinder'
import { calendarNavigationParams, normalizeCalendarNavigation } from '../HealthCalendar/navigation'
import type { CalendarReturnState as JournalReturnState } from '../HealthCalendar/useCalendarNavigation'

export function JournalSearchPage() {
  const navigate = useNavigate(), location = useLocation()
  const token = useAppStore(s => s.authToken), memberId = useAppStore(s => s.currentMemberId)
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const identity = `${accountId}:${memberId}`
  const today = getLocalDateKey(new Date())!
  const rawReturn = (location.state as { journalReturn?: JournalReturnState } | null)?.journalReturn
  const returnState = !rawReturn?.identity || rawReturn.identity === identity ? rawReturn : undefined
  const leaveSearch = () => navigate(`/health-events?${calendarNavigationParams(normalizeCalendarNavigation(new URLSearchParams(), today, returnState), new URLSearchParams(returnState?.search))}${returnState?.hash ?? ''}`, { replace: true, state: { journalReturn: { ...returnState, documentTimeOrigin: performance.timeOrigin } } })
  if (!memberId || !token) return <Navigate to="/health-events" replace />
  return <RecordFinder key={identity} memberId={memberId} token={token} onClose={leaveSearch} />
}
