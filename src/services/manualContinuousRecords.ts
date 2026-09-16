import type { HealthEventRecordApiDto, UpdateHealthEventRecordInput } from '../types'
import { apiRequest } from './apiClient'

export const manualContinuousRecordService = {
  list(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthEventRecordApiDto[]>(`/api/events/${encodeURIComponent(eventId)}/records`, { token, signal })
  },
  create(eventId: string, input: { type: 'note'; content: string; occurredAt: string; sourceType: 'text_record'; sourceText: string; note: string; journal: import('../types/journal').JournalMetadata; operationId: string }, token: string) {
    return apiRequest<HealthEventRecordApiDto>(`/api/events/${encodeURIComponent(eventId)}/records`, { token, method: 'POST', body: input })
  },
  update(recordId: string, input: UpdateHealthEventRecordInput, token: string) {
    return apiRequest<HealthEventRecordApiDto>(`/api/records/${encodeURIComponent(recordId)}`, { token, method: 'PATCH', body: input })
  },
  replaceRelations(eventId: string, rootRecordId: string, relatedRecordIds: string[], baseRelatedRecordIds: string[], token: string) {
    return apiRequest<HealthEventRecordApiDto>(`/api/events/${encodeURIComponent(eventId)}/continuous-relations`, { token, method: 'PUT', body: { rootRecordId, relatedRecordIds, baseRelatedRecordIds } })
  }
}
