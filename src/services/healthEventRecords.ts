import type { CreateHealthEventRecordInput, HealthEventRecordApiDto } from '../types'
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
  }
}
