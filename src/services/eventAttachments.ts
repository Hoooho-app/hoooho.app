import type { CreateEventAttachmentInput, EventAttachmentApiDto, EventAttachmentPreviewApiDto } from '../types'
import { apiRequest } from './apiClient'

export const eventAttachmentService = {
  list(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<EventAttachmentApiDto[]>(`/api/events/${encodeURIComponent(eventId)}/attachments`, { token, signal })
  },
  create(eventId: string, input: CreateEventAttachmentInput, token: string) {
    return apiRequest<EventAttachmentApiDto>(`/api/events/${encodeURIComponent(eventId)}/attachments`, {
      token,
      method: 'POST',
      body: input
    })
  },
  preview(eventId: string, input: CreateEventAttachmentInput, token: string) {
    return apiRequest<EventAttachmentPreviewApiDto>(`/api/events/${encodeURIComponent(eventId)}/attachments/preview`, {
      token,
      method: 'POST',
      body: input
    })
  }
}
