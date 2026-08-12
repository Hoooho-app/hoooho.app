import type { CreateHealthEventInput, HealthEventApiDto } from '../types'
import { apiRequest } from './apiClient'

export const healthEventService = {
  list(token: string, signal?: AbortSignal) {
    return apiRequest<HealthEventApiDto[]>('/api/events', { token, signal })
  },

  create(input: CreateHealthEventInput, token: string) {
    return apiRequest<HealthEventApiDto>('/api/events', {
      token,
      method: 'POST',
      body: input
    })
  },

  getById(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthEventApiDto>(`/api/events/${encodeURIComponent(eventId)}`, { token, signal })
  },

  updateStatus(eventId: string, status: HealthEventApiDto['status'], token: string) {
    return apiRequest<HealthEventApiDto>(`/api/events/${encodeURIComponent(eventId)}`, {
      token,
      method: 'PATCH',
      body: { status }
    })
  },

  updateTitle(eventId: string, title: string, token: string) {
    return apiRequest<HealthEventApiDto>(`/api/events/${encodeURIComponent(eventId)}`, {
      token,
      method: 'PATCH',
      body: { title }
    })
  },

  correctSummary(eventId: string, input: { title: string; summary: string }, token: string) {
    return apiRequest<HealthEventApiDto>(`/api/events/${encodeURIComponent(eventId)}/summary`, {
      token,
      method: 'PATCH',
      body: input
    })
  },

  delete(eventId: string, token: string) {
    return apiRequest<void>(`/api/events/${encodeURIComponent(eventId)}`, {
      token,
      method: 'DELETE'
    })
  }
}
