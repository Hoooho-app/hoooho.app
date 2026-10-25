import test from 'node:test'
import assert from 'node:assert/strict'
import {interactionInput,semanticInterview,interpretSemanticAnswer,factMessages} from './front-desk-semantics.mjs'
import {validateExtraction,resolveItemTime} from './contract.mjs'
import {groundNursingEvidence,boundNursingOnset} from './nursing-evidence.mjs'
import {recognitionKey,recognizePage} from './documents.mjs'
const decision=patch=>({intent:'record',subject:'current',status:'ready',topic:'injury',question:null,unresolvedItems:[],media:'none',...patch})
const reply=d=>({decision:d,questionId:null})
for(const [raw,kind] of [['','empty'],[' \n\t','empty'],['\u200b\ufeff','empty'],['？？','explain'],['...','symbols'],['😭','symbols'],['❤️','symbols'],['谢谢','courtesy'],['小拇指被踢破了',null],['有',null],['没有呕吐',null],['38.5',null]])test(`classifies interaction without facts: ${JSON.stringify(raw)}`,()=>{
 assert.equal(interactionInput(raw),kind)
 assert.equal(interactionInput(raw,true),null,'attachments remain processable regardless of text')
})
test('malformed and contradictory semantic decisions cannot declare ready',()=>{
 for(const value of [{},reply(decision({status:'ask'})),reply(decision({subject:'unknown'})),reply(decision({question:{text:'多余问题'}}))])assert.throws(()=>semanticInterview(value),{code:'FRONT_SEMANTIC_INVALID'})
 for(const patch of [{intent:'chat'},{subject:'other',status:'incomplete',question:{text:'这是当前成员吗？',slot:'subject',predicate:null,unit:null,options:[]}},{media:'uncertain'},{media:'unrelated'}])assert.equal(semanticInterview(reply(decision(patch))).semantic.organize,false)
})
test('binary displayed question is the exact predicate used to expand its short answer',()=>{
 const q={text:'这里疼吗？',slot:'observation',predicate:'bleeding',unit:null,options:[{label:'疼',value:'疼'}]}
 const interview=semanticInterview(reply(decision({status:'ask',question:q})),{messageId:'one'})
 assert.equal(interview.question.text,'目前还有出血吗？')
 assert.deepEqual(interview.question.options.map(o=>o.value),['有','没有','没注意'])
 assert.match(interpretSemanticAnswer(interview.question,'没有').text,/否认目前仍有出血/u)
 assert.equal(interpretSemanticAnswer(interview.question,'没注意').polarity,'unknown')
 assert.equal(interpretSemanticAnswer({...interview.question,semantic:{...interview.question.semantic,predicate:null}},'有').polarity,'literal')
})
test('numeric answers inherit units only from the displayed persisted question',()=>{
 const q={text:'体温是多少℃？',semantic:{version:2,slot:'quantity',predicate:null,unit:'℃'}}
 assert.match(interpretSemanticAnswer(q,'38.5').text,/38.5℃/u)
 assert.equal(interpretSemanticAnswer({...q,text:'数值是多少？'},'38.5').text,'38.5')
})
test('control and other-person messages never enter the fact projection',()=>assert.deepEqual(factMessages([{id:1,status:'completed',kind:'text'},{id:2,status:'completed',kind:'text',recordable:false},{id:3,status:'pending',kind:'image'},{id:4,status:'completed',kind:'assistant'}]).map(m=>m.id),[1]))
test('photo-only observation binds one exact dynamic onset with the answer day as anchor',()=>{
 const raw='今天开始',sources=[{id:'input',page:1,text:raw,status:'readable'},{id:'photo',page:1,text:'脚小趾表面有破皮',status:'readable',sourceKind:'visual_observation'}]
 const item={category:'injury',subject:'current',title:'小趾破皮',timeText:'今天',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:sources[1].text,quote:sources[1].text,sourceId:'photo',page:1}]}
 const answer={contextId:'owned',sourceMessageId:'onset-answer',answeredAt:'2026-10-26T08:00:00.000Z',questionId:'semantic:onset',domain:'injury',slot:'onset',questionDescriptor:{text:'这个破皮从什么时候开始？',semantic:{version:2,slot:'onset',topic:'injury'}},answerText:raw,rawStart:0,rawEnd:raw.length,status:'active'}
 const context={frontContextId:'owned',answerContext:[answer],referenceNow:'2026-10-25T08:00:00.000Z',timezone:'Asia/Shanghai'}
 const extract=(items,ctx)=>validateExtraction({items},sources,{timeEvidence:(item,all)=>boundNursingOnset(item,all,sources,ctx)})
 const [result]=groundNursingEvidence(extract([item],context),sources,context)
 assert.equal(result.timeResolution.source,'bound_nursing_answer')
 assert.equal(result.timeResolution.references[0].sourceMessageId,'onset-answer')
 assert.equal(result.timeResolution.referenceNow,answer.answeredAt)
 assert.equal(resolveItemTime(result,{...context,referenceNow:result.timeResolution.referenceNow}).resolvedStart,'2026-10-25T16:00:00.000Z')
 for(const patch of [{contextId:'foreign'},{rawStart:1},{status:'superseded'},{domain:'skin'}])assert.throws(()=>extract([item],{...context,answerContext:[{...answer,...patch}]}))
 assert.throws(()=>extract([item,{...item}],context))
})
test('visual recognition keeps an observation distinct from OCR and never makes uncertain empty pages normal',async()=>{
 const page={id:'photo',page:1,name:'合成.png',hash:'bytes',dataUrl:'data:image/png;base64,AA==',mimeType:'image/png'}
 let value={kind:'observation',status:'readable',text:'',observations:[{text:'局部发红',region:'图片中央'}]}
 const model={frontDeskVisual:true,provider:{name:'test',visionModel:'v1'},structured:async({task})=>{assert.equal(task,'front-desk-visual-source');return {value}}}
 const visible=await recognizePage(page,model)
 assert.equal(visible.sourceKind,'visual_observation');assert.match(visible.text,/照片可见观察.*局部发红/u)
 value={kind:'observation',status:'uncertain',text:'',observations:[]}
 assert.equal((await recognizePage(page,model)).status,'uncertain')
 value={kind:'unrelated',status:'readable',text:'模型多余文字',observations:[]}
 assert.equal((await recognizePage(page,model)).text,'')
 assert.notEqual(recognitionKey(page,model),recognitionKey(page,{...model,frontDeskVisual:false}))
 assert.notEqual(recognitionKey(page,model),recognitionKey(page,{...model,provider:{...model.provider,visionModel:'v2'}}))
})
