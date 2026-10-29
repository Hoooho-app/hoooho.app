import {guideFrontDeskReply,frontDeskAnswerQuestion} from './front-desk-question-progress.mjs'
import {continuousCard,continuousChecklist,generateContinuousRecord,saveContinuousRecord,editContinuousRecord,enrichContinuousRecord} from './front-desk-continuous.mjs'
import {rebindSemanticSummaryOwnership,validSemanticSummary} from './business/semantic-summary.mjs'
import {LegacySemanticFrontDeskRecord} from './front-desk-legacy-semantic-record.mjs'
import {factMessages} from './business/front-desk-semantics.mjs'
import path from 'node:path'
import { randomUUID,createHash } from 'node:crypto'
import sharp from 'sharp'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { BusinessModel } from './business/model.mjs'
import { prepareDocuments, prepareVoiceOriginals } from './business/documents.mjs'
import { pdfPageImage } from './business/pdf-page-image.mjs'
import { createDialogueProvider } from './providers/dialogue-provider.mjs'
import { withAIAccount } from './providers/call-control.mjs'
import { fail, fingerprint } from './business/contract.mjs'
import {prepareFrontDeskMedia} from './front-desk-media.mjs'
import { nursingMemberContext, nursingKnowledgeFor, nursingInterview, interpretNursingAnswer } from './business/nursing-interview.mjs'
import { confirmedCurrentEmergency,confirmedCurrentEmergencyQuote } from './nurse-emergency.mjs'
import {assertFrontDeskReplySafety} from './front-desk-reply-safety.mjs'
import { hasConversationInput } from '../../shared/conversation-input.mjs'
import { conversationTitle } from '../../shared/conversation-title.mjs'
import { frontDeskRecordSections, recordSectionsText } from './front-desk-record-sections.mjs'
import {frontDeskUnderstandingSchema,normalizeFrontDeskUnderstanding,frontDeskUnderstandingContext,applyFrontDeskRecordChanges,frontDeskUnderstandingPolicy,frontDeskSubjectConfirmations} from './front-desk-understanding.mjs'
import {planFrontDeskAction,directFrontDeskSaveRequest} from './front-desk-actions.mjs'
import {accessibleFrontDeskTargets} from './front-desk-record-targets.mjs'
import {saveFrontDeskOriginal} from './front-desk-original-save.mjs'
const messageOrder=(a,b)=>(a.inputAt??Date.parse(a.at))-(b.inputAt??Date.parse(b.at))||a.id.localeCompare(b.id)
const messageSignature=(kind,text,files=[],voices=[],answerTo,contextId,presentedDraft,expectedContextVersion)=>fingerprint([kind,text.trim(),files.map(f=>f.contentHash??fingerprint(f.dataUrl)),voices.map(f=>createHash('sha256').update(Buffer.from(f.dataUrl.slice(f.dataUrl.indexOf(',')+1),'base64')).digest('hex')),...(answerTo?[answerTo]:[]),...(contextId?[{contextId}]:[]),...(presentedDraft||expectedContextVersion!==undefined?[{presentedDraft:presentedDraft??null,expectedContextVersion:expectedContextVersion??null}]:[])])
const conversationIdOf=context=>context.conversationId??context.id
const latestConversationContext=contexts=>{
  const parents=new Set(contexts.filter(c=>c.continuedFromId&&c.continuedFromId!==c.id).map(c=>c.continuedFromId))
  return contexts.filter(c=>!parents.has(c.id)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]
}

