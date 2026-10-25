import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'

const account='synthetic-cold-time'
const inputs=['身体有点冷','家长摸着孩子身体觉得凉。','今天开始，持续了十分钟']
const now=()=>new Date('2026-10-25T08:00:00.000Z')
const item=(timeText='今天')=>({category:'symptom',title:'身体冷感',timeText,subject:'current',archiveCategory:null,relationKey:null,fields:[
 {name:'symptom',value:'身体有点冷',quote:'身体有点冷',sourceId:'input',page:1},
 {name:'reaction',value:inputs[1],quote:inputs[1],sourceId:'input',page:1},
 {name:'durationMinutes',value:'持续了十分钟',quote:'持续了十分钟',sourceId:'input',page:1}
]})
async function fixture(t,output=item()){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-cold-time-binding-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'冷感时间（虚构）',relationship:'child',birthday:'2024-01-01'})
 const extraction={structured:async()=>({value:{items:[structuredClone(output)]},diagnostics:{provider:'synthetic-short-quotes'}})}
 const business=new AIBusinessService({dataDirectory,model:extraction,now,logger:{info(){}}})
 // Deliberately return new/null: actual persisted question/answer binding, rather
 // than a helpful model, must preserve the same observation through all turns.
 const dialogue={structured:async()=>({value:{reply:'内容已收到。',contextId:'new',action:'record',questionId:null,emergency:{currentChild:false,quote:''}},diagnostics:{provider:'synthetic'}})}
 const front=new FrontDeskRecord({dataDirectory,events:business.events,business,model:dialogue,now})
 return {front,business,member}
}
async function interview(f,{initial=inputs[0],onset=inputs[2]}={}){
 let turn=await f.front.submit(account,f.member.id,{id:'initial',kind:'text',text:initial,inputAt:now().getTime()-2000})
 const contextId=turn.context.id
 assert.equal(turn.context.interview.question?.id,'cold-observation')
 turn=await f.front.submit(account,f.member.id,{id:'touch-answer',kind:'text',text:inputs[1],inputAt:now().getTime()-1000,answerTo:{contextId,questionId:'cold-observation'}})
 assert.equal(turn.context.id,contextId)
 assert.equal(turn.context.interview.question?.id,'cold-onset')
 turn=await f.front.submit(account,f.member.id,{id:'onset-answer',kind:'text',text:onset,inputAt:now().getTime(),answerTo:{contextId,questionId:'cold-onset'}})
 assert.equal(turn.context.id,contextId)
 assert.equal(turn.context.interview.status,'ready')
 assert.equal(turn.context.interview.question,null)
 assert.equal(turn.context.interview.turnCount,2)
 const raw=turn.context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed').map(m=>m.text).join('\n')
 return {contextId,raw}
}
for(const contract of ['defaults','ui'])for(const timeText of ['今天','今天开始',inputs[2]])test(`bound cold onset survives short quotes, save/readback and replay (${contract}: ${timeText})`,async t=>{
 const f=await fixture(t,item(timeText)),{contextId,raw}=await interview(f)
 assert.equal(raw,inputs.join('\n'))
 const extra=contract==='ui'?{selectedOccurredAt:now().toISOString(),confirmOccurrenceTime:false}:{}
 const review=await f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false,timezone:'Asia/Shanghai',...extra})
 assert.equal(review.state,'ready')
 assert.equal(review.items.length,1)
 assert.equal(review.items[0].category,'symptom')
 const summary=review.items[0].professionalSummary?.text
 assert.ok(summary)
 assert.match(summary,/家长.*摸|摸.*家长/u)
 assert.match(summary,/今天|今日/u)
 assert.match(summary,/(?:十|10)分钟/u)
 assert.doesNotMatch(summary,/低体温|发热|发烧|感冒|寒战|休克|体温正常/u)
 assert.ok(review.items[0].timeSources?.some(ref=>ref.sourceId==='input'&&ref.page===1&&raw.includes(ref.quote)&&/今天/u.test(ref.quote)),'bound onset keeps explicit source proof')
 const saved=await f.business.save(account,f.member.id,review.id,{version:review.version,confirmed:true})
 assert.equal(saved.result.count,1)
 const ref=saved.result.records[0],record=await f.business.records.getOwnedRecord(account,ref.recordId)
 assert.equal(record.sourceText,raw)
 assert.equal(record.content,summary)
 assert.equal(record.aiProvenance.professionalSummary.text,summary)
 assert.equal(record.journal.timePrecision,'period')
 assert.equal(record.occurredAt,'2026-10-24T16:00:00.000Z')
 assert.notEqual((await f.business.events.get(account,ref.eventId)).caseTracking,true)
 const replay=await f.business.save(account,f.member.id,review.id,{version:saved.version,confirmed:true})
 assert.deepEqual(replay.result,saved.result)
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,1)
 assert.equal((await f.business.events.repository.findByAccountId(account)).length,1)
})

test('unbound date in a separate source turn remains rejected',async t=>{
 const f=await fixture(t),raw=inputs.join('\n')
 await assert.rejects(()=>f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,followUp:false,timezone:'Asia/Shanghai'}),{code:'AI_TIME_CONFLICT'})
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,0)
})

test('bound today answer cannot authorize borrowing yesterday from another activity',async t=>{
 const f=await fixture(t,item('昨天')),{contextId,raw}=await interview(f,{initial:'昨天去公园。身体有点冷'})
 await assert.rejects(()=>f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false,timezone:'Asia/Shanghai'}),{code:'AI_TIME_CONFLICT'})
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,0)
})

for(const timeText of ['今天','昨天开始，今天开始，持续了十分钟'])test(`a bound onset answer with conflicting dates remains rejected without saving (${timeText})`,async t=>{
 const f=await fixture(t,item(timeText)),{contextId,raw}=await interview(f,{onset:'昨天开始，今天开始，持续了十分钟'})
 await assert.rejects(()=>f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false,timezone:'Asia/Shanghai'}),{code:'AI_TIME_CONFLICT'})
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,0)
})

for(const [timeText,initial] of [['今天10点','今天10点喝奶。身体有点冷'],['持续了十分钟',inputs[0]]])test(`onset cannot borrow precision or use duration as a date (${timeText})`,async t=>{
 const f=await fixture(t,item(timeText)),{contextId,raw}=await interview(f,{initial})
 await assert.rejects(()=>f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false,timezone:'Asia/Shanghai'}),{code:'AI_TIME_CONFLICT'})
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,0)
})
