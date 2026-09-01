import { useCallback, useEffect, useState } from 'react'
import { healthInformationCandidateService } from '../services/healthInformationCandidates'
import { useAppStore } from '../store/useAppStore'
import type { HealthInformationCandidateApiDto, HealthProfileDestination } from '../types'

export function useHealthInformationCandidates(eventId: string | undefined, enabled = true) {
  const token = useAppStore((state) => state.authToken)
  const [items, setItems] = useState<HealthInformationCandidateApiDto[]>([])
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState('')

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!eventId || !token || !enabled) { setLoading(false); return }
    setLoading(true)
    setError('')
    try { setItems(await healthInformationCandidateService.discover(eventId, token, signal)) }
    catch (loadError) {
      if (signal?.aborted) return
      setError(loadError instanceof Error ? loadError.message : '健康信息加载失败')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [enabled, eventId, token])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const update = useCallback(async (candidateId: string, input: { status: 'confirmed' | 'dismissed'; destinationProfileSection?: HealthProfileDestination; note?: string }) => {
    if (!token) throw new Error('登录状态无效，请重新登录')
    const updated = await healthInformationCandidateService.update(candidateId, token, input)
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item))
    return updated
  }, [token])

  return { error, items, loading, refresh, update }
}
