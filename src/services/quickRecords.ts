import { apiRequest } from './apiClient'

export interface QuickRecordCreateInput {
  journal?: import('../types/journal').JournalMetadata
  memberId: string
  content: string
  occurredAt: string
  inputChannel: 'voice' | 'text'
  idempotencyKey: string
  title: string
  photoDraftId?: string
  photoIds?: string[]
}

export interface QuickRecordCreateResult {
  eventId: string
  recordId: string
  photoCount?: number
  idempotent: boolean
}

export interface QuickRecordPhotoDto {
  id: string
  draftId: string
  memberId: string
  name: string
  mimeType: string
  binarySize: number
  width: number
  height: number
  sortOrder: number
  uploadStatus: 'uploaded'
  createdAt: string
  consumedAt: string | null
}

export const quickRecordService = {
  create(input: QuickRecordCreateInput, token: string) {
    return apiRequest<QuickRecordCreateResult>('/api/quick-records', { method: 'POST', body: input, token })
  },
  listPhotos(draftId: string, memberId: string, token: string) {
    return apiRequest<QuickRecordPhotoDto[]>(`/api/quick-records/${encodeURIComponent(draftId)}/photos`, { token, headers: { 'X-Hoooho-Member-Id': memberId } })
  },
  uploadPhoto(draftId: string, input: { memberId: string; name: string; mimeType: string; dataUrl: string; sortOrder: number }, token: string) {
    return apiRequest<QuickRecordPhotoDto>(`/api/quick-records/${encodeURIComponent(draftId)}/photos`, { token, method: 'POST', body: input })
  },
  deletePhoto(draftId: string, photoId: string, memberId: string, token: string) {
    return apiRequest<{ deleted: true }>(`/api/quick-records/${encodeURIComponent(draftId)}/photos/${encodeURIComponent(photoId)}`, { token, method: 'DELETE', headers: { 'X-Hoooho-Member-Id': memberId } })
  },
  cancelPhotos(draftId: string, memberId: string, token: string) {
    return apiRequest<{ deleted: number }>(`/api/quick-records/${encodeURIComponent(draftId)}/photos`, { token, method: 'DELETE', headers: { 'X-Hoooho-Member-Id': memberId } })
  },
  async readPhoto(draftId: string, photoId: string, memberId: string, token: string) {
    const response = await fetch(`/api/quick-records/${encodeURIComponent(draftId)}/photos/${encodeURIComponent(photoId)}/content`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Hoooho-Member-Id': memberId }
    })
    if (!response.ok) throw new Error('照片预览加载失败')
    return response.blob()
  }
}
