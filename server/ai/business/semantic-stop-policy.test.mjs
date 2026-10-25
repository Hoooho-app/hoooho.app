// Source messages and files are real persisted fixtures; no live provider calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import {nursingResponseIntent} from './nursing-response-intent.mjs'
import {semanticInterview,factMessages} from './front-desk-semantics.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'

const stopQuestion={text:'现在走路有什么变化？',slot:'impact',predicate:'activity_impact',unit:null,options:[]}
const stopSubjectQuestion={text:'这是哪位成员的情况？',slot:'subject',predicate:null,unit:null,options:[]}
const stopDecision=patch=>({intent:'record',subject:'current',subjectResolution:null,status:'ask',topic:'injury',question:stopQuestion,unresolvedItems:['疼痛程度未明确'],media:'body',...patch})
const stopValue=d=>({decision:d,questionId:null})
const stopRaw=context=>factMessages(context.messages).map(m=>m.text).filter(Boolean).join('\n')
const stopSentence='先按已经说过的情况记录，不再追问。不清楚的项目保留待确认。'

test('direct stop clauses need not be the final clause and do not erase independent facts',()=>{
 for(const text of [
  stopSentence,
  '脚趾今天被踢破了，不再追问，不清楚的项目保留待确认。',
  '先记下来。现在没有出血。',
  '先记录。明天有变化再补充。',
  '照片标签写着“仅供参考”。不再追问，未知项保留待确认。',
 ])assert.equal(nursingResponseIntent(text).stop,true,text)
})

test('quoted, reported, conditional or future stop language is not a direct present request',()=>{
 for(const text of [
  '医生说：“不再追问。”',
  '医生说：“先记录。不再追问。未知项保留。”',
  '“如果看不清。先记录。不再追问。”只是图片里的文字。',
  '医生说，不再追问。',
  '如果资料不够，就先记录，不再追问。',
  '明天再记录，不再追问。',
  '如果护士说“先记录”，我应该怎么办？',
  '“先按已经说过的情况记录，不再追问。”这句话什么意思？',
  '不要理解成我不再追问。',
 ])assert.equal(nursingResponseIntent(text).stop,false,text)
})

test('scanning stop clauses does not turn an interior courtesy into a finish or ignore a later explicit withdrawal',()=>{
 for(const text of ['谢谢，我还有一条要补充。','嗯，现在还有点红。','不再追问。不过我改主意了，请继续问。'])assert.equal(nursingResponseIntent(text).stop,false,text)
 assert.equal(nursingResponseIntent('谢谢').stop,true,'retain the existing whole-message finish convention')
 assert.equal(nursingResponseIntent('不知道').kind,'unknown','unknown is not transformed into a denial')
})

test('server stop request overrides a model ordinary ask for a current member and safe media only',()=>{
 const previous={askedQuestionIds:['semantic:already-shown'],askedKnowledgeQuestionIds:['injury-onset'],turnCount:1}
 for(const media of ['none','body','document','medication','food']){
  const value=stopValue(stopDecision({media})),before=structuredClone(value)
  const result=semanticInterview(value,{messageId:'finished',previous,stopRequested:true})
  assert.equal(result.status,'ready');assert.equal(result.question,null);assert.equal(result.stopReason,'user_finished')
  assert.equal(result.semantic.organize,true);assert.equal(result.semantic.disposition,'summarize')
  assert.deepEqual(result.semantic.unresolvedItems,['疼痛程度未明确'])
  assert.deepEqual(result.askedQuestionIds,previous.askedQuestionIds,'a suppressed supplier question was never shown')
  assert.equal(result.turnCount,1)
  assert.deepEqual(value,before,'normalization must not mutate model evidence or caller state')
 }
 const ordinary=semanticInterview(stopValue(stopDecision()),{messageId:'ordinary',previous})
 assert.equal(ordinary.status,'asking');assert.ok(ordinary.question);assert.equal(ordinary.semantic.organize,false)
})

