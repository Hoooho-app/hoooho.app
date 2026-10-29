import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { conversationCaptureDrafts } from '../../features/ai-business/captureDraft'
import { drawerHistoryRows, type HistoryPage, type RetainedConversation, type ServerConversation } from './drawerHistory'

interface State {
  identity: string; server: ServerConversation[]; retained: RetainedConversation[]
  loading: boolean; error: boolean; localError: boolean; hasMore: boolean; nextOffset: number; loadingMore: boolean; moreError: boolean
}
const empty = (identity: string, loading = false): State => ({ identity, server: [], retained: [], loading, error: false, localError: false, hasMore: false, nextOffset: 0, loadingMore: false, moreError: false })

export function useDrawerHistory({ open, accountId, memberId, memberName, token, hasMembers }: { open: boolean; accountId: string; memberId: string; memberName: string; token: string | null; hasMembers: boolean }) {
  const identity = accountId + ':' + memberId
  const [state, setState] = useState<State>(() => empty(identity)), [revision, setRevision] = useState(0)
  const stateRef = useRef(state); stateRef.current = state
  const requestRef = useRef<AbortController | null>(null), locked = useRef(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(); requestRef.current = controller; locked.current = false
    setState(empty(identity, Boolean(hasMembers && token)))
    if (hasMembers && token) void Promise.allSettled([
      apiRequest<HistoryPage>('/api/members/' + encodeURIComponent(memberId) + '/front-desk-record/history', { token, signal: controller.signal }),
      conversationCaptureDrafts('home-smart:' + accountId + ':' + memberId + ':new')
    ]).then(([server, local]) => {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setState({ ...empty(identity), server: server.status === 'fulfilled' ? server.value.items : [], retained: local.status === 'fulfilled' ? local.value : [], error: server.status === 'rejected', localError: local.status === 'rejected', hasMore: server.status === 'fulfilled' && server.value.hasMore, nextOffset: server.status === 'fulfilled' ? server.value.nextOffset : 0 })
    })
    return () => { controller.abort(); if (requestRef.current === controller) requestRef.current = null }
  }, [accountId, hasMembers, identity, memberId, open, revision, token])

  const loadMore = useCallback(async () => {
    const current = stateRef.current, controller = requestRef.current
    if (!open || !token || !controller || controller.signal.aborted || locked.current || current.identity !== identity || current.loading || !current.hasMore) return
    locked.current = true
    setState(old => ({ ...old, loadingMore: true, moreError: false }))
    try {
      const next = await apiRequest<HistoryPage>('/api/members/' + encodeURIComponent(memberId) + '/front-desk-record/history?offset=' + current.nextOffset, { token, signal: controller.signal })
      if (controller.signal.aborted || requestRef.current !== controller) return
      if (next.hasMore && next.nextOffset <= current.nextOffset) throw new Error('History pagination did not advance')
      setState(old => ({ ...old, server: [...new Map([...old.server, ...next.items].map(row => [row.id, row])).values()], hasMore: next.hasMore, nextOffset: next.nextOffset, loadingMore: false }))
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) setState(old => ({ ...old, loadingMore: false, moreError: true }))
    } finally {
      if (requestRef.current === controller) locked.current = false
    }
  }, [identity, memberId, open, token])
  const own = state.identity === identity ? state : empty(identity, open)
  return { ...own, rows: drawerHistoryRows(own.server, own.retained, memberName), loadMore, retry: () => setRevision(value => value + 1) }
}
