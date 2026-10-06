import { apiRequest } from './apiClient'
import type {
  VisitChapterId,
  VisitFocus,
  VisitSheetState,
  VisitPhotoDetail,
} from '../types/visitSheet'
export interface VisitSheetUpdate {
  previewUpdate?: boolean
  confirmUpdate?: string
  caseDetails?: import('../types/visitSheet').VisitSheet['caseDetails']
  selection?: { eventIds: string[]; from?: string; to?: string; includeBackground: boolean } | null
  previewScope?: boolean
  generateAI?: boolean
  previewAI?: boolean
  confirmAI?: string
  aiOverview?: string
  expectedVersion: number
  requestId: string
  focus?: VisitFocus
  question?: string
  selectedPhotoIds?: string[]
  photoDraft?: { draftId: string; photoIds: string[] }
  photoDetails?: Record<string, VisitPhotoDetail>
  notes?: Partial<Record<VisitChapterId, string>>
}
export const visitSheetService = {
  async uploadMedia(memberId:string,draftId:string,file:File,token:string,sortOrder:number,uploadId:string){
    if(file.size>100*1024*1024)throw new Error('单个视频超过100MB，请裁剪或选择较小原件')
    const mime=file.type||({mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'}[file.name.split('.').at(-1)?.toLowerCase()??'']??'application/octet-stream')
    const response=await fetch(`/api/members/${encodeURIComponent(memberId)}/visit-sheet/media/${encodeURIComponent(draftId)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':mime,'X-Hoooho-File-Name':encodeURIComponent(file.name),'X-Hoooho-Sort-Order':String(sortOrder),'X-Hoooho-Upload-Id':uploadId,'X-Hoooho-Media-Origin':'library'},body:file,signal:AbortSignal.timeout(240000)})
    const result=await response.json().catch(()=>null)
    if(!response.ok||!result?.id)throw new Error(result?.error?.message||'影像上传未完成，请重试；本机原件仍保留')
    return result as import('./quickRecords').QuickRecordPhotoDto
  },
  get(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<VisitSheetState & { expectedVersion?: number }>(
      `/api/members/${encodeURIComponent(memberId)}/visit-sheet`,
      {
        token,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      },
    )
  },
  save(
    memberId: string,
    token: string,
    body: VisitSheetUpdate,
    signal?: AbortSignal,
  ) {
    return apiRequest<VisitSheetState>(
      `/api/members/${encodeURIComponent(memberId)}/visit-sheet`,
      {
        token,
        method: 'PUT',
        body,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(body.generateAI?130000:30000)])
          : AbortSignal.timeout(body.generateAI?130000:30000),
      },
    )
  },
}
