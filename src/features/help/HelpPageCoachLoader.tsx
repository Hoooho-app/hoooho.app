import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
const Coach = lazy(() => import('./HelpPageCoach').then(module => ({ default: module.HelpPageCoach })))
export function HelpPageCoachLoader() {
  const location = useLocation()
  const account = useAppStore(s => s.authUser?.id ?? ''), member = useAppStore(s => s.currentMemberId)
  const [restored] = useState(() => { try { return Boolean(sessionStorage.getItem('hoooho-help-page:' + encodeURIComponent(account) + ':' + encodeURIComponent(member))) } catch { return false } })
  const [used, setUsed] = useState(false)
  const requested = new URLSearchParams(location.search).has('helpTour')
  useEffect(() => { if (requested) setUsed(true) }, [requested])
  return requested || used || restored ? <Suspense fallback={null}><Coach/></Suspense> : null
}
