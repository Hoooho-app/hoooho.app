// A real persisted question and answer; only the nurse model is injected.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {semanticInterview} from './front-desk-semantics.mjs'

const question={text:'现在还在出血吗？',slot:'observation',predicate:'bleeding',unit:null,options:[]}
const decision=(patch={})=>({intent:'record',subject:'current',subjectResolution:null,status:'ask',topic:'injury',question,unresolvedItems:['红肿情况未明确'],media:'none',...patch})
async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-question-repeat-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const account='synthetic-question-repeat',member=await new FamilyMemberRepository(directory).create({accountId:account,name:'虚构已回答问题',relationship:'child'})
 const service=new AIBusinessService({dataDirectory:directory,logger:{info(){},warn(){}}});let context='new',calls=0
 const model={async structured(){calls++;return {value:{reply:'我再确认一下，目前还有出血吗？',contextId:context,action:'record',questionId:null,emergency:{currentChild:false,quote:''},decision:decision()},diagnostics:{provider:'synthetic'}}}}
 const front=new FrontDeskRecord({dataDirectory:directory,events:service.events,business:service,model})
 const first=await front.submit(account,member.id,{id:'first',protocolVersion:2,kind:'text',text:'今天脚的小拇指被踢破了。'});context=first.context.id
 const answer=text=>front.submit(account,member.id,{id:'answer',protocolVersion:2,kind:'text',text,answerTo:{contextId:context,questionId:first.context.interview.question.id}})
 return {service,account,member,first,answer,calls:()=>calls}
}
for(const text of ['是脚的小拇指表面破皮，今天刚被踢到；现在没有出血，能正常走路，还没有做处理。','没有'])test(`a bound ${text==='没有'?'short':'complete'} answer ends a repeated bleeding question without generating a new finding`,async t=>{
 const f=await fixture(t),done=await f.answer(text)
 assert.equal(done.context.interview.question,null);assert.equal(done.context.interview.stopReason,'answered_question');assert.equal(done.context.decision.organize,true)
 assert.deepEqual(done.context.decision.unresolvedItems,['红肿情况未明确'])
 assert.equal(done.context.messages.find(m=>m.id==='answer').text,text)
 assert.equal(done.context.messages.find(m=>m.id==='answer:reply').text,'嗯，我了解了。')
 assert.equal(f.calls(),2);assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
 assert.equal((await f.service.store.read()).drafts.length,0,'suppression does not produce any clinical extraction or record')
})
for(const text of ['手没有出血。','没注意有没有出血。'])test(`a non-answer stays unconfirmed: ${text}`,async t=>{
 const f=await fixture(t),done=await f.answer(text)
 assert.equal(done.context.interview.question.semantic.predicate,'bleeding')
 assert.equal(done.context.interview.status,'asking');assert.equal(done.context.decision.organize,false)
 assert.notEqual(done.context.interview.stopReason,'answered_question')
})
test('a redundant-predicate hint cannot bypass urgent, unrelated or uncertain-media gates',()=>{
 const answeredPredicate={predicate:'bleeding',polarity:'no',sourceMessageId:'answer',quote:'现在没有出血'}
 for(const patch of [{intent:'chat'},{media:'unrelated'},{media:'uncertain'}]){
  const result=semanticInterview({decision:decision(patch)},{messageId:'message',answeredPredicate})
  assert.equal(result.semantic.organize,false);assert.notEqual(result.stopReason,'answered_question')
 }
 const urgent=semanticInterview({decision:decision()},{messageId:'message',answeredPredicate,urgent:true})
 assert.equal(urgent.status,'urgent');assert.equal(urgent.semantic.organize,false)
})
