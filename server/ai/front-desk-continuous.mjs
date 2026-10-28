import {frontRecordVersion} from './front-desk-record-targets.mjs'
import {archiveItem} from './business/archive.mjs'
import { randomUUID } from 'node:crypto'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { validateOccurredAt } from '../events/health-event-record-service.mjs'
import { fail, fingerprint, resolveItemTime } from './business/contract.mjs'
import { contentFor } from './business/service.mjs'
import { applyFrontDeskRecordChanges } from './front-desk-understanding.mjs'
import { originals } from './front-desk-original-save.mjs'
import { continuousPresentation } from './front-desk-presentation.mjs'
import { frontDeskRecognitionPreview } from './front-desk-recognition-preview.mjs'

const revision = record => frontRecordVersion({type:record.type,content:record.content,occurredAt:record.occurredAt,journal:record.journal,aiProvenance:record.aiProvenance,sourceText:record.sourceText})
const sourcesFor = (data, context) => data.messages.filter(m => m.contextId === context.id && m.accountId === context.accountId && m.memberId === context.memberId && ['text','voice','image'].includes(m.kind) && m.status !== 'discarded' && (m.acceptedInput === true || m.acceptedInput == null && m.status === 'completed') && !m.retracted).sort((a,b) => a.inputAt-b.inputAt || a.id.localeCompare(b.id))
const checkSubject = (subject, memberId) => {
  if (subject && (['other','multiple'].includes(subject.kind) || subject.memberId && subject.memberId !== memberId)) throw fail('内容涉及其他记录对象，请切换对象后分别记录',409,'FRONT_SUBJECT_MISMATCH')
}
const owned = async (front, accountId, memberId, contextId) => {
  const member=await front.scope(accountId,memberId)
  let data=await front.store.read(),context=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId&&!c.closedAt)
  if(!context)throw fail('未找到当前记录单',404,'FRONT_RECORD_NOT_FOUND')
  if(!context.continuousRecord)await accountTransaction(front.directory,async()=>{
    data=await front.store.read();context=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId&&!c.closedAt)
    if(!context||context.continuousRecord)return
    const messages=sourcesFor(data,context),first=messages[0]
    const firstDescribedAt=first?new Date(first.inputAt??Date.parse(first.at)).toISOString():null
    const refs=context.saved===true?context.recordResult?.records??[]:[]
    let binding,restoredRecord
    // An old single-record receipt is an exact identity proof. Multi-record
    // historical intents keep their original separate links, never get merged.
    if(refs.length===1){
      const record=await front.business.records.getOwnedRecord(accountId,refs[0].recordId),event=await front.business.events.get(accountId,record.eventId)
      if(event.memberId!==memberId||event.id!==refs[0].eventId)throw fail('原记录暂不可访问',404,'FRONT_ORIGINAL_UNAVAILABLE')
      binding={recordId:record.id,eventId:event.id,memberId,revision:revision(record),sourceSignature:fingerprint(messages.map(m=>[m.id,m.text,m.sourceSignature??null])),evidenceVersion:context.evidenceVersion??0,editRevision:0,at:record.createdAt,category:record.aiProvenance?.category??record.journal?.categories?.[0]??record.type,profileEntries:refs[0].profileEntries??[]}
      restoredRecord={text:record.content,occurredAt:record.occurredAt,timePrecision:record.journal?.timePrecision??record.aiProvenance?.time?.precision??'exact',title:record.aiProvenance?.title??event.title,evidenceVersion:context.evidenceVersion??0}
    }
    if(context.saved&&!binding)throw fail('这次历史保存包含多条记录，请分别打开对应记录',409,'FRONT_RECORD_TARGET_AMBIGUOUS')
    const patch={continuousRecord:true,firstDescribedAt,version:context.version??1,evidenceVersion:context.evidenceVersion??0,...(binding?{saved:false,currentRecord:binding,restoredRecord,legacySavedDraftId:context.draftId,draftId:undefined,subject:{kind:'current',memberId,label:member.name,confirmed:true,confirmedBy:'selection',sources:[]}}:{})}
    await front.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId?{...c,...patch}:c)}))
    data=await front.store.read();context=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId)
  })
  return {data,context,member}
}
const assertVersion = (context,input) => {if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion!==context.version)throw fail('记录单已有更新，请查看最新内容',409,'FRONT_CONTEXT_CHANGED')}

