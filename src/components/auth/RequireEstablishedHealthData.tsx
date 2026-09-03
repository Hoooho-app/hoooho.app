import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { HohoButton, StatusNotice } from '../design-system'
import { accountEntryStateService } from '../../services/accountEntryState'
import { ApiRequestError } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'

type GateState = 'loading' | 'allowed' | 'first-use' | 'error'

export function RequireEstablishedHealthData() {
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const allowFirstRecord = Boolean((location.state as { allowFirstRecord?: boolean } | null)?.allowFirstRecord)
  const [state, setState] = useState<GateState>(allowFirstRecord ? 'allowed' : 'loading')

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token || allowFirstRecord) return
    setState('loading')
    try {
      const entryState = await accountEntryStateService.get(token, signal)
      setState(entryState.familyMemberCount > 0 && entryState.hasValidHealthRecord ? 'allowed' : 'first-use')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof ApiRequestError && error.status === 401) {
        clearAuthSession()
        return
      }
      setState('error')
    }
  }, [allowFirstRecord, clearAuthSession, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (state === 'allowed') return <Outlet />
  if (state === 'first-use') return <Navigate to="/health-events" replace />
  return (
    <main className="app-shell px-4 py-16">
      {state === 'loading'
        ? <p className="text-center text-sm text-text-secondary">正在准备健康记录…</p>
        : <StatusNotice action={<HohoButton size="small" variant="secondary" onClick={() => void load()}>重新加载</HohoButton>} title="页面状态加载失败" tone="error">请检查网络后重试</StatusNotice>}
    </main>
  )
}
