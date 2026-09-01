import type { CandidateHealthFactApiDto, HealthProfileFactApiDto, HealthProfileFactCategory, HealthProfileFactStatus } from '../types'
import { apiRequest } from './apiClient'

export interface CreateHealthProfileFactInput {
  memberId: string
  title: string
  category: HealthProfileFactCategory
  status: HealthProfileFactStatus
  firstObservedAt: string
  notes?: string
  source: { organizationId: string; sourceFactId: string }
}

export const healthProfileFactService = {
  list(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthProfileFactApiDto[]>(`/api/health-profile-facts?memberId=${encodeURIComponent(memberId)}`, { token, signal })
  },
  listCandidates(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<CandidateHealthFactApiDto[]>(`/api/health-profile-facts/candidates?memberId=${encodeURIComponent(memberId)}`, { token, signal })
  },
  get(factId: string, token: string, signal?: AbortSignal) {
    return apiRequest<HealthProfileFactApiDto>(`/api/health-profile-facts/${encodeURIComponent(factId)}`, { token, signal })
  },
  create(input: CreateHealthProfileFactInput, token: string) {
    return apiRequest<HealthProfileFactApiDto>('/api/health-profile-facts', { token, method: 'POST', body: input })
  },
  update(factId: string, input: Partial<Pick<HealthProfileFactApiDto, 'title' | 'category' | 'status' | 'firstObservedAt' | 'notes'>>, token: string) {
    return apiRequest<HealthProfileFactApiDto>(`/api/health-profile-facts/${encodeURIComponent(factId)}`, { token, method: 'PATCH', body: input })
  },
  addSource(factId: string, source: { organizationId: string; sourceFactId: string }, token: string) {
    return apiRequest<HealthProfileFactApiDto>(`/api/health-profile-facts/${encodeURIComponent(factId)}/sources`, { token, method: 'POST', body: source })
  }
}
