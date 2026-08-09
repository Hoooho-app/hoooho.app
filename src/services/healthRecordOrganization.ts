import type { HealthRecordOrganizationApiDto } from '../types'
import { apiRequest } from './apiClient'

export const healthRecordOrganizationService = {
  list(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthRecordOrganizationApiDto[]>(`/api/events/${encodeURIComponent(eventId)}/organizations`, { token, signal })
  },

  organize(eventId: string, recordId: string, token: string) {
    return apiRequest<HealthRecordOrganizationApiDto>(`/api/events/${encodeURIComponent(eventId)}/organizations`, {
      token,
      method: 'POST',
      body: { recordId }
    })
  }
}
