import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'

async function fixture(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'manual-front-subject-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const account='synthetic-manual-owner',member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'合成手工记录',relationship:'child'})
 const now=()=>new Date('2026-10-26T08:00:00Z'),service=new AIBusinessService({dataDirectory,now,model:{async structured(){throw new Error('No model for manual entry')}},logger:{info(){},warn(){}}})
 const subject={kind:'current',memberId:member.id,confirmed:true,confirmedBy:'user'}
 const draft={id:'draft',accountId:account,memberId:member.id,version:1,state:'ready',raw:'咳嗽',referenceNow:now().toISOString(),timezone:'Asia/Shanghai',expiresAt:'2026-10-27T08:00:00Z',smartRecord:true,followUp:false,semanticVersion:2,frontDeskRecord:true,frontContextId:'context',frontEvidenceVersion:1,frontSubject:subject,frontUnderstanding:{version:'front-desk-understanding-v2',recordChangesPending:false},documents:[],pages:[],voices:[],sources:[{id:'input',page:1,text:'咳嗽',status:'readable'}],items:[{id:'original',category:'symptom',title:'咳嗽',subject:'current',subjectConfirmed:true,subjectMemberId:member.id,timeText:null,fields:[{name:'symptom',value:'咳嗽',sources:[{sourceId:'input',page:1,quote:'咳嗽'}]}]}],history:[],unmappedRows:[],documentWarnings:[]}
 await service.store.update(()=>({drafts:[draft]}))
 const front=new JsonStore(path.join(dataDirectory,'front-desk-records.json'),{contexts:[],messages:[]})
 await front.update(()=>({contexts:[{id:'context',accountId:account,memberId:member.id,version:2,evidenceVersion:1,subject,facts:[]}],messages:[]}))
 const addition={id:'manual-added',category:'symptom',text:'胳膊有点痒',timeText:'昨天'}
 const edit=value=>service.edit(account,member.id,draft.id,{version:1,changes:[{deleteItem:'original'},{addItem:{...addition,...value}}]})
 return {service,account,member,front,edit}
}
test('manual additions require the actual actor to confirm the scoped member, with atomic failure',async t=>{
 for(const subjectConfirmation of [undefined,{confirmed:false,memberId:'any'},{confirmed:true,memberId:'another'}]){
  const f=await fixture(t)
  await assert.rejects(()=>f.edit({subjectConfirmation}),{code:'FRONT_MANUAL_SUBJECT_CONFIRMATION_REQUIRED'})
  const unchanged=await f.service.get(f.account,f.member.id,'draft')
  assert.equal(unchanged.version,1);assert.deepEqual(unchanged.items.map(item=>item.id),['original'])
  assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
 }
})
test('confirmed manual content saves once with its exact original and manual provenance, without AI',async t=>{
 const f=await fixture(t),edited=await f.edit({subjectConfirmation:{confirmed:true,memberId:f.member.id}})
 assert.equal(edited.items[0].subjectConfirmed,true)
 const saved=await f.service.save(f.account,f.member.id,'draft',{version:edited.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,'胳膊有点痒');assert.equal(record.aiProvenance.provider,'manual');assert.equal(record.aiProvenance.model,null)
 assert.equal(record.aiProvenance.subjectConfirmedBy,'user');assert.equal(record.aiProvenance.subjectMemberId,f.member.id)
 assert.deepEqual((await f.service.save(f.account,f.member.id,'draft',{version:edited.version,confirmed:true})).result,saved.result)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,1)
})
test('a stale or foreign context cannot inherit a manual confirmation',async t=>{
 for(const patch of [{evidenceVersion:2},{subject:{kind:'other',memberId:null}},{closedAt:'2026-10-26T08:00:00Z'}]){
  const f=await fixture(t);await f.front.update(data=>({...data,contexts:data.contexts.map(context=>({...context,...patch}))}))
  await assert.rejects(()=>f.edit({subjectConfirmation:{confirmed:true,memberId:f.member.id}}),error=>['FRONT_RECORD_CHANGED','FRONT_SUBJECT_MISMATCH'].includes(error.code))
  assert.equal((await f.service.get(f.account,f.member.id,'draft')).version,1)
 }
})
