import { apiRequest } from '../../services/apiClient'
import type { CasesData, MaterialIdentity, ObservationResult } from './types'
const memberPath = (memberId: string) => `/api/members/${encodeURIComponent(memberId)}`
async function caseRequest<T>(path:string,options:Parameters<typeof apiRequest>[1]):Promise<T> {
  const controller=new AbortController();let timedOut=false
  const cancel=()=>controller.abort(),timer=setTimeout(()=>{timedOut=true;controller.abort()},45000)
  if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true})
  try{return await apiRequest<T>(path,{...options,signal:controller.signal})}
  catch(error){if(timedOut)throw new Error('请求超时，内容仍保留，请检查网络后重试');if(error instanceof TypeError)throw new Error('网络中断，内容仍保留，请检查网络后重试');throw error}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel)}
}
export const caseService = {
  list(memberId: string, token: string, signal?: AbortSignal) { return caseRequest<CasesData>(`${memberPath(memberId)}/cases?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`, { token, signal }) },
  capture(memberId: string, token: string, input: { requestId: string; text: string; occurredAt: string; timeUnknown: boolean; eventId?: string; taskId?: string; result?: ObservationResult; identity?: MaterialIdentity; aiDraftId?: string; supplement?: string; bodyLocations?: string[]; journal?: import('../../types/journal').JournalMetadata; photoDraftId?: string; photoIds?: string[]; files: { name: string; mimeType: string; dataUrl: string }[] }) { return caseRequest<{ eventId: string; recordId: string; attachmentIds: string[] }>(`${memberPath(memberId)}/case-records`, { token, method: 'POST', body: input }) },
  archive(memberId: string, token: string, eventId: string, archived: boolean) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/archive`, { token, method: 'POST', body: { archived } }) },
  recovery(memberId: string, token: string, eventId: string, input: { action: 'recover' | 'restore' | 'undo'; requestId: string; undoRequestId?: string; expectedArchivedAt?: string | null }) { return caseRequest<import('./types').FollowedCase['event']>(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/recovery`, { token, method: 'POST', body: input }) },
  observation(memberId: string, token: string, eventId: string, input: Record<string, unknown>) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/observations`, { token, method: 'POST', body: input }) },
  confirm(memberId: string, token: string, eventId: string, recordId: string, input: { identity: MaterialIdentity; content: string; confirmed: boolean }) { return caseRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/materials/${encodeURIComponent(recordId)}`, { token, method: 'POST', body: input }) }
}
