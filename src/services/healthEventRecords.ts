import type { CreateHealthEventRecordInput, HealthChangeType, HealthEventRecordApiDto, UpdateHealthEventRecordInput } from '../types'
import { apiRequest } from './apiClient'

export const healthEventRecordService = {
  list(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthEventRecordApiDto[]>(`/api/events/${encodeURIComponent(eventId)}/records`, { token, signal })
  },

  create(eventId: string, input: CreateHealthEventRecordInput, token: string) {
    return apiRequest<HealthEventRecordApiDto>(`/api/events/${encodeURIComponent(eventId)}/records`, {
      token,
      method: 'POST',
      body: input
    })
  },

  update(recordId: string, input: UpdateHealthEventRecordInput, token: string) {
    return apiRequest<HealthEventRecordApiDto>(`/api/records/${encodeURIComponent(recordId)}`, {
      token,
      method: 'PATCH',
      body: input
    })
  },

  delete(recordId: string, token: string) {
    return apiRequest<{ success: true }>(`/api/records/${encodeURIComponent(recordId)}`, {
      token,
      method: 'DELETE'
    })
  },

  updateChangeAnnotation(recordId: string, annotationId: string, changeType: HealthChangeType, token: string) {
    return apiRequest<HealthEventRecordApiDto>(`/api/records/${encodeURIComponent(recordId)}/change-annotations/${encodeURIComponent(annotationId)}`, {
      token,
      method: 'PATCH',
      body: { changeType }
    })
  },

  deleteChangeAnnotation(recordId: string, annotationId: string, token: string) {
    return apiRequest<{ success: true }>(`/api/records/${encodeURIComponent(recordId)}/change-annotations/${encodeURIComponent(annotationId)}`, {
      token,
      method: 'DELETE'
    })
  }
}
