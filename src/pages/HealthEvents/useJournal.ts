import { useEffect, useState } from 'react'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types'
import { apiRequest, ApiRequestError } from '../../services/apiClient'
import { eventAttachmentService } from '../../services/eventAttachments'
import { flattenJournal, type JournalEntry } from './timeViewModel'

export function useJournal(memberId: string, token: string, revision: number) {
  const [attempt, setAttempt] = useState(0)
  const cacheKey = `hoooho-journal-cache:${memberId}`
  const readCache = () => { try { return JSON.parse(sessionStorage.getItem(cacheKey) ?? '[]') as JournalEntry[] } catch { return [] } }
  const [state, setState] = useState<{ memberId: string; entries: JournalEntry[]; loading: boolean; error: string }>(() => ({ memberId, entries: readCache(), loading: true, error: '' }))
  useEffect(() => {
    const controller = new AbortController()
    const cached = readCache()
    setState({ memberId, entries: cached, loading: cached.length === 0, error: '' })
    const load = async () => {
      try {
        const events = (await apiRequest<HealthEventApiDto[]>('/api/events?view=time', { token, signal: controller.signal })).filter((event) => event.memberId === memberId)
        const results = await Promise.all(events.map(async (event) => {
          const [records, attachments] = await Promise.all([
            apiRequest<HealthEventRecordApiDto[]>(`/api/events/${encodeURIComponent(event.id)}/records?view=time`, { token, signal: controller.signal }),
            eventAttachmentService.list(event.id, token, controller.signal)
          ])
          return { event, records, attachments }
        }))
        if (!controller.signal.aborted) {
          const entries = flattenJournal(events, new Map(results.map((item) => [item.event.id, item.records])), new Map(results.map((item) => [item.event.id, item.attachments])), memberId)
          sessionStorage.setItem(cacheKey, JSON.stringify(entries))
          setState({ memberId, entries, loading: false, error: '' })
        }
      } catch (error) {
        if (!controller.signal.aborted) setState({ memberId, entries: cached, loading: false, error: error instanceof ApiRequestError && error.status === 401 ? '登录状态已失效，请重新登录' : '记录加载失败，请重试' })
      }
    }
    if (token && memberId) void load()
    return () => controller.abort()
  }, [memberId, token, revision, attempt, cacheKey])
  return { ...(state.memberId === memberId ? state : { entries: [], loading: true, error: '' }), retry: () => setAttempt((value) => value + 1) }
}
