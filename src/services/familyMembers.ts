import type { FamilyMemberApiDto } from '../types'
import { apiRequest } from './apiClient'

export const familyMemberService = {
  list(token: string, signal?: AbortSignal) {
    return apiRequest<FamilyMemberApiDto[]>('/api/members', { token, signal })
  },

  getById(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<FamilyMemberApiDto>(`/api/members/${encodeURIComponent(memberId)}`, { token, signal })
  }
}
