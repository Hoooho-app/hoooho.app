import type { RecognitionJob } from '../ai-business/recognitionJobs'

export type VisitMaterialSource = 'hospital' | 'online_doctor' | 'external_ai'
export type VisitMaterialStatus = 'preparing' | 'uploading' | 'queued' | 'recognizing' | 'organizing' | 'ready' | 'failed'
export interface VisitMaterialBlock {
  id: string
  title: string
  text: string
  documentId: string
  page: number
  quote: string
  edited?: boolean
}
export interface VisitMaterialDocument {
  id: string
  name: string
  kind: 'file' | 'text' | 'link'
  mimeType?: string
  contentHash?: string
  attachmentId?: string
  originalText?: string
  recognizedText?: string
  status: VisitMaterialStatus
  error?: string
  jobId?: string
}
export interface VisitMaterials {
  source: VisitMaterialSource
  status: 'originals_only' | 'reviewed'
  title: string
  occurredAt?: string
  institution?: string
  supplement?: string
  documents: VisitMaterialDocument[]
  blocks: VisitMaterialBlock[]
}
export interface LocalVisitDocument extends VisitMaterialDocument {
  file?: File
  preview?: string
  job?: RecognitionJob
}
export interface VisitMaterialsDeviceDraft {
  source: VisitMaterialSource
  stage: 'entry' | 'processing' | 'review'
  title: string
  occurredAt: string
  institution: string
  supplement: string
  targetEventId?: string
  targetRecordId?: string
  documents: (VisitMaterialDocument & { fileIndex?: number })[]
  blocks: VisitMaterialBlock[]
  saveLocked?: boolean
  saveMode?: 'originals_only' | 'reviewed'
  savedRecord?: { eventId: string; recordId: string; attachmentIds: string[] }
  editingExisting?: boolean
}
export const visitMaterialSources: Record<VisitMaterialSource, string> = {
  hospital: '医院就诊', online_doctor: '在线医生', external_ai: 'AI 问诊'
}
export const visitMaterialIdentity = (source: VisitMaterialSource) => source === 'external_ai' ? 'external_ai' as const : 'medical_consultation' as const
