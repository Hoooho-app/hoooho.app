import type { FamilyMemberApiDto } from '../types'
import { apiRequest } from './apiClient'

export const familyMemberService = {
  list(token: string, signal?: AbortSignal) {
    return apiRequest<FamilyMemberApiDto[]>('/api/members', { token, signal })
  },

  getById(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<FamilyMemberApiDto>(`/api/members/${encodeURIComponent(memberId)}`, { token, signal })
  },

  create(input: { name: string; birthday: string; gender: 'male' | 'female'; avatar: string }, token: string) {
    return apiRequest<FamilyMemberApiDto>('/api/members', {
      token,
      method: 'POST',
      body: { ...input, relationship: 'other' }
    })
  },

  update(
    memberId: string,
    input: Partial<Pick<FamilyMemberApiDto,
      | 'name' | 'birthday' | 'gender' | 'avatar'
      | 'heightCm' | 'weightKg' | 'bloodType'
      | 'waistCircumferenceCm' | 'bodyFatPercentage' | 'headCircumferenceCm' | 'rhBloodType'
    >>,
    token: string,
    signal?: AbortSignal
  ) {
    return apiRequest<FamilyMemberApiDto>(`/api/members/${encodeURIComponent(memberId)}`, {
      token,
      signal,
      method: 'PATCH',
      body: input
    })
  },

  delete(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<{ success: true }>(`/api/members/${encodeURIComponent(memberId)}`, {
      token,
      signal,
      method: 'DELETE'
    })
  }
}
