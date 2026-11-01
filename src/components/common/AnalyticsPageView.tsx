import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { visitProductPage } from '../../services/productAnalytics'

export function AnalyticsPageView({ children }: { children: ReactNode }) {
  const location = useLocation()
  useEffect(() => { visitProductPage(location.pathname, location.key) }, [location.pathname, location.key])
  return children
}