// Submitted chat is durable evidence; it never creates a formal health record.
// Only a selected context's originals are loaded. History search sends bounded
// text summaries, never every stored image or recording to the model.
export class FrontDeskRecord {
  constructor(options) {
    this.directory = options.dataDirectory
    this.events = options.events
    this.business = options.business
    this.model = options.model
    this.options = options
    this.now = options.now ?? (() => new Date())
    this.store = new JsonStore(path.join(this.directory, 'front-desk-records.json'), { contexts: [], messages: [] })
    this.inFlight = new Map()
    this.legacySemantic=new LegacySemanticFrontDeskRecord(options)
    this.legacySemantic.inFlight=this.inFlight
  }
  async scope(accountId, memberId) { return this.events.assertMemberOwnership(accountId, memberId) }
  async retainLegacy(accountId, memberId, input) {
    await this.scope(accountId, memberId)
    if (typeof input.requestId !== 'string' || input.requestId.length > 180 || !Array.isArray(input.turns) || input.turns.length > 60 || input.turns.some(t=>typeof t.text!=='string'||t.text.length>5000)) throw fail('旧草稿内容无效',422,'FRONT_RECORD_INVALID')
    const id=`legacy-${fingerprint([accountId,memberId,input.requestId]).slice(0,32)}`
    if ((await this.store.read()).contexts.some(c=>c.id===id)) {
      // Old migrations predate versioned confirmation. Supply only missing
      // counters from their owned retained originals, never reset a revision.
      await accountTransaction(this.directory,async()=>this.store.update(data=>({...data,contexts:data.contexts.map(context=>context.id===id&&context.accountId===accountId&&context.memberId===memberId?{...context,version:context.version??1,evidenceVersion:context.evidenceVersion??0,originalsVersion:context.originalsVersion??(data.messages.some(message=>message.contextId===id&&message.accountId===accountId&&message.memberId===memberId&&[...message.files??[],...message.voices??[]].length)?1:0)}:context)})))
      return this.snapshot(accountId,memberId,id)
    }
    const files=await prepareDocuments(input.files??[])
    let voices
    try{voices=prepareVoiceOriginals(input.voiceFiles??[])}catch(error){
      // Migration retains readable byte snapshots even when a legacy recorder
      // declaration is inconsistent. Formal organization still validates them
      // and presents the existing explicit remove/re-record recovery action.
      if(!Array.isArray(input.voiceFiles)||input.voiceFiles.length>12||input.voiceFiles.some(f=>typeof f.dataUrl!=='string'||f.dataUrl.length>8_400_000||!/^data:audio\/[a-z0-9;=., _"-]+;base64,[A-Za-z0-9+/=]+$/i.test(f.dataUrl)))throw error
      voices=input.voiceFiles.map((f,i)=>({...f,id:`legacy-voice-${i}`,unreadable:true}))
    }
    const at=new Date(Number.isFinite(input.updatedAt)?Math.min(input.updatedAt,this.now().getTime()):this.now().getTime()).toISOString()
    const turns=input.turns.filter(t=>t.text.trim()).map((t,i)=>({id:`${id}:user-${i}`,accountId,memberId,contextId:id,kind:'text',text:t.text,at,inputAt:Date.parse(at)+i,status:'completed',files:[],voices:[]}))
    if(files.documents.length||voices.length)turns.push({id:`${id}:media`,accountId,memberId,contextId:id,kind:files.documents.length?'image':'voice',text:'',at,inputAt:Date.parse(at)+turns.length,status:'completed',files:files.documents.map((f,i)=>({...f,lastModified:input.files[i]?.lastModified??0})),voices:voices.map((f,i)=>({...f,lastModified:input.voiceFiles[i]?.lastModified??0}))})
    if(!turns.length)return null
    let draftId
    if(input.draftId){try{const draft=await this.business.get(accountId,memberId,input.draftId);if(draft.raw===turns.map(t=>t.text).filter(Boolean).join('\n'))draftId=draft.id}catch{/* Keep originals even if the old review expired. */}}
    await accountTransaction(this.directory,async()=>this.store.update(data=>data.contexts.some(c=>c.id===id)?data:{...data,contexts:[...data.contexts,{id,accountId,memberId,updatedAt:at,createdAt:at,draftId,provisional:false,version:1,evidenceVersion:0,originalsVersion:files.documents.length||voices.length?1:0}],messages:[...data.messages,...turns]}))
    return this.snapshot(accountId,memberId,id)
  }
  async snapshot(accountId, memberId, contextId) {
    const data = await this.store.read()
    const context = data.contexts.find(c => c.id === contextId && c.accountId === accountId && c.memberId === memberId)
    if (!context || context.conversationDeletedAt) return null
    let review
    if (context.draftId) try { review = await this.business.read(accountId, memberId, context.draftId) } catch (error) { if (error.code !== 'AI_DRAFT_NOT_FOUND') throw error }
    if(context.semanticVersion===2&&review&&(context.decision?.organize===false&&context.decision.intent!=='interaction'||context.interview?.status!=='ready'||review.inputText!==factMessages(data.messages.filter(message=>message.contextId===contextId&&message.accountId===accountId&&message.memberId===memberId)).map(message=>message.text).filter(Boolean).join('\n')))review=undefined
    const candidateReady=['ready','saved'].includes(review?.state??'')&&review?.items.length>0&&review.frontEvidenceVersion===context.evidenceVersion
    const visibleUnderstanding=value=>value?.candidateFeedbackPending&&!candidateReady?{...value,reply:'内容已收到。'}:value
    const originalsSubjectConfirmed=context.subject?.confirmed===true&&(!(context.originalsVersion>0)||context.subject.confirmedBy==='user'&&context.subject.confirmation?.originalsVersion===context.originalsVersion)
    return { ...context, originalsSubjectConfirmed,understanding:visibleUnderstanding(context.understanding),accountId: undefined, memberId: undefined, review, messages: data.messages.filter(m => m.contextId === contextId && m.accountId === accountId && m.memberId === memberId).sort(messageOrder).map(({ accountId, memberId, digest, signature,mediaPreparation,sourceSignature,responseHistory,...m }) =>m.kind==='assistant'&&m.understanding?.candidateFeedbackPending&&!candidateReady?{...m,originalFileCount:m.originalFiles?.length??0,text:'内容已收到。',understanding:visibleUnderstanding(m.understanding)}:{...m,originalFileCount:m.originalFiles?.length??0}) }
  }
  async contextForMessage(accountId,memberId,id){
    await this.scope(accountId,memberId)
    const data=await this.store.read(),message=data.messages.find(m=>m.id===id&&m.accountId===accountId&&m.memberId===memberId&&m.acceptedInput===true)
    if(!message||data.contexts.find(c=>c.id===message.contextId)?.closedAt)return null
    return this.snapshot(accountId,memberId,message.contextId)
  }
  /** A conversation may contain several separately saved record intents.
   * Previous messages are display-only and never become the new draft's facts. */
  async conversation(accountId, memberId, contextId) {
    await this.scope(accountId,memberId)
    const data=await this.store.read()
    const requested=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId)
    if(!requested||requested.conversationDeletedAt)return null
    const root=conversationIdOf(requested)
    const group=data.contexts.filter(c=>c.accountId===accountId&&c.memberId===memberId&&conversationIdOf(c)===root)
    const active=latestConversationContext(group)??requested
    const snapshot=await this.snapshot(accountId,memberId,active.id)
    if(!snapshot)return null
    const previousIds=new Set(group.filter(c=>c.id!==active.id).map(c=>c.id))
    const pendingContexts=group.filter(c=>previousIds.has(c.id)&&!c.saved&&data.messages.some(m=>m.contextId===c.id&&m.understanding?.candidateFeedbackPending))
    const proofs=new Map(await Promise.all(pendingContexts.map(async c=>{const draft=c.draftId?await this.business.read(accountId,memberId,c.draftId).catch(()=>null):null;return [c.id,draft?.state==='ready'&&draft.items.length>0&&draft.frontEvidenceVersion===c.evidenceVersion]})))
    const previousMessages=data.messages.filter(m=>m.accountId===accountId&&m.memberId===memberId&&previousIds.has(m.contextId)&&m.status!=='discarded').sort(messageOrder).map(({accountId,memberId,digest,signature,mediaPreparation,sourceSignature,responseHistory,...message})=>proofs.has(message.contextId)&&!proofs.get(message.contextId)&&message.understanding?.candidateFeedbackPending?{...message,text:'内容已收到。',understanding:{...message.understanding,reply:'内容已收到。'}}:message)
    return {...snapshot,conversationId:root,previousMessages}
  }
  async resume(accountId,memberId,contextId) {
    await this.scope(accountId,memberId)
    if(this.inFlight.has(JSON.stringify([accountId,memberId])))throw fail('正在回应上一条消息，请稍后继续此对话',409,'FRONT_RECORD_BUSY')
    let selectedId
    await accountTransaction(this.directory,async()=>{
      await this.scope(accountId,memberId)
      await this.store.update(data=>{
        const requested=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId)
        if(!requested||requested.conversationDeletedAt)throw fail('未找到这次对话',404,'FRONT_RECORD_NOT_FOUND')
        const group=data.contexts.filter(c=>c.accountId===accountId&&c.memberId===memberId&&conversationIdOf(c)===conversationIdOf(requested))
        const selected=latestConversationContext(group)??requested
        selectedId=selected.id
        const at=this.now().toISOString()
        return {...data,contexts:data.contexts.map(c=>c.id===selected.id&&c.accountId===accountId&&c.memberId===memberId?{...c,closedAt:null,updatedAt:at}:c)}
      })
    })
    return this.conversation(accountId,memberId,selectedId)
  }
  async latest(accountId, memberId) {
    await this.scope(accountId, memberId)
    const data = await this.store.read()
    const scoped=data.contexts.filter(c=>c.accountId===accountId&&c.memberId===memberId&&!c.conversationDeletedAt)
    const parents=new Set(scoped.filter(c=>c.continuedFromId&&c.continuedFromId!==c.id).map(c=>c.continuedFromId))
    const context = scoped.filter(c => !parents.has(c.id)&&!c.closedAt&&data.messages.some(m=>m.contextId===c.id&&m.status!=='discarded')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0]
    return context ? this.conversation(accountId, memberId, context.id) : null
  }
  async history(accountId, memberId, { query = '', offset = 0 } = {}) {
    const member = await this.scope(accountId, memberId)
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || typeof query !== 'string' || query.length > 100) throw fail('对话查询条件无效', 422, 'FRONT_HISTORY_INVALID')
    const data = await this.store.read(), term = query.trim().toLocaleLowerCase()
    const savedRecords=this.business.records?.repository?await this.business.records.repository.findByAccountId(accountId):[]
    await this.scope(accountId, memberId)
    // One history row per conversation, even after several formal saves.
    const groups=new Map()
    for(const context of data.contexts.filter(c=>c.accountId===accountId&&c.memberId===memberId&&!c.conversationDeletedAt)){
      const root=conversationIdOf(context)
      if(!groups.has(root))groups.set(root,[])
      groups.get(root).push(context)
    }
    const items=[...groups.entries()].map(([root,contexts])=>{
      const ids=new Set(contexts.map(c=>c.id))
      const messages=data.messages.filter(m=>m.accountId===accountId&&m.memberId===memberId&&ids.has(m.contextId)&&m.status!=='discarded').sort(messageOrder)
      const first=messages.find(m=>m.kind!=='assistant')
      if(!first)return null
      const active=latestConversationContext(contexts)
      const currentMessages=messages.filter(m=>m.contextId===active.id&&!m.retracted)
      const recordText=active.cardEdit&&active.cardEdit.evidenceVersion===active.evidenceVersion?active.cardEdit.text:active.restoredRecord&&active.restoredRecord.evidenceVersion===active.evidenceVersion?active.restoredRecord.text:recordSectionsText(frontDeskRecordSections(active,currentMessages))
      const retracted=active.facts?.length&&!active.facts.some(f=>f.status==='active')
      const label=conversationTitle({recordText,texts:retracted?[]:currentMessages.filter(m=>m.kind!=='assistant').map(m=>m.text),fallback:retracted?'内容已撤回':first.kind==='image'?'图片与资料':first.kind==='voice'&&!first.text?'语音记录':'对话记录',excludeNames:[member.name]})
      if(term&&!label.title.toLocaleLowerCase().includes(term)&&!messages.some(m=>(m.text??'').toLocaleLowerCase().includes(term)||(m.files??[]).some(f=>f.name.toLocaleLowerCase().includes(term))))return null
      const recorded=contexts.some(context=>[...(context.saved?context.recordResult?.records??[]:[]),...(context.currentRecord?[context.currentRecord]:[])].some(ref=>savedRecords.some(record=>record.id===ref.recordId&&record.eventId===ref.eventId)))
      return {recorded,id:root,contextIds:[...ids],updatedAt:contexts.reduce((last,c)=>c.updatedAt>last?c.updatedAt:last,''),...label,preview:(messages.at(-1)?.text??'').slice(0,160),saved:Boolean(active?.saved||active?.currentRecord),closed:Boolean(active?.closedAt),messageCount:messages.length}
    }).filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id))
    const limit = 30
    return { items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit, nextOffset: offset + limit, deletedContextIds:data.contexts.filter(c=>c.accountId===accountId&&c.memberId===memberId&&c.conversationDeletedAt).map(c=>c.id) }
  }
  /** Remove a conversation from access, preserving saved-record source dependencies. */
  async deleteConversation(accountId,memberId,contextId) {
    await this.scope(accountId,memberId)
    let contextIds=[]
    await accountTransaction(this.directory,async()=>{
      await this.scope(accountId,memberId)
      if(this.inFlight.has(JSON.stringify([accountId,memberId])))throw fail('正在处理对话，请稍后再删除',409,'FRONT_RECORD_BUSY')
      await this.store.update(data=>{
        const selected=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId)
        if(!selected)throw fail('未找到这次对话',404,'FRONT_RECORD_NOT_FOUND')
        const root=conversationIdOf(selected)
        contextIds=data.contexts.filter(c=>c.accountId===accountId&&c.memberId===memberId&&conversationIdOf(c)===root).map(c=>c.id)
        const at=this.now().toISOString()
        return {...data,contexts:data.contexts.map(c=>c.accountId===accountId&&c.memberId===memberId&&contextIds.includes(c.id)?{...c,conversationDeletedAt:c.conversationDeletedAt??at,closedAt:c.closedAt??at}:c)}
      })
    })
    return {deleted:true,contextIds}
  }
  async discard(accountId,memberId,id){
    await this.scope(accountId,memberId)
    await this.store.update(data=>{const message=data.messages.find(m=>m.id===id&&m.accountId===accountId&&m.memberId===memberId);if(message?.status==='completed')throw fail('这条消息已经提交，请重试找回回复',409,'FRONT_RECORD_ALREADY_SUBMITTED');return {...data,messages:data.messages.map(m=>m===message?{...m,status:'discarded'}:m)}})
    return {removed:true}
  }
  async closeSession(accountId,memberId,contextIds){
    await this.scope(accountId,memberId)
    await accountTransaction(this.directory,async()=>{
      await this.scope(accountId,memberId)
      await this.store.update(data=>({...data,contexts:data.contexts.map(c=>c.accountId===accountId&&c.memberId===memberId&&!c.closedAt&&(!contextIds||contextIds.includes(c.id))?{...c,closedAt:this.now().toISOString()}:c)}))
    })
    const running=this.inFlight.get(JSON.stringify([accountId,memberId]));if(!contextIds||contextIds.includes(running?.contextId))running?.controller.abort()
    // Tombstone is committed before cancellation; no remote response is awaited.
    // End the resumable conversation only; formal records and originals stay intact.
    return {closed:true}
  }
  async closeMessages(accountId,memberId,ids){const data=await this.store.read();const contexts=[...new Set(data.messages.filter(m=>m.accountId===accountId&&m.memberId===memberId&&ids.includes(m.id)).map(m=>m.contextId))];return this.closeSession(accountId,memberId,contexts)}
  async continuous(accountId,memberId,contextId,input={}){
    if(input.action==='generate_current'){
      const card=await generateContinuousRecord(this,accountId,memberId,contextId,input)
      if(this.onGenerate)try{const job=await this.onGenerate(accountId,memberId,contextId,card.version);if(job)card.recognitionJob=job}catch{this.logger?.warn?.('[Hoooho front desk] generation organization deferred')}
      return card
    }
    if(input.action==='edit_current'){
      const card=await editContinuousRecord(this,accountId,memberId,contextId,input)
      // The edit is already durable. Failure to queue optional organization must
      // never turn that successful revision into a failed edit or lose its text.
      if(this.onManualEdit)try{card.recognitionJob=await this.onManualEdit(accountId,memberId,contextId,card.version)}catch{this.logger?.warn?.('[Hoooho front desk] organization deferred')}
      return card
    }
    return input.action==='generate_current'?generateContinuousRecord(this,accountId,memberId,contextId,input):input.action==='visit_checklist'?continuousChecklist(this,accountId,memberId,contextId,input):input.action==='save_current'?saveContinuousRecord(this,accountId,memberId,contextId,input):continuousCard(this,accountId,memberId,contextId)
  }
  async enrichContinuous(accountId,memberId,contextId){const context=await this.snapshot(accountId,memberId,contextId);if(context?.continuousRecord&&context.currentRecord)return enrichContinuousRecord(this,accountId,memberId,contextId)}
  async saveOriginal(accountId,memberId,contextId,input,signal){return saveFrontDeskOriginal({front:this,business:this.business,accountId,memberId,contextId,input,signal})}
  async confirmSubject(accountId,memberId,contextId,input){
    const member=await this.scope(accountId,memberId)
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw fail('请刷新后确认记录对象',409,'FRONT_CONTEXT_CHANGED')
    await accountTransaction(this.directory,async()=>{
      const data=await this.store.read(),context=data.contexts.find(c=>c.id===contextId&&c.accountId===accountId&&c.memberId===memberId&&!c.closedAt&&!c.saved)
      if(!context||context.version!==input.expectedVersion||this.inFlight.has(JSON.stringify([accountId,memberId])))throw fail('对话正在更新，请核对后确认',409,'FRONT_CONTEXT_CHANGED')
      if(!['unknown','current'].includes(context.subject?.kind??'unknown'))throw fail('内容属于其他人物，请切换到对应人物',409,'FRONT_SUBJECT_MISMATCH')
      if((context.facts??[]).some(f=>f.status==='active'&&(['other','multiple'].includes(f.subject?.kind)||f.subject?.memberId&&f.subject.memberId!==memberId))||data.messages.some(message=>message.contextId===contextId&&message.kind!=='assistant'&&message.status!=='discarded'&&(['other','multiple'].includes(message.subject?.kind)||message.subject?.memberId&&message.subject.memberId!==memberId)))throw fail('这次对话包含其他人物的内容，请分开核对',409,'FRONT_SUBJECT_MISMATCH')
      const subject={kind:'current',memberId,label:member.name,confirmed:true,confirmedBy:'user',confirmation:{contextId,contextVersion:context.version+1,originalsVersion:context.originalsVersion??0,memberId,at:this.now().toISOString()},sources:context.subject?.sources??[]}
      if(context.draftId){
        const draft=await this.business.get(accountId,memberId,context.draftId)
        if(draft.items.some(item=>['other','multiple'].includes(item.subject)))throw fail('资料包含其他人物，请分开核对',409,'FRONT_SUBJECT_MISMATCH')
        draft.frontSubject=subject
        for(const item of draft.items){
          if(item.subject==='current'&&item.subjectConfirmed===true&&(item.subjectMemberId??item.subjectResolution?.memberId)===memberId)continue
          const previousItem=structuredClone(item),verified=previousItem.subject==='unknown'&&!previousItem.unassigned&&!previousItem.needsReview&&!previousItem.revisionIssue&&validSemanticSummary(previousItem.professionalSummary,previousItem,{sources:draft.sources})
          item.subject='current';item.subjectConfirmed=true;item.subjectConfirmedBy='user';item.subjectMemberId=memberId;item.subjectResolution=subject
          if(verified)item.professionalSummary=rebindSemanticSummaryOwnership({previousItem,item,sources:draft.sources,confirmation:subject.confirmation,previousScope:{contextId,contextVersion:context.version,originalsVersion:context.originalsVersion??0,memberId},scope:{contextId,contextVersion:context.version+1,originalsVersion:context.originalsVersion??0,memberId}})
        }
        draft.version++;await this.business.write(draft)
      }
      await this.store.update(d=>({...d,contexts:d.contexts.map(c=>c.id===contextId?{...c,subject,updatedAt:this.now().toISOString(),version:c.version+1,facts:(c.facts??[]).map(f=>f.status==='active'&&['unknown','current'].includes(f.subject?.kind??'unknown')?{...f,subject}:f)}:c)}))
      // Ownership confirmation can make an already-saved attachment readable.
      // Enrich that same receipt atomically; never create a second record.
      if(context.continuousRecord){
        const generation=context.recordGeneration
        // Finish only the exact version the user already asked to organize and
        // save. New evidence or manual edits require a new explicit command.
        if(generation?.saveRequested&&generation.pendingSave==='subject'&&generation.evidenceVersion===(context.evidenceVersion??0)&&generation.editRevision===(context.editRevision??0))await saveContinuousRecord(this,accountId,memberId,contextId,{confirmed:true,expectedVersion:context.version+1})
        else if(context.currentRecord)await enrichContinuousRecord(this,accountId,memberId,contextId)
      }
    })
    return this.snapshot(accountId,memberId,contextId)
  }
  async checkpoint(accountId, memberId, contextId, input, guard) {
    await this.scope(accountId, memberId)
    const draft = await this.business.get(accountId, memberId, input.draftId)
    await this.store.update(data => {
      const context = data.contexts.find(c => c.id === contextId && c.accountId === accountId && c.memberId === memberId)
      guard?.()
      if (!context||context.closedAt) throw fail('未找到本次对话', 404, 'FRONT_RECORD_NOT_FOUND')
      // The original text must belong to this exact record intent.
      const scoped=data.messages.filter(message=>message.contextId===contextId&&message.accountId===accountId&&message.memberId===memberId)
      const raw = (context.semanticVersion===2&&!context.understanding?factMessages(scoped):scoped.filter(message=>message.kind!=='assistant'&&message.status==='completed')).sort(messageOrder).map(message=>message.text).filter(Boolean).join('\n')
      if (draft.frontEvidenceVersion != null ? draft.frontEvidenceVersion !== (context.evidenceVersion??0) : raw !== draft.raw) throw fail('整理内容已变化，请重新整理', 409, 'FRONT_RECORD_CHANGED')
      return {...data,contexts:data.contexts.map(c=>c===context?{...c,draftId:draft.id,saved:draft.state==='saved',recordResult:draft.result??c.recordResult,updatedAt:this.now().toISOString()}:c)}
    })
    return { saved: true }
  }
  async submit(accountId, memberId, input, signal, execution={}) {
    await this.scope(accountId, memberId)
    const stored=await this.store.read(),prior=stored.messages.find(message=>message.id===input.id&&message.accountId===accountId&&message.memberId===memberId)
    const target=stored.contexts.find(context=>context.id===(input.contextId??input.answerTo?.contextId)&&context.accountId===accountId&&context.memberId===memberId)
    if(target?.conversationDeletedAt||stored.contexts.find(c=>c.id===prior?.contextId)?.conversationDeletedAt)throw fail('这次对话已删除，请新建对话',410,'FRONT_CONVERSATION_DELETED')
    if(!execution.continuousRecord&&((prior?.protocolVersion??input.protocolVersion)===2||target?.semanticVersion===2&&!target.understanding))return this.legacySemantic.submit(accountId,memberId,{...input,protocolVersion:2},signal)
    const key = JSON.stringify([accountId, memberId]), digest = fingerprint(input), active = this.inFlight.get(key)
    if (active) { if (active.digest === digest) return active.promise; throw fail('正在回应上一条消息，内容已保留', 409, 'FRONT_RECORD_BUSY') }
    const controller=new AbortController(), combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal
    const promise = this.submitOnce(accountId, memberId, input, digest, combined,execution)
    this.inFlight.set(key, { digest, promise, controller })
    try { return await promise } finally { if (this.inFlight.get(key)?.promise === promise) this.inFlight.delete(key) }
  }
  async submitOnce(accountId, memberId, input, digest, signal,execution={}) {
    signal?.throwIfAborted()
    if (!/^[A-Za-z0-9:_-]{1,180}$/.test(input.id ?? '') || !['text', 'voice', 'image'].includes(input.kind) || typeof input.text !== 'string' || input.text.length > 5000 || !hasConversationInput(input)) throw fail('消息内容无效', 422, 'FRONT_RECORD_INVALID')
    if(!Array.isArray(input.files??[])||!Array.isArray(input.voiceFiles??[])||[...(input.files??[]),...(input.voiceFiles??[])].length>12)throw fail('原件最多12份',413,'FRONT_RECORD_MEDIA_LIMIT')
    const bytesFor=files=>files.reduce((n,f)=>n+Math.floor((f.dataUrl?.split(',')[1]?.length??0)*3/4),0)
    if(bytesFor([...(input.files??[]),...(input.voiceFiles??[])])>15*1024*1024)throw fail('原件总大小不能超过15 MB',413,'FRONT_RECORD_MEDIA_LIMIT')
    let data = await this.store.read()
    let message = data.messages.find(m => m.id === input.id && m.accountId === accountId && m.memberId === memberId)
    const newOriginals=!message&&[...input.files??[],...input.voiceFiles??[]].length>0
    const earlyEmergencyQuote=confirmedCurrentEmergencyQuote(input.text)
    if(input.contextId!==undefined&&!/^[A-Za-z0-9:_-]{1,180}$/.test(input.contextId??''))throw fail('对话归属无效',422,'FRONT_CONTEXT_INVALID')
    if(input.expectedContextVersion!==undefined&&(!Number.isSafeInteger(input.expectedContextVersion)||input.expectedContextVersion<1))throw fail('对话版本无效',422,'FRONT_CONTEXT_INVALID')
    if(input.presentedDraft!==undefined&&(!input.presentedDraft||!/^[A-Za-z0-9:_-]{1,180}$/.test(input.presentedDraft.id??'')||!Number.isSafeInteger(input.presentedDraft.version)||input.presentedDraft.version<1||Object.keys(input.presentedDraft).some(key=>!['id','version'].includes(key))))throw fail('已展示草稿版本无效',422,'FRONT_CONTEXT_INVALID')
    if(input.contextId&&input.answerTo&&input.contextId!==input.answerTo.contextId)throw fail('回答不属于当前对话',422,'FRONT_CONTEXT_INVALID')
    if(input.contextId){
      const owner=data.contexts.find(c=>c.id===input.contextId&&c.accountId===accountId&&c.memberId===memberId)
      if(!owner)throw fail('未找到这次对话',404,'FRONT_RECORD_NOT_FOUND')
      if(owner.closedAt&&!message)throw fail('这次对话已结束，请先继续此对话',409,'FRONT_RECORD_CLOSED')
    }
    const sourceSignature=fingerprint([...input.files??[],...input.voiceFiles??[]].map(file=>[String(file.mimeType??'').split(';')[0],file.dataUrl?.includes(';base64,')?createHash('sha256').update(Buffer.from(file.dataUrl.split(',')[1]??'','base64')).digest('hex'):file.dataUrl]))
    const retryMedia=input.retryMedia===true&&message?.mediaProblems?.length>0
    const retryTranscription=execution.retryTranscription===true&&message?.kind==='voice'&&message.text===''&&hasConversationInput({text:input.text})
    const knownPages=new Set((message?.mediaPreparation?.entries??[]).flatMap(entry=>(entry.pageResults??[]).filter(result=>result.status==='prepared').map(result=>`${result.page.id}:${result.page.page}`)))
    const prepared=earlyEmergencyQuote?{documents:[],pages:[],originalFiles:[...input.files??[],...input.voiceFiles??[]],entries:[],problems:[]}:await prepareFrontDeskMedia(input.files??[],{signal,cache:message?.mediaPreparation?.entries})
    let voices=[]
    try{voices=earlyEmergencyQuote?[]:prepareVoiceOriginals(input.voiceFiles ?? []).map(f => ({...f, lastModified: input.voiceFiles.find(source => source.dataUrl === f.dataUrl)?.lastModified ?? 0}))}
    catch(error){if(!execution.inputProblem)throw error;prepared.originalFiles.push(...input.voiceFiles??[])}
    if(message?.sourceSignature&&message.sourceSignature!==sourceSignature)throw fail('消息原件已变化，请用新消息提交',409,'FRONT_RECORD_ID_CONFLICT')
    // Validate containers first, then compare actual sources. Codec declaration
    // formatting and converted HEIC preview headers may change on restoration;
    // identical bytes still belong to the same immutable input operation.
    const signature=messageSignature(input.kind,input.text,prepared.documents,voices,input.answerTo,input.contextId,input.presentedDraft,input.expectedContextVersion)
    const expectedSignature=message&&(message.signature??messageSignature(message.kind,message.text,message.files,message.voices,message.answerTo,message.targetContextId,message.presentedDraft,message.expectedContextVersion))
    const checkedSignature=retryMedia||retryTranscription?messageSignature(input.kind,retryTranscription?message.text:input.text,message.files,voices,input.answerTo,input.contextId,input.presentedDraft,input.expectedContextVersion):signature
    if(message&&expectedSignature!==checkedSignature)throw fail('消息标识已使用，请重试原消息',409,'FRONT_RECORD_ID_CONFLICT')
    if(message&&(message.status==='discarded'||data.contexts.find(c=>c.id===message.contextId)?.closedAt))throw fail('这次对话已结束',409,'FRONT_RECORD_CLOSED')
    if(message?.status==='completed'&&!retryMedia&&!retryTranscription)return {context:await this.snapshot(accountId,memberId,message.contextId),messageId:message.id,replyId:`${message.id}:reply`}
    let answerQuestion
    if(!message&&input.answerTo!==undefined){
      const target=input.answerTo
      if(!target||typeof target.contextId!=='string'||typeof target.questionId!=='string')throw fail('问题归属无效',422,'FRONT_ANSWER_INVALID')
      const owner=data.contexts.find(c=>c.id===target.contextId&&c.accountId===accountId&&c.memberId===memberId&&!c.saved&&!c.closedAt)
      if(!owner||owner.interview?.status!=='asking'||owner.interview.question?.id!==target.questionId)throw fail('这个问题已有更新，请查看最新记录后继续',409,'FRONT_ANSWER_STALE')
      answerQuestion={...owner.interview.question,domain:owner.interview.domain,knowledgeVersion:owner.interview.version}
    }
    if (!message) {
      const at = this.now().toISOString(), contextId = randomUUID()
      const selected=execution.continuousRecord?await this.scope(accountId,memberId):null
      const inputAt=Number.isFinite(input.inputAt)?Math.min(input.inputAt,this.now().getTime()):this.now().getTime()
      message = { id: input.id, accountId, memberId, kind: input.kind, text: input.text.trim(), inputAt,acceptedInput:true,inputAcceptedAt:at,protocolVersion:input.protocolVersion??3,transcriptVerified:execution.transcriptionVerified===true,files: prepared.documents, originalFiles:prepared.originalFiles,mediaPreparation:{entries:prepared.entries},mediaProblems:prepared.problems,sourceSignature,voices, contextId, at, status: 'pending', digest,signature,...(input.contextId?{targetContextId:input.contextId}:{}),...(input.answerTo?{answerTo:input.answerTo,answerQuestion}: {}),...(input.presentedDraft?{presentedDraft:structuredClone(input.presentedDraft)}:{}),...(input.expectedContextVersion!==undefined?{expectedContextVersion:input.expectedContextVersion}:{}) }
      await accountTransaction(this.directory, async () => {
        await this.scope(accountId,memberId)
        await this.store.update(d => {signal?.throwIfAborted();return ({ ...d, contexts: [...d.contexts, { id: contextId, accountId, memberId,...(selected?{continuousRecord:true,version:1,evidenceVersion:0,firstDescribedAt:new Date(inputAt).toISOString(),subject:{kind:'current',memberId,label:selected.name,confirmed:true,confirmedBy:'selection',sources:[]}}:{}),updatedAt:at,createdAt:at,originalsVersion:newOriginals?1:0,provisional: true }], messages: [...d.messages, message] }) })
      })
    }
    if((retryMedia||retryTranscription||message.status==='failed')&&message){
      const oldReply=data.messages.find(m=>m.id===`${message.id}:reply`&&m.accountId===accountId&&m.memberId===memberId)
      message={...message,...(retryTranscription?{text:input.text.trim(),transcriptVerified:execution.transcriptionVerified===true,revision:(message.revision??1)+1,retranscribedAt:this.now().toISOString(),responseHistory:[...(message.responseHistory??[]),...(oldReply?[oldReply]:[])]}:{}),files:prepared.documents,originalFiles:prepared.originalFiles,mediaPreparation:{entries:prepared.entries},mediaProblems:prepared.problems,sourceSignature,status:'pending',signature}
      await this.store.update(data=>({...data,messages:data.messages.map(m=>m.id===message.id&&m.accountId===accountId&&m.memberId===memberId?message:m)}))
    }
    const provisionalId = message.contextId
    if(execution.continuousRecord&&execution.onAccepted)await execution.onAccepted({context:await this.snapshot(accountId,memberId,message.targetContextId??provisionalId),messageId:message.id,replyId:`${message.id}:reply`})
    try {
      if(execution.inputProblem)throw fail(execution.inputProblem.message,422,execution.inputProblem.code)
      const visionPages=retryMedia?prepared.pages.filter(page=>!knownPages.has(`${page.id}:${page.page}`)):prepared.pages
      if(retryMedia&&!retryTranscription&&!visionPages.length){
        await this.store.update(d=>({ ...d,contexts:d.contexts.map(c=>c.id===provisionalId?{...c,mediaProblems:prepared.problems}:c),messages:d.messages.map(m=>m.id===message.id?{...m,status:'completed'}:m)}))
        return {context:await this.snapshot(accountId,memberId,provisionalId),messageId:message.id,replyId:`${message.id}:reply`}
      }
      if(!prepared.pages.length&&prepared.problems.length&&!hasConversationInput({text:message.text})){
        const at=this.now().toISOString(),reply=prepared.problems.map(problem=>problem.name+'：'+problem.message).join('\n')
        await this.store.update(d=>{signal?.throwIfAborted();return {...d,contexts:d.contexts.map(c=>c.id===provisionalId?{...c,provisional:false,version:(c.version??0)+1,evidenceVersion:c.evidenceVersion??0,updatedAt:at,resultKind:'conversation',mediaProblems:prepared.problems}:c),messages:[...d.messages.filter(m=>m.id!==`${message.id}:reply`).map(m=>m.id===message.id?{...m,status:'completed',recordEligible:false}:m),{id:`${message.id}:reply`,accountId,memberId,contextId:provisionalId,kind:'assistant',text:reply,at,inputAt:message.inputAt+.1,status:'completed',resultKind:'conversation'}]}})
        return {context:await this.snapshot(accountId,memberId,provisionalId),messageId:message.id,replyId:`${message.id}:reply`}
      }
      data = await this.store.read()
      const all = data.contexts.filter(c => c.accountId === accountId && c.memberId === memberId && !c.provisional && !c.closedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      const terms=[...new Set((message.text.match(/[\u4e00-\u9fff]{2,}/g)??[]).flatMap(word=>Array.from({length:word.length-1},(_,i)=>word.slice(i,i+2))))].filter(t=>!['之前','刚才','继续','整理','内容','帮我','上次','一下'].includes(t))
      const relevant=all.map(c=>({c,score:terms.filter(term=>data.messages.some(m=>m.contextId===c.id&&(m.text.includes(term)||(m.files??[]).some(f=>f.name.includes(term))))).length})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(item=>item.c)
      const candidates=[...new Map([...all.slice(0,5),...relevant,...(message.answerTo?all.filter(c=>c.id===message.answerTo.contextId):[]),...(message.targetContextId?all.filter(c=>c.id===message.targetContextId):[])].map(c=>[c.id,c])).values()]
      const history = candidates.map(c => ({ id: c.id, saved:!!c.saved, updatedAt: c.updatedAt, interview:c.interview??null, turns: data.messages.filter(m => m.contextId === c.id && m.status === 'completed').sort(messageOrder).slice(-6).map(m => ({ role: m.kind === 'assistant' ? 'assistant' : 'user', kind:m.kind, text: m.text.slice(0, 700),recordable:m.recordable,semanticSubject:m.semanticSubject,subjectResolvedBy:m.subjectResolvedBy,files:(m.files??[]).map(f=>({name:f.name,mimeType:f.mimeType})),voices:(m.voices??[]).map(f=>({name:f.name,mimeType:f.mimeType})) })) }))
      const memberContext=nursingMemberContext(await this.scope(accountId,memberId),this.now())
      const relatedContext=typeof this.business.context==='function'?await this.business.context(accountId,memberId,message.text):{}
      const nursingKnowledge=[{contextId:'new',...nursingKnowledgeFor(message.text,memberContext)},...candidates.filter(c=>!c.saved).slice(0,5).map(c=>({contextId:c.id,...nursingKnowledgeFor([...factMessages(data.messages.filter(m=>m.contextId===c.id)).sort(messageOrder).map(m=>m.text),message.text].join('\n'),memberContext)}))]
      const questionIds=[...new Set(nursingKnowledge.flatMap(k=>k.nodes.map(n=>n.id)))]
      const sourceMessages=data.messages.filter(m=>candidates.some(c=>c.id===m.contextId)&&m.status==='completed')
      const activeContextId=message.targetContextId??message.answerTo?.contextId??candidates[0]?.id
      const activeContext=candidates.find(c=>c.id===activeContextId)
      const continuousRecord=execution.continuousRecord===true||activeContext?.continuousRecord===true
      const turnContext=frontDeskUnderstandingContext({contexts:candidates,messages:sourceMessages,latestMessage:message,activeContextId})
      if(continuousRecord)turnContext.effectiveQuestion=frontDeskAnswerQuestion(turnContext.effectiveQuestion,message)
      let candidateReview
      if(activeContext?.draftId)candidateReview=await this.business.read(accountId,memberId,activeContext.draftId).catch(()=>null)
      const selectedMember=await this.scope(accountId,memberId)
      const ownedMembers=await this.events.members.findByAccountId(accountId)
      const explicitSubjects=frontDeskSubjectConfirmations({member:selectedMember,members:ownedMembers,message})
      const subjectEstablished=continuousRecord||activeContext?.subject?.confirmed===true||explicitSubjects.length>0
      const recordTargets=this.business.records?.getOwnedRecord&&this.business.events?.get?await accessibleFrontDeskTargets({business:this.business,accountId,memberId,contexts:candidates}):[]

      const continuousCandidate=continuousRecord&&activeContext&&message.presentedDraft?.id===activeContext.id&&message.presentedDraft.version===activeContext.version?{id:activeContext.id,version:activeContext.version,contextId:activeContext.id,ready:true,subjectConfirmed:activeContext.subject?.kind==='current'&&activeContext.subject.confirmed===true,itemIds:['current']}:null
      const directRequest=directFrontDeskSaveRequest({message,presentedDraft:message.presentedDraft,pendingSaveConfirmation:activeContext?.pendingSaveConfirmation,selectedMemberSubject:continuousRecord?{memberId,label:selectedMember.name,aliases:selectedMember.relationship==='child'?['孩子','宝宝','宝贝','患儿','小孩']:selectedMember.isSelf?['我','本人','我自己']:[]}:null})
      const directPrevious=activeContext?.pendingSaveConfirmation&&turnContext.effectiveQuestion?.messageId===activeContext.pendingSaveConfirmation.questionMessageId?{...activeContext.pendingSaveConfirmation,kind:'save_confirmation',messageId:activeContext.pendingSaveConfirmation.questionMessageId,contextId:activeContext.id,contextVersion:activeContext.version}:null
      const directPlan=directRequest?planFrontDeskAction({message,requestedAction:directRequest,contextId:activeContextId,contextVersion:activeContext?.version,expectedContextVersion:message.expectedContextVersion,presentedDraft:message.presentedDraft,previousQuestion:directPrevious,candidate:continuousCandidate??(candidateReview?{id:candidateReview.id,version:candidateReview.version,contextId:activeContextId,ready:candidateReview.state==='ready',subjectConfirmed:candidateReview.items.every(item=>item.subjectConfirmed===true&&!item.needsReview&&!item.unassigned),itemIds:candidateReview.items.map(item=>item.id)}:null),receipts:activeContext?.operationReceipts??[]}):null
      const schema = frontDeskUnderstandingSchema({contextIds:candidates.map(c=>c.id),questionIds})
      if(continuousRecord){schema.properties.subject.properties.kind.description='当前记录对象由selectedMember确定；无明确其他人物时用current，不重复询问归属。明确其他人物仍用other/multiple。';schema.properties.nextQuestion.anyOf[1].properties.text.description+='发生时间未说明时程序使用首次描述时间，不追问默认人物。仅当起病经过对当前记录有实际价值且尚未提供时，简短询问开始或变化时间。'}
      let content = [{ type: 'input_text', text: JSON.stringify({history:history.map(c=>({...c,turns:c.turns.slice(-4)})),memberContext:subjectEstablished?memberContext:null,selectedMember:{id:memberId,...(continuousRecord?{recordingSubjectConfirmed:true}:{}),...(subjectEstablished?{name:selectedMember.name}:{scope:'UI selection; factual subject unknown'})},conversation:{...turnContext,sources:turnContext.sources.filter(s=>s.contextId===activeContextId||s.messageId===message.id),facts:turnContext.facts.filter(f=>f.contextId===activeContextId||f.status==='active').slice(-30)},recordTargets:recordTargets.map(target=>({id:target.id,version:target.version,contextId:target.contextId,category:target.category,text:target.record.content.slice(0,700),occurredAt:target.record.journal?.timePrecision==='unknown'?null:target.record.occurredAt})),candidate:continuousCandidate??(candidateReview?{id:candidateReview.id,version:candidateReview.version,state:candidateReview.state,itemIds:candidateReview.items.map(i=>i.id)}:null),existingContext:relatedContext.existingContext??[],nursingKnowledge:subjectEstablished?nursingKnowledge.filter(k=>k.contextId==='new'||k.contextId===activeContextId):[],latest:{id:message.id,text:message.text,kind:message.kind,answerTo:message.answerTo,answerQuestion:message.answerQuestion,transcriptionRetry:Boolean(message.retranscribedAt),attachments:[...message.files??[],...message.voices??[]].map(file=>({id:file.id,name:file.name,mimeType:file.mimeType}))} }) }]
      if (visionPages.length) {
        // A real contact sheet respects the configured one-image request limit.
        content[0].text=JSON.stringify({...JSON.parse(content[0].text),imagePages:visionPages.map(page=>({attachmentId:page.id,page:page.page,name:page.name})),retryOnlyFailed:retryMedia})
        const cells = await Promise.all(visionPages.map(async p => {
          const image = p.imageDataUrl??(p.mimeType === 'application/pdf' ? await pdfPageImage(p.dataUrl, signal) : p.dataUrl)
          signal?.throwIfAborted()
          return sharp(Buffer.from(image.split(',')[1], 'base64')).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
        }))
        const height = cells.reduce((n, c) => n + c.info.height, 0)
        let top = 0
        const image = await sharp({ create: { width: 1000, height, channels: 3, background: '#ffffff' } }).composite(cells.map(c => { const placement = { input: c.data, top, left: 0 }; top += c.info.height; return placement })).resize({ width: 1600, height: 4000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
        content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${image.toString('base64')}` })
      }
      const model = this.model ??= new BusinessModel({ ...this.options, provider: createDialogueProvider(this.options) })
      const uploadInstructions=continuousRecord&&visionPages.length?' 本轮新上传的图片是独立资料输入，不因上一轮症状问题而假定它在回答该问题。若为单据，首轮reply直接按单据类型、明确日期、可读项目/数值/金额组织简短分行预览，并将可靠内容保留为带真实附件来源的recordChanges；读不清的字段标为待核对。收费、预约、检查申请单只代表列出的项目，不表示检查已完成或已有结果，不能推断诊断、结果阴阳性或编造数值。单据出现的人物与当前成员不符时保持other/unknown，不把成人资料归到孩子。首轮先说明读到了什么，不套用上一事项的症状问卷，不索取缺省发生时间，不声称已保存；是否生成记录单由程序单独询问。普通症状照片仍只描述可靠所见并按必要性追问。':''
      let { value, diagnostics } = earlyEmergencyQuote?{value:{reply:'这条描述中有需要尽快由专业人员评估的异常，请先就医或寻求急救帮助。原话已保留，先不用继续回答普通记录问题。',contextId:activeContextId??'new',responseMode:'consultation',taskRelation:activeContextId?'continue':'new',subject:{kind:'unknown',memberId:null,label:null,sources:[]},recordChanges:[],nextQuestion:null,requestedAction:{type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''},uncertainties:[],emergency:{currentChild:true,quote:earlyEmergencyQuote}},diagnostics:{provider:'policy',task:'front-desk-emergency',model:null}}:directPlan&&['save','readback'].includes(directPlan.type)?{value:{reply:'正在保存这条记录。',contextId:activeContextId,responseMode:'operation',taskRelation:'continue',subject:activeContext.subject,recordChanges:[],nextQuestion:null,requestedAction:directRequest,uncertainties:[],emergency:{currentChild:false,quote:''}},diagnostics:{provider:'operation',task:'front-desk-action',model:null}}:await withAIAccount(accountId, () => model.structured({task:'front-desk-dialogue',schema,signal,vision:visionPages.length>0,input:[{role:'user',content}],instructions:frontDeskUnderstandingPolicy+(continuousRecord?' 当前前台的记录对象已由用户顶部选择selectedMember确定；未明确涉及其他人时以该对象承接，不再询问是谁。明确涉及其他人、多人仍保持other/multiple。基于已完成的输入，简短回应具体已理解的情况，不机械重复“收到”，随后最多问一个知识库支持的必要问题。按实际任务：症状观察、实际用药、日常、回顾过去就医或资料解释分别承接，不把所有事项套入症状问卷；不默认接下来要就医。发生时间缺失时首次消息时间仅用于排序，不作为用户明确起病时间。优先获取这件事关键的具体信息：表现、测量数值、部位、程度、发生变化和已做处理；按当前情况选必要缺口，不逐项填问卷。数值问题直接让用户填或说数值，不先问量过没有；不复述整段已知信息。用户已说精神和平时一样时，不得用“这种变化”指代它再追问，应明确指向实际症状。仅在当前任务确实需要且用户未说明时询问开始/变化时间；有明确相对时间正常提取。后续回答、补充、更正属于当前事项时继续同一contextId，只有真实切换事项才new/switch。不要主动提出开启或持续跟进。内部事实提取不需要征求同意；展示记录单前由程序单独询问并取得用户确认，不能提前声称已生成或已保存；不要输出整理中、待整理、原话已保留或处理失败的推测。事实足够就不问。手动记录单修订是有效来源，后续只更改用户明确改变的字段。 对知识库候选问题先将target与已经提供的事实、否定和未知逐项比对：目标已知或用户已明确不知道时不能再选该目标，换一种措辞也算重复。知识库不是待办问卷，不为补齐可选项目继续提问；当前任务信息足够时nextQuestion=null。实际已执行的用药、摄入、睡眠和就医都是scope=record；药名、剂量等可选属性未知仍分别保留unknown，不把已发生事件降为context。用户明确另记独立事项时必须新contextId=new、taskRelation=switch，不得用side_topic把新事件放入旧事项背景；新事项只针对自身决定是否追问，不催答旧事项的问题。side_topic只用于无新发生事实的插话。复述保持原有程度：还能做某动作不等于正常、完全没问题；未知和未观察不得转成阴性。':'' )+' 你是Hoooho的AI护士前台，不冒充真人。自然简练，先回答具体问题，普通每轮最多一个主要问题；无必要可以不问。咨询说明已知与不确定、资料含义和就医准备，不做个体化居家观察、免就医或免检查分流，不以可活动排除损伤或判定无碍。纯知识/资料解释不转为本人的病情，也不为未请求的归档索要身份。nursingKnowledge只作已有健康事项的观察参考，不限定对话主线或事实主体，不强制选题。memberContext只在事实主体已由来源确认时适用。不要把只有情绪符号、问候或生活交流拉进症状问卷。实际需要用户回答的主要问题须与nextQuestion.text一致，同一问题只说一次。已有题库无问题不表示内容已经整理。recordChanges.text使用原话事实，sources必须使用latest.id或conversation.sources给出的真实messageId；附件使用给定attachmentId。多个主体/事项分别提出记录变化，当前成员只是界面选择。对于照片先提供1至2项可靠所见，身份不明不阻止临时读图。历史摘要只作背景，不能作为新事实来源。更正撤回使用conversation.facts中的factId。无新事实时recordChanges=[]；旧候选仍在，不必重写。无实时检索工具时如实说明无法查询当前医院预约，不虚构查到。用户请求操作时仅requestedAction表达准确candidate或recordTargets的id/version和原话授权，reply不能提前声称完成。保存、删除、导出都以程序真实回执为准。非事实插话可以沿用当前contextId且taskRelation=side_topic，不强行新建事项。每轮输出前核对：首次输入健康资料也必须add临时事实，不能把reply中的整理预览当成已生成候选；暂不保存只限制正式写入，不限制临时提取。相反极性的分句分别提取。更正只引用最新更正句，由程序承接未被改变的旧字段。短答不扩写进text。严格按给定JSONSchema返回一个对象，不附带Markdown或数组包装。'+(continuousRecord?'最后核对本轮规则：对象已由用户选定，不问对象；不为补齐可选栏位追问时间；记录对象不是说话者，不把家长叙述改成孩子说；无正式保存回执不能说已补充记录、已记录或已保存，只可在事实更正时简短说明当前记录单的具体改动。':'')+uploadInstructions+JSON.stringify(schema)}))
      const legacy=value?.responseMode===undefined&&value?.recordChanges===undefined
      // Old providers may predate the action/receipt contract. Quarantine their
      // unsafe acknowledgement; ordinary validated v2 replies are never replaced.
      if(legacy&&typeof value?.reply==='string'&&/已(?:经)?(?:为[你您]|帮[你您]|替[你您])?(?:记录|保存)|(?:记录|保存)好了?|记下(?:来)?了/.test(value.reply))value={...value,reply:'嗯，我了解了。'}
      if(legacy&&typeof value?.reply==='string'&&/建议用药|建议服用|应当服用|每次.{0,8}(?:毫克|毫升|mg|ml)/iu.test(value.reply))value={...value,reply:'这部分还不能根据现有资料确认，可以继续说实际观察到的情况。'}
      if(legacy&&message.targetContextId)value={...value,contextId:message.targetContextId}
      if(legacy&&message.answerTo)value={...value,contextId:message.answerTo.contextId}
      if(!legacy&&!earlyEmergencyQuote)assertFrontDeskReplySafety({reply:value.reply,messages:[...sourceMessages,message],responseMode:value.responseMode})
      const confirmedSubjects=[...turnContext.facts.map(f=>f.subject).filter(s=>s?.confirmed),...(activeContext?.subject?.confirmed?[activeContext.subject]:[]),...explicitSubjects]
      const understanding=normalizeFrontDeskUnderstanding(value,{latestMessage:message,messages:sourceMessages,contexts:candidates,contextIds:candidates.map(c=>c.id),activeContextId,activeContextVersion:activeContext?.version,allowDeferredCandidateFeedback:execution.deferCandidateFeedback===true,candidateReceipt:candidateReview?{contextId:activeContextId,state:candidateReview.state,itemCount:candidateReview.items.length,evidenceVersion:candidateReview.frontEvidenceVersion,contextEvidenceVersion:activeContext?.evidenceVersion}:null,subjectMembers:ownedMembers,questionIds,facts:turnContext.facts,confirmedSubjects,effectiveQuestion:turnContext.effectiveQuestion,pendingSaveConfirmation:activeContext?.pendingSaveConfirmation,selectedMemberSubject:continuousRecord?{memberId,label:selectedMember.name,aliases:selectedMember.relationship==='child'?['孩子','宝宝','宝贝','患儿','小孩']:selectedMember.isSelf?['我','本人','我自己']:[]}:null})
      value=understanding
      // Supplier acknowledgements cannot claim an unconfirmed formal save.
      let acknowledged=value.reply
      // Read-back can select saved history; new facts always get a fresh intent
      // when the selected history has already been formally saved.
      const selected=candidates.find(c=>c.id===value.contextId)
      const existing=selected?data.messages.filter(m=>m.contextId===selected.id&&m.kind!=='assistant'):[]
      const full=[...existing.filter(m=>m.status==='completed').map(m=>m.text),message.text].join('\n').length>5000||existing.reduce((n,m)=>n+(m.files?.length??0)+(m.voices?.length??0),0)+prepared.documents.length+voices.length>12||bytesFor(existing.flatMap(m=>[...m.files??[],...m.voices??[]]))+bytesFor([...prepared.documents,...voices])>15*1024*1024
      if(full&&message.answerTo)throw fail('当前记录内容已满，请先保存已有记录。这个回答已保留，可稍后继续补充。',422,'FRONT_ANSWER_CONTEXT_FULL')
      const contextId = value.contextId === 'new'||(selected?.saved&&(value.recordChanges.length||value.recordChangesPending))||(full&&value.action==='record') ? provisionalId : value.contextId, at = this.now().toISOString()
      const guidance=continuousRecord&&!legacy?guideFrontDeskReply(value,{previous:selected?.interview,messages:existing,latest:message,effectiveQuestion:turnContext.effectiveQuestion?.contextId===contextId?turnContext.effectiveQuestion:null,knowledge:nursingKnowledge.flatMap(k=>k.nodes??[])}):null
      if(guidance){value.nextQuestion=guidance.question;value.questionId=guidance.question?.id??null;value.reply=guidance.reply;acknowledged=guidance.reply}
      const interpreted=message.answerTo?interpretNursingAnswer(message.answerTo.questionId,message.text):null
      const observedEmergency=(message.answerTo?.questionId==='resp-effort'&&(interpreted?.polarity==='yes'||message.text==='家长现在看到孩子呼吸明显费力。'))||confirmedCurrentEmergency(value.emergency,{text:message.text})
      if(observedEmergency){understanding.nextQuestion=null;understanding.questionId=null}
      const interview=observedEmergency?{status:'urgent',question:null,domain:selected?.interview?.domain??null}:legacy?(value.action==='record'?nursingInterview({text:[...(contextId===selected?.id?existing:[]).filter(m=>m.status==='completed').sort(messageOrder).map(m=>m.text),message.text].filter(Boolean).join('\n'),latestText:message.text,previous:contextId===selected?.id?selected.interview:null,requestedQuestionId:value.questionId,member:memberContext,urgent:false}):selected?.interview):guidance?.interview??{version:value.version,status:value.nextQuestion?'asking':'ready',question:value.nextQuestion?{...value.nextQuestion,options:[],sourceIds:[]}:null,domain:value.responseMode==='record'?'record':null,stopReason:value.nextQuestion?null:'no_necessary_question'}
      const reply=observedEmergency?(continuousRecord?'这条描述中有需要尽快由专业人员评估的异常，请先就医或寻求急救帮助，先不用继续回答普通记录问题。':'这条描述中有需要尽快由专业人员评估的异常，请先就医或寻求急救帮助。原话已保留，先不用继续回答普通记录问题。'):legacy&&interview?.question&&!/[?？]/u.test(acknowledged)?`${acknowledged}${interview.question.text}`:acknowledged
      const oldFacts=contextId===selected?.id?selected.facts??[]:[]
      const subjectClarification=Boolean(turnContext.effectiveQuestion&&/(?:subject|member|person|identity|归属|对象)/iu.test(turnContext.effectiveQuestion.target))||/(?:这(?:条|份|张|个)?(?:记录|资料|报告|情况)?|刚才(?:说的)?|前面(?:说的)?|说的|对象)的?\s*(?:是|属于|记给)|(?:^|[，,。；;])\s*(?:说的|对象)?(?:是|记给)/u.test(message.text)
      const subjectRefined=subjectClarification&&!legacy&&!selected?.saved&&oldFacts.filter(f=>f.status==='active').length===1&&value.subject.sources.length>0&&value.subject.kind!=='unknown'&&value.subject.kind!=='multiple'&&(value.subject.kind!==selected?.subject?.kind||value.subject.memberId!==selected?.subject?.memberId||value.subject.confirmed!==selected?.subject?.confirmed)
      const changed=value.recordChanges.some(change=>change.scope!=='context')||value.recordChangesPending||subjectRefined
      const resultKind=changed?'candidates':value.action==='history'?'no_change':'conversation'
      const contextQuestion=!legacy&&value.taskRelation==='continue'&&turnContext.effectiveQuestion?.contextId===contextId&&turnContext.effectiveQuestion.target!=='unresolved'?turnContext.effectiveQuestion:null
      const parent=selected??activeContext
      let facts=applyFrontDeskRecordChanges(oldFacts,value.recordChanges,{messageId:message.id,contextId})
      if(subjectRefined)facts=facts.map(f=>f.status==='active'?{...f,subject:value.subject}:f)
      const actionContext=contextId===selected?.id?selected:null
      const actionDraft=actionContext?.draftId&&(value.requestedAction.type!=='none'||value.nextQuestion?.target==='save_confirmation')?await this.business.read(accountId,memberId,actionContext.draftId).catch(()=>null):null
      const candidate=continuousCandidate??(actionDraft?{id:actionDraft.id,version:actionDraft.version,contextId,ready:actionDraft.state==='ready',saved:actionDraft.state==='saved',itemIds:actionDraft.items.map(item=>item.id),subjectConfirmed:actionDraft.items.length>0?actionDraft.items.every(item=>item.subjectConfirmed===true&&!item.needsReview&&!item.unassigned):actionContext.subject?.kind==='current'&&actionContext.subject?.memberId===memberId&&actionContext.subject?.confirmed===true,originals:{text:actionDraft.inputText??actionDraft.raw??'',messageIds:existing.filter(m=>m.status==='completed').map(m=>m.id),attachments:existing.filter(m=>m.status==='completed').flatMap(m=>[...m.files??[],...m.voices??[]]).map(file=>({id:file.id,retained:true}))}}:null)
      const freshRecordTargets=recordTargets.length?await accessibleFrontDeskTargets({business:this.business,accountId,memberId,contexts:candidates}):[]
      const pending=actionContext?.pendingSaveConfirmation
      const previousQuestion=pending&&turnContext.effectiveQuestion?.messageId===pending.questionMessageId?{...pending,kind:'save_confirmation',messageId:pending.questionMessageId,contextId,contextVersion:actionContext.version}:null
      const receipts=actionContext?.operationReceipts??[]
      const pendingSaveConfirmation=value.nextQuestion?.target==='save_confirmation'&&candidate&&message.presentedDraft?.id===candidate.id&&message.presentedDraft.version===candidate.version&&!changed&&candidate.itemIds.length===1?{targetId:candidate.id,targetVersion:candidate.version,questionMessageId:`${message.id}:reply`,contextVersion:(actionContext?.version??0)+1}:null
      let actionPlan={...planFrontDeskAction({message,requestedAction:value.requestedAction,contextId,contextVersion:actionContext?.version,expectedContextVersion:message.expectedContextVersion,candidate,presentedDraft:message.presentedDraft,previousQuestion,receipts,targets:[...(candidate?[{id:candidate.id,version:candidate.version,contextId,subjectConfirmed:candidate.subjectConfirmed}]:[]),...freshRecordTargets]}),targetKind:freshRecordTargets.some(target=>value.requestedAction.targetIds.includes(target.id))?'record':'draft',executionContextVersion:(actionContext?.version??0)+1}
      if(changed&&['save','save_original','export','update','delete'].includes(actionPlan.type))actionPlan={contextId,expectedContextVersion:message.expectedContextVersion??null,executionContextVersion:actionPlan.executionContextVersion,sourceMessageId:message.id,type:'clarify',reason:'evidence_changed_in_turn'}
      if(newOriginals&&([...(input.files??[])].length||[...(input.voiceFiles??[])].length&&!message.transcriptVerified)&&['save','save_original'].includes(actionPlan.type))actionPlan={contextId,expectedContextVersion:message.expectedContextVersion??null,executionContextVersion:actionPlan.executionContextVersion,sourceMessageId:message.id,type:'clarify',reason:'media_added_in_turn'}
      await accountTransaction(this.directory, async () => {
        await this.scope(accountId,memberId)
        await this.store.update(d => {
          signal?.throwIfAborted()
          const original=d.messages.find(m=>m.id===message.id&&m.accountId===accountId&&m.memberId===memberId)
          if(!original||original.status==='discarded'||d.contexts.find(c=>c.id===original.contextId)?.closedAt||d.contexts.find(c=>c.id===contextId)?.closedAt)throw fail('这次对话已结束',409,'FRONT_RECORD_CLOSED')
          if(continuousRecord&&d.contexts.find(c=>c.id===contextId)?.version!==(selected?.version??data.contexts.find(c=>c.id===contextId)?.version))throw fail('记录单已修改，本轮旧结果未覆盖新内容',409,'FRONT_CONTEXT_CHANGED')
          if(continuousRecord&&contextId!==provisionalId&&d.contexts.find(c=>c.id===provisionalId)?.currentRecord)throw fail('原话记录已保存，旧回复未改变其归属',409,'FRONT_CONTEXT_CHANGED')
          if(actionPlan.type!=='none'&&actionPlan.type!=='clarify'&&d.contexts.find(c=>c.id===contextId)?.version!==actionContext?.version)throw fail('对话已有更新，请核对最新内容后继续',409,'FRONT_CONTEXT_CHANGED')
          if(message.answerTo&&!retryTranscription){const owner=d.contexts.find(c=>c.id===message.answerTo.contextId&&c.accountId===accountId&&c.memberId===memberId&&!c.saved&&!c.closedAt);if(!owner||owner.interview?.question?.id!==message.answerTo.questionId)throw fail('这个问题已有更新，请查看最新记录后继续',409,'FRONT_ANSWER_STALE')}
          return {...d,contexts:d.contexts.filter(c=>c.id!==provisionalId||contextId===provisionalId).map(c=>c.id===contextId?{...c,...(continuousRecord?{continuousRecord:true,firstDescribedAt:c.firstDescribedAt??new Date(Math.min(message.inputAt??Date.parse(message.at),...d.messages.filter(m=>m.contextId===c.id&&m.kind!=='assistant'&&m.status!=='discarded').map(m=>m.inputAt??Date.parse(m.at)).filter(Number.isFinite))).toISOString()}:{}),provisional:false,updatedAt:at,version:(c.version??0)+1,originalsVersion:(c.originalsVersion??0)+(newOriginals&&contextId!==provisionalId?1:0),evidenceVersion:(c.evidenceVersion??0)+(changed?1:0),understanding,resultKind,facts,actionPlan,pendingSaveConfirmation,mediaProblems:prepared.problems,subject:!changed&&c.subject?.confirmed&&understanding.subject.kind==='unknown'&&!understanding.subject.sources.length?c.subject:understanding.subject,...(contextId===provisionalId&&parent&&parent.id!==contextId&&(!legacy||message.targetContextId)?{conversationId:conversationIdOf(parent),continuedFromId:parent.id}:{}),interview:interview??c.interview}:c),messages:[...d.messages.filter(m=>m.id!==`${message.id}:reply`||m.accountId!==accountId||m.memberId!==memberId).map(m=>m===original?{...m,contextId,contextQuestion,subject:understanding.subject,status:'completed',recordEligible:changed,revision:m.revision??1,error:undefined}:m),{id:`${message.id}:reply`,accountId,memberId,contextId,kind:'assistant',text:reply,at,inputAt:(message.retranscribedAt?Date.parse(message.retranscribedAt):message.inputAt??Date.parse(message.at))+.1,status:'completed',understanding,resultKind,diagnostics}]}
        })
      })
      return { context: await this.snapshot(accountId, memberId, contextId), messageId: message.id, replyId: `${message.id}:reply` }
    } catch (error) {
      // An unavailable reply is not permission to split a user-selected task.
      // Retain its new raw source in that context without inventing any facts.
      if(execution.continuousRecord&&message.targetContextId&&error.code!=='FRONT_CONTEXT_CHANGED')await accountTransaction(this.directory,async()=>this.store.update(d=>{
        const original=d.messages.find(m=>m.id===message.id&&m.accountId===accountId&&m.memberId===memberId),target=d.contexts.find(c=>c.id===message.targetContextId&&c.accountId===accountId&&c.memberId===memberId&&c.continuousRecord&&!c.closedAt),provisional=d.contexts.find(c=>c.id===original?.contextId)
        if(!original||!target||original.contextId===target.id||provisional?.currentRecord)return d
        const removable=d.messages.filter(m=>m.contextId===original.contextId).length===1
        message={...message,contextId:target.id}
        return {...d,contexts:d.contexts.filter(c=>!removable||c.id!==original.contextId).map(c=>c===target?{...c,version:c.version+1,evidenceVersion:(c.evidenceVersion??0)+1,resultKind:'partial',updatedAt:this.now().toISOString()}:c),messages:d.messages.map(m=>m===original?{...m,contextId:target.id}:m)}
      }))
      await this.store.update(d => ({ ...d,contexts:d.contexts.map(c=>c.id===message.contextId&&c.provisional&&!c.closedAt?{...c,provisional:false,version:c.version??1,evidenceVersion:c.evidenceVersion??0,resultKind:'conversation',updatedAt:this.now().toISOString()}:c),messages: d.messages.map(m => m.id === message.id && m.accountId === accountId && m.memberId === memberId && m.status!=='discarded' && !d.contexts.find(c=>c.id===m.contextId)?.closedAt ? { ...m, status: 'failed', error: error.code ?? 'FRONT_RECORD_UNAVAILABLE' } : m) }))
      throw error
    }
  }
}
