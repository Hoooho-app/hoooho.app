import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './business/service.mjs'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {CaseContinuityService} from '../events/case-continuity-service.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'

async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'front-continuous-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const accountId='synthetic',member=await new FamilyMemberRepository(directory).create({accountId,name:'合成孩子',relationship:'child'})
 const now=()=>new Date('2026-10-27T06:00:00Z'),business=new AIBusinessService({dataDirectory:directory,now,model:{structured(){assert.fail('no paid calls')}}}),front=new FrontDeskRecord({dataDirectory:directory,business,events:business.events,now})
 const contextId='continuous-context',at='2026-10-27T05:00:00.000Z',subject={kind:'current',memberId:member.id,confirmed:true,confirmedBy:'selection'}
 await front.store.update(()=>({contexts:[{id:contextId,accountId,memberId:member.id,continuousRecord:true,version:1,evidenceVersion:1,firstDescribedAt:at,createdAt:at,updatedAt:at,subject}],messages:[{id:'m1',accountId,memberId:member.id,contextId,kind:'text',status:'completed',acceptedInput:true,text:'头有点疼',inputAt:Date.parse(at),at,subject,files:[],voices:[]}]}))
 return {directory,accountId,memberId:member.id,contextId,front,business,at,subject}
}
test('confirmation generates and saves atomically when requested; retry and edit retain the same exact ID',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,facts:[{id:'f1',status:'active',scope:'record',polarity:'affirmed',subject:f.subject,text:'头有点疼',sources:[{messageId:'m1',quote:'头有点疼',attachmentId:null}]}]}))}))
 const input={action:'generate_current',expectedVersion:1,confirmed:true,save:true}
 const first=await f.front.continuous(...args,input),again=await f.front.continuous(...args,input)
 assert.equal(first.presentation.generated,true);assert.equal(first.saved.available,true)
 assert.equal(first.saved.recordId,again.saved.recordId)
 const edited=await f.front.continuous(...args,{action:'edit_current',expectedVersion:first.version,title:'更正',text:'头已经不疼了',occurredAt:f.at,save:true})
 assert.equal(edited.saved.recordId,first.saved.recordId);assert.equal(edited.saved.evidenceVersion,edited.evidenceVersion)
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,edited.saved.recordId)).content,'头已经不疼了')
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})
test('failed confirmation save rolls back both generation marker and persistent record; retry remains usable',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,facts:[{id:'f1',status:'active',scope:'record',polarity:'affirmed',subject:f.subject,text:'头有点疼',sources:[{messageId:'m1',quote:'头有点疼',attachmentId:null}]}]}))}))
 const update=f.business.records.repository.update.bind(f.business.records.repository)
 f.business.records.repository.update=async(id,patch,now)=>{if(patch.aiProvenance)throw Error('synthetic storage failure');return update(id,patch,now)}
 const input={action:'generate_current',expectedVersion:1,confirmed:true,save:true}
 await assert.rejects(()=>f.front.continuous(...args,input),/synthetic storage/)
 const card=await f.front.continuous(...args)
 assert.equal(card.presentation.generated,false);assert.equal(card.saved,null)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 f.business.records.repository.update=update
 assert.equal((await f.front.continuous(...args,input)).saved.available,true)
})
async function unconfirmed(f){
 const subject={kind:'unknown',memberId:null,confirmed:false,sources:[]}
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,subject,facts:[{id:'f1',status:'active',scope:'record',polarity:'affirmed',subject,text:'头有点疼',sources:[{messageId:'m1',quote:'头有点疼',attachmentId:null}]}]})),messages:d.messages.map(m=>({...m,subject}))}))
}
test('organizing unconfirmed ownership shows a pending receipt; explicit ownership completes the same save intent once',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId];await unconfirmed(f)
 const generated=await f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true,save:true})
 assert.equal(generated.presentation.generated,true);assert.equal(generated.pendingSave,'subject');assert.equal(generated.saved,null)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 await f.front.confirmSubject(...args,{expectedVersion:1})
 const saved=await f.front.continuous(...args)
 assert.equal(saved.pendingSave,undefined);assert.equal(saved.saved.available,true)
 await f.front.continuous(...args,{action:'generate_current',expectedVersion:saved.version,confirmed:true,save:true})
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})
test('new evidence invalidates a pending save intent until the user confirms organizing the new version',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId];await unconfirmed(f)
 await f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true,save:true})
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,version:2,evidenceVersion:2})),messages:[...d.messages,{...d.messages[0],id:'m2',text:'今天已经减轻',inputAt:Date.parse(f.at)+1}]}))
 await f.front.confirmSubject(...args,{expectedVersion:2})
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 const latest=await f.front.continuous(...args)
 assert.equal(latest.presentation.generated,false);assert.equal(latest.pendingSave,undefined)
 assert.equal((await f.front.continuous(...args,{action:'generate_current',expectedVersion:latest.version,confirmed:true,save:true})).saved.available,true)
})
test('selecting a child does not confirm the ownership of a newly uploaded first reading',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 const file={id:'photo1',name:'合成图片.png',mimeType:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='}
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,originalsVersion:1,facts:[{id:'f1',status:'active',scope:'record',polarity:'affirmed',subject:f.subject,text:'合成检查项目',sources:[{messageId:'m1',attachmentId:file.id,quote:'合成检查项目'}]}]})),messages:d.messages.map(m=>({...m,kind:'image',files:[file]}))}))
 const generated=await f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true,save:true})
 assert.equal(generated.uploadReading.kind,'first_read');assert.equal(generated.pendingSave,'subject');assert.equal(generated.saved,null)
 await f.front.confirmSubject(...args,{expectedVersion:1})
 assert.equal((await f.front.continuous(...args)).saved.available,true)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})
