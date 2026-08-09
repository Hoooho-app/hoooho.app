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
    input: Pick<FamilyMemberApiDto, 'name' | 'birthday' | 'gender' | 'avatar'>,
    token: string,
    signal?: AbortSignal
  ) {
    return apiRequest<FamilyMemberApiDto>(`/api/members/${encodeURIComponent(memberId)}`, {
      token,
      signal,
      method: 'PATCH',
      body: input
    })
  }
}
