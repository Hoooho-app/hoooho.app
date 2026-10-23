import { PRODUCT_FEATURES } from '../../../shared/product-visibility.mjs'
import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import type { MedicationReminderDto } from '../../services/medicationReminders'
import { medicationCalendarReminders } from './reminders'

export function useCalendarReminders(accountId: string, memberId: string, token: string, today: string, revision: number) {
  const scope = `${accountId}:${memberId}:${token}`
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ scope: string; plans: MedicationReminderDto[]; loading: boolean; error: string }>({ scope, plans: [], loading: true, error: '' })
  useEffect(() => {
    if (!PRODUCT_FEATURES.auxiliaryTools) return
    const refresh = () => { if (document.visibilityState === 'visible') setAttempt(value => value + 1) }
    window.addEventListener('hoooho-data-changed', refresh); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { window.clearInterval(timer); window.removeEventListener('hoooho-data-changed', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  useEffect(() => {
    if (!PRODUCT_FEATURES.auxiliaryTools) { setState({ scope, plans: [], loading: false, error: '' }); return }
    const controller = new AbortController()
    setState(previous => ({ scope, plans: previous.scope === scope ? previous.plans : [], loading: Boolean(token && memberId && (previous.scope !== scope || !previous.plans.length)), error: '' }))
    if (token && memberId) void apiRequest<MedicationReminderDto[]>(`/api/medication-reminders?memberId=${encodeURIComponent(memberId)}`, { token, signal: controller.signal }).then(plans => {
      if (!controller.signal.aborted) setState({ scope, plans, loading: false, error: '' })
    }).catch(() => { if (!controller.signal.aborted) setState({ scope, plans: [], loading: false, error: '提醒加载失败，请重试' }) })
    return () => controller.abort()
  }, [scope, accountId, memberId, token, today, revision, attempt])
  const plans = state.scope === scope ? state.plans : []
  const reminders = useMemo(() => medicationCalendarReminders(plans, accountId, memberId, today), [plans, accountId, memberId, today])
  return { reminders, loading: state.scope === scope && state.loading, error: state.scope === scope ? state.error : '', retry: () => setAttempt(value => value + 1) }
}
