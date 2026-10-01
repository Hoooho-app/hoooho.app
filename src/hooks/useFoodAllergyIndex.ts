import { useEffect, useState } from 'react'
import { apiRequest } from '../services/apiClient'
import { useAppStore } from '../store/useAppStore'

export interface FoodAllergyIndexResult {
  formulaVersion: string; accountId: string; memberId: string; percentage: number
  foodCount: number; recordedCount: number; expectedCount: number; unknownFoodCount: number
  pendingMaterialCount: number; updatedAt: string
  foods: { id: string; name: string; dimensions: Record<string, { label: string; recorded: boolean; sources: { id: string; label: string; href: string }[] }> }[]
}
const cache = new Map<string, FoodAllergyIndexResult>()

export function useFoodAllergyIndex() {
  const token = useAppStore(state => state.authToken)
  const accountId = useAppStore(state => state.authUser?.id)
  const memberId = useAppStore(state => state.currentMemberId)
  const key = JSON.stringify([accountId, memberId])
  const [state, setState] = useState<{ key: string; data?: FoodAllergyIndexResult; error: boolean; loading: boolean }>({ key, data: cache.get(key), error: false, loading: true })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('hoooho-data-changed', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('hoooho-data-changed', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    setState({ key, data: cache.get(key), loading: true, error: false })
    if (!token || !accountId || !memberId) {
      setState({ key, loading: false, error: true })
      clearTimeout(timeout)
      return
    }
    void apiRequest<FoodAllergyIndexResult>(`/api/food-allergy-index?memberId=${encodeURIComponent(memberId)}`, { token, signal: controller.signal })
      .then(data => {
        if (!active) return
        if (data.accountId !== accountId || data.memberId !== memberId) throw new Error('统计对象已变化')
        cache.set(key, data)
        setState({ key, data, loading: false, error: false })
      }).catch(() => { if (active) setState({ key, data: cache.get(key), loading: false, error: true }) })
      .finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [token, accountId, memberId, key, revision])
  const current = state.key === key ? state : { key, data: cache.get(key), loading: true, error: false }
  return { ...current, retry: () => setRevision(value => value + 1), label: current.data ? `${current.data.percentage}%` : current.loading ? '计算中…' : '加载失败' }
}