test('a failed pending ownership save rolls back confirmation and can be retried without duplicates',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId];await unconfirmed(f)
 await f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true,save:true})
 const update=f.business.records.repository.update.bind(f.business.records.repository)
 f.business.records.repository.update=async(id,patch,now)=>{if(patch.aiProvenance)throw Error('synthetic ownership save failure');return update(id,patch,now)}
 await assert.rejects(()=>f.front.confirmSubject(...args,{expectedVersion:1}),/synthetic ownership save failure/)
 assert.equal((await f.front.snapshot(...args)).subject.kind,'unknown')
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 f.business.records.repository.update=update
 await f.front.confirmSubject(...args,{expectedVersion:1})
 assert.equal((await f.front.continuous(...args)).saved.available,true)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})
test('a corrected headed record refreshes derived keywords in the saved text and active fact source',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 const text='【情况概述】\n没有发热，有点咳嗽。\n\n【关键词】\n发热\n\n【具体表现与测量】\n没有发热，有点咳嗽。'
 const result=await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,title:'更正',text,occurredAt:f.at,save:true})
 const record=await f.business.records.getOwnedRecord(f.accountId,result.saved.recordId)
 assert.match(record.content,/【关键词】\n咳嗽/);assert.doesNotMatch(record.content,/【关键词】\n发热/)
 const stored=await f.front.store.read(),message=stored.messages.find(message=>message.manualCardEdit)
 assert.doesNotMatch(message.text,/【关键词】\n发热/);assert.equal(message.manualInputText,text)
 assert.doesNotMatch(stored.contexts[0].facts.find(fact=>fact.status==='active').text,/【关键词】\n发热/)
})
test('the first description timestamp remains distinguished from onset through body-only edits and save',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 const before=await f.front.continuous(...args)
 assert.equal(before.timeDefaulted,true)
 const edited=await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,title:'更正',text:'头部不适减轻',occurredAt:before.occurredAt,save:true})
 assert.equal(edited.timeDefaulted,true)
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,edited.saved.recordId)).aiProvenance.time.defaulted,true)
})
test('raw save works without a structured draft; retries and later saves retain one exact ID and first occurrence',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 const first=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 const again=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 assert.equal(first.saved.recordId,again.saved.recordId)
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,first.saved.recordId)).revisions?.length??0,0)
 assert.equal(first.occurredAt,f.at);assert.equal((await f.business.records.getOwnedRecord(f.accountId,first.saved.recordId)).content,'头有点疼')
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
 assert.equal((await f.business.events.get(f.accountId,first.saved.eventId)).caseTracking,false)
})
test('a historical self-parent introduced by a voice retry cannot hide its conversation on reopening',async t=>{
 const f=await fixture(t)
 await f.front.store.update(data=>({...data,contexts:data.contexts.map(context=>({...context,continuedFromId:context.id,conversationId:context.id}))}))
 const reopened=await f.front.latest(f.accountId,f.memberId)
 assert.equal(reopened.id,f.contextId);assert.equal(reopened.messages[0].text,'头有点疼')
})
test('manual revision is immediately readable, invalidates old evidence and stale writes; explicit occurrence stays fixed',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 const card=await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,title:'头部不适',text:'昨晚八点头疼，今天减轻',occurredAt:'2026-10-26T12:00:00Z'})
 assert.equal(card.version,2);assert.equal(card.text,'昨晚八点头疼，今天减轻');assert.equal(card.occurredAt,'2026-10-26T12:00:00.000Z')
 await assert.rejects(()=>f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true}),e=>e.code==='FRONT_CONTEXT_CHANGED')
 const saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:2,confirmed:true})
 await f.front.enrichContinuous(...args)
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,saved.saved.recordId)).content,card.text)
 assert.match((await f.business.records.getOwnedRecord(f.accountId,saved.saved.recordId)).sourceText,/头有点疼/)
})
test('ownership, explicit other subjects, empty and future input fail before writes',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await assert.rejects(()=>f.front.continuous('other-account',f.memberId,f.contextId,{action:'save_current',expectedVersion:1,confirmed:true}))
 await assert.rejects(()=>f.front.continuous(...args,{action:'edit_current',expectedVersion:1,text:'x',title:'x',occurredAt:'2027-01-01T00:00:00Z'}))
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,subject:{kind:'other'}}))}))
 await assert.rejects(()=>f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true}),e=>e.code==='FRONT_SUBJECT_MISMATCH')
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
})
test('external manual changes and deleted records cannot be silently overwritten or replaced',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId],saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 await f.business.records.update(f.accountId,saved.saved.recordId,{content:'详情页修改'},new Date('2026-10-27T06:00:00Z'))
 await assert.rejects(()=>f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true}),e=>e.code==='FRONT_RECORD_TARGET_CHANGED')
 await f.business.records.delete(f.accountId,saved.saved.recordId)
 assert.equal((await f.front.continuous(...args)).saved.available,false)
 await assert.rejects(()=>f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true}))
})