test('stop cannot resolve unknown ownership, promote unrelated chat/media or override an urgent observation',()=>{
 for(const patch of [
  {intent:'clarify',subject:'unknown',question:stopSubjectQuestion},
  {intent:'clarify',subject:'other',question:stopSubjectQuestion},
  {media:'uncertain'},
  {media:'unrelated'},
  {intent:'chat'},
  {intent:'history'},
 ]){
  const result=semanticInterview(stopValue(stopDecision(patch)),{messageId:'blocked',stopRequested:true})
  assert.equal(result.semantic.organize,false,JSON.stringify(patch))
 }
 const urgent=semanticInterview(stopValue(stopDecision()),{messageId:'urgent',stopRequested:true,urgent:true})
 assert.equal(urgent.status,'urgent');assert.equal(urgent.stopReason,'important_observation');assert.equal(urgent.semantic.organize,false)
})

async function stopFrontFixture(t,{unknown=false}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-stop-policy-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const account='synthetic-stop-policy',member=await new FamilyMemberRepository(directory).create({accountId:account,name:'虚构停止追问',relationship:'child'})
 const service=new AIBusinessService({dataDirectory:directory,logger:{info(){},warn(){}}})
 let selected='new',calls=0
 const model={async structured(){calls++;return {value:{reply:'嗯，我了解了。',contextId:selected,action:'record',questionId:null,emergency:{currentChild:false,quote:''},decision:stopDecision(unknown?{intent:'clarify',subject:'unknown',question:stopSubjectQuestion}:{})},diagnostics:{provider:'synthetic'}}}}
 const front=new FrontDeskRecord({dataDirectory:directory,events:service.events,business:service,model})
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#bb4455'}}).png().toBuffer(),photo={name:'synthetic-toe.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}
 const submit=(id,text,extra={})=>front.submit(account,member.id,{id,protocolVersion:2,kind:'text',text,...extra})
 return {account,member,service,front,photo,submit,select:id=>{selected=id},calls:()=>calls}
}

test('photo conversation with a stubborn ask model finishes on explicit stop and retains all mixed health text and the original photo',async t=>{
 const f=await stopFrontFixture(t),at=Date.now()-10000
 const first=await f.submit('photo-first','这是宝宝脚趾的照片',{kind:'image',files:[f.photo],inputAt:at});f.select(first.context.id)
 assert.equal(first.context.interview.status,'asking')
 const text='脚趾是今天被踢破的，现在没有出血。'+stopSentence
 const done=await f.submit('photo-stop',text,{inputAt:at+1,answerTo:{contextId:first.context.id,questionId:first.context.interview.question.id}})
 assert.equal(done.context.interview.status,'ready');assert.equal(done.context.interview.question,null)
 assert.equal(done.context.interview.stopReason,'user_finished');assert.equal(done.context.decision.organize,true)
 assert.equal(done.context.messages.find(m=>m.id==='photo-stop').text,text)
 assert.equal(done.context.messages.find(m=>m.id==='photo-stop').recordable,true)
 assert.equal(stopRaw(done.context),'这是宝宝脚趾的照片\n'+text,'keep mixed observations rather than dropping a whole control-containing message')
 assert.equal(done.context.messages.find(m=>m.id==='photo-first').files[0].dataUrl,f.photo.dataUrl)
 const evidence=await f.service.frontAnswerObservations(f.account,f.member.id,first.context.id,stopRaw(done.context))
 assert.equal(evidence.mediaHashes.length,1);assert.deepEqual(evidence.unresolvedItems,['疼痛程度未明确'])
 assert.equal(f.calls(),2,'no extra rewrite conversation call is required to enforce the stop')
})

test('explicit stop in an unknown-owner photo conversation preserves the isolated material and cannot bypass ownership',async t=>{
 const f=await stopFrontFixture(t,{unknown:true}),at=Date.now()-10000
 const first=await f.submit('unknown-photo','这张照片',{kind:'image',files:[f.photo],inputAt:at});f.select(first.context.id)
 const done=await f.submit('unknown-stop',stopSentence,{inputAt:at+1,answerTo:{contextId:first.context.id,questionId:first.context.interview.question.id}})
 assert.equal(done.context.decision.organize,false);assert.equal(done.context.interview.status,'asking')
 assert.equal(done.context.interview.question.semantic.slot,'subject');assert.equal(stopRaw(done.context),'')
 assert.equal(done.context.messages.find(m=>m.id==='unknown-photo').files[0].dataUrl,f.photo.dataUrl)
 assert.equal(done.context.messages.find(m=>m.id==='unknown-photo').recordable,false)
 await assert.rejects(()=>f.service.frontAnswerObservations(f.account,f.member.id,first.context.id,''),{code:'FRONT_RECORD_NOT_READY'})
})
