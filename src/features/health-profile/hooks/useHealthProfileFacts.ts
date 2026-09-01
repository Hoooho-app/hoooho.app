import { useCallback, useEffect, useState } from 'react'
import type { CandidateHealthFactApiDto, HealthProfileFactApiDto } from '../../../types'
import { healthProfileFactService } from '../../../services/healthProfileFacts'
import { useAppStore } from '../../../store/useAppStore'

export function useHealthProfileFacts(memberId: string) {
  const token = useAppStore((state) => state.authToken)
  const [facts, setFacts] = useState<HealthProfileFactApiDto[]>([])
  const [candidates, setCandidates] = useState<CandidateHealthFactApiDto[]>([])
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token || !memberId) return
    setStatus('loading')
    try {
      const [nextFacts, nextCandidates] = await Promise.all([
        healthProfileFactService.list(memberId, token, signal),
        healthProfileFactService.listCandidates(memberId, token, signal)
      ])
      if (signal?.aborted) return
      setFacts(nextFacts)
      setCandidates(nextCandidates)
      setStatus('success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage(error instanceof Error ? error.message : '重要健康事实加载失败')
      setStatus('error')
    }
  }, [memberId, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return { candidates, facts, load, message, status, token }
}
