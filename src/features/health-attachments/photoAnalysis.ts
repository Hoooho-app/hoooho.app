import { apiRequest } from '../../services/apiClient'
import { mapWithConcurrency } from '../../services/concurrentTasks'
import { startAITiming } from '../../services/aiTiming'
import { recognitionCommand, recognitionUrl, uploadRecognitionFile, reuseRecognitionPhoto, waitForRecognitionJob, type UploadedPhotoSource, type RecognitionJob } from '../ai-business/recognitionJobs'
import type { SmartRecordItem } from '../ai-business/smartRecordTypes'
import { prepareHealthImage } from './prepareHealthImage'

export type PhotoAnalysisStage = 'preparing' | 'uploading' | 'analyzing'
export function sourcedPhotoFields(items: SmartRecordItem[], names: string[]) {
  // A model candidate is usable only when its field retains original evidence.
  return items.flatMap(item => item.fields.filter(field => names.includes(field.name) && field.value.trim() && field.sources.some(source => source.quote?.trim())))
}

export async function analyzePhotos(memberId: string, token: string, files: File[], signal: AbortSignal, onStage: (stage: PhotoAnalysisStage) => void, onJob: (id: string) => void, uploadedSources?: UploadedPhotoSource[]) {
  if (!files.length || !memberId || !token) throw new Error('请先选择当前人物的照片')
  if(uploadedSources&&(uploadedSources.length!==files.length||uploadedSources.some(source=>!source?.quickRecordDraftId?.trim()||!source?.photoId?.trim())))throw new Error('图片原件尚未上传完成')
  const id=crypto.randomUUID(),timing=startAITiming('recognition-job',token,id)
  let outcome:'ready'|'needs_review'|'failed'|'cancelled'='failed'
  try{
  const assetIds = await mapWithConcurrency(files, 2, async (file,index) => {
    if(uploadedSources){onStage('uploading');return reuseRecognitionPhoto(memberId,token,uploadedSources[index],signal)}
    signal.throwIfAborted()
    onStage('preparing')
    const prepared = await prepareHealthImage(file)
    signal.throwIfAborted()
    const binary = atob(prepared.dataUrl.slice(prepared.dataUrl.indexOf(',') + 1))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    onStage('uploading')
    return uploadRecognitionFile(memberId, token, new File([bytes], prepared.name, { type: prepared.mimeType }), signal)
  }, signal)
  onJob(id)
  onStage('analyzing')
  const url = recognitionUrl(memberId)
  let job = await apiRequest<RecognitionJob>(url, { token, signal, method: 'POST', body: { id, mode: 'structured', scopeKey: `photo-fields:${id}`, input: { id: crypto.randomUUID(), kind: 'image', text: '', assetIds }, options: { task: 'record', sourceIdentity: 'pending', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } })
  while (!['ready', 'needs_review', 'failed', 'discarded', 'paused'].includes(job.state)) {
    job = await waitForRecognitionJob(memberId, token, id, job, signal)
  }
  if (!['ready', 'needs_review'].includes(job.state) || !job.review) throw new Error(job.error?.message ?? '识别未完成，请重试或按原图手动填写')
  outcome=job.state==='needs_review'?'needs_review':'ready'
  return { items: job.review.items, partial: job.state === 'needs_review' }
  }finally{timing.finish(signal.aborted?'cancelled':outcome)}
}

export function discardPhotoAnalysis(memberId: string, token: string, id?: string) {
  if (id) void recognitionCommand(memberId, token, id, 'discard').catch(() => undefined)
}
