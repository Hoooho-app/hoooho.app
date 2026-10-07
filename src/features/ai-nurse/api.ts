import { apiRequest } from '../../services/apiClient'
import type { NurseDraft, NurseTurn } from './types'
const path = (member: string, id = '') => `/api/members/${encodeURIComponent(member)}/nurse-drafts${id ? `/${encodeURIComponent(id)}` : ''}`
export const nurseApi = {
  get: (member: string, token: string, id: string, signal?: AbortSignal) => apiRequest<NurseDraft>(path(member, id), { token, signal }),
  usage: (member: string, token: string, id: string, responseId: string, usage: unknown) => apiRequest(`${path(member, id)}/usage`, { token, method: 'POST', body: { responseId, usage } }),
  open: (member: string, token: string, scope: string, signal?: AbortSignal) => apiRequest<NurseDraft>(path(member), { token, method: 'POST', body: { scope }, signal }),
  change: (member: string, token: string, draft: NurseDraft, body: { turn?: NurseTurn; step?: string; review?: NurseDraft['review']; discard?: boolean }, signal?: AbortSignal) => apiRequest<NurseDraft>(path(member, draft.id), { token, method: 'PATCH', body: { ...body, version: draft.version }, signal }),
  generate: (member: string, token: string, draft: NurseDraft, organize: boolean, signal?: AbortSignal) => apiRequest<NurseDraft>(`${path(member, draft.id)}/generate`, { token, method: 'POST', body: { version: draft.version, organize }, signal }),
  assess: (member: string, token: string, draft: NurseDraft, signal?: AbortSignal) => apiRequest<NurseDraft>(`${path(member, draft.id)}/generate`, { token, method: 'POST', body: { version: draft.version, assessOnly: true }, signal }),
  sdp: (member: string, token: string, id: string, sdp: string, signal: AbortSignal) => apiRequest<{ sdp: string; model: string; instructions: string }>(`${path(member, id)}/sdp`, { token, method: 'POST', body: { sdp }, signal })
}
