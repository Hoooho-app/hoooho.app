import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OPS_PROJECTS, isOpsProject } from '../../../shared/ops-projects.mjs'
import { opsApiRequest } from '../../services/opsAuth'
import { useAppStore } from '../../store/useAppStore'

export interface OpsEvent { id: string; projectId: string; kind: string; title: string; preview: string; occurredAt: string; target: string; viewedAt: string | null }
interface Inbox { events: OpsEvent[]; loading: boolean; error: string; refresh: () => Promise<void>; markViewed: (id: string) => Promise<void>; drafts: Map<string, { kind: 'user-reply' | 'internal-note'; text: string }> }
const InboxContext = createContext<Inbox | null>(null)
export const useOpsInbox = () => useContext(InboxContext)
export const projectName = (id: string) => OPS_PROJECTS.find(project => project.id === id)?.name ?? '护护记录'
export function useOpsProject(fallback = 'all', resetParams: string[] = []) {
  const [params, setParams] = useSearchParams()
  const value = params.get('project')
  const project = value === 'all' || isOpsProject(value) ? value! : fallback
  const choose = (id: string) => setParams(previous => {
    const next = new URLSearchParams(previous)
    next.set('project', id)
    next.delete('source'); next.delete('feedback'); next.delete('event')
    for (const key of resetParams) next.delete(key)
    return next
  })
  return { project, choose }
}
export function OpsProjectPicker({ fallback = 'all', resetParams = [] }: { fallback?: string; resetParams?: string[] }) {
  const { project, choose } = useOpsProject(fallback, resetParams)
  const options = [{ id: 'all', name: '全部项目' }, ...OPS_PROJECTS]
  return <div className="ops-project-picker">
    <div className="ops-project-tabs" aria-label="选择项目">{options.map(item => <button type="button" key={item.id} aria-pressed={project === item.id} onClick={() => choose(item.id)}>{item.name}</button>)}</div>
    <label className="ops-project-select"><span className="sr-only">选择项目</span><select value={project} onChange={event => choose(event.target.value)}>{options.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
  </div>
}
export function OpsInboxProvider({ children }: { children: ReactNode }) {
  const token = useAppStore(state => state.opsAuthToken)!
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const active = useRef(true)
  const pending = useRef(new Map<string, Promise<void>>())
  const drafts = useMemo(() => new Map<string, { kind: 'user-reply' | 'internal-note'; text: string }>(), [token])
  const refresh = useCallback(async () => {
    const sequence = ++generation.current
    try {
      const data = await opsApiRequest<{ events: OpsEvent[] }>('/api/ops/overview', { token })
      if (!Array.isArray(data.events)) throw new Error('新情况数据格式异常')
      if (active.current && sequence === generation.current) { setEvents(data.events); setError('') }
    } catch (cause) {
      if (active.current && sequence === generation.current) setError(cause instanceof Error ? cause.message : '新情况读取失败')
    } finally { if (active.current && sequence === generation.current) setLoading(false) }
  }, [token])
  useEffect(() => {
    active.current = true
    setEvents([]); setError(''); setLoading(true)
    void refresh()
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(onFocus, 60_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { active.current = false; generation.current++; clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [refresh])
  const markViewed = useCallback((id: string) => {
    const current = pending.current.get(id)
    if (current) return current
    const operation = (async () => {
      const receipt = await opsApiRequest<{ id: string; viewedAt: string }>('/api/ops/overview/viewed', { token, method: 'POST', body: { id } })
      if (active.current) setEvents(previous => previous.map(event => event.id === receipt.id ? { ...event, viewedAt: receipt.viewedAt } : event))
      await refresh()
    })().finally(() => pending.current.delete(id))
    pending.current.set(id, operation)
    return operation
  }, [token, refresh])
  return <InboxContext.Provider value={{ events, loading, error, refresh, markViewed, drafts }}>{children}</InboxContext.Provider>
}
export function useOpsViewedReceipt(id: string | null | undefined, ready: boolean) {
  const inbox = useOpsInbox()
  const markViewed = inbox?.markViewed
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    setError('')
    if (!id || !ready || !markViewed) return
    let current = true
    void markViewed(id).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : '查看状态同步失败') })
    return () => { current = false }
  }, [id, ready, markViewed, retry])
  return { error, retry: () => setRetry(value => value + 1) }
}
