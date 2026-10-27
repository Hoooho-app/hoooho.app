import type { CaptureDraft, CaptureTurn } from './captureDraft'
import { fileIdentity } from './captureDraft'
import type { NursingInterview, SmartRecordDraft } from './smartRecordTypes'
import {retainSmartRecordEdits} from './smartRecordTypes'
import type {RecognitionOperationReceipt} from './recognitionJobs'
import {retainRawSaveTarget} from './frontOriginalSave'

export type FrontResultKind='conversation'|'no_change'|'candidates'|'transcription'|'partial'|'saved'
type FrontValue={ [key:string]:unknown }
export type FrontSubject={kind:'current'|'other'|'unknown'|'multiple';memberId?:string|null;label?:string|null;confirmed?:boolean;sources?:FrontValue[]}
/** Optional V2 fields are carried through old drafts; the service validates them. */
export interface FrontUnderstanding {
  version?:string;reply?:string;contextId?:string;action?:string;questionId?:string|null;emergency?:boolean|FrontValue|null
  responseMode?:string;taskRelation?:string|FrontValue;subject?:string|FrontValue|null
  recordChanges?:FrontValue[];nextQuestion?:string|FrontValue|null;requestedAction?:string|FrontValue|null
  uncertainties?:(string|FrontValue)[]
}
export interface FrontMessage {manualCardEdit?:boolean;recordable?:boolean;protocolVersion?:number;originalFileCount?:number;understanding?:FrontUnderstanding;resultKind?:FrontResultKind;targetContextId?:string;answerTo?:{contextId:string;questionId:string};id:string;kind:'text'|'voice'|'image'|'assistant';text:string;at?:string;inputAt?:number;contextId:string;status:'pending'|'completed'|'failed'|'discarded';files?:FrontFile[];voices?:FrontFile[]}
export interface FrontFile {name:string;mimeType:string;dataUrl:string;lastModified?:number}
export interface FrontContext {operationReceipts?:RecognitionOperationReceipt[];semanticVersion?:number;originalsSubjectConfirmed?:boolean;originalsVersion?:number;subject?:FrontSubject;frontSubject?:FrontSubject;subjectConfirmed?:boolean;version?:number;understanding?:FrontUnderstanding;resultKind?:FrontResultKind;previousMessages?:FrontMessage[];interview?:NursingInterview;id:string;updatedAt:string;saved?:boolean;recordResult?:SmartRecordDraft['result'];review?:SmartRecordDraft;messages:FrontMessage[]}
export const voiceTurnId=(file:File)=>`voice:${file.name}:${file.lastModified}`
export function restoreFrontFile(file:FrontFile) {
  const binary=atob(file.dataUrl.split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
  return new File([bytes],file.name,{type:file.mimeType,lastModified:file.lastModified??0})
}
/** A proposed action is not an operation result. Only exact returned snapshots render. */
export function recordOperationTurn(receipt:RecognitionOperationReceipt|undefined,at=Date.now()):CaptureTurn|undefined {
  if(!receipt||receipt.state!=='completed'||!receipt.operationId||!receipt.targetId||!Number.isInteger(receipt.targetVersion)||receipt.targetVersion<1||!receipt.snapshot)return
  if(receipt.type==='delete')return {id:`operation:${receipt.operationId}`,role:'assistant',text:'这条记录已删除。',at,status:'completed',operationResult:receipt}
  if(receipt.type==='export'&&(!receipt.text?.trim()||!receipt.fileName?.trim()))return
  const original=receipt.snapshot.inputText?.trim()||receipt.snapshot.items.flatMap(item=>item.fields.map(field=>field.value)).filter(Boolean).slice(0,2).join('；')
  if(receipt.type==='query'&&!original)return
  return {id:`operation:${receipt.operationId}`,role:'assistant',text:receipt.type==='export'?'记录已准备好，可下载。':original.slice(0,320)+(original.length>320?'…':''),at,status:'completed',operationResult:receipt}
}
/** A real save receipt supersedes only its own pending operation reply. */
export function completedFrontSaveReplyIds(context:FrontContext):Set<string> {
  const receipts=(context.operationReceipts??[]).filter(receipt=>receipt.state==='saved'&&receipt.savedDraft.state==='saved'&&receipt.savedDraft.result?.records?.some(record=>record.recordId&&record.eventId))
  return new Set(context.messages.filter(message=>message.kind==='assistant'&&message.id.endsWith(':reply')&&receipts.some(receipt=>receipt.operationId===`${message.id.slice(0,-6)}:${receipt.type}:${receipt.targetVersion}`)).map(message=>message.id))
}
/** Model selection changes the record intent, never destroys the chat history. */
export function restoreFrontContext(context:FrontContext,local:CaptureDraft):CaptureDraft {
  const files:File[]=[],turns:CaptureTurn[]=[],completedReplies=completedFrontSaveReplyIds(context)
  const savedOriginalIds=new Set((context.saved?context.operationReceipts??[]:[]).flatMap(receipt=>receipt.state==='saved'&&receipt.type==='save_original'&&receipt.savedDraft?.state==='saved'&&receipt.savedDraft.result?.records?.length&&Array.isArray(receipt.sourceMessageIds)?receipt.sourceMessageIds:[]))
  for(const message of context.messages){
    if(message.status==='discarded'||message.manualCardEdit)continue
    const media=[...(message.files??[]),...(message.voices??[])].map(restoreFrontFile)
    files.push(...media)
    const previous=local.conversationTurns?.find(turn=>turn.id===message.id)
    turns.push({completedOperation:completedReplies.has(message.id)||previous?.completedOperation,continuationId:message.targetContextId,answerTo:message.answerTo,id:message.id,text:message.text,at:message.inputAt??Date.parse(message.at??context.updatedAt),role:message.kind==='assistant'?'assistant':'user',kind:message.kind==='assistant'?undefined:message.kind,fileKeys:media.map(fileIdentity),status:savedOriginalIds.has(message.id)&&message.kind!=='assistant'&&message.status==='failed'?'completed':message.status,contextId:context.id,reviewId:previous?.reviewId,recordCount:previous?.recordCount})
  }
  const previousTurns:CaptureTurn[]=(context.previousMessages??[]).filter(message=>message.status!=='discarded'&&!message.manualCardEdit).map(message=>{
    const media=[...(message.files??[]),...(message.voices??[])].map(restoreFrontFile)
    return {completedOperation:local.conversationTurns?.find(turn=>turn.id===message.id)?.completedOperation,id:message.id,text:message.text,at:message.inputAt??Date.parse(message.at??context.updatedAt),role:message.kind==='assistant'?'assistant':'user',kind:message.kind==='assistant'?undefined:message.kind,fileKeys:media.map(fileIdentity),status:message.status==='discarded'?undefined:message.status,contextId:message.contextId}
  })
  const pending=(local.conversationTurns??[]).filter(t=>t.role!=='assistant'&&t.status&&t.status!=='completed'&&!turns.some(s=>s.id===t.id))
  const operations=(local.conversationTurns??[]).filter(turn=>turn.operationResult&&!turns.some(value=>value.id===turn.id)&&!previousTurns.some(value=>value.id===turn.id))
  const pendingKeys=new Set(pending.flatMap(t=>t.fileKeys??[]))
  const extra=local.files.filter(f=>pendingKeys.has(fileIdentity(f))||f===local.pendingVoice)
  const reply=context.messages.filter(message=>message.kind==='assistant').at(-1)
  const resultKind=context.resultKind??reply?.resultKind,understanding=context.understanding??reply?.understanding
  const changed=Boolean(understanding?.recordChanges?.length)
  const savedCurrent=Boolean(context.saved&&(!local.frontContextId||local.frontContextId===context.id)&&(!local.smartReview||!context.review||local.smartReview.id===context.review.id))
  const preserve=!savedCurrent&&(context.saved||resultKind==='conversation'||resultKind==='no_change'||((resultKind==='partial'||resultKind==='transcription'||resultKind==='saved')&&!changed))
  // Conversation-only results must not replace a usable candidate with an empty
  // extraction. Explicit candidates, including an empty withdrawal result, do.
  let review=savedCurrent?undefined:preserve?(local.smartReview??context.review):context.review&&retainSmartRecordEdits(context.review,local.smartReview?.id===context.review.id?local.smartReview:undefined)
  if(preserve&&review&&context.review?.id===review.id&&context.review.version===review.version&&context.review.state==='ready')review={...review,state:'ready'}
  const narrative=context.messages.filter(message=>message.kind!=='assistant'&&message.status==='completed'&&(message.protocolVersion===3||message.recordable!==false)).map(message=>message.text).filter(Boolean).join('\n')
  const text=savedCurrent?'':preserve?(local.text||context.review?.inputText||''):(resultKind||changed)&&context.review?context.review.inputText:narrative
  const retainedFiles=preserve?[...new Map([...files,...local.files,...extra].map(file=>[fileIdentity(file),file])).values()]:[...(savedCurrent?[]:files),...extra]
  const keepCurrentContext=Boolean(context.saved&&!savedCurrent)
  return {...local,rawSaveTarget:keepCurrentContext?local.rawSaveTarget:retainRawSaveTarget(local.rawSaveTarget,context),nursingInterview:savedCurrent?undefined:keepCurrentContext?local.nursingInterview:context.interview,frontContextId:keepCurrentContext?local.frontContextId:context.id,frontContextVersion:keepCurrentContext?local.frontContextVersion:context.version??local.frontContextVersion,frontSubject:keepCurrentContext?local.frontSubject:context.frontSubject??context.subject,...(local.resumeContextId&&!keepCurrentContext?{resumeContextId:context.id}:{}),capturedAt:preserve?local.capturedAt:local.frontContextId===context.id?local.capturedAt:new Date(context.messages.find(m=>m.kind!=='assistant')?.inputAt??Date.parse(context.updatedAt)).toISOString(),text,files:retainedFiles,conversationTurns:[...previousTurns,...turns,...pending,...operations],smartReview:review,aiDraftId:review?.id,requestId:keepCurrentContext?local.requestId:context.id}
}
