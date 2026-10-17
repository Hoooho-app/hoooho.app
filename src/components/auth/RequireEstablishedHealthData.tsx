import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { accountEntryStateService } from '../../services/accountEntryState'
import { ApiRequestError } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'
import { SessionRecoveryScreen } from './SessionRecoveryView'

type GateState = 'loading' | 'allowed' | 'first-use' | 'error'

interface RequireEstablishedHealthDataProps {
  requireHealthRecord?: boolean
}

export function RequireEstablishedHealthData({ requireHealthRecord = true }: RequireEstablishedHealthDataProps) {
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const accountId = useAppStore((state) => state.authUser?.id)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const allowFirstRecord = Boolean((location.state as { allowFirstRecord?: boolean } | null)?.allowFirstRecord)
  const [state, setState] = useState<GateState>(allowFirstRecord ? 'allowed' : 'loading')
  const allowedAccount = useRef(allowFirstRecord ? accountId : undefined)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token || allowFirstRecord) return
    setState(current => current === 'allowed' && allowedAccount.current === accountId ? current : 'loading')
    try {
      const entryState = await accountEntryStateService.get(token, signal)
      if (signal?.aborted) return
      const hasRequiredData = entryState.familyMemberCount > 0
        && (!requireHealthRecord || entryState.hasValidHealthRecord)
      allowedAccount.current = hasRequiredData ? accountId : undefined
      setState(hasRequiredData ? 'allowed' : 'first-use')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof ApiRequestError && error.status === 401) {
        clearAuthSession()
        return
      }
      setState(current => current === 'allowed' && allowedAccount.current === accountId ? current : 'error')
    }
  }, [accountId, allowFirstRecord, clearAuthSession, requireHealthRecord, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (allowFirstRecord || (state === 'allowed' && allowedAccount.current === accountId)) return <Outlet />
  if (state === 'first-use') return <Navigate to="/health-events" replace />
  return <SessionRecoveryScreen failed={state === 'error'} onRetry={() => void load()} />
}
