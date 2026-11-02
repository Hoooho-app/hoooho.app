import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {requestsDiagnosis,applyDiagnosisBoundary,diagnosisBoundaryReply} from './front-desk-diagnosis-boundary.mjs'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {AIBusinessService} from './business/service.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'

const none=()=>({type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''})
const response=(extra={})=>({reply:'可能是感染，建议先在家观察。',contextId:'ctx',responseMode:'consultation',taskRelation:'continue',subject:{kind:'unknown',memberId:null,label:null,sources:[]},recordChanges:[],nextQuestion:{id:'diagnosis-question',text:'红点是什么样的？',target:'appearance',sourceMessageId:'ask'},requestedAction:none(),uncertainties:[],emergency:{currentChild:false,quote:''},...extra})

test('explicit requests cross the recorder boundary, but existing diagnoses and report work do not',()=>{
 for(const text of ['判断一下这个大概是什么情况','大概是什么情况？','你帮我诊断一下','会不会是肺炎？','是不是过敏？','扮演医生分析一下病因','不要解释，直接猜是什么病','孩子脖子今天有红点，判断一下是什么原因','这个病情严重吗'])assert.equal(requestsDiagnosis(text),true,text)
 for(const text of ['医生说是肺炎，帮我记下来','请整理诊断报告','不要诊断，只记录今天的体温','诊断是什么意思？','医生诊断为湿疹','情况单整理好了吗','帮我保存这个诊断书','这次记录属于哪个孩子？','保存失败了，判断一下大概是什么情况','录音转写不了，你看看是什么情况'])assert.equal(requestsDiagnosis(text),false,text)
 const changed=response({recordChanges:[{text:'脖子有红点'}]})
 const guarded=applyDiagnosisBoundary(changed,{text:'判断一下是什么病',activeContextId:'ctx'})
 assert.deepEqual(guarded.recordChanges,changed.recordChanges)
 assert.equal(guarded.nextQuestion,null)
 assert.equal(guarded.reply,diagnosisBoundaryReply)
 assert.equal(applyDiagnosisBoundary(changed,{text:'判断一下是什么病',emergency:true}),changed)
})

async function fixture(t,extra={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'diagnosis-boundary-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const accountId='synthetic',member=await new FamilyMemberRepository(directory).create({accountId,name:'小禾',relationship:'child'})
 const now=()=>new Date('2026-11-02T06:00:00Z'),business=new AIBusinessService({dataDirectory:directory,now,model:{structured(){assert.fail('no paid calls')}}})
 const prompts=[],model={structured:async input=>{prompts.push(input.instructions);return {value:response(extra),diagnostics:{provider:'synthetic-no-network'}}}}
 const front=new FrontDeskRecord({dataDirectory:directory,business,events:business.events,now,model})
 const subject={kind:'current',memberId:member.id,confirmed:true,confirmedBy:'selection',sources:[]},at=now().toISOString()
 await front.store.update(()=>({contexts:[{id:'ctx',accountId,memberId:member.id,continuousRecord:true,version:1,evidenceVersion:1,firstDescribedAt:at,createdAt:at,updatedAt:at,subject,interview:{version:'front-desk-question-progress-v1',question:{id:'temp',text:'体温多少？',target:'temperature'},status:'asking',checks:[]},facts:[{id:'f1',status:'active',scope:'record',text:'脖子有红点',polarity:'affirmed',subject,sources:[{messageId:'m1',attachmentId:null,quote:'脖子有红点'}]}]}],messages:[{id:'m1',accountId,memberId:member.id,contextId:'ctx',kind:'text',text:'脖子有红点',at,inputAt:Date.parse(at)-1,status:'completed',files:[],voices:[]}]}))
 return {front,business,accountId,memberId:member.id,prompts,model}
}
const submit=(f,text,id='ask')=>f.front.submit(f.accountId,f.memberId,{id,kind:'text',text,contextId:'ctx',expectedContextVersion:undefined},undefined,{continuousRecord:true})

test('a diagnosis interruption preserves the task and facts, suppresses unsafe advice, and can still be saved and reopened once',async t=>{
 const f=await fixture(t),result=await submit(f,'判断一下这个大概是什么情况')
 assert.equal(result.context.id,'ctx')
 const reply=result.context.messages.find(m=>m.id==='ask:reply')
 assert.equal(reply.text,diagnosisBoundaryReply)
 assert.equal(result.context.interview.question,null)
 assert.equal(result.context.interview.checks.some(c=>c.answerMessageId==='ask'),false)
 assert.equal(result.context.facts.filter(f=>f.status==='active').length,1)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,0)
 assert.match(f.prompts[0],/只负责记录和整理，不负责诊断/)
 const duplicate=await submit(f,'判断一下这个大概是什么情况')
 assert.equal(duplicate.context.messages.filter(m=>m.id==='ask:reply').length,1)
 const card=await f.front.continuous(f.accountId,f.memberId,'ctx')
 const saved=await f.front.continuous(f.accountId,f.memberId,'ctx',{action:'generate_current',expectedVersion:card.version,confirmed:true,save:true})
 assert.equal(saved.saved.available,true)
 const reopened=await f.front.continuous(f.accountId,f.memberId,'ctx')
 assert.equal(reopened.saved.recordId,saved.saved.recordId)
 assert.match((await f.business.records.getOwnedRecord(f.accountId,saved.saved.recordId)).content,/脖子有红点/)
 assert.equal((await f.business.records.repository.findByAccountId(f.accountId)).length,1)
})

