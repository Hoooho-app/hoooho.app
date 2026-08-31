import type { HealthRecordOrganizationApiDto, HealthRecordOrganizationConfirmApiDto, HealthRecordOrganizationPreviewApiDto } from '../types'
import { apiRequest } from './apiClient'

export const healthRecordOrganizationService = {
  preview(eventId: string, rawInput: string, token: string, options: { bodyLocations?: string[]; selectedOccurredAt?: string; inputChannel?: 'voice' | 'text' } = {}) {
    return apiRequest<HealthRecordOrganizationPreviewApiDto>(`/api/events/${encodeURIComponent(eventId)}/organizations/preview`, {
      token,
      method: 'POST',
      body: { rawInput, ...options }
    })
  },

  confirm(eventId: string, previewId: string, idempotencyKey: string, token: string) {
    return apiRequest<HealthRecordOrganizationConfirmApiDto>(`/api/events/${encodeURIComponent(eventId)}/organizations/confirm`, {
      token,
      method: 'POST',
      body: { previewId, idempotencyKey }
    })
  },

  list(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthRecordOrganizationApiDto[]>(`/api/events/${encodeURIComponent(eventId)}/organizations`, { token, signal })
  },

  organize(eventId: string, recordId: string, token: string, context?: string) {
    return apiRequest<HealthRecordOrganizationApiDto>(`/api/events/${encodeURIComponent(eventId)}/organizations`, {
      token,
      method: 'POST',
      body: { recordId, context }
    })
  }
}
