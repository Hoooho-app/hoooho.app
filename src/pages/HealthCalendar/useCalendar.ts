import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types'
import { caseService } from '../../features/case-continuity/api'
import type { FollowedCase } from '../../features/case-continuity/types'
import { calendarEntries, type CalendarEntry } from './model'

export function useCalendar(memberId: string, token: string, revision: number) {
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const changed = () => setRefresh(v => v + 1)
    const visible = () => { if (document.visibilityState === 'visible') changed() }
    window.addEventListener('hoooho-data-changed', changed)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('hoooho-data-changed', changed); document.removeEventListener('visibilitychange', visible) }
  }, [])
  const key = `${memberId}:${token}`
  const [state, setState] = useState<{ key: string; entries: CalendarEntry[]; cases: FollowedCase[]; loading: boolean; error: string; caseError: string }>({ key, entries: [], cases: [], loading: true, error: '', caseError: '' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ key, entries: [], cases: [], loading: true, error: '', caseError: '' })
    if (!memberId || !token) return () => controller.abort()
    void caseService.list(memberId, token, controller.signal).then(data => {
      if (!controller.signal.aborted) setState(s => ({ ...s, cases: [...data.active, ...data.archived].filter(item => item.event.memberId === memberId) }))
    }).catch(() => { if (!controller.signal.aborted) setState(s => ({ ...s, caseError: '跟进事项加载失败，请刷新重试' })) })
    const timeout = window.setTimeout(() => {
      setState(s => ({ ...s, loading: false, error: '记录读取超时，请重试' }))
      controller.abort()
    }, 45000)
    void (async () => {
      try {
        const events = (await apiRequest<HealthEventApiDto[]>('/api/events?view=time', { token, signal: controller.signal })).filter(event => event.memberId === memberId)
        const records = new Map<string, HealthEventRecordApiDto[]>()
        let index = 0
        await Promise.all(Array.from({ length: Math.min(6, events.length) }, async () => {
          while (index < events.length && !controller.signal.aborted) {
            const event = events[index++]
            records.set(event.id, await apiRequest<HealthEventRecordApiDto[]>(`/api/events/${encodeURIComponent(event.id)}/records`, { token, signal: controller.signal }))
          }
        }))
        if (!controller.signal.aborted) setState(s => ({ ...s, entries: calendarEntries(events, records, memberId), loading: false }))
      } catch {
        if (!controller.signal.aborted) setState(s => ({ ...s, loading: false, error: '记录加载未完成，请重试' }))
      } finally { window.clearTimeout(timeout) }
    })()
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [key, memberId, token, revision, refresh])
  return state.key === key ? state : { entries: [], cases: [], loading: true, error: '', caseError: '' }
}
