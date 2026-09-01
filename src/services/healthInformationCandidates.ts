import type { HealthInformationCandidateApiDto, HealthProfileDestination } from '../types'
import { apiRequest } from './apiClient'

const eventRoute = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/health-information-candidates`

export const healthInformationCandidateService = {
  list: (eventId: string, token: string, signal?: AbortSignal) => apiRequest<HealthInformationCandidateApiDto[]>(eventRoute(eventId), { token, signal }),
  discover: (eventId: string, token: string, signal?: AbortSignal) => apiRequest<HealthInformationCandidateApiDto[]>(`${eventRoute(eventId)}/discover`, { token, method: 'POST', body: {}, signal }),
  update: (candidateId: string, token: string, input: { status: 'confirmed' | 'dismissed'; destinationProfileSection?: HealthProfileDestination; note?: string }) => (
    apiRequest<HealthInformationCandidateApiDto>(`/api/health-information-candidates/${encodeURIComponent(candidateId)}`, { token, method: 'PATCH', body: input })
  )
}
