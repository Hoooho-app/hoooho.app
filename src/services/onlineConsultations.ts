import type { OnlineConsultationApiDto, OnlineConsultationStatus } from '../types'
import { apiRequest } from './apiClient'

const route = (eventId: string, action = '') => `/api/events/${encodeURIComponent(eventId)}/online-consultation${action}`

export const onlineConsultationService = {
  get(eventId: string, token: string, signal?: AbortSignal) {
    return apiRequest<OnlineConsultationApiDto>(route(eventId), { token, signal })
  },
  updateStatus(eventId: string, status: OnlineConsultationStatus, token: string) {
    return apiRequest<OnlineConsultationApiDto>(route(eventId), { token, method: 'PATCH', body: { status } })
  },
  refreshWaiting(eventId: string, token: string) {
    return apiRequest<OnlineConsultationApiDto>(route(eventId, '/refresh'), { token, method: 'POST', body: {} })
  },
  addQuestion(eventId: string, input: { question: string; reply: string; missing: string[]; sources: string[]; supplements: string[] }, token: string) {
    return apiRequest<OnlineConsultationApiDto>(route(eventId, '/questions'), { token, method: 'POST', body: input })
  },
  complete(eventId: string, finalDoctorInstructions: string, token: string) {
    return apiRequest<OnlineConsultationApiDto>(route(eventId, '/complete'), { token, method: 'POST', body: { finalDoctorInstructions } })
  }
}
