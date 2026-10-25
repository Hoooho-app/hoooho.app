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
  enableTracking(memberId:string,token:string,eventId:string,recordId:string) { return caseRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/tracking`, { token, method:'POST', body:{recordId} }) },
  manage(memberId:string,token:string,eventId:string,input:{title?:string;expectedUpdatedAt:string;expectedChangedAt?:string;sourceEventIds?:string[]},deleting=false) { return caseRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}`,{token,method:deleting?'DELETE':'PATCH',body:input}) },
  records(memberId:string,token:string,eventId:string,signal?:AbortSignal) { return caseRequest<import('../../types').HealthEventRecordApiDto[]>(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/records`,{token,signal}) },
  merge(memberId:string,token:string,target:import('./types').FollowedCase,source:import('./types').FollowedCase,action:'merge'|'separate',title:string) { return caseRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(target.event.id)}/merge`,{token,method:'POST',body:{action,title,sourceEventId:source.event.id,expectedTargetAt:target.event.updatedAt,expectedSourceAt:source.event.updatedAt}}) },
  list(memberId: string, token: string, signal?: AbortSignal) { return caseRequest<CasesData>(`${memberPath(memberId)}/cases?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`, { token, signal }) },
  capture(memberId: string, token: string, input: { requestId: string; title?: string; followUp?:boolean; text: string; occurredAt: string; timeUnknown: boolean; eventId?: string; taskId?: string; result?: ObservationResult; identity?: MaterialIdentity; aiDraftId?: string; supplement?: string; bodyLocations?: string[]; journal?: import('../../types/journal').JournalMetadata; photoDraftId?: string; photoIds?: string[]; files: { name: string; mimeType: string; dataUrl: string }[] }) { return caseRequest<{ eventId: string; recordId: string; attachmentIds: string[] }>(`${memberPath(memberId)}/case-records`, { token, method: 'POST', body: input }) },
  archive(memberId: string, token: string, eventId: string, archived: boolean) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/archive`, { token, method: 'POST', body: { archived } }) },
  recovery(memberId: string, token: string, eventId: string, input: { action: 'recover' | 'archive' | 'restore' | 'undo'; requestId: string; undoRequestId?: string; expectedArchivedAt?: string | null }) { return caseRequest<import('./types').FollowedCase['event']>(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/recovery`, { token, method: 'POST', body: input }) },
  observation(memberId: string, token: string, eventId: string, input: Record<string, unknown>) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/observations`, { token, method: 'POST', body: input }) },
  confirm(memberId: string, token: string, eventId: string, recordId: string, input: { identity: MaterialIdentity; content: string; confirmed: boolean }) { return caseRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/materials/${encodeURIComponent(recordId)}`, { token, method: 'POST', body: input }) }
}