/** One existing front-desk context owns one persistent record. No second draft store. */
export async function continuousCard(front, accountId, memberId, contextId) {
  const {data,context,member}=await owned(front,accountId,memberId,contextId)
  const messages=sourcesFor(data,context), raw=messages.map(m=>m.text).filter(Boolean).join('\n')
  const review=context.draftId?await front.business.read(accountId,memberId,context.draftId).catch(()=>null):null
  const usable=review?.state==='ready'&&review.frontEvidenceVersion===context.evidenceVersion&&review.items.length&&review.items.every(i=>i.subjectConfirmed&&!i.needsReview&&!i.unassigned&&!i.occurrenceUncertain)&&!review.documentWarnings?.length&&!review.unmappedRows?.length&&!review.conflicts?.length&&!review.sources?.some(source=>source.status==='uncertain')
  const items=usable?review.items:[]
  const hasOriginals=messages.some(m=>[...m.files??[],...m.originalFiles??[],...m.voices??[]].length)
  const recognitionPreview=frontDeskRecognitionPreview(review,{evidenceVersion:context.evidenceVersion,usable,hasOriginals})
  const edit=context.cardEdit
  const restored=context.restoredRecord?.evidenceVersion===context.evidenceVersion?context.restoredRecord:null
  const text=edit&&edit.evidenceVersion===context.evidenceVersion?edit.text:items.length?items.map(contentFor).join('\n\n'):restored?.text??raw
  const explicitItem=items.find(i=>i.time?.resolvedStart&&!i.time.defaulted),explicit=explicitItem?.time.resolvedStart
  // Explicit record-time edits take precedence even while extraction is still
  // running. Resolve only the user's time-edit clause, never a symptom update
  // such as “今天轻了一些”. Other fields retain the original occurrence.
  const lastManual=context.cardEdit?.messageId?messages.findIndex(m=>m.id===context.cardEdit.messageId):-1
  const timeEdit=[...messages.slice(lastManual+1)].reverse().map(message=>({message,match:/(?:发生时间|开始时间|时间)(?:[^。；;\n]{0,12}?)(?:改成|改为|改到|修改为|修改成)\s*([^。；;\n]+)/u.exec(message.text??'')})).find(value=>value.match)
  const correctedTime=timeEdit?resolveItemTime({timeText:timeEdit.match[1]},{referenceNow:timeEdit.message.at,timezone:'Asia/Shanghai'}):null
  let narratedTime,narratedPrecision
  if(!explicit&&!context.occurrenceOverride)for(const message of messages){try{const time=resolveItemTime({timeText:message.text},{referenceNow:message.at,timezone:'Asia/Shanghai'});if(time.resolvedStart){narratedTime=time.resolvedStart;narratedPrecision=time.precision;break}}catch{/* The validated structured result can resolve more precise narration later. */}}
  const timePrecision=correctedTime?.resolvedStart?correctedTime.precision:edit?.evidenceVersion===context.evidenceVersion?context.occurrencePrecision??'exact':explicitItem?.time.precision??(context.occurrenceOverride?context.occurrencePrecision??'exact':restored?.timePrecision??narratedPrecision??'exact')
  const occurredAt=correctedTime?.resolvedStart??(edit?.evidenceVersion===context.evidenceVersion?context.occurrenceOverride:null)??explicit??context.occurrenceOverride??restored?.occurredAt??narratedTime??context.firstDescribedAt??messages[0]?.at
  let saved=context.currentRecord??null
  if(saved){try{const record=await front.business.records.getOwnedRecord(accountId,saved.recordId);const event=await front.business.events.get(accountId,record.eventId);if(event.memberId!==memberId||record.eventId!==saved.eventId)throw Error();saved={...saved,available:true}}catch{saved={...saved,available:false}}}
  const card={contextId,sourceSignature:fingerprint(messages.map(message=>[message.id,message.text,message.sourceSignature??null])),recordable:Boolean(items.length||edit||context.currentRecord||context.provisional||(context.facts??[]).some(f=>f.status==='active'&&f.scope!=='context')||messages.some(m=>m.status==='failed')),version:context.version,evidenceVersion:context.evidenceVersion,editRevision:context.editRevision??0,timePrecision,title:edit?.evidenceVersion===context.evidenceVersion?edit.title:items.map(i=>i.title).join('、')||restored?.title||'记录单',text,raw,occurredAt,items,saved,hasOriginals:messages.some(m=>[...m.files??[],...m.originalFiles??[],...m.voices??[]].length),checklist:context.visitChecklist??null}
  if(context.visitChecklist)card.checklist=checklistFor(card,context,member.name)
  const relevant=data.messages.filter(message=>message.accountId===accountId&&message.memberId===memberId&&(message.contextId===contextId||message.targetContextId===contextId&&['pending','transcribing'].includes(message.status))).sort((a,b)=>(a.inputAt??Date.parse(a.at))-(b.inputAt??Date.parse(b.at)))
  card.recognitionPreview=recognitionPreview
  card.presentation=continuousPresentation(context,relevant,card)
  return card
}

