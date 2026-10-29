import { conversationTitle } from '../../../shared/conversation-title.mjs'
import type { CaptureDraft } from '../../features/ai-business/captureDraft'

export interface ServerConversation { id: string; contextIds?: string[]; title: string; keywords?: string[]; updatedAt: string }
export interface HistoryPage { items: ServerConversation[]; hasMore: boolean; nextOffset: number }
export interface DrawerHistoryRow { id: string; title: string; updatedAt: string; destination: string }
export type RetainedConversation = { key: string; draft: CaptureDraft }

export function draftConversationTitle(draft: CaptureDraft, memberName = '') {
  const edit = draft.frontCardEdit?.contextId === draft.frontContextId ? draft.frontCardEdit : undefined
  return conversationTitle({ recordText: edit?.text ?? draft.smartReview?.inputText ?? '', texts: [
    ...(draft.conversationTurns ?? []).filter(turn => turn.role !== 'assistant').map(turn => turn.text),
    draft.text, draft.conversationInput ?? ''
  ], fallback: draft.pendingVoice ? '语音记录' : draft.files.length ? '图片与资料' : '对话记录', excludeNames: [memberName] }).title
}

export function drawerHistoryRows(server: ServerConversation[], retained: RetainedConversation[], memberName = ''): DrawerHistoryRow[] {
  const rows = new Map(server.map(item => [item.id, { ...item, destination: '/conversation-history/' + encodeURIComponent(item.id) + '?from=sidebar' }]))
  // The most recent local copy wins. A pending addition changes the destination,
  // never replaces the conversation's established subject with a short reply.
  const localIds = new Set<string>()
  for (const item of [...retained].sort((a, b) => (b.draft.updatedAt ?? 0) - (a.draft.updatedAt ?? 0))) {
    const draft = item.draft, id = server.find(row => row.id === draft.frontContextId || row.contextIds?.includes(draft.frontContextId ?? ''))?.id || draft.frontContextId || item.key
    if (localIds.has(id)) continue
    localIds.add(id)
    const saved = rows.get(id), pending = Boolean(draft.conversationInput?.trim() || draft.pendingVoice)
    if (saved && !pending) continue
    const hasContent = Boolean(draft.text?.trim() || draft.conversationInput?.trim() || draft.pendingVoice || draft.files.length || draft.conversationTurns?.some(turn => turn.role !== 'assistant' && turn.text))
    if (!hasContent) continue
    rows.set(id, { id, title: saved?.title || draftConversationTitle(draft, memberName), updatedAt: new Date(Math.max(Date.parse(saved?.updatedAt ?? '') || 0, draft.updatedAt ?? 0)).toISOString(), destination: '/conversation-history?draft=' + encodeURIComponent(item.key) + '&from=sidebar' })
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id))
}
