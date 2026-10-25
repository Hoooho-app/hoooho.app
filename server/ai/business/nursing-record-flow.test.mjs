import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {AIBusinessService} from './service.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {currentSituation} from '../../visit-sheets/current-situation.mjs'

async function fixture(t){
  const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-nursing-flow-'))
  t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
  const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic-nursing',name:'小禾（虚构）',relationship:'child',birthday:'2024-01-01'})
  const now=()=>new Date('2026-10-24T08:00:00Z')
  const extraction={structured:async input=>{
    const raw=JSON.parse(input.input).sources.find(s=>s.id==='input').text
    return {value:{items:[{category:'symptom',title:'观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:raw,quote:raw,sourceId:'input',page:1}]}]},diagnostics:{provider:'synthetic'}}
  }}
  const business=new AIBusinessService({dataDirectory,model:extraction,now,logger:{info(){}}})
  let call=0
  const dialogue={structured:async()=>({value:{reply:'内容已收到。',contextId:'new',action:'record',questionId:call++===0?'resp-effort':'cough-pattern',emergency:{currentChild:false,quote:''}},diagnostics:{provider:'synthetic'}})}
  const front=new FrontDeskRecord({dataDirectory,events:business.events,business,model:dialogue,now})
  return {front,business,member}
}

test('bound voice no survives professional preview, save, replay and doctor-facing projection',async t=>{
  const f=await fixture(t),account='synthetic-nursing'
  const first=await f.front.submit(account,f.member.id,{id:'initial',kind:'text',text:'孩子昨晚开始咳嗽'})
  assert.equal(first.context.interview.question.id,'resp-effort')
  const answer={id:'voice-answer',kind:'voice',text:'没有',answerTo:{contextId:first.context.id,questionId:'resp-effort'}}
  const second=await f.front.submit(account,f.member.id,answer)
  assert.equal(second.context.id,first.context.id,'a model choosing new cannot reset a bound question')
  assert.equal(second.context.interview.turnCount,2,'a remaining impact question is useful without repeating the known pattern and onset')
  assert.equal(second.context.interview.question.id,'cough-impact')
  const replay=await f.front.submit(account,f.member.id,answer)
  assert.equal(replay.context.interview.turnCount,2)
  assert.equal(replay.context.messages.filter(m=>m.id==='voice-answer').length,1)
  const raw=second.context.messages.filter(m=>m.kind!=='assistant').map(m=>m.text).join('\n')
  let review=await f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:second.context.id})
  assert.match(review.items[0].professionalSummary.text,/家长未见孩子有明显呼吸费力/)
  assert.doesNotMatch(review.items[0].professionalSummary.text,/没有呕吐|呼吸正常|已排除/)
  assert.deepEqual(review.questions,[],'mechanical body/sleep form questions cannot override the focused dialogue')
  review=await f.business.save(account,f.member.id,review.id,{version:review.version,confirmed:true})
  const record=await f.business.records.getOwnedRecord(account,review.result.records[0].recordId)
  assert.equal(record.content,review.items[0].professionalSummary.text)
  assert.equal(record.sourceText,raw)
  assert.equal(record.aiProvenance.answerObservations[0].sourceMessageId,'voice-answer')
  assert.equal(record.aiProvenance.itemId,review.items[0].id)
  const projected=currentSituation({focusSourceIds:[`record:${record.id}`],complaintSourceId:`record:${record.id}`,sources:[{id:`record:${record.id}`}],focus:{mode:'source'},photoKey:'none',reading:{onset:'',change:'',description:'',sourceIds:[]}},{records:[record],organizations:[],member:{id:f.member.id}})
  assert.match(JSON.stringify(projected),/家长未见孩子有明显呼吸费力/)
  await f.business.save(account,f.member.id,review.id,{version:review.version,confirmed:true})
  assert.equal((await f.business.records.repository.findByAccountId(account)).length,1)
})

test('question identity rejects stale or foreign answers without new source writes',async t=>{
  const f=await fixture(t),account='synthetic-nursing'
  const first=await f.front.submit(account,f.member.id,{id:'initial',kind:'text',text:'孩子咳嗽'})
  const binding={contextId:first.context.id,questionId:'resp-effort'}
  await assert.rejects(()=>f.front.submit('foreign',f.member.id,{id:'foreign',kind:'text',text:'没有',answerTo:binding}))
  await f.front.submit(account,f.member.id,{id:'first-answer',kind:'text',text:'没有',answerTo:binding})
  await assert.rejects(()=>f.front.submit(account,f.member.id,{id:'stale',kind:'text',text:'有',answerTo:binding}),{code:'FRONT_ANSWER_STALE'})
  assert.equal((await f.front.snapshot(account,f.member.id,first.context.id)).messages.some(m=>m.id==='stale'),false)
})

test('unknown stops the interview even when a provider requests more questions',async t=>{
  const f=await fixture(t),account='synthetic-nursing'
  const first=await f.front.submit(account,f.member.id,{id:'initial',kind:'text',text:'孩子咳嗽'})
  const result=await f.front.submit(account,f.member.id,{id:'unknown-answer',kind:'text',text:'没注意',answerTo:{contextId:first.context.id,questionId:'resp-effort'}})
  assert.equal(result.context.id,first.context.id)
  assert.equal(result.context.interview.status,'ready')
  assert.equal(result.context.interview.question,null)
  assert.equal(result.context.interview.turnCount,1)
})

test('field correction invalidates an earlier professional projection before persistence',async t=>{
  const f=await fixture(t),account='synthetic-nursing'
  let review=await f.business.prepare(account,f.member.id,{text:'拉稀两回',smartRecord:true,frontDeskRecord:true})
  assert.equal(review.items[0].professionalSummary.text,'排稀便2次。')
  review=await f.business.edit(account,f.member.id,review.id,{version:review.version,itemId:review.items[0].id,field:'symptom',value:'记错了，稀便1次'})
  assert.match(review.items[0].professionalSummary.text,/稀便1次/)
  assert.doesNotMatch(review.items[0].professionalSummary.text,/2次/)
  const saved=await f.business.save(account,f.member.id,review.id,{version:review.version,confirmed:true})
  assert.match((await f.business.records.getOwnedRecord(account,saved.result.records[0].recordId)).content,/稀便1次/)
})

test('bound answer attaches only to its uniquely matching observation in a multi-item extraction',async t=>{
  const f=await fixture(t),account='synthetic-nursing'
  f.business.model.structured=async()=>({value:{items:[
    {category:'symptom',title:'皮肤观察',timeText:'昨晚',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'右腿起红点',quote:'昨晚右腿起红点',sourceId:'input',page:1}]},
    {category:'symptom',title:'咳嗽观察',timeText:'今天',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'咳嗽',quote:'孩子今天咳嗽',sourceId:'input',page:1}]}
  ]},diagnostics:{provider:'synthetic'}})
  const first=await f.front.submit(account,f.member.id,{id:'multi',kind:'text',text:'孩子今天咳嗽，昨晚右腿起红点'})
  const second=await f.front.submit(account,f.member.id,{id:'multi-answer',kind:'text',text:'没有',answerTo:{contextId:first.context.id,questionId:'resp-effort'}})
  const raw=second.context.messages.filter(m=>m.kind!=='assistant').map(m=>m.text).join('\n')
  const review=await f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:second.context.id})
  const skin=review.items.find(item=>item.fields.some(field=>field.value==='右腿起红点')),cough=review.items.find(item=>item.fields.some(field=>field.value==='咳嗽'))
  assert.ok(skin&&cough,JSON.stringify(review.items))
  assert.doesNotMatch(skin.professionalSummary.text,/呼吸/)
  assert.match(cough.professionalSummary.text,/家长未见孩子有明显呼吸费力/)
})