export async function generateContinuousRecord(front,accountId,memberId,contextId,input) {
  if(input.confirmed!==true)throw fail('请确认生成记录单',422,'FRONT_GENERATION_CONFIRMATION_REQUIRED')
  return accountTransaction(front.directory,async()=>{
    const {context}=await owned(front,accountId,memberId,contextId);assertVersion(context,input)
    const card=await continuousCard(front,accountId,memberId,contextId)
    if(!card.presentation.canGenerate)throw fail(card.presentation.asking?'请先回答当前问题，再生成记录单':'这段内容还在处理，请稍后生成记录单',409,'FRONT_RECORD_NOT_READY')
    checkSubject(context.subject,memberId)
    if(!card.presentation.generated)await front.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId?{...c,recordGeneration:{evidenceVersion:c.evidenceVersion??0,editRevision:c.editRevision??0,at:front.now().toISOString()}}:c)}))
    return continuousCard(front,accountId,memberId,contextId)
  })
}

async function writeRecord(front,accountId,memberId,contextId,{automatic=false,expectedVersion}={}) {
  const {data,context}=await owned(front,accountId,memberId,contextId)
  if(expectedVersion!==undefined)assertVersion(context,{expectedVersion})
  if(automatic&&(!context.currentRecord||context.currentRecord.evidenceVersion!==(context.evidenceVersion??0)||context.currentRecord.editRevision!==(context.editRevision??0)))return
  checkSubject(context.subject,memberId)
  const messages=sourcesFor(data,context)
  messages.forEach(m=>checkSubject(m.subject,memberId))
  for(const fact of context.facts??[])if(fact.status==='active'&&fact.scope!=='context'){checkSubject(fact.subject,memberId);if(fact.subject?.confirmed!==true||fact.subject?.kind!=='current')throw fail('这部分涉及其他或不明确的记录对象，请分别记录',409,'FRONT_SUBJECT_MISMATCH')}
  const card=await continuousCard(front,accountId,memberId,contextId)
  if(!card.text.trim()&&!card.hasOriginals)throw fail('还没有可保存的内容',422,'FRONT_ORIGINAL_INPUT_REQUIRED')
  const current=context.currentRecord
  let record=current?await front.business.records.getOwnedRecord(accountId,current.recordId):null
  if(record&&revision(record)!==current.revision)throw fail('记录已在其他页面修改，请查看原记录',409,'FRONT_RECORD_TARGET_CHANGED')
  // A manual revision belongs to the user. A later extraction may enrich only
  // a matching evidence/edit revision; never replace that user's text.
  if(automatic&&!card.items.length)return
  const projectionSignature=frontRecordVersion({sourceSignature:card.sourceSignature,text:card.text,items:card.items,occurredAt:card.occurredAt,timePrecision:card.timePrecision,editRevision:card.editRevision})
  if(current?.projectionSignature===projectionSignature)return card
  const item=card.items[0],category=item?.category??'other',now=front.now()
  const previousRaw=record?.sourceText
  const content=card.text.trim()||'附件记录'
  if(content.length>5000)throw fail('记录内容较长，请缩短记录单内容后保存，原话仍完整保留',422,'RECORD_CONTENT_TOO_LONG')
  const occurredAt=validateOccurredAt(card.occurredAt,now)
  const body={type:['symptom','medication','visit','examination'].includes(category)?category:'note',content,occurredAt,journal:item?.journal??{categories:['other'],timePrecision:card.timePrecision==='exact'?'exact':card.timePrecision==='unknown'?'unknown':'period',...(['exact','unknown'].includes(card.timePrecision)?{}:{timeLabel:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(occurredAt))})}}
  let event=record?await front.business.events.get(accountId,record.eventId):null
  if(event&&event.memberId!==memberId)throw fail('记录对象已变化',409,'FRONT_SUBJECT_MISMATCH')
  if(!event){event=await front.business.events.create(accountId,{memberId,title:card.title==='记录单'?(card.raw.slice(0,40)||'附件记录'):card.title,category:'other',status:'active',startTime:occurredAt},now);event=await front.business.events.repository.update(event.id,{caseTracking:false},now)}
  // The shared service validates fields, times, permissions and journals.
  record=record?await front.business.records.update(accountId,record.id,{...body,sourceText:card.raw||null},now):await front.business.records.create(accountId,event.id,{...body,sourceText:card.raw||null,sourceType:'text_record',caseIdentity:'parent'},now)
  const refs=[]
  for(const file of originals(messages,memberId)){
    const {id:sourceFileId,...original}=file
    const {attachment}=await front.business.attachments.createUnique({accountId,memberId,eventId:event.id,recordId:record.id,...original,analysis:{status:card.items.length?'completed':'unavailable',provider:'manual',confirmed:true,sourcePages:[]}},now)
    refs.push(attachment.id)
  }
  record=await front.business.records.repository.update(record.id,{aiProvenance:{...record.aiProvenance,title:card.title,category,provider:card.items.length?'front-desk':'manual',confirmed:true,fields:item?.fields??[],sources:card.items.length?card.items.flatMap(item=>item.fields.flatMap(field=>field.sources??[])):card.raw?[{sourceId:`front-original:${contextId}`,page:1,quote:card.raw}]:[],notice:null,time:item?.time??{resolvedStart:card.timePrecision==='unknown'?null:occurredAt,resolvedEnd:null,precision:card.timePrecision,source:'recorded_time'},professionalSummary:item?.professionalSummary,structuredItems:card.items,originalVersions:[...new Set([...(record.aiProvenance?.originalVersions??[]),...(previousRaw&&previousRaw!==card.raw?[previousRaw]:[])])],attachmentIds:[...new Set([...(record.aiProvenance?.attachmentIds??[]),...refs])],frontContextId:contextId},caseContext:{...record.caseContext,identity:record.caseContext?.identity??'parent',confirmed:true,originalText:card.raw,timeUnknown:card.timePrecision==='unknown',attachmentIds:refs}},now)
  const profileData=structuredClone(await front.business.profiles.read())
  for(const item of card.items)profileData.sections=archiveItem(profileData.sections,item,{accountId,memberId,eventId:event.id,recordId:record.id,attachmentIds:refs,now})
  if(card.items.length)await front.business.profiles.update(()=>profileData)
  const profileEntries=(record.journal?.vaccination?.items??[]).map(item=>({sectionId:'vaccination',entryId:`${record.id}/${item.id}`}))
  for(const section of profileData.sections.filter(section=>section.accountId===accountId&&section.memberId===memberId))for(const entry of section.records.filter(entry=>entry.sourceRecordId===record.id||entry.sourceReferences?.some(ref=>ref.id===`ai:${record.id}`)))profileEntries.push({sectionId:section.sectionId,entryId:entry.id})
  const saved={projectionSignature,sourceSignature:card.sourceSignature,recordId:record.id,eventId:event.id,memberId,revision:revision(record),evidenceVersion:context.evidenceVersion,editRevision:context.editRevision??0,at:now.toISOString(),category,profileEntries}
  await front.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId?{...c,currentRecord:saved}:c)}))
  return continuousCard(front,accountId,memberId,contextId)
}

