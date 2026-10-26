import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'

async function fixture(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'verbatim-question-flow-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const account='synthetic-verbatim',now=()=>new Date('2026-10-25T08:00:00Z')
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'虚构问答',relationship:'child'})
 const contextId='qa-context',scope={accountId:account,memberId:member.id,contextId},subject={kind:'unknown',memberId:null,label:null,sources:[],confirmed:false}
 const q={id:'fever-question',messageId:'nurse-question',text:'这次有没有发热？',target:'fever'}
 const reference={messageId:'answer',attachmentId:null,quote:'没有'}
 const change={id:'qa-change',type:'add',targetId:null,text:'没有',scope:'record',polarity:'negated',subject,sources:[reference]}
 const understanding={version:'front-desk-understanding-v2',contextId,action:'record',responseMode:'clarification',taskRelation:'continue',recordChangesPending:false,recordChanges:[change],subject,requestedAction:{type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}}
 const fact={...scope,id:'qa-fact',changeId:change.id,sourceMessageId:'answer',text:'没有',scope:'record',polarity:'negated',subject,sources:[reference],status:'active',saved:false}
 const store=new JsonStore(path.join(dataDirectory,'front-desk-records.json'),{contexts:[],messages:[]})
 await store.update(()=>({contexts:[{id:contextId,accountId:account,memberId:member.id,version:1,evidenceVersion:1,originalsVersion:1,understanding,subject,facts:[fact]}],messages:[
  {...scope,id:q.messageId,kind:'assistant',status:'completed',text:q.text,inputAt:now().getTime()-1000,understanding:{nextQuestion:q}},
  {...scope,id:'answer',kind:'text',status:'completed',text:'没有',inputAt:now().getTime(),contextQuestion:q,files:[],voices:[]}
 ]}))
 const calls=[],model={sourceReferences:true,async structured({task,input}){
  calls.push(task);assert.equal(task,'draft-extraction','literal QA must never request or fake a clinical summary verdict')
  const source=JSON.parse(input).sources[0]
  return {value:{items:[{category:'symptom',title:'模型临时标题',subject:'current',timeText:null,archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'没有',evidenceId:source.segments[0].evidenceId}]}]},diagnostics:{provider:'synthetic'}}
 }}
 const business=new AIBusinessService({dataDirectory,model,now,logger:{info(){},warn(){}}})
 const front=new FrontDeskRecord({dataDirectory,business,events:business.events,now,model,env:{}})
 const prepare=()=>business.prepare(account,member.id,{text:'没有',smartRecord:true,frontDeskRecord:true,frontContextId:contextId,semanticVersion:2,followUp:false})
 return {account,member,contextId,business,front,store,calls,prepare}
}

test('literal QA selects before AI narration, confirms through its real context, saves exact original Q/A once',async t=>{
 const f=await fixture(t),draft=await f.prepare()
 assert.equal(draft.state,'ready');assert.deepEqual(f.calls,['draft-extraction'])
 assert.equal(draft.items[0].professionalSummary.version,'professional-summary-v1')
 assert.equal(draft.items[0].professionalSummary.text,'问：这次有没有发热？答：没有。')
 assert.equal(draft.items[0].time.precision,'unknown')
 await assert.rejects(()=>f.business.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true}),{code:'FRONT_SUBJECT_UNCONFIRMED'})
 await f.store.update(data=>({...data,contexts:data.contexts.map(context=>({...context,draftId:draft.id}))}))
 const confirmed=await f.front.confirmSubject(f.account,f.member.id,f.contextId,{expectedVersion:1})
 const saved=await f.business.save(f.account,f.member.id,draft.id,{version:confirmed.review.version,confirmed:true})
 const record=await f.business.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.content,'问：这次有没有发热？答：没有。');assert.equal(record.sourceText,'没有')
 assert.deepEqual(record.journal.categories,['other']);assert.equal(record.journal.symptom,undefined)
 assert.equal(record.aiProvenance.fields[0].value,'没有');assert.equal(record.aiProvenance.professionalSummary.verification,undefined)
 assert.deepEqual((await f.business.save(f.account,f.member.id,draft.id,{version:saved.version,confirmed:true})).result,saved.result)
 assert.equal((await f.business.records.repository.findByAccountId(f.account)).length,1);assert.deepEqual(f.calls,['draft-extraction'])
})

test('a changed source or a clinical edit loses literal-QA save eligibility',async t=>{
 for(const target of ['source','title']){
  const f=await fixture(t),draft=await f.prepare()
  await f.store.update(data=>({...data,contexts:data.contexts.map(context=>({...context,draftId:draft.id}))}))
  const confirmed=await f.front.confirmSubject(f.account,f.member.id,f.contextId,{expectedVersion:1})
  if(target==='source')await f.store.update(data=>({...data,messages:data.messages.map(message=>message.id==='answer'?{...message,text:'有'}:message)}))
  else await f.business.edit(f.account,f.member.id,draft.id,{version:confirmed.review.version,itemId:confirmed.review.items[0].id,field:'title',value:'没有发热'})
  const current=await f.business.get(f.account,f.member.id,draft.id)
  await assert.rejects(()=>f.business.save(f.account,f.member.id,draft.id,{version:current.version,confirmed:true}),{code:'AI_VERBATIM_QUESTION_CHANGED'})
  assert.equal((await f.business.records.repository.findByAccountId(f.account)).length,0)
 }
})
