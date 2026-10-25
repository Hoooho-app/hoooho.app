import {apiRequest} from '../../services/apiClient'
import {abortable} from '../../services/abortable'
import {fileBytes} from './draftFiles'
import {recordingToWav} from './recordingAudio'
import type {SmartRecordDraft} from './smartRecordTypes'
import type {FrontContext,FrontResultKind} from './frontDeskRecord'
export type RecognitionState='queued'|'running'|'publishing'|'paused'|'failed'|'ready'|'needs_review'|'discarded'
export interface CompletedRecordOperation {operationId:string;type:'query'|'export'|'delete';targetId:string;targetVersion:number;state:'completed';snapshot:{inputText:string;items:SmartRecordDraft['items'];sources?:SmartRecordDraft['sources']};fileName?:string;text?:string}
export type RecognitionOperationReceipt={operationId:string;type:string;targetId:string;targetVersion:number;state:'saved';savedDraft:SmartRecordDraft;recordIds:string[]}|CompletedRecordOperation
export interface RecognitionJob {resultKind?:FrontResultKind;operationReceipt?:RecognitionOperationReceipt;id:string;draftId?:string;state:RecognitionState;stage:string;seq:number;inputRevision:number;resultRevision:number;createdAt:string;processingStartedAt?:string;updatedAt:string;inputStates?:{id:string;status:'pending'|'completed'|'failed';text:string}[];unresolvedInputs?:{id:string;code:string;message:string}[];progress?:{completed:number;total:number;reused?:boolean}|null;transcript?:{inputId:string;text:string};frontDesk?:{context:FrontContext;messageId:string;replyId:string};review?:SmartRecordDraft|null;error?:{code:string;message:string}|null}
export const recognitionUrl=(memberId:string)=>`/api/members/${encodeURIComponent(memberId)}/recognition-jobs`
export const recognitionActive=(job?:RecognitionJob|null)=>!!job&&['queued','running','publishing'].includes(job.state)
export function recognitionStatusUrl(memberId:string,id:string,previous?:RecognitionJob|null){
  const path=`${recognitionUrl(memberId)}/${encodeURIComponent(id)}`
  return recognitionActive(previous)?`${path}?afterSeq=${previous!.seq}&waitMs=25000`:path
}
export function recognitionPollDelay(previous:RecognitionJob|null|undefined,next:RecognitionJob,elapsedMs:number){
  return recognitionActive(next)&&(!previous||previous.seq===next.seq)?Math.max(0,1000-elapsedMs):0
}
// An older server may ignore long-poll parameters and return the same snapshot
// immediately. Bound that fallback to one request/second instead of busy polling.
export async function waitForRecognitionJob(memberId:string,token:string,id:string,previous?:RecognitionJob|null,signal?:AbortSignal):Promise<RecognitionJob>{
  const started=Date.now(),deadline=AbortSignal.timeout(35000),requestSignal=signal?AbortSignal.any([signal,deadline]):deadline
  const job=await apiRequest<RecognitionJob>(recognitionStatusUrl(memberId,id,previous),{token,signal:requestSignal})
  const delay=recognitionPollDelay(previous,job,Date.now()-started)
  if(delay)await new Promise<void>((resolve,reject)=>{
    const stop=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'))}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},delay)
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop()
  })
  signal?.throwIfAborted()
  return job
}
export async function uploadRecognitionFile(memberId:string,token:string,file:File,signal?:AbortSignal):Promise<string>{
  signal?.throwIfAborted()
  const bytes=await fileBytes(file),params=new URLSearchParams({name:file.name,lastModified:String(file.lastModified)})
  const response=await fetch(`/api/members/${encodeURIComponent(memberId)}/recognition-assets?${params}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':file.type},body:bytes,signal,credentials:'same-origin'})
  let result;try{result=await response.json()}catch{throw new Error('原件上传结果未确认，请重试；本机原件仍保留')}
  if(!response.ok)throw new Error(result.error?.message??'原件未上传成功，请重试')
  return result.id
}
export type UploadedPhotoSource={quickRecordDraftId:string;photoId:string}
export async function reuseRecognitionPhoto(memberId:string,token:string,source:UploadedPhotoSource,signal?:AbortSignal):Promise<string>{
  signal?.throwIfAborted()
  if(!source.quickRecordDraftId?.trim()||!source.photoId?.trim())throw new Error('图片原件尚未上传完成')
  const response=await fetch(`/api/members/${encodeURIComponent(memberId)}/recognition-assets`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Hoooho-Member-Id':memberId},body:JSON.stringify(source),signal,credentials:'same-origin'})
  let result;try{result=await response.json()}catch{throw new Error('原件上传结果未确认，请重试；本机原件仍保留')}
  if(!response.ok||!result?.id)throw new Error(result?.error?.message??'原件未上传成功，请重试')
  return result.id
}
export async function uploadRecognitionAudio(memberId:string,token:string,file:File,signal?:AbortSignal){signal?.throwIfAborted();const prepared=recordingToWav(file),wav=await(signal?abortable(prepared,signal):prepared);signal?.throwIfAborted();return uploadRecognitionFile(memberId,token,new File([wav],'转写音频.wav',{type:'audio/wav',lastModified:file.lastModified}),signal)}
export const recognitionCommand=(memberId:string,token:string,id:string,type:'pause'|'resume'|'retry'|'discard'|'use_text',commandId:string=crypto.randomUUID())=>apiRequest<RecognitionJob>(`${recognitionUrl(memberId)}/${encodeURIComponent(id)}/commands`,{method:'POST',token,body:{id:commandId,type}})
