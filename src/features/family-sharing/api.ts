import { apiRequest } from '../../services/apiClient'

export interface FamilyPermission { active: boolean; mode: string; expiresAt: string | null }
export interface FamilyOverview {
  capability: FamilyPermission
  scope: string
  spaces: { id: string; role: string; childNames: string[]; participantCount: number; active: boolean; mode: string }[]
  invitations: { id: string; spaceId: string; childNames: string[]; expiresAt: string }[]
}
export interface SharedRecord {
  id: string; childId: string; batchId: string; sourceAccountId: string; sourceRecordId: string; sourceMemberId: string
  type: string; eventTitle: string; content: string; note: string | null; occurredAt: string; createdAt: string; updatedAt: string
  authorName: string; sharedAt: string; revisionCount: number
  attachments: { id: string; name: string; mimeType: string; createdAt: string }[]
}
export interface FamilySpace {
  id: string; role: string; permission: FamilyPermission
  participants: { accountId: string; name: string; role: string }[]
  children: { id: string; name: string; birthday: string | null; gender: string | null; myMemberId: string | null }[]
  entries: SharedRecord[]
  batches: { id: string; accountId: string; status: string; count: number; createdAt: string }[]
  audits: { id: string; actorName: string; action: string; createdAt: string }[]
}
export interface ImportPreview {
  id: string; childId: string; remainingCount: number; expiresAt: string
  candidates: (Omit<SharedRecord, 'id' | 'childId' | 'batchId' | 'authorName' | 'sharedAt' | 'revisionCount'> & { possibleDuplicate: boolean; action: 'add' | 'update' })[]
}
const root = '/api/family-sharing'
const id = encodeURIComponent
export const familySharingApi = {
  overview: (token: string, signal?: AbortSignal) => apiRequest<FamilyOverview>(root, { token, signal }),
  space: (token: string, spaceId: string, signal?: AbortSignal) => apiRequest<FamilySpace>(`${root}/spaces/${id(spaceId)}`, { token, signal }),
  create: (token: string, memberIds: string[]) => apiRequest<{ id: string }>(`${root}/spaces`, { token, method: 'POST', body: { memberIds, confirmShare: true } }),
  invite: (token: string, spaceId: string, recipientHooohoId: string) => apiRequest<{ id: string; expiresAt: string }>(`${root}/spaces/${id(spaceId)}/invitations`, { token, method: 'POST', body: { recipientHooohoId, confirmShare: true } }),
  accept: (token: string, invitationId: string) => apiRequest<{ id: string }>(`${root}/invitations/${id(invitationId)}/accept`, { token, method: 'POST', body: { confirmShare: true } }),
  link: (token: string, spaceId: string, childId: string, sourceMemberId: string) => apiRequest<{ memberId: string }>(`${root}/spaces/${id(spaceId)}/children/${id(childId)}/link`, { token, method: 'POST', body: { confirmSameChild: true, ...(sourceMemberId === 'new' ? { createPersonalCopy: true } : { sourceMemberId }) } }),
  preview: (token: string, spaceId: string, childId: string) => apiRequest<ImportPreview>(`${root}/spaces/${id(spaceId)}/children/${id(childId)}/preview`, { token, method: 'POST', body: {} }),
  confirm: (token: string, spaceId: string, batchId: string, selectedRecordIds: string[]) => apiRequest<{ id: string; count: number }>(`${root}/spaces/${id(spaceId)}/imports/${id(batchId)}/confirm`, { token, method: 'POST', body: { selectedRecordIds, confirmShare: true } }),
  withdraw: (token: string, spaceId: string, batchId: string) => apiRequest<{ success: true }>(`${root}/spaces/${id(spaceId)}/imports/${id(batchId)}/withdraw`, { token, method: 'POST', body: { confirm: true } }),
  revoke: (token: string, spaceId: string, accountId: string) => apiRequest<{ success: true }>(`${root}/spaces/${id(spaceId)}/revoke`, { token, method: 'POST', body: { accountId, confirm: true } }),
  async downloadAttachment(token: string, spaceId: string, entryId: string, attachmentId: string) {
    const response = await fetch(`${root}/spaces/${id(spaceId)}/entries/${id(entryId)}/attachments/${id(attachmentId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message ?? '无法读取附件，请刷新授权后重试')
    }
    return response.blob()
  }
}
