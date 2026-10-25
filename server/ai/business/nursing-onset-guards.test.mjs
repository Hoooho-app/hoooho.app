import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {groundNursingEvidence} from './nursing-evidence.mjs'
import {validateExtraction} from './contract.mjs'
import {AIBusinessService} from './service.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
const raw='身体有点冷\n家长摸着孩子身体觉得凉。\n今天开始，持续了十分钟'
const baseItem=()=>({category:'symptom',title:'身体冷感',timeText:'今天',subject:'current',archiveCategory:null,relationKey:null,fields:[
 {name:'symptom',value:'身体有点冷',quote:'身体有点冷',sourceId:'input',page:1},
 {name:'reaction',value:'家长摸着孩子身体觉得凉。',quote:'家长摸着孩子身体觉得凉。',sourceId:'input',page:1}
]})
function ground({text=raw,items=[baseItem()],answer={}}={}){
 const source={id:'input',page:1,text,status:'readable'},rawStart=text.indexOf('今天开始'),rawEnd=rawStart+'今天开始，持续了十分钟'.length
 const context={referenceNow:'2026-10-25T08:00:00.000Z',timezone:'Asia/Shanghai',frontContextId:'owned-context',answerContext:[{contextId:'owned-context',sourceMessageId:'onset-answer',questionId:'cold-onset',domain:'cold',answerText:'今天开始，持续了十分钟',rawStart,rawEnd,status:'active',...answer}]}
 return groundNursingEvidence(validateExtraction({items},[source]),[source],context)
}
test('exact current-context onset answer has a sourced binding control',()=>{
 const [item]=ground()
 assert.equal(item.timeResolution.source,'bound_nursing_answer')
 assert.equal(item.timeResolution.references[0].sourceMessageId,'onset-answer')
 assert.equal(item.timeResolution.references[0].quote,'今天开始，持续了十分钟')
})
for(const [name,answer] of [
 ['foreign context',{contextId:'another-context'}],
 ['wrong raw source range',{rawStart:0,rawEnd:'今天开始，持续了十分钟'.length}],
 ['source text mismatch',{answerText:'今天开始，持续了二十分钟'}],
 ['retired answer',{status:'superseded'}]
])test(`onset binding rejects ${name}`,()=>{
 assert.throws(()=>ground({answer}),{code:'AI_TIME_CONFLICT'})
})
test('one bound onset cannot be copied to multiple ambiguous cold items',()=>{
 const text=raw+'\n右脚摸起来凉',second={...baseItem(),title:'右脚凉感',fields:[{name:'symptom',value:'右脚摸起来凉',quote:'右脚摸起来凉',sourceId:'input',page:1}]}
 assert.throws(()=>ground({text,items:[baseItem(),second]}),{code:'AI_TIME_CONFLICT'})
})

test('generic correction retires the persisted onset answer before time binding or saving',async t=>{
 const account='synthetic-retired-onset',directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-retired-onset-'))
 t.after(()=>rm(directory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(directory).create({accountId:account,name:'更正时间（虚构）',relationship:'child',birthday:'2024-01-01'})
 const now=()=>new Date('2026-10-25T08:00:00.000Z')
 const business=new AIBusinessService({dataDirectory:directory,now,logger:{info(){}},model:{structured:async()=>({value:{items:[baseItem()]},diagnostics:{provider:'synthetic'}})}})
 let selected='new'
 const front=new FrontDeskRecord({dataDirectory:directory,events:business.events,business,now,model:{structured:async()=>({value:{reply:'内容已收到。',contextId:selected,action:'record',questionId:null,emergency:{currentChild:false,quote:''}}})}})
 const first=await front.submit(account,member.id,{id:'initial',kind:'text',text:'身体有点冷',inputAt:now().getTime()-3000}),contextId=first.context.id
 await front.submit(account,member.id,{id:'touch',kind:'text',text:'家长摸着孩子身体觉得凉。',inputAt:now().getTime()-2000,answerTo:{contextId,questionId:'cold-observation'}})
 await front.submit(account,member.id,{id:'onset',kind:'text',text:'今天开始，持续了十分钟',inputAt:now().getTime()-1000,answerTo:{contextId,questionId:'cold-onset'}})
 selected=contextId
 const final=await front.submit(account,member.id,{id:'correction',kind:'text',text:'说错了，刚才没看清',inputAt:now().getTime()})
 assert.equal(final.context.id,contextId)
 const currentRaw=final.context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed').map(m=>m.text).join('\n')
 const evidence=await business.frontAnswerObservations(account,member.id,contextId,currentRaw)
 assert.equal(evidence.context.find(answer=>answer.questionId==='cold-onset').status,'superseded')
 await assert.rejects(()=>business.prepare(account,member.id,{text:currentRaw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false,timezone:'Asia/Shanghai'}),{code:'AI_TIME_CONFLICT'})
 assert.equal((await business.records.repository.findByAccountId(account)).length,0)
})
