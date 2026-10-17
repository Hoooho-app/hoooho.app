import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { recoverBrowserSession } from './SessionBootstrap'
import { useBrowserRecoveryState } from '../../services/browserRecoveryState'
import { SessionRecoveryScreen } from './SessionRecoveryView'
import { SessionExpiredDialog } from './SessionExpiredDialog'

export function RequireAuth() {
  const token = useAppStore((state) => state.authToken)
  const authStatus = useAppStore((state) => state.authStatus)
  const accountId = useAppStore((state) => state.authUser?.id)
  const { contextAccountId, reauthenticationRequired, phase } = useBrowserRecoveryState()
  const location = useLocation()

  const keepPage = accountId && contextAccountId === accountId
  if (!keepPage && (authStatus === 'unknown' || authStatus === 'loading' || token || authStatus === 'error')) return <SessionRecoveryScreen failed={phase === 'failed'} onRetry={() => void recoverBrowserSession()} />
  if (!token && !reauthenticationRequired) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  }

  return <><div className="session-protected-page" key={accountId} aria-hidden={reauthenticationRequired || undefined}><Outlet /></div>{reauthenticationRequired && <SessionExpiredDialog />}</>
}
