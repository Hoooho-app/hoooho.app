import type { FamilyMemberApiDto } from '../types'
import { apiRequest } from './apiClient'

let cachedToken = ''
const cachedMembers = new Map<string, FamilyMemberApiDto>()

function cacheFor(token: string) {
  if (token !== cachedToken) {
    cachedToken = token
    cachedMembers.clear()
  }
  return cachedMembers
}

function rememberMember(member: FamilyMemberApiDto, token: string) {
  cacheFor(token).set(member.id, member)
  return member
}

export const familyMemberService = {
  list(token: string, signal?: AbortSignal) {
    return apiRequest<FamilyMemberApiDto[]>('/api/members', { token, signal })
      .then((members) => {
        const cache = cacheFor(token)
        cache.clear()
        members.forEach((member) => cache.set(member.id, member))
        return members
      })
  },

  getCachedById(memberId: string, token: string) {
    return cacheFor(token).get(memberId)
  },

  getById(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<FamilyMemberApiDto>(`/api/members/${encodeURIComponent(memberId)}`, { token, signal })
      .then((member) => rememberMember(member, token))
  },

  create(input: {
    name: string
    birthday: string
    gender: 'male' | 'female'
    avatar: string
    relationship: Extract<FamilyMemberApiDto['relationship'], 'child' | 'other'>
    primaryRecorderRelationship?: FamilyMemberApiDto['primaryRecorderRelationship']
  }, token: string) {
    return apiRequest<FamilyMemberApiDto>('/api/members', {
      token,
      method: 'POST',
      body: input
    }).then((member) => rememberMember(member, token))
  },

  createSelf(input: { name?: string; birthday?: string; gender?: 'male' | 'female'; avatar?: string } = {}, token: string) {
    return apiRequest<FamilyMemberApiDto>('/api/members/self', {
      token,
      method: 'POST',
      body: input
    }).then((member) => rememberMember(member, token))
  },

  update(
    memberId: string,
    input: Partial<Pick<FamilyMemberApiDto,
      | 'name' | 'relationship' | 'birthday' | 'gender' | 'avatar'
      | 'heightCm' | 'weightKg' | 'bloodType'
      | 'waistCircumferenceCm' | 'bodyFatPercentage' | 'headCircumferenceCm' | 'rhBloodType'
      | 'caregivers' | 'primaryRecorderRelationship' | 'otherRelative' | 'otherCaregiver'
    >>,
    token: string,
    signal?: AbortSignal
  ) {
    return apiRequest<FamilyMemberApiDto>(`/api/members/${encodeURIComponent(memberId)}`, {
      token,
      signal,
      method: 'PATCH',
      body: input
    }).then((member) => rememberMember(member, token))
  },

  delete(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<{ success: true }>(`/api/members/${encodeURIComponent(memberId)}`, {
      token,
      signal,
      method: 'DELETE'
    }).then((result) => {
      cacheFor(token).delete(memberId)
      return result
    })
  }
}
