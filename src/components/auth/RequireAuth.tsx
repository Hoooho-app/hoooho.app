import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

export function RequireAuth() {
  const token = useAppStore((state) => state.authToken)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
