import { Navigate, useLocation } from 'react-router-dom'

export function GrowthReassurancePage() {
  const location = useLocation()
  const state = location.state as { measure?: 'height' | 'weight'; returnTo?: unknown } | null
  const returnTo = typeof state?.returnTo === 'string' && state.returnTo.startsWith('/') ? state.returnTo : ''
  return <Navigate replace state={{ selectedMeasure: state?.measure === 'weight' ? 'weight' : 'height', returnTo }} to="/health-profile/basic" />
}
