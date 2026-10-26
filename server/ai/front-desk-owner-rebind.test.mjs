// Real local services, account transactions and stores; every model response is
// explicitly injected and no provider credentials or remote models are used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './business/service.mjs'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {validSemanticSummary} from './business/semantic-summary.mjs'
import {validateProfessionalSummary} from './business/professional-summary.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {accountTransaction} from '../auth/storage/transaction.mjs'

const clone=value=>structuredClone(value)
const accountId='synthetic-owner-rebind'
const raw='孩子咳嗽'
const unknown=()=>({kind:'unknown',memberId:null,label:null,confirmed:false,sources:[]})

async function fixture(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'front-owner-rebind-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const now=()=>new Date('2026-10-26T08:00:00.000Z')
 const members=new FamilyMemberRepository(dataDirectory)
 const member=await members.create({accountId,name:'合成归属人物',relationship:'child'})
 const anotherMember=await members.create({accountId,name:'另一合成人物',relationship:'child'})
 const calls=[]
 const model={sourceReferences:true,async structured({task,input}){
  calls.push(task)
  const data=JSON.parse(input)
  if(task==='draft-extraction'){
   const source=data.sources.find(source=>source.id==='fact-cough')
   assert.ok(source,'the source ledger supplied the actual user fact')
   const segment=source.segments.find(segment=>segment.text.includes(raw))
   assert.ok(segment)
   return {value:{items:[{category:'symptom',title:'咳嗽记录',subject:'unknown',timeText:null,archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:raw,evidenceId:segment.evidenceId}]}]},diagnostics:{provider:'injected-owner-rebind'}}
  }
  if(task==='professional-summary-generate'){
   assert.equal(data.items[0].scope.subject,'unknown')
   assert.equal(data.items[0].scope.phase,'candidate')
   assert.equal(data.items[0].scope.subjectConfirmationRequired,true)
   return {value:{items:data.items.map(packet=>({itemId:packet.itemId,title:'咳嗽记录',claims:packet.facts.map(fact=>({text:fact.text,factIds:fact.factIds}))}))},diagnostics:{provider:'injected-owner-rebind'}}
  }
  assert.equal(task,'professional-summary-verify','confirmation and save cannot request another model task')
  assert.equal(data.candidates[0].recordScope.subject,'unknown')
  return {value:{items:data.candidates.map(candidate=>({itemId:candidate.itemId,titleSupported:true,complete:true,claims:candidate.claims.map((_,index)=>({index,supported:true})),problems:[],missingFacts:[]}))},diagnostics:{provider:'injected-owner-rebind'}}
 }}
 const business=new AIBusinessService({dataDirectory,model,now,env:{},logger:{info(){},warn(){}}})
 const front=new FrontDeskRecord({dataDirectory,business,events:business.events,model,now,env:{}})
 const contextId='synthetic-owner-context'
 const context={id:contextId,accountId,memberId:member.id,version:4,evidenceVersion:1,originalsVersion:0,semanticVersion:3,subject:unknown(),understanding:{version:'front-desk-understanding-v2',recordChanges:[],recordChangesPending:false},facts:[{id:'fact-cough',contextId,status:'active',scope:'event',text:raw,polarity:'affirmed',subject:unknown(),sources:[{messageId:'user-cough',attachmentId:null,quote:raw}]}],createdAt:now().toISOString(),updatedAt:now().toISOString(),saved:false}
 const message={id:'user-cough',accountId,memberId:member.id,contextId,kind:'text',status:'completed',text:raw,recordable:true,acceptedInput:true,inputAcceptedAt:now().toISOString(),at:now().toISOString(),inputAt:now().getTime(),files:[],voices:[]}
 await accountTransaction(dataDirectory,()=>front.store.update(()=>({contexts:[context],messages:[message]})))
 const candidate=await business.prepare(accountId,member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false})
 assert.equal(candidate.state,'ready')
 assert.equal(candidate.items[0].subject,'unknown')
 assert.equal(candidate.items[0].subjectConfirmed,false)
 assert.equal(validSemanticSummary(candidate.items[0].professionalSummary,candidate.items[0],{sources:candidate.sources}),true)
 await accountTransaction(dataDirectory,()=>front.checkpoint(accountId,member.id,contextId,{draftId:candidate.id}))
 return {dataDirectory,member,anotherMember,business,front,candidate,contextId,calls,records:()=>business.records.repository.findByAccountId(accountId)}
}