export async function saveContinuousRecord(front,accountId,memberId,contextId,input) {
  if(input.confirmed!==true)throw fail('请确认保存记录',422,'FRONT_ORIGINAL_CONFIRMATION_REQUIRED')
  return accountTransaction(front.directory,()=>writeRecord(front,accountId,memberId,contextId,input))
}
export async function enrichContinuousRecord(front,accountId,memberId,contextId) {
  return accountTransaction(front.directory,()=>writeRecord(front,accountId,memberId,contextId,{automatic:true}))
}
export async function editContinuousRecord(front,accountId,memberId,contextId,input) {
  if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4900||typeof input.title!=='string'||input.title.length>120)throw fail('请填写有效的记录内容',422,'FRONT_RECORD_INVALID')
  return accountTransaction(front.directory,async()=>{
    const {context}=await owned(front,accountId,memberId,contextId);assertVersion(context,input)
    const before=await continuousCard(front,accountId,memberId,contextId)
    if(input.recognitionDraft&&(!before.recognitionPreview?.canAdopt||input.recognitionDraft.id!==before.recognitionPreview.draftId||input.recognitionDraft.version!==before.recognitionPreview.draftVersion))throw fail('识别内容已有更新，请重新核对最新内容；已编辑的文字仍保留',409,'FRONT_RECOGNITION_CHANGED')
    const occurredAt=validateOccurredAt(input.occurredAt,front.now()),occurrencePrecision=Date.parse(occurredAt)===Date.parse(before.occurredAt)?before.timePrecision:'exact',id=`edit-${randomUUID()}`,at=front.now().toISOString(),subject={kind:'current',memberId,confirmed:true,confirmedBy:'selection',label:(await front.scope(accountId,memberId)).name,sources:[]}
    const sourceText=`${input.text.trim()}\n发生时间：${occurredAt}`
    const facts=applyFrontDeskRecordChanges((context.facts??[]).map(f=>f.status==='active'?{...f,status:'superseded'}:f),[{id,type:'add',text:sourceText,scope:'record',polarity:'affirmed',subject,sources:[{messageId:id,attachmentId:null,quote:sourceText}]}],{messageId:id,contextId})
    const feedback={id:`${id}:feedback`,text:Date.parse(before.occurredAt)!==Date.parse(occurredAt)?`时间已改为${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(occurredAt))}`:'内容已修改'}
    await front.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId?{...c,version:c.version+1,evidenceVersion:(c.evidenceVersion??0)+1,editRevision:(c.editRevision??0)+1,occurrenceOverride:occurredAt,occurrencePrecision,cardEdit:{messageId:id,text:input.text.trim(),title:input.title.trim()||'记录单',evidenceVersion:(c.evidenceVersion??0)+1},facts,resultKind:'candidates',decision:{organize:true},understanding:{...c.understanding,recordChangesPending:false},interview:undefined,actionPlan:undefined,pendingSaveConfirmation:undefined,updatedAt:at}:c),messages:[...d.messages,{id,accountId,memberId,contextId,kind:'text',text:sourceText,status:'completed',acceptedInput:true,inputAcceptedAt:at,at,inputAt:Date.parse(at),subject,manualCardEdit:true,files:[],voices:[]},{...feedback,accountId,memberId,contextId,kind:'assistant',status:'completed',at}]}))
    // Editing an already presented card is another explicit revision of that
    // same card. A later background extraction cannot revoke that user action.
    if(before.presentation.generated)await front.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId?{...c,recordGeneration:{evidenceVersion:c.evidenceVersion??0,editRevision:c.editRevision??0,at:front.now().toISOString()}}:c)}))
    return {...await continuousCard(front,accountId,memberId,contextId),feedback}
  })
}

