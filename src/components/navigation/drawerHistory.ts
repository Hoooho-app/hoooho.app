import { conversationTitle } from '../../../shared/conversation-title.mjs'
import type { CaptureDraft } from '../../features/ai-business/captureDraft'

export interface ServerConversation { id: string; contextIds?: string[]; title: string; keywords?: string[]; updatedAt: string; saved?: boolean; recorded?: boolean }
export interface HistoryPage { items: ServerConversation[]; hasMore: boolean; nextOffset: number; deletedContextIds?: string[] }
export interface DrawerHistoryRow { id: string; title: string; updatedAt: string; destination: string; recorded?: boolean; serverId?: string; contextIds?: string[]; requestIds?: string[] }
export type RetainedConversation = { key: string; draft: CaptureDraft }

/** Keep the symptom visible first when the trailing status tags narrow a row. */
export function drawerConversationLabel(title:string) {
  const parts=title.replace(/（待确认）|(?: · )?待确认/gu,'').split(' · ')
  const location=/^(?:脸上|脸部|面部|额头|头上|头部|头皮|手上|手部|脚上|脚部|腿上|腿部|背上|背部|胸部|腹部|肚子|臀部|全身|身上|脖子)$/u
  return (parts.length>1&&location.test(parts[0])?[...parts.slice(1),parts[0]]:parts).join('·')
}

export function draftConversationTitle(draft: CaptureDraft, memberName = '') {
  const edit = draft.frontCardEdit?.contextId === draft.frontContextId ? draft.frontCardEdit : undefined
  return conversationTitle({ recordText: edit?.text ?? draft.smartReview?.inputText ?? '', texts: [
    ...(draft.conversationTurns ?? []).filter(turn => turn.role !== 'assistant').map(turn => turn.text),
    draft.text, draft.conversationInput ?? ''
  ], fallback: draft.pendingVoice ? '语音记录' : draft.files.length ? '图片与资料' : '对话记录', excludeNames: [memberName] }).title
}

export function drawerHistoryRows(server: ServerConversation[], retained: RetainedConversation[], memberName = ''): DrawerHistoryRow[] {
  const rows = new Map(server.map(item => [item.id, { ...item, recorded:item.recorded??item.saved??false,destination: '/nurse-station?conversation=' + encodeURIComponent(item.id) }]))
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
    rows.set(id, { id, title: saved?.title || draftConversationTitle(draft, memberName), updatedAt: new Date(Math.max(Date.parse(saved?.updatedAt ?? '') || 0, draft.updatedAt ?? 0)).toISOString(), recorded:saved?.recorded??Boolean(draft.smartReview?.state==='saved'&&draft.smartReview.result?.records?.length||draft.savedGuides?.some(guide=>guide.recordId&&guide.eventId)),destination: '/nurse-station?draft=' + encodeURIComponent(item.key) })
  }
  return [...rows.values()].map(row=>{const saved=server.find(item=>item.id===row.id),ids=saved?.contextIds??[row.id];const copies=retained.filter(item=>item.key===row.id||ids.includes(item.draft.frontContextId??''));return {...row,serverId:saved?.id??copies.find(item=>item.draft.frontContextId)?.draft.frontContextId,contextIds:ids,requestIds:copies.map(item=>item.draft.requestId)}}).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id))
}