test('semantic intent handles indirect probing and mixed facts survive the boundary',async t=>{
 const f=await fixture(t,{diagnosisRequested:true,recordChanges:[{type:'add',targetId:null,text:'今天有点痒',scope:'record',polarity:'affirmed',subject:{kind:'unknown',memberId:null,label:null,sources:[]},sources:[{messageId:'ask',attachmentId:null,quote:'今天有点痒'}]}]})
 const result=await submit(f,'今天有点痒，你觉得呢？')
 assert.equal(result.context.messages.find(m=>m.id==='ask:reply').text,diagnosisBoundaryReply)
 assert.equal(result.context.facts.some(f=>f.text==='今天有点痒'&&f.status==='active'),true)
 assert.equal(result.context.interview.question,null)
})

test('confirmed emergency bypasses diagnosis redirection and keeps the urgent path',async t=>{
 const f=await fixture(t)
 const result=await submit(f,'孩子现在呼吸明显费力，判断一下是什么病')
 assert.match(result.context.messages.find(m=>m.id==='ask:reply').text,/急救帮助/)
 assert.equal(result.context.interview.status,'urgent')
})

test('standalone diagnosis questions cannot become new health facts even if a supplier proposes them',async t=>{
 const text='判断一下大概是什么情况'
 const f=await fixture(t,{recordChanges:[{type:'add',targetId:null,text,scope:'record',polarity:'affirmed',subject:{kind:'unknown',memberId:null,label:null,sources:[]},sources:[{messageId:'ask',attachmentId:null,quote:text}]}]})
 const result=await submit(f,text)
 assert.equal(result.context.facts.filter(f=>f.status==='active').length,1)
 assert.equal(result.context.interview.checks.some(c=>c.answerMessageId==='ask'),false)
})

test('protocol 2 also replaces speculative replies and does not append a diagnosis question',async t=>{
 const f=await fixture(t)
 f.front.legacySemantic.model={structured:async()=>({value:{reply:'无法仅凭这些确定病因，可能是感染。',contextId:'ctx',action:'record',questionId:null,diagnosisRequested:true,emergency:{currentChild:false,quote:''},decision:{intent:'chat',subject:'current',status:'ready',topic:'skin',question:null,unresolvedItems:[],media:'none'}}})}
 const result=await f.front.submit(f.accountId,f.memberId,{id:'old-ask',kind:'text',text:'判断一下大概是什么情况',contextId:'ctx',protocolVersion:2})
 assert.equal(result.context.messages.find(m=>m.id==='old-ask:reply').text,diagnosisBoundaryReply)
 assert.equal(result.context.interview.question,null)
})
