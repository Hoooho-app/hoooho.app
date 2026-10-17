import { apiRequest } from '../../services/apiClient'
import { recognitionCommand, recognitionUrl, uploadRecognitionFile, type RecognitionJob } from '../ai-business/recognitionJobs'
import type { SmartRecordItem } from '../ai-business/smartRecordTypes'
import { prepareHealthImage } from './prepareHealthImage'

export type PhotoAnalysisStage = 'preparing' | 'uploading' | 'analyzing'
export function sourcedPhotoFields(items: SmartRecordItem[], names: string[]) {
  // A model candidate is usable only when its field retains original evidence.
  return items.flatMap(item => item.fields.filter(field => names.includes(field.name) && field.value.trim() && field.sources.some(source => source.quote?.trim())))
}

export async function analyzePhotos(memberId: string, token: string, files: File[], signal: AbortSignal, onStage: (stage: PhotoAnalysisStage) => void, onJob: (id: string) => void) {
  if (!files.length || !memberId || !token) throw new Error('请先选择当前人物的照片')
  const assetIds: string[] = []
  for (const file of files) {
    signal.throwIfAborted()
    onStage('preparing')
    const prepared = await prepareHealthImage(file)
    signal.throwIfAborted()
    const binary = atob(prepared.dataUrl.slice(prepared.dataUrl.indexOf(',') + 1))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    onStage('uploading')
    assetIds.push(await uploadRecognitionFile(memberId, token, new File([bytes], prepared.name, { type: prepared.mimeType }), signal))
  }
  const id = crypto.randomUUID()
  onJob(id)
  onStage('analyzing')
  const url = recognitionUrl(memberId)
  let job = await apiRequest<RecognitionJob>(url, { token, signal, method: 'POST', body: { id, mode: 'structured', scopeKey: `photo-fields:${id}`, input: { id: crypto.randomUUID(), kind: 'image', text: '', assetIds }, options: { task: 'record', sourceIdentity: 'pending', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } })
  while (!['ready', 'needs_review', 'failed', 'discarded', 'paused'].includes(job.state)) {
    await new Promise<void>((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, 800)
      signal.addEventListener('abort', stop, { once: true })
      if (signal.aborted) stop()
    })
    job = await apiRequest<RecognitionJob>(`${url}/${id}`, { token, signal })
  }
  if (!['ready', 'needs_review'].includes(job.state) || !job.review) throw new Error(job.error?.message ?? '识别未完成，请重试或按原图手动填写')
  return { items: job.review.items, partial: job.state === 'needs_review' }
}

export function discardPhotoAnalysis(memberId: string, token: string, id?: string) {
  if (id) void recognitionCommand(memberId, token, id, 'discard').catch(() => undefined)
}