test('a failure after record creation rolls back the event, record and receipt together',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId],update=f.business.records.repository.update.bind(f.business.records.repository)
 f.business.records.repository.update=async(id,patch,now)=>{if(patch.aiProvenance)throw Object.assign(new Error('synthetic disk failure'),{code:'SYNTHETIC_WRITE_FAILURE'});return update(id,patch,now)}
 await assert.rejects(()=>f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true}),e=>e.code==='SYNTHETIC_WRITE_FAILURE')
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 assert.equal((await f.business.events.repository.findByAccountId(f.accountId)).length,0)
 assert.equal((await f.front.continuous(...args)).saved,null)
 f.business.records.repository.update=update
 assert.ok((await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})).saved.recordId)
})

test('late dialogue understanding cannot replace a newer manual revision',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 let release,entered
 const gate=new Promise(resolve=>{release=resolve}),ready=new Promise(resolve=>{entered=resolve})
 f.front.model={async structured(){entered();await gate;return {value:{reply:'收到。',contextId:f.contextId,responseMode:'record',taskRelation:'continue',subject:{kind:'unknown',memberId:null,label:null,sources:[]},recordChanges:[{type:'add',targetId:null,text:'右手痒',scope:'record',polarity:'affirmed',subject:{kind:'unknown',memberId:null,label:null,sources:[]},sources:[{messageId:'late-input',attachmentId:null,quote:'右手痒'}]}],nextQuestion:null,requestedAction:{type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''},uncertainties:[],emergency:{currentChild:false,quote:''}},diagnostics:{provider:'synthetic'}}}}
 const running=f.front.submit(f.accountId,f.memberId,{id:'late-input',protocolVersion:3,contextId:f.contextId,kind:'text',text:'右手痒',inputAt:Date.parse('2026-10-27T06:00:00Z'),files:[],voiceFiles:[]},undefined,{continuousRecord:true})
 await ready
 await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,text:'现在右手不痒了',title:'右手情况',occurredAt:f.at})
 release()
 await assert.rejects(()=>running,e=>e.code==='FRONT_CONTEXT_CHANGED')
 assert.equal((await f.front.continuous(...args)).text,'现在右手不痒了')
})