test('verified unknown candidate confirms ownership, saves real record and reads the same seal/text without another model call',async t=>{
 const f=await fixture(t),before=await f.business.get(accountId,f.member.id,f.candidate.id)
 const contextBefore=clone((await f.front.store.read()).contexts[0])
 await assert.rejects(()=>f.business.save(accountId,f.member.id,before.id,{version:before.version,confirmed:true}),{code:'FRONT_SUBJECT_UNCONFIRMED'})
 assert.equal((await f.records()).length,0)
 const confirmed=await f.front.confirmSubject(accountId,f.member.id,f.contextId,{expectedVersion:contextBefore.version})
 assert.equal(confirmed.version,contextBefore.version+1)
 assert.equal(confirmed.subject.confirmedBy,'user')
 const after=await f.business.get(accountId,f.member.id,before.id),item=after.items[0]
 assert.equal(after.version,before.version+1)
 assert.equal(item.subject,'current')
 assert.equal(item.subjectConfirmedBy,'user')
 assert.equal(item.subjectMemberId,f.member.id)
 assert.deepEqual(item.subjectResolution,confirmed.subject)
 assert.deepEqual(after.sources,before.sources,'confirmation cannot rewrite original source identities or text')
 assert.deepEqual(item.fields,before.items[0].fields)
 assert.equal(item.professionalSummary.text,before.items[0].professionalSummary.text)
 assert.deepEqual(item.professionalSummary.claims,before.items[0].professionalSummary.claims)
 assert.equal(item.professionalSummary.verification.outputKey,before.items[0].professionalSummary.verification.outputKey)
 assert.equal(item.professionalSummary.verification.ownershipRebind.previousEvidenceKey,before.items[0].professionalSummary.verification.evidenceKey)
 assert.deepEqual(item.professionalSummary.verification.ownershipRebind.confirmation,confirmed.subject.confirmation)
 assert.equal(validSemanticSummary(before.items[0].professionalSummary,item,{sources:after.sources}),false)
 assert.equal(validSemanticSummary(item.professionalSummary,item,{sources:after.sources}),true)
 await assert.rejects(()=>f.front.confirmSubject(accountId,f.member.id,f.contextId,{expectedVersion:contextBefore.version}),{code:'FRONT_CONTEXT_CHANGED'})
 assert.deepEqual(await f.business.get(accountId,f.member.id,after.id),after,'replayed stale ownership confirmation cannot alter the rebound draft')
 await assert.rejects(()=>f.business.save(accountId,f.member.id,after.id,{version:before.version,confirmed:true}),error=>error.status===409)
 const saved=await f.business.save(accountId,f.member.id,after.id,{version:after.version,confirmed:true})
 assert.equal(saved.state,'saved')
 assert.equal(saved.result.records.length,1)
 const recordId=saved.result.records[0].recordId
 const record=await f.business.records.getOwnedRecord(accountId,recordId)
 const event=await f.business.events.get(accountId,record.eventId)
 assert.equal(event.memberId,f.member.id)
 assert.equal(record.content,before.items[0].professionalSummary.text)
 assert.equal(record.sourceText,raw)
 const provenance=record.aiProvenance
 assert.equal(provenance.subjectConfirmedBy,'user','the ownership hash field must survive formal persistence')
 assert.equal(validateProfessionalSummary(provenance.professionalSummary,{...provenance,id:provenance.itemId}),true)
 assert.equal(validSemanticSummary(provenance.professionalSummary,{...provenance,id:provenance.itemId},{sources:after.sources}),true)
 assert.deepEqual(provenance.professionalSummary,item.professionalSummary)
 assert.deepEqual(provenance.fields.map(({confirmed,...field})=>field),before.items[0].fields.map(({confirmed,...field})=>field))
 const repeated=await f.business.save(accountId,f.member.id,after.id,{version:after.version,confirmed:true})
 assert.equal(repeated.result.records[0].recordId,recordId)
 assert.equal((await f.records()).length,1)
 assert.equal((await f.business.read(accountId,f.member.id,after.id)).items[0].professionalSummary.text,record.content)
 const messages=(await f.front.store.read()).messages
 assert.equal(messages[0].text,raw)
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate','professional-summary-verify'])
})

test('a fresh repeated confirmation preserves the already verified current ownership seal',async t=>{
 const f=await fixture(t)
 const first=await f.front.confirmSubject(accountId,f.member.id,f.contextId,{expectedVersion:4})
 const before=await f.business.get(accountId,f.member.id,f.candidate.id)
 await f.front.confirmSubject(accountId,f.member.id,f.contextId,{expectedVersion:first.version})
 const after=await f.business.get(accountId,f.member.id,f.candidate.id)
 assert.deepEqual(after.items,before.items)
 assert.deepEqual(after.sources,before.sources)
 assert.equal(validSemanticSummary(after.items[0].professionalSummary,after.items[0],{sources:after.sources}),true)
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate','professional-summary-verify'])
})

test('subject confirmation rejects stale context, another member and foreign account without changing a verified candidate',async t=>{
 const f=await fixture(t),before=await f.front.store.read(),draft=await f.business.get(accountId,f.member.id,f.candidate.id)
 await assert.rejects(()=>f.front.confirmSubject(accountId,f.member.id,f.contextId,{expectedVersion:3}),{code:'FRONT_CONTEXT_CHANGED'})
 await assert.rejects(()=>f.front.confirmSubject(accountId,f.anotherMember.id,f.contextId,{expectedVersion:4}),{code:'FRONT_CONTEXT_CHANGED'})
 await assert.rejects(()=>f.front.confirmSubject('foreign-account',f.member.id,f.contextId,{expectedVersion:4}),error=>[403,404].includes(error.status))
 assert.deepEqual(await f.front.store.read(),before)
 assert.deepEqual(await f.business.get(accountId,f.member.id,draft.id),draft)
 assert.equal((await f.records()).length,0)
 assert.equal(f.calls.length,3)
})

test('an active fact explicitly owned by another person cannot be moved by a global subject confirmation',async t=>{
 const f=await fixture(t)
 await accountTransaction(f.dataDirectory,()=>f.front.store.update(data=>({...data,contexts:data.contexts.map(context=>({...context,facts:context.facts.map(fact=>({...fact,subject:{kind:'other',memberId:f.anotherMember.id,label:'其他人',confirmed:true}}))}))})))
 const before=await f.front.store.read(),draft=await f.business.get(accountId,f.member.id,f.candidate.id)
 await assert.rejects(()=>f.front.confirmSubject(accountId,f.member.id,f.contextId,{expectedVersion:4}),{code:'FRONT_SUBJECT_MISMATCH'})
 assert.deepEqual(await f.front.store.read(),before)
 assert.deepEqual(await f.business.get(accountId,f.member.id,draft.id),draft)
 assert.equal((await f.records()).length,0)
 assert.equal(f.calls.length,3)
})
