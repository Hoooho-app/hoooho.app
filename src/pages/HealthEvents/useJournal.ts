import { useEffect, useState } from 'react'
import type { HealthEventRecordApiDto } from '../../types'
import { apiRequest, ApiRequestError } from '../../services/apiClient'
import { healthEventService } from '../../services/healthEvents'
import { eventAttachmentService } from '../../services/eventAttachments'
import { flattenJournal, type JournalEntry } from './timeViewModel'

export function useJournal(memberId: string, token: string, revision: number) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ memberId: string; entries: JournalEntry[]; loading: boolean; error: string }>({ memberId, entries: [], loading: true, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ memberId, entries: [], loading: true, error: '' })
    const load = async () => {
      try {
        const events = (await healthEventService.list(token, controller.signal)).filter((event) => event.memberId === memberId)
        const results = await Promise.all(events.map(async (event) => {
          const [records, attachments] = await Promise.all([
            apiRequest<HealthEventRecordApiDto[]>(`/api/events/${encodeURIComponent(event.id)}/records?view=time`, { token, signal: controller.signal }),
            eventAttachmentService.list(event.id, token, controller.signal)
          ])
          return { event, records, attachments }
        }))
        if (!controller.signal.aborted) setState({ memberId, entries: flattenJournal(events, new Map(results.map((item) => [item.event.id, item.records])), new Map(results.map((item) => [item.event.id, item.attachments])), memberId), loading: false, error: '' })
      } catch (error) {
        if (!controller.signal.aborted) setState({ memberId, entries: [], loading: false, error: error instanceof ApiRequestError && error.status === 401 ? '登录状态已失效，请重新登录' : '记录加载失败，请重试' })
      }
    }
    if (token && memberId) void load()
    return () => controller.abort()
  }, [memberId, token, revision, attempt])
  return { ...(state.memberId === memberId ? state : { entries: [], loading: true, error: '' }), retry: () => setAttempt((value) => value + 1) }
}