test('structured saving reuses the existing archive adapter and exact entry receipt without duplicate rows',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,draftId:'synthetic-ready'})),messages:d.messages.map(m=>({...m,text:'吃花生后有点痒'}))}))
 f.business.read=async()=>({id:'synthetic-ready',state:'ready',frontEvidenceVersion:1,items:[{id:'allergy-observation',category:'symptom',archiveCategory:'allergy',title:'花生后发痒',subjectConfirmed:true,subject:'current',time:{resolvedStart:f.at,resolvedEnd:null,precision:'exact'},fields:[{name:'allergen',value:'花生',sources:[{sourceId:'m1',page:1,quote:'花生'}]},{name:'symptom',value:'有点痒',sources:[{sourceId:'m1',page:1,quote:'有点痒'}]}],journal:{categories:['symptom'],timePrecision:'exact'}}]})
 const first=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true}),again=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 assert.equal(first.saved.recordId,again.saved.recordId)
 assert.equal(first.saved.profileEntries.length,1)
 assert.equal((await new CaseContinuityService({dataDirectory:f.directory,business:f.business}).list(f.accountId,f.memberId)).active.length,0)
 assert.deepEqual(first.saved.profileEntries,again.saved.profileEntries)
 const sections=(await f.business.profiles.read()).sections.filter(s=>s.accountId===f.accountId&&s.memberId===f.memberId)
 assert.equal(sections[0].records.length,1)
 assert.deepEqual(sections[0].records[0].sourceReferences.flatMap(reference=>reference.recordIds),[first.saved.recordId])
})

test('editing description preserves the first occurrence down to milliseconds',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId],exact='2026-10-27T05:00:36.321Z'
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,firstDescribedAt:exact})),messages:d.messages.map(m=>({...m,at:exact,inputAt:Date.parse(exact)}))}))
 const before=await f.front.continuous(...args)
 const after=await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,text:'头部不适减轻了',title:'头部情况',occurredAt:before.occurredAt})
 assert.equal(after.occurredAt,exact);assert.equal(after.timePrecision,'exact')
 const saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:after.version,confirmed:true})
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,saved.saved.recordId)).occurredAt,exact)
})
test('explicit spoken time correction is available before structuring; ordinary supplements keep that occurrence',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,messages:d.messages.map(m=>({...m,text:'昨天上午头有点疼'}))}))
 const correction={id:'time-correction',accountId:f.accountId,memberId:f.memberId,contextId:f.contextId,kind:'voice',status:'completed',acceptedInput:true,text:'发生时间不对，改成昨晚八点',inputAt:Date.parse('2026-10-27T05:30:00Z'),at:'2026-10-27T05:30:00Z',subject:f.subject,files:[],voices:[]}
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,version:2,evidenceVersion:2})),messages:[...d.messages,correction]}))
 const corrected=await f.front.continuous(...args);assert.equal(corrected.occurredAt,'2026-10-26T12:00:00.000Z')
 await f.front.store.update(d=>({...d,messages:[...d.messages,{...correction,id:'supplement',kind:'text',text:'今天轻了一些',at:'2026-10-27T05:45:00Z',inputAt:Date.parse('2026-10-27T05:45:00Z')}]}))
 assert.equal((await f.front.continuous(...args)).occurredAt,corrected.occurredAt)
 const saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:2,confirmed:true});assert.equal((await f.business.records.getOwnedRecord(f.accountId,saved.saved.recordId)).occurredAt,corrected.occurredAt)
})

