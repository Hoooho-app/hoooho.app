import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

const traces = new AsyncLocalStorage()
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const operations = new Set(['recognition-job','recognition-assets','smart-record','draft-edit','audio-transcription','medical-summary','symptom-media','image-analysis','food-label','product-help','feedback-interview','nurse-dialogue','client-timing'])
export const safeTraceId = value => typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : randomUUID()
export function withAITrace({traceId, operation, signal} = {}, operationBody) {
  // Explicitly start a new scope. Background jobs must not inherit an HTTP
  // disconnect signal after their submission has already been acknowledged.
  return traces.run({traceId:safeTraceId(traceId),operation:operations.has(operation)?operation:'smart-record',signal},operationBody)
}
export function traceMetadata() {
  const trace=traces.getStore()
  return trace ? {traceId:trace.traceId,operation:trace.operation} : {}
}
export function linkedAISignal(signal) {
  const request=traces.getStore()?.signal
  return signal && request && signal !== request ? AbortSignal.any([signal,request]) : signal ?? request
}
export function aiRequestOperation(pathname) {
  if(pathname==='/api/ai/telemetry')return 'client-timing'
  if(pathname==='/api/ai/audio/transcriptions')return 'audio-transcription'
  if(/\/recognition-assets(?:\/|$)/.test(pathname))return 'recognition-assets'
  if(/\/recognition-jobs(?:\/|$)/.test(pathname))return 'recognition-job'
  if(/\/front-desk-record(?:\/|$)/.test(pathname))return 'smart-record'
  if(/\/ai-drafts(?:\/|$)/.test(pathname))return 'smart-record'
  if(/\/visit-sheet$|\/medical-preparation$/.test(pathname))return 'medical-summary'
  if(/^\/api\/quick-records\/[^/]+\/media(?:\/|$)/.test(pathname))return 'symptom-media'
  if(/\/attachments(?:\/preview)?$/.test(pathname))return 'image-analysis'
  if(pathname==='/api/food-label/check')return 'food-label'
  if(pathname.startsWith('/api/help/'))return 'product-help'
  if(pathname==='/api/feedback/interview')return 'feedback-interview'
  if(/\/nurse-drafts(?:\/|$)/.test(pathname))return 'nurse-dialogue'
  return null
}
export const bypassAccountRequestLock = (method,pathname) => method==='GET' && /^\/api\/members\/[^/]+\/recognition-jobs\/[^/]+$/.test(pathname) || method==='POST' && /^\/api\/members\/[^/]+\/recognition-assets$/.test(pathname)

const phaseNames = new Set(['preparation','upload','queue','transcription','recognition','organization','validation','save','display','total'])
export function safeClientTiming(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || typeof input.traceId!=='string' || !uuid.test(input.traceId) || !operations.has(input.operation) || !Number.isFinite(input.elapsedMs) || input.elapsedMs<0 || input.elapsedMs>600000 || !['ready','needs_review','failed','cancelled'].includes(input.outcome))return null
  const phases={}
  for(const [name,value] of Object.entries(input.phases??{}))if(phaseNames.has(name) && Number.isFinite(value) && value>=0 && value<=600000)phases[name]=Math.round(value)
  return {traceId:input.traceId.toLowerCase(),operation:input.operation,elapsedMs:Math.round(input.elapsedMs),outcome:input.outcome,phases}
}
