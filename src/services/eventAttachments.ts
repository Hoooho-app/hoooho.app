import type { CreateEventAttachmentInput, EventAttachmentApiDto, EventAttachmentPreviewApiDto } from '../types'
import { apiRequest } from './apiClient'

export const eventAttachmentService = {
  list(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<EventAttachmentApiDto[]>(`/api/events/${encodeURIComponent(eventId)}/attachments`, { token, signal })
  },
  async read(eventId: string, attachmentId: string, token: string, signal?: AbortSignal) {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/attachments/${encodeURIComponent(attachmentId)}/content`, { headers: { Authorization: `Bearer ${token}` }, signal, credentials: 'same-origin' })
    if (!response.ok) throw new Error('原照片加载失败')
    return response.blob()
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
