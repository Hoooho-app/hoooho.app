import type { CaptureDraft } from './captureDraft'

export const conversationDeletedEvent = 'hoooho-conversation-deleted'
const memory = new Map<string, { ids: Set<string>; at: number }>()
export const deletionStorageKey = (key: string) => 'hoooho-deleted-conversations:' + key.split(':retained:')[0]
function deletedState(key: string) {
  const storageKey = deletionStorageKey(key), state = memory.get(storageKey) ?? { ids: new Set<string>(), at: 0 }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    for (const value of saved?.ids ?? []) if (typeof value === 'string') state.ids.add(value)
    state.at = Math.max(state.at, Number(saved?.at) || 0)
  } catch { /* In-memory guards still protect this session. */ }
  memory.set(storageKey, state)
  return state
}
export const lastConversationDeletionAt = (key: string) => deletedState(key).at
export function captureConversationDeleted(key: string, draft: CaptureDraft) {
  const { ids } = deletedState(key)
  return ids.has('request:' + draft.requestId) || Boolean(draft.frontContextId && ids.has('context:' + draft.frontContextId)) || Boolean(draft.resumeContextId && ids.has('context:' + draft.resumeContextId))
}
export function markCaptureConversationsDeleted(key: string, contextIds: string[], requestIds: string[]) {
  const state = deletedState(key), previous = state.ids.size
  contextIds.forEach(id => state.ids.add('context:' + id)); requestIds.forEach(id => state.ids.add('request:' + id))
  if (state.ids.size !== previous) state.at = Date.now()
  try { localStorage.setItem(deletionStorageKey(key), JSON.stringify({ ids: [...state.ids], at: state.at })) } catch { /* Existing IDB removal remains authoritative. */ }
  window.dispatchEvent(new CustomEvent(conversationDeletedEvent, { detail: { key } }))
}