test('an unavailable later reply retains the source on the selected task and saves to its original ID',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId],first=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 f.front.model={async structured(){throw Object.assign(new Error('synthetic supplier unavailable'),{status:503,code:'SYNTHETIC_UNAVAILABLE'})}}
 await assert.rejects(()=>f.front.submit(f.accountId,f.memberId,{id:'followup-raw',protocolVersion:3,kind:'text',text:'左边轻了一些',contextId:f.contextId,inputAt:Date.parse('2026-10-27T06:00:00Z'),files:[],voiceFiles:[]},undefined,{continuousRecord:true}))
 const card=await f.front.continuous(...args);assert.match(card.raw,/左边轻了一些/)
 const saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:card.version,confirmed:true})
 assert.equal(saved.saved.recordId,first.saved.recordId)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})

test('visit checklist is separate from saving and stays synchronized with the latest manual record',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,messages:[...d.messages,{...d.messages[0],id:'visit-intent',text:'准备去医院，挂什么科？',inputAt:Date.parse(f.at)+1}]}))
 const generated=await f.front.continuous(...args,{action:'visit_checklist',expectedVersion:1})
 assert.match(generated.checklist.text,/头有点疼/);assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,text:'头部不适减轻了',title:'头部情况',occurredAt:f.at})
 const latest=await f.front.continuous(...args)
 assert.match(latest.checklist.text,/头部不适减轻了/);assert.equal(latest.checklist.version,latest.evidenceVersion)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
})

test('serialization key order does not constitute an external record revision',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId],saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 const record=await f.business.records.getOwnedRecord(f.accountId,saved.saved.recordId)
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value
 await f.business.records.repository.update(record.id,{journal:reorder(record.journal),aiProvenance:reorder(record.aiProvenance)},new Date('2026-10-27T06:00:00Z'))
 assert.equal((await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})).saved.recordId,record.id)
})

test('a single exact legacy save is adopted without recreating the record or losing its original text',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId],saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,continuousRecord:undefined,currentRecord:undefined,saved:true,recordResult:{records:[{recordId:saved.saved.recordId,eventId:saved.saved.eventId}]}})),messages:d.messages.map(m=>({...m,acceptedInput:undefined}))}))
 const restored=await f.front.continuous(...args)
 assert.equal(restored.saved.recordId,saved.saved.recordId);assert.match(restored.raw,/头有点疼/)
 const edit=await f.front.continuous(...args,{action:'edit_current',expectedVersion:restored.version,title:'头部情况',text:'头部不适减轻了',occurredAt:restored.occurredAt})
 const updated=await f.front.continuous(...args,{action:'save_current',expectedVersion:edit.version,confirmed:true})
 assert.equal(updated.saved.recordId,saved.saved.recordId);assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})

