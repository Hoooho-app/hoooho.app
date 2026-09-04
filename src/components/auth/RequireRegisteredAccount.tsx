import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

export function RequireRegisteredAccount() {
  const user = useAppStore((state) => state.authUser)
  const location = useLocation()
  if (!user || user.guest) return <Navigate replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} to="/login" />
  return <Outlet />
}
