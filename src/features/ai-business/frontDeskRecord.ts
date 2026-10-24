import type { CaptureDraft, CaptureTurn } from './captureDraft'
import { fileIdentity } from './captureDraft'
import type { NursingInterview, SmartRecordDraft } from './smartRecordTypes'
import {retainSmartRecordEdits} from './smartRecordTypes'

export interface FrontMessage {answerTo?:{contextId:string;questionId:string};id:string;kind:'text'|'voice'|'image'|'assistant';text:string;at?:string;inputAt?:number;contextId:string;status:'pending'|'completed'|'failed'|'discarded';files?:FrontFile[];voices?:FrontFile[]}
export interface FrontFile {name:string;mimeType:string;dataUrl:string;lastModified?:number}
export interface FrontContext {interview?:NursingInterview;id:string;updatedAt:string;saved?:boolean;recordResult?:SmartRecordDraft['result'];review?:SmartRecordDraft;messages:FrontMessage[]}
export const voiceTurnId=(file:File)=>`voice:${file.name}:${file.lastModified}`
export function restoreFrontFile(file:FrontFile) {
  const binary=atob(file.dataUrl.split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
  return new File([bytes],file.name,{type:file.mimeType,lastModified:file.lastModified??0})
}
/** Model selection changes the record intent, never destroys the chat history. */
export function restoreFrontContext(context:FrontContext,local:CaptureDraft):CaptureDraft {
  const files:File[]=[],turns:CaptureTurn[]=[]
  for(const message of context.messages){
    if(message.status==='discarded')continue
    const media=[...(message.files??[]),...(message.voices??[])].map(restoreFrontFile)
    files.push(...media)
    const previous=local.conversationTurns?.find(turn=>turn.id===message.id)
    turns.push({answerTo:message.answerTo,id:message.id,text:message.text,at:message.inputAt??Date.parse(message.at??context.updatedAt),role:message.kind==='assistant'?'assistant':'user',kind:message.kind==='assistant'?undefined:message.kind,fileKeys:media.map(fileIdentity),status:message.status,contextId:context.id,reviewId:previous?.reviewId,recordCount:previous?.recordCount})
  }
  const pending=(local.conversationTurns??[]).filter(t=>t.role!=='assistant'&&t.status&&t.status!=='completed'&&!turns.some(s=>s.id===t.id))
  const pendingKeys=new Set(pending.flatMap(t=>t.fileKeys??[]))
  const extra=local.files.filter(f=>pendingKeys.has(fileIdentity(f))||f===local.pendingVoice)
  const review=context.saved?undefined:context.review&&retainSmartRecordEdits(context.review,local.smartReview?.id===context.review.id?local.smartReview:undefined)
  return {...local,nursingInterview:context.saved?undefined:context.interview,frontContextId:context.id,capturedAt:local.frontContextId===context.id?local.capturedAt:new Date(context.messages.find(m=>m.kind!=='assistant')?.inputAt??Date.parse(context.updatedAt)).toISOString(),text:context.saved?'':turns.filter(t=>t.role==='user'&&t.status==='completed').map(t=>t.text).filter(Boolean).join('\n'),files:[...(context.saved?[]:files),...extra],conversationTurns:[...turns,...pending],smartReview:review,aiDraftId:review?.id,requestId:context.id}
}
