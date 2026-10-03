import { apiRequest } from '../../services/apiClient'
import type { CasesData, MaterialIdentity, ObservationResult } from './types'
const memberPath = (memberId: string) => `/api/members/${encodeURIComponent(memberId)}`
export const caseService = {
  list(memberId: string, token: string, signal?: AbortSignal) { return apiRequest<CasesData>(`${memberPath(memberId)}/cases?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`, { token, signal }) },
  capture(memberId: string, token: string, input: { requestId: string; text: string; occurredAt: string; timeUnknown: boolean; eventId?: string; taskId?: string; result?: ObservationResult; identity?: MaterialIdentity; aiDraftId?: string; supplement?: string; bodyLocations?: string[]; journal?: import('../../types/journal').JournalMetadata; photoDraftId?: string; photoIds?: string[]; files: { name: string; mimeType: string; dataUrl: string }[] }) { return apiRequest<{ eventId: string; recordId: string; attachmentIds: string[] }>(`${memberPath(memberId)}/case-records`, { token, method: 'POST', body: input }) },
  archive(memberId: string, token: string, eventId: string, archived: boolean) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/archive`, { token, method: 'POST', body: { archived } }) },
  observation(memberId: string, token: string, eventId: string, input: Record<string, unknown>) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/observations`, { token, method: 'POST', body: input }) },
  confirm(memberId: string, token: string, eventId: string, recordId: string, input: { identity: MaterialIdentity; content: string; confirmed: boolean }) { return apiRequest(`${memberPath(memberId)}/cases/${encodeURIComponent(eventId)}/materials/${encodeURIComponent(recordId)}`, { token, method: 'POST', body: input }) }
}