test('a bound answer cannot silently split from an overfull original context',async t=>{
  const f=await fixture(t),account='synthetic-nursing'
  const text='孩子咳嗽'+ '。'.repeat(4999-'孩子咳嗽'.length)
  const first=await f.front.submit(account,f.member.id,{id:'long',kind:'text',text})
  await assert.rejects(()=>f.front.submit(account,f.member.id,{id:'long-answer',kind:'text',text:'没有',answerTo:{contextId:first.context.id,questionId:'resp-effort'}}),{code:'FRONT_ANSWER_CONTEXT_FULL'})
  const restored=await f.front.snapshot(account,f.member.id,first.context.id)
  assert.equal(restored.messages.filter(m=>m.kind!=='assistant').length,1)
  assert.equal(restored.messages.find(m=>m.id==='long').text,text)
  assert.equal(restored.interview.question.id,'resp-effort')
})

test('a separately quoted time retains its proof through save and doctor-facing summary validation',async t=>{
 const f=await fixture(t),account='synthetic-nursing'
 f.business.model.structured=async()=>({value:{items:[{category:'symptom',title:'小腿红点',timeText:'昨天',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'起了红点',quote:'小腿起了红点',sourceId:'input',page:1},{name:'location',value:'小腿',quote:'小腿起了红点',sourceId:'input',page:1}]}]},diagnostics:{provider:'synthetic'}})
 const preview=await f.business.prepare(account,f.member.id,{text:'昨天小腿起了红点',smartRecord:true,frontDeskRecord:true})
 assert.match(preview.items[0].professionalSummary.text,/昨天/)
 const saved=await f.business.save(account,f.member.id,preview.id,{version:preview.version,confirmed:true})
 const record=await f.business.records.getOwnedRecord(account,saved.result.records[0].recordId)
 assert.equal(record.content,preview.items[0].professionalSummary.text)
 assert.equal(record.aiProvenance.timeSources[0].quote,'昨天')
 const projected=currentSituation({focusSourceIds:[`record:${record.id}`],complaintSourceId:`record:${record.id}`,sources:[{id:`record:${record.id}`}],focus:{mode:'source'},photoKey:'none',reading:{onset:'',change:'',description:'',sourceIds:[]}},{records:[record],organizations:[],member:{id:f.member.id}})
 assert.ok(JSON.stringify(projected).includes(record.content))
})
test('unobserved awakenings and settling behaviour cannot become structured sleep clock times',async t=>{
 const f=await fixture(t),account='synthetic-nursing',raw='夜间睡眠，睡觉时哭闹，安抚后能继续睡，没有观察到醒来'
 f.business.model.structured=async()=>({value:{items:[{category:'sleep',title:'睡眠观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[['sleepKind','夜间睡眠'],['quality','睡觉时哭闹'],['sleepAt','没有观察到醒来'],['wakeAt','安抚后能继续睡']].map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))}]},diagnostics:{provider:'synthetic'}})
 const preview=await f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true})
 assert.equal(preview.items[0].journal.sleep,undefined)
 assert.doesNotMatch(preview.items[0].professionalSummary.text,/入睡：|醒来：/)
 assert.match(preview.items[0].professionalSummary.text,/没有观察到醒来/)
})

for(const [raw,value] of [['看起来不太像过敏。','过敏'],['不太像有明显发烧。','发烧'],['可能是有点发烧。','发烧'],['好像有点发烧。','发烧'],['我怀疑孩子发烧。','发烧'],['感觉像过敏。','过敏'],['保姆说孩子吐了。','吐了']])test('full-source uncertainty or reporter survives preview and persistence: '+raw,async t=>{
 const f=await fixture(t),account='synthetic-nursing'
 f.business.model.structured=async()=>({value:{items:[{category:'symptom',title:'观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value,quote:raw,sourceId:'input',page:1}]}]},diagnostics:{provider:'synthetic-fault-injection'}})
 const preview=await f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true})
 assert.ok(preview.items[0].professionalSummary.text.includes(raw.replace(/。$/u,'')),preview.items[0].professionalSummary.text)
 const saved=await f.business.save(account,f.member.id,preview.id,{version:preview.version,confirmed:true})
 const record=await f.business.records.getOwnedRecord(account,saved.result.records[0].recordId)
 assert.equal(record.content,preview.items[0].professionalSummary.text)
 assert.equal(record.sourceText,raw)
})

test('a provider cannot disable live-narration grounding by selecting an archive category',async t=>{
 const f=await fixture(t),raw='看起来不太像过敏。',account='synthetic-nursing'
 f.business.model.structured=async()=>({value:{items:[{category:'symptom',title:'观察',timeText:null,subject:'current',archiveCategory:'allergy',relationKey:null,fields:[{name:'symptom',value:'过敏',quote:raw,sourceId:'input',page:1}]}]},diagnostics:{provider:'synthetic-fault-injection'}})
 const preview=await f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true})
 assert.match(preview.items[0].professionalSummary.text,/不太像过敏/)
})

for(const clipped of [true,false])test('a retired choice cannot be persisted, clipped='+clipped,async t=>{
 const f=await fixture(t),account='synthetic-nursing'
 const first=await f.front.submit(account,f.member.id,{id:'retire-start',kind:'text',text:'孩子呼吸声和平时不一样'})
 const second=await f.front.submit(account,f.member.id,{id:'retire-choice',kind:'text',text:'家长现在看到孩子呼吸明显费力。',answerTo:{contextId:first.context.id,questionId:'resp-effort'}})
 f.front.model.structured=async()=>({value:{reply:'收到',contextId:second.context.id,action:'record',questionId:null,emergency:{currentChild:false,quote:''}}})
 const third=await f.front.submit(account,f.member.id,{id:'retire-fix',kind:'text',text:'说错了，刚才没看清'})
 const raw=third.context.messages.filter(m=>m.kind!=='assistant').map(m=>m.text).join('\n')
 f.business.model.structured=async()=>({value:{items:[{category:'symptom',title:'观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[['symptom',clipped?'呼吸声和平时不一样':raw.slice(0,raw.indexOf('\n说错了')).replace(/。$/u,''),clipped?'孩子呼吸声和平时不一样':raw],['reaction','呼吸明显费力','家长现在看到孩子呼吸明显费力。'],['correction','说错了，刚才没看清','说错了，刚才没看清']].map(([name,value,quote])=>({name,value,quote,sourceId:'input',page:1}))}]},diagnostics:{provider:'synthetic-fault-injection'}})
 await assert.rejects(()=>f.business.prepare(account,f.member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:third.context.id}),error=>error.code==='AI_EVIDENCE_MISMATCH'&&error.validation.rule==='superseded_answer')
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,0)
})

for(const c of [
 {raw:'昨天去公园。今天老扯右耳朵。',timeText:'昨天',fields:[['symptom','老扯右耳朵','今天老扯右耳朵']],code:'AI_TIME_CONFLICT'},
 {raw:'哥哥咳嗽。他今天还发烧。',timeText:'今天',fields:[['symptom','发烧','他今天还发烧']],code:'AI_EVIDENCE_MISMATCH'},
 {raw:'昨天老扯左耳朵。今天老扯右耳朵。',timeText:'昨天',fields:[['symptom','老扯左耳朵','昨天老扯左耳朵'],['reaction','老扯右耳朵','今天老扯右耳朵']],code:'AI_TIME_CONFLICT'}
])test('fault injection cannot borrow another observation date or child: '+c.raw,async t=>{
 const f=await fixture(t),account='synthetic-nursing'
 f.business.model.structured=async()=>({value:{items:[{category:'symptom',title:'观察',timeText:c.timeText,subject:'current',archiveCategory:null,relationKey:null,fields:c.fields.map(([name,value,quote])=>({name,value,quote,sourceId:'input',page:1}))}]},diagnostics:{provider:'synthetic-fault-injection'}})
 await assert.rejects(()=>f.business.prepare(account,f.member.id,{text:c.raw,smartRecord:true,frontDeskRecord:true}),{code:c.code})
 const draft=await f.business.latest(account,f.member.id)
 assert.equal(draft.state,'failed');assert.equal(draft.inputText,c.raw)
 assert.equal((await f.business.records.repository.findByAccountId(account)).length,0)
})
