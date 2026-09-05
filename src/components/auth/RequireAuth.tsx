import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

export function RequireAuth() {
  const token = useAppStore((state) => state.authToken)
  const authStatus = useAppStore((state) => state.authStatus)
  const location = useLocation()

  if (authStatus === 'unknown' || authStatus === 'loading') return <main className="app-shell px-4 py-16"><p role="status">正在恢复使用状态…</p></main>
  if (!token) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  }

  return <Outlet />
}