export async function continuousChecklist(front,accountId,memberId,contextId,input){
 return accountTransaction(front.directory,async()=>{
  const {context}=await owned(front,accountId,memberId,contextId);assertVersion(context,input)
  const card=await continuousCard(front,accountId,memberId,contextId)
  if(!card.presentation.visitEligible&&!card.checklist)throw fail('聊到就医准备时，再整理就诊情况单',422,'FRONT_VISIT_CONTEXT_REQUIRED')
  if(!card.text.trim())throw fail('先说说需要整理的情况',422,'FRONT_ORIGINAL_INPUT_REQUIRED')
  const member=await front.scope(accountId,memberId),checklist=checklistFor(card,context,member.name)
  await front.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId?{...c,visitChecklist:checklist}:c)}))
  return continuousCard(front,accountId,memberId,contextId)
 })
}

function checklistFor(card,context,name){
 const at=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',...(card.timePrecision==='exact'?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(card.occurredAt))
 const facts=(context.facts??[]).filter(fact=>fact.status==='active'&&fact.scope!=='context').map(fact=>fact.text).join('\n')
 const description=card.items.length||context.cardEdit?.evidenceVersion===context.evidenceVersion?card.text:facts||card.text
 return {text:['就诊清单',`记录对象：${name}`,`发生时间：${at}`,description].join('\n\n'),version:card.evidenceVersion}
}
