import { apiRequest } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'
import { localDateTimeValue } from '../../utils/healthOccurredAt'
import { captureDraft, retainedCaptureDrafts, hasCaptureContent, type CaptureDraft } from './captureDraft'
import { restoreFrontContext, type FrontContext } from './frontDeskRecord'

export interface ConversationTarget { contextId?: string; draftKey?: string }

/** Switch only after the selected originals are readable; keep the current draft. */
export async function openStoredConversation({ accountId, memberId, token, target, signal }: { accountId: string; memberId: string; token: string; target: ConversationTarget; signal: AbortSignal }) {
  const key = `home-smart:${accountId}:${memberId}:new`
  const guard = () => {
    signal.throwIfAborted()
    const state = useAppStore.getState()
    if (state.authUser?.id !== accountId || state.currentMemberId !== memberId) throw new Error('记录对象已切换，请重新选择对话')
  }
  guard()
  if(target.contextId&&target.draftKey)throw new Error('对话选择无效，请重新选择')
  if (target.draftKey && target.draftKey !== key && !target.draftKey.startsWith(key + ':retained:')) throw new Error('未找到这次对话')
  const resume = (id:string) => apiRequest<FrontContext | null>(`/api/members/${encodeURIComponent(memberId)}/front-desk-record/contexts/${encodeURIComponent(id)}`, { method: 'POST', token, body: { action: 'resume' }, signal })
  // Start the network request before reading local originals, not after them.
  const remote = target.contextId ? resume(target.contextId) : Promise.resolve(null)
  const currentRead = captureDraft(key)
  const explicitRead = target.draftKey ? target.draftKey === key ? currentRead : captureDraft(target.draftKey) : Promise.resolve(undefined)
  const copiesRead=currentRead.then(current=>target.draftKey||current?.frontContextId===target.contextId?[]:retainedCaptureDrafts(key))
  const [resumedById,current,explicit,copies] = await Promise.all([remote,currentRead,explicitRead,copiesRead])
  guard()
  if (target.draftKey && !explicit) throw new Error('这次对话已不存在，请重新选择')
  const contextId = target.contextId ?? explicit?.frontContextId
  const resumed = target.contextId ? resumedById : contextId ? await resume(contextId) : null
  guard()
  if (contextId && !resumed) throw new Error('这次对话已不存在，请重新选择')
  const ids = new Set([contextId, resumed?.id, resumed?.conversationId, ...(resumed?.previousMessages ?? []).map(message => message.contextId)].filter(Boolean))
  const latest = current && (explicit ? current.requestId === explicit.requestId : ids.has(current.frontContextId)) ? current : undefined
  const retained = latest ?? explicit ?? copies.find(item => ids.has(item.draft.frontContextId))?.draft
  const clean: CaptureDraft = { text: '', files: [], occurredAt: localDateTimeValue(), timeUnknown: false, requestId: crypto.randomUUID() }
  const selected = retained ? { ...retained, archivedConversation: false, ...(resumed && resumed.id !== retained.frontContextId ? { recognitionJobId: undefined, recognitionSnapshot: undefined, recognitionAssets: undefined, aiDraftId: undefined, smartReview: undefined } : {}) } : clean
  const restored = resumed ? { ...restoreFrontContext(resumed, selected), resumeContextId: resumed.id } : selected
  guard()
  if (current && current.requestId !== restored.requestId && (hasCaptureContent(current) || current.conversationTurns?.length || current.savedGuides?.length)) {
    await captureDraft(`${key}:retained:${current.requestId}`, { ...current, archivedConversation: true, updatedAt: current.updatedAt ?? Date.now() })
    guard()
  }
  const next = { ...restored, archivedConversation: false, returningFromRecord: false, returnScrollTop: undefined, conversationResetAt: undefined, updatedAt: Date.now() }
  await captureDraft(key, next)
  guard()
  return next
}
