import {apiRequest} from '../../services/apiClient'
import {fileBytes} from './draftFiles'
import {recordingToWav} from './recordingAudio'
import type {SmartRecordDraft} from './smartRecordTypes'
import type {FrontContext} from './frontDeskRecord'
export type RecognitionState='queued'|'running'|'publishing'|'paused'|'failed'|'ready'|'needs_review'|'discarded'
export interface RecognitionJob {id:string;state:RecognitionState;stage:string;seq:number;inputRevision:number;resultRevision:number;createdAt:string;processingStartedAt?:string;updatedAt:string;inputStates?:{id:string;status:'pending'|'completed'|'failed';text:string}[];unresolvedInputs?:{id:string;code:string;message:string}[];progress?:{completed:number;total:number;reused?:boolean}|null;transcript?:{inputId:string;text:string};frontDesk?:{context:FrontContext;messageId:string;replyId:string};review?:SmartRecordDraft|null;error?:{code:string;message:string}|null}
export const recognitionUrl=(memberId:string)=>`/api/members/${encodeURIComponent(memberId)}/recognition-jobs`
export const recognitionActive=(job?:RecognitionJob|null)=>!!job&&['queued','running','publishing'].includes(job.state)
export async function uploadRecognitionFile(memberId:string,token:string,file:File,signal?:AbortSignal):Promise<string>{
  const bytes=await fileBytes(file),params=new URLSearchParams({name:file.name,lastModified:String(file.lastModified)})
  const response=await fetch(`/api/members/${encodeURIComponent(memberId)}/recognition-assets?${params}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':file.type},body:bytes,signal,credentials:'same-origin'})
  let result;try{result=await response.json()}catch{throw new Error('原件上传结果未确认，请重试；本机原件仍保留')}
  if(!response.ok)throw new Error(result.error?.message??'原件未上传成功，请重试')
  return result.id
}
export async function uploadRecognitionAudio(memberId:string,token:string,file:File,signal?:AbortSignal){const wav=await recordingToWav(file);return uploadRecognitionFile(memberId,token,new File([wav],'转写音频.wav',{type:'audio/wav',lastModified:file.lastModified}),signal)}
export const recognitionCommand=(memberId:string,token:string,id:string,type:'pause'|'resume'|'retry'|'discard'|'use_text',commandId:string=crypto.randomUUID())=>apiRequest<RecognitionJob>(`${recognitionUrl(memberId)}/${encodeURIComponent(id)}/commands`,{method:'POST',token,body:{id:commandId,type}})
