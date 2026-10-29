import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest, ApiRequestError } from '../../services/apiClient'
import { conversationCaptureDrafts, deleteCaptureConversations } from '../../features/ai-business/captureDraft'
import { drawerHistoryRows, type HistoryPage, type RetainedConversation, type ServerConversation, type DrawerHistoryRow } from './drawerHistory'

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
    const localKey='home-smart:' + accountId + ':' + memberId + ':new'
    if (hasMembers && token) void Promise.allSettled([
      apiRequest<HistoryPage>('/api/members/' + encodeURIComponent(memberId) + '/front-desk-record/history', { token, signal: controller.signal }),
      conversationCaptureDrafts('home-smart:' + accountId + ':' + memberId + ':new')
    ]).then(async ([server, local]) => {
      if (controller.signal.aborted || requestRef.current !== controller) return
      const deleted=server.status==='fulfilled'?server.value.deletedContextIds??[]:[]
      if(deleted.length){try{await deleteCaptureConversations(localKey,deleted)}catch{/* Guards suppress deleted copies while cleanup can retry on reopening. */}}
      if(controller.signal.aborted||requestRef.current!==controller)return
      setState({ ...empty(identity), server: server.status === 'fulfilled' ? server.value.items : [], retained: local.status === 'fulfilled' ? local.value.filter(item=>!deleted.includes(item.draft.frontContextId??'')) : [], error: server.status === 'rejected', localError: local.status === 'rejected', hasMore: server.status === 'fulfilled' && server.value.hasMore, nextOffset: server.status === 'fulfilled' ? server.value.nextOffset : 0 })
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
  const remove = async (row:DrawerHistoryRow) => {
    if(!token)throw new Error('请登录后删除对话')
    const currentUser=useAppStore.getState()
    if(currentUser.authUser?.id!==accountId||currentUser.currentMemberId!==memberId)throw new Error('记录对象已切换，请重新打开侧栏')
    const localKey='home-smart:'+accountId+':'+memberId+':new'
    const latest=await conversationCaptureDrafts(localKey)
    const serverId=row.serverId??latest.find(item=>row.requestIds?.includes(item.draft.requestId)&&item.draft.frontContextId)?.draft.frontContextId
    const receipt=serverId?await apiRequest<{deleted:boolean;contextIds:string[]}>('/api/members/'+encodeURIComponent(memberId)+'/front-desk-record/contexts/'+encodeURIComponent(serverId),{method:'DELETE',token}).catch(error=>{if(error instanceof ApiRequestError&&error.status===404)return {deleted:true,contextIds:[serverId]};throw error}):{deleted:true,contextIds:[]}
    if(!receipt.deleted)throw new Error('删除尚未完成，请重试')
    await deleteCaptureConversations(localKey,[...new Set([...row.contextIds??[],...receipt.contextIds])],row.requestIds)
    if(useAppStore.getState().authUser?.id!==accountId||useAppStore.getState().currentMemberId!==memberId)return
    requestRef.current?.abort();setRevision(value=>value+1)
  }
  const own = state.identity === identity ? state : empty(identity, open)
  return { ...own, rows: drawerHistoryRows(own.server, own.retained, memberName), loadMore, remove, retry: () => setRevision(value => value + 1) }
}
