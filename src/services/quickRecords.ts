import { apiRequest } from './apiClient'

export interface QuickRecordCreateInput {
  dailySettings?: import('./dailyRecords').DailySettingsInput
  automaticInstanceId?: string
  journal?: import('../types/journal').JournalMetadata
  memberId: string
  content: string
  rawText?: string
  occurredAt: string
  inputChannel: 'voice' | 'text'
  idempotencyKey: string
  title: string
  photoDraftId?: string
  photoIds?: string[]
  duplicateAction?: 'update' | 'create'
  duplicateEventId?: string
}

export interface QuickRecordCreateResult {
  eventId: string
  recordId: string
  photoCount?: number
  idempotent: boolean
}

export interface QuickRecordDuplicate {
  eventId: string
  recordId: string
  occurredAt: string
  summary: string
  hasClearChange: boolean
  changeSummary: string
}

export interface QuickRecordPhotoDto {
  id: string
  draftId: string
  memberId: string
  name: string
  mimeType: string
  binarySize: number
  width: number | null
  height: number | null
  sortOrder: number
  uploadId?: string
  duration?: number
  review?: MediaReview
  uploadStatus: 'uploaded'
  createdAt: string
  consumedAt: string | null
}

export interface MediaReview { jobId?: string; confirmedText?: string; referenceDate?: string | null; audio?: { status: string; text?: string; message?: string; range?: number[] }; vision?: { status: string; observations?: { text: string; seconds: number | null; sourceId: string }[]; questions?: string[]; message?: string }; sound?: { status: string; message?: string } }
const inferredMime=(file:File)=>file.type||({mov:'video/quicktime',mp4:'video/mp4',webm:'video/webm',heic:'image/heic',heif:'image/heif',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[file.name.split('.').at(-1)?.toLowerCase()??'']??'application/octet-stream')
export const quickRecordService = {
  async uploadMedia(draftId: string, file: File, memberId: string, token: string, sortOrder: number, origin: 'capture' | 'library', uploadId:string) {
    let r:Response
    try{r = await fetch(`/api/quick-records/${encodeURIComponent(draftId)}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': inferredMime(file), 'X-Hoooho-Member-Id': memberId, 'X-Hoooho-File-Name': encodeURIComponent(file.name), 'X-Hoooho-Sort-Order': String(sortOrder), 'X-Hoooho-Upload-Id':uploadId, 'X-Hoooho-Media-Origin': origin, 'X-Hoooho-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone, ...(origin === 'capture' ? { 'X-Hoooho-Reference-Date': new Date().toLocaleDateString('en-CA') } : {}) }, body: file, signal: AbortSignal.timeout(240000) })}catch(e){throw new Error(e instanceof Error&&e.name==='TimeoutError'?'上传或兼容处理超时，请重试或缩短视频；本机原件仍保留':'网络中断，请重试上传；本机原件仍保留')}
    const data = await r.json().catch(()=>null); if (!r.ok) throw new Error(data?.error?.message || `上传失败（HTTP ${r.status}），请重试`);if(!data?.id)throw new Error('上传结果不完整，请重试');return data as QuickRecordPhotoDto
  },
  mediaReview(draftId: string, id: string, memberId: string, token: string, part?: string) {
    return apiRequest<MediaReview | null>(`/api/quick-records/${encodeURIComponent(draftId)}/media/${encodeURIComponent(id)}/review`, { token, ...(part ? { method: 'POST' as const, body: { part } } : {}), headers: { 'X-Hoooho-Member-Id': memberId } })
  },
  confirmMedia(draftId: string, id: string, memberId: string, token: string, text: string) { return apiRequest<MediaReview>(`/api/quick-records/${encodeURIComponent(draftId)}/media/${encodeURIComponent(id)}/review`, { token, method:'PATCH', body:{text}, headers:{'X-Hoooho-Member-Id':memberId} }) },
  async mediaPreview(draftId: string, id: string, memberId: string, token: string, poster = false) { const r = await fetch(`/api/quick-records/${encodeURIComponent(draftId)}/media/${encodeURIComponent(id)}/${poster?'poster':'preview'}`, {headers:{Authorization:`Bearer ${token}`,'X-Hoooho-Member-Id':memberId}});if(!r.ok)throw new Error('预览暂不可用');return r.blob() },
  checkDuplicate(input: QuickRecordCreateInput, token: string) {
    return apiRequest<{ duplicate: QuickRecordDuplicate | null }>('/api/quick-records/duplicate-check', { method: 'POST', body: input, token })
  },
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