test('generation is explicit and durable but creates no formal record; new facts require new consent',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,facts:[{id:'observed',status:'active',scope:'record',subject:f.subject,text:'头有点疼'}]}))}))
 const before=await f.front.continuous(...args)
 assert.equal(before.presentation.generated,false);assert.equal(before.presentation.canGenerate,true)
 await assert.rejects(()=>f.front.continuous(...args,{action:'generate_current',expectedVersion:1}),e=>e.code==='FRONT_GENERATION_CONFIRMATION_REQUIRED')
 const generated=await f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true})
 assert.equal(generated.presentation.generated,true)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 const restored=new FrontDeskRecord({dataDirectory:f.directory,business:f.business,events:f.business.events,now:f.front.now})
 assert.equal((await restored.continuous(...args)).presentation.generated,true)
 const edited=await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,title:'头部情况',text:'头已经不疼了',occurredAt:f.at})
 assert.equal(edited.presentation.generated,true)
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,evidenceVersion:c.evidenceVersion+1,version:c.version+1}))}))
 assert.equal((await f.front.continuous(...args)).presentation.generated,false)
})
test('generation is blocked during questioning, pending input and for another member',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,interview:{status:'asking',question:{id:'q',text:'是否影响睡眠？'}}}))}))
 await assert.rejects(()=>f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true}),e=>e.code==='FRONT_RECORD_NOT_READY')
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,interview:{status:'ready',question:null}})),messages:[...d.messages,{...d.messages[0],id:'queued',contextId:'provisional',targetContextId:f.contextId,status:'pending'}]}))
 await assert.rejects(()=>f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true}),e=>e.code==='FRONT_RECORD_NOT_READY')
 await assert.rejects(()=>f.front.continuous('other',f.memberId,f.contextId,{action:'generate_current',expectedVersion:1,confirmed:true}))
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
})
test('second question permits explicit partial generation; pending bytes still fence it and consent never saves',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await f.front.store.update(d=>({...d,contexts:d.contexts.map(c=>({...c,facts:[{id:'f1',status:'active',scope:'record',polarity:'affirmed',subject:f.subject,text:'头有点疼',sources:[{messageId:'m1',quote:'头有点疼',attachmentId:null}]}],interview:{status:'asking',turnCount:2,question:{id:'q2',text:'是否影响睡眠？'}}}))}))
 const generated=await f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true})
 assert.equal(generated.presentation.generated,true);assert.equal(generated.presentation.asking,true)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 await f.front.store.update(d=>({...d,messages:[...d.messages,{...d.messages[0],id:'voice-pending',status:'pending'}]}))
 await assert.rejects(()=>f.front.continuous(...args,{action:'generate_current',expectedVersion:1,confirmed:true}),{code:'FRONT_RECORD_NOT_READY'})
})
test('a new correction is not automatically written over the saved record before explicit save',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 const original=await f.front.continuous(...args,{action:'save_current',expectedVersion:1,confirmed:true})
 const edited=await f.front.continuous(...args,{action:'edit_current',expectedVersion:1,title:'更正',text:'头已经不疼了',occurredAt:f.at})
 await f.front.enrichContinuous(...args)
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,original.saved.recordId)).content,'头有点疼')
 const saved=await f.front.continuous(...args,{action:'save_current',expectedVersion:edited.version,confirmed:true})
 assert.equal(saved.saved.recordId,original.saved.recordId)
 assert.equal((await f.business.records.getOwnedRecord(f.accountId,original.saved.recordId)).content,'头已经不疼了')
})
test('a visit checklist needs an actual care-preparation context and creates no health record',async t=>{
 const f=await fixture(t),args=[f.accountId,f.memberId,f.contextId]
 await assert.rejects(()=>f.front.continuous(...args,{action:'visit_checklist',expectedVersion:1}),e=>e.code==='FRONT_VISIT_CONTEXT_REQUIRED')
 await f.front.store.update(d=>({...d,messages:[...d.messages,{...d.messages[0],id:'visit-question',text:'准备去医院，挂什么科？',inputAt:Date.parse(f.at)+1}]}))
 const card=await f.front.continuous(...args,{action:'visit_checklist',expectedVersion:1})
 assert.match(card.checklist.text,/头有点疼/)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
})
