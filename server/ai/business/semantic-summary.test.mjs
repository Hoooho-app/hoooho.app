// All model results are injected; this file never calls a live model.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {generateSemanticSummaries,validSemanticSummary,summaryEvidenceKey} from './semantic-summary.mjs'
import * as semanticSummary from './semantic-summary.mjs'
import {fingerprint,validateExtraction,mergeItems,buildJournal} from './contract.mjs'
import {bindFrontDeskAnswerContext} from './front-desk-answer-context.mjs'
import {buildFrontDeskFactSources} from './front-desk-source-context.mjs'
import {buildProfessionalSummary,validateProfessionalSummary} from './professional-summary.mjs'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'
import {currentSituation} from '../../visit-sheets/current-situation.mjs'

const clone=value=>structuredClone(value)
function factsFixture({raw='脚小拇指被踢破了',category='symptom',entries=[['symptom','脚小拇指被踢破了']],timeText=null}={}){
 const sources=[{id:'input',page:1,text:raw,status:'readable'}]
 const item={id:'item-1',category,timeText,fields:entries.map(([name,value])=>({name,value,sources:[{sourceId:'input',page:1,quote:raw}],confirmed:false,editedBy:'model'}))}
 return {item,sources}
}
const allIds=packet=>packet.facts.flatMap(f=>f.factIds)
const candidate=(packet,text='足小趾被踢后破损',title='足小趾被踢后破损')=>({itemId:packet.itemId,title,claims:[{text,factIds:allIds(packet)}]})
const approved=items=>({items:items.map(c=>({itemId:c.itemId,titleSupported:true,complete:true,missingFacts:[],problems:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))})
function fakeModel({generate=packet=>candidate(packet),generation,verify=approved}={}){
 const calls=[]
 return {calls,async structured({task,input}){
  calls.push(task)
  const parsed=JSON.parse(input)
  if(task==='professional-summary-generate')return {value:generation===undefined?{items:parsed.items.map(generate)}:clone(generation)}
  assert.equal(task,'professional-summary-verify')
  return {value:verify(parsed.candidates,parsed.facts)}
 }}
}
const run=(fixture,model,extra={})=>generateSemanticSummaries([fixture.item],{model,sources:fixture.sources,buildFacts:buildProfessionalSummary,...extra})
const summaryError=error=>Boolean(!(error instanceof TypeError)&&/^AI_SUMMARY_/u.test(error.code??''))

test('same numeric value cannot acquire a different dose unit even if verifier says yes',async()=>{
 const f=factsFixture({raw:'服了合成药0.5 mg',category:'medication',entries:[['medicationName','合成药'],['doseOriginal','0.5 mg']]})
 const model=fakeModel({generate:p=>candidate(p,'服用合成药0.5 g','合成药服用记录')})
 await assert.rejects(()=>run(f,model),{code:'AI_SUMMARY_UNSUPPORTED'})
 assert.deepEqual(model.calls,['professional-summary-generate'])
})

test('unchanged reported doctor advice survives generation and independent verification',async()=>{
 const f=factsFixture({raw:'医生建议服用合成药',category:'visit',entries:[['doctorStatement','医生建议服用合成药']]})
 const model=fakeModel({generate:p=>candidate(p,'医生建议服用合成药','原医生意见')})
 const [item]=await run(f,model)
 assert.equal(item.professionalSummary.text,'医生建议服用合成药。')
 assert.equal(validSemanticSummary(item.professionalSummary,item),true)
 assert.deepEqual(model.calls,['professional-summary-generate','professional-summary-verify'])
})

test('a result and its separately extracted unit can be expressed together naturally',async()=>{
 const f=factsFixture({raw:'合成项目结果4.2 mmol/L',category:'examination',entries:[['testName','合成项目'],['result','4.2'],['unit','mmol/L']]})
 const model=fakeModel({generate:p=>candidate(p,'合成项目结果为4.2 mmol/L','合成检查结果')})
 const [item]=await run(f,model)
 assert.equal(item.professionalSummary.text,'合成项目结果为4.2 mmol/L。')
})

test('vaccination dose sequence 1 can be expressed as 第1剂 while new quantities or volume units remain forbidden',async()=>{
 const f=factsFixture({raw:'接种合成疫苗第1剂',category:'vaccination',entries:[['vaccineName','合成疫苗'],['doseOriginal','1']]})
 const model=fakeModel({generate:p=>{
  assert.ok(p.facts.some(fact=>fact.text==='接种剂次：1'))
  return candidate(p,'接种合成疫苗第1剂。','合成疫苗接种')
 }})
 const [item]=await run(f,model,{sourceCoverage:true})
 assert.equal(item.professionalSummary.text,'接种合成疫苗第1剂。')
 assert.equal(item.fields[1].value,'1')
 for(const text of ['接种合成疫苗第2剂。','接种合成疫苗1 mL。'])await assert.rejects(()=>run(f,fakeModel({generate:p=>candidate(p,text,'合成疫苗接种')})),{code:'AI_SUMMARY_UNSUPPORTED'})
})

for(const [name,configuration] of [
 ['null generation',{generation:{items:[null]}}],
 ['null claim',{generate:p=>({...candidate(p),claims:[null]})}],
 ['null verifier item',{verify:()=>({items:[null]})}],
 ['null verifier claim',{verify:items=>({items:items.map(c=>({...approved([c]).items[0],claims:[null]}))})}],
 ['missing generation items',{generation:{}}],
 ['missing verifier items',{verify:()=>({})}],
])test(`${name} is rejected with a summary error rather than a TypeError`,async()=>{
 await assert.rejects(()=>run(factsFixture(),fakeModel(configuration)),summaryError)
})

test('unverified facts are rejected rather than silently removed from the summary batch',async()=>{
 const f=factsFixture();f.item.fields[0].value='没有发生的内容'
 const model=fakeModel()
 await assert.rejects(()=>run(f,model),{code:'AI_SUMMARY_INCOMPLETE'})
 assert.equal(model.calls.length,0)
})

test('omitting a known fact cannot be approved merely by a permissive verifier',async()=>{
 const f=factsFixture({raw:'脚小拇指被踢破了，已用清水清洗',entries:[['symptom','脚小拇指被踢破了'],['handling','已用清水清洗']]})
 const model=fakeModel({generate:p=>({...candidate(p),claims:[{text:'足小趾被踢后破损',factIds:p.facts[0].factIds}]})})
 await assert.rejects(()=>run(f,model),{code:'AI_SUMMARY_INCOMPLETE'})
 assert.deepEqual(model.calls,['professional-summary-generate'])
})

test('unknown or foreign fact IDs are rejected before verification',async()=>{
 const model=fakeModel({generate:p=>({...candidate(p),claims:[{text:'足小趾被踢后破损',factIds:['another-item:field:0']}]})})
 await assert.rejects(()=>run(factsFixture(),model),{code:'AI_SUMMARY_UNSUPPORTED'})
 assert.equal(model.calls.length,1)
})

for(const [name,mutate] of [
 ['unsupported title',v=>({...v,titleSupported:false})],
 ['incomplete semantics',v=>({...v,complete:false})],
 ['unsupported sentence',v=>({...v,claims:[{index:0,supported:false}]})],
 ['noncontiguous verdict index',v=>({...v,claims:[{index:1,supported:true}]})],
 ['reported verification problem',v=>({...v,problems:['unknown was changed to a negative']})],
])test(`independent verifier rejects ${name}`,async()=>{
 const model=fakeModel({verify:items=>({items:approved(items).items.map(mutate)})})
 await assert.rejects(()=>run(factsFixture(),model),{code:'AI_SUMMARY_UNSUPPORTED'})
 assert.equal(model.calls.length,2)
})

test('the stored itemId and confirmed flag remain compatible with v2 provenance',async()=>{
 const [item]=await run(factsFixture(),fakeModel())
 const stored={...clone(item),itemId:item.id,fields:item.fields.map(f=>({...clone(f),confirmed:true}))}
 delete stored.id
 assert.equal(validSemanticSummary(item.professionalSummary,stored),true)
 assert.equal(validateProfessionalSummary(item.professionalSummary,{...stored,id:stored.itemId}),true)
 const legacy=buildProfessionalSummary(item)
 assert.equal(validateProfessionalSummary(legacy,item),true)
})

test('fact, time, category, source and unknown edits invalidate v2; title-only edits preserve its body',async()=>{
 const [item]=await run(factsFixture(),fakeModel())
 for(const [name,mutate] of [
  ['fact',x=>{x.fields[0].value='已经恢复'}],
  ['time',x=>{x.timeText='昨天'}],
  ['category',x=>{x.category='other'}],
  ['source',x=>{x.fields[0].sources[0].quote='不同原话'}],
  ['unknown',x=>{x.unresolvedItems=['疼痛情况未知']}],
 ]){
  const edited=clone(item);mutate(edited)
  assert.equal(validSemanticSummary(item.professionalSummary,edited),false,name)
 }
 assert.equal(validSemanticSummary(item.professionalSummary,{...item,title:'家长改过的名称',titleEditedBy:'user'}),true)
 const forged=clone(item.professionalSummary);forged.text='已经确诊某病。'
 assert.equal(validSemanticSummary(forged,item),false)
})

async function serviceFixture(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-semantic-summary-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const account='synthetic-semantic-summary',now=()=>new Date('2026-10-24T08:00:00Z'),raw='今天脚小拇指被踢破了'
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'虚构摘要测试人物',relationship:'child',birthday:'2024-01-01'})
 await new JsonStore(path.join(dataDirectory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({
  contexts:[{id:'synthetic-context',accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:['当前疼痛程度不清楚']}}],
  messages:[{id:'synthetic-source',contextId:'synthetic-context',accountId:account,memberId:member.id,status:'completed',kind:'text',text:raw,recordable:true,inputAt:now().getTime(),files:[],voices:[]}],
 }))
 const calls=[]
 const model={async structured({task,input}){
  calls.push(task)
  const parsed=JSON.parse(input)
  if(task==='draft-extraction')return {value:{items:[{category:'symptom',title:'观察',subject:'current',timeText:'今天',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'脚小拇指被踢破了',quote:raw,sourceId:'input',page:1}]}]},diagnostics:{provider:'synthetic'}}
  if(task==='professional-summary-generate')return {value:{items:parsed.items.map(p=>({itemId:p.itemId,title:'足小趾被踢后破损',claims:[
   {text:'今天足小趾被踢后破损',factIds:p.facts.filter(f=>!f.text.startsWith('待确认：')).flatMap(f=>f.factIds)},
   {text:'当前疼痛程度待确认',factIds:p.facts.filter(f=>f.text.startsWith('待确认：')).flatMap(f=>f.factIds)},
  ]}))}}
  assert.equal(task,'professional-summary-verify')
  return {value:approved(parsed.candidates)}
 }}
 const service=new AIBusinessService({dataDirectory,model,now,logger:{info(){},warn(){}}})
 const prepare=()=>service.prepare(account,member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:'synthetic-context'})
 return {service,account,member,raw,calls,prepare}
}

test('v2 preview, draft read, persisted record and doctor-facing summary use the same verified text',async t=>{
 const f=await serviceFixture(t)
 let draft=await f.prepare()
 const initial=draft.items[0].professionalSummary
 assert.equal(initial.version,'professional-summary-v2')
 assert.match(initial.text,/疼痛程度待确认/u)
 assert.equal((await f.service.read(f.account,f.member.id,draft.id)).items[0].professionalSummary.text,initial.text)
 assert.equal((await f.prepare()).items[0].professionalSummary.text,initial.text)
 assert.equal(f.calls.length,3,'cached prepare/read do not generate or verify again')
 draft=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,draft.result.records[0].recordId)
 assert.equal(record.content,initial.text)
 assert.equal(record.sourceText,f.raw)
 assert.equal(record.aiProvenance.professionalSummary.version,'professional-summary-v2')
 assert.equal(validateProfessionalSummary(record.aiProvenance.professionalSummary,{...record.aiProvenance,id:record.aiProvenance.itemId}),true)
 const report={focusSourceIds:[`record:${record.id}`],complaintSourceId:`record:${record.id}`,sources:[{id:`record:${record.id}`}],focus:{mode:'source'},photoKey:'none',reading:{onset:'',change:'',description:'',sourceIds:[]}}
 const result=currentSituation(report,{records:[record],organizations:[],member:{id:f.member.id}})
 assert.equal(result.symptoms[0].text,initial.text)
 assert.equal(f.calls.length,3,'save and doctor-facing projection do not call the model')
})

test('a real draft field edit invalidates the previous generated summary before save',async t=>{
 const f=await serviceFixture(t)
 let draft=await f.prepare()
 const before=clone(draft.items[0].professionalSummary)
 draft=await f.service.edit(f.account,f.member.id,draft.id,{version:draft.version,itemId:draft.items[0].id,field:'symptom',value:'脚小拇指已经恢复'})
 assert.equal(validSemanticSummary(before,draft.items[0]),false)
 assert.notEqual(draft.items[0].professionalSummary?.version,'professional-summary-v2')
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.match(record.content,/已经恢复/u)
 assert.doesNotMatch(record.content,/被踢后破损/u)
 assert.equal(f.calls.length,3)
})


test('source coverage seal binds all inspected pages including unreferenced sources and source kind',async()=>{
 const f=factsFixture();f.sources.push({id:'extra',page:2,text:'尚未提供另一处观察',sourceKind:'document_text'})
 const [item]=await run(f,fakeModel(),{sourceCoverage:true})
 const seal=item.professionalSummary
 assert.equal(validSemanticSummary(seal,item,{sources:f.sources}),true)
 assert.equal(validSemanticSummary(seal,item,{sources:[...f.sources].reverse()}),true)
 const changed=clone(f.sources);changed[1].text='补充了另一处重要观察'
 assert.equal(validSemanticSummary(seal,item,{sources:changed}),false)
 const changedKind=clone(f.sources);changedKind[1].sourceKind='visual_observation'
 assert.equal(validSemanticSummary(seal,item,{sources:changedKind}),false)
 assert.equal(validSemanticSummary(seal,item,{sources:[]}),false)
 assert.equal(validSemanticSummary(seal,item,{sources:f.sources.map(({id,page})=>({id,page}))}),true)
})


for(const malformed of [null,{},undefined])test(`source coverage rejects missingFacts ${JSON.stringify(malformed)} instead of sealing it`,async()=>{
 const model=fakeModel({verify:items=>({items:approved(items).items.map(v=>({...v,missingFacts:malformed}))})})
 await assert.rejects(()=>run(factsFixture(),model,{sourceCoverage:true}),{code:'AI_SUMMARY_UNSUPPORTED'})
 assert.equal(model.calls.length,2)
})


test('source omission diagnostics expose only validated UTF-16 positions and a bounded reason code',async()=>{
 const raw='脚小拇指破了，今天被踢到。',quote='今天被踢到',f=factsFixture({raw,entries:[['symptom','脚小拇指破了']]})
 const model=fakeModel({generate:p=>candidate(p,'脚小拇指破了','小脚趾破损'),verify:items=>({items:approved(items).items.map(v=>({...v,complete:false,problems:['missing_fact'],missingFacts:[{itemId:v.itemId,sourceId:'input',page:1,quote}]}))})})
 await assert.rejects(()=>run(f,model,{sourceCoverage:true}),error=>{
  assert.equal(error.code,'AI_SUMMARY_INCOMPLETE')
  assert.deepEqual(error.details.verification,{codes:['verifier_missing_source_fact'],sourceSpans:[{sourceIndex:0,page:1,start:raw.indexOf(quote),end:raw.indexOf(quote)+quote.length}],timeCoverage:[{itemIndex:0,known:false,included:false}]})
  assert.doesNotMatch(JSON.stringify(error.details),/小拇指|踢到|quote/)
  return true
 })
})


test('summary repair hints contain only this pass fact IDs and scope rather than raw missing-source prose',async()=>{
 const f=factsFixture(),model=fakeModel(),structured=model.structured
 model.structured=async input=>{
  if(input.task==='professional-summary-generate'){
   const data=JSON.parse(input.input)
   assert.deepEqual(data.repairHints,{items:[{itemId:'item-1',reviewFactIds:allIds(data.items[0]),requiredTimeText:null}]})
   assert.doesNotMatch(input.input,/只能来自遗漏引文的额外内容/)
  }
  return structured(input)
 }
 await run(f,model,{repairHints:{missingFacts:[{itemId:'item-1',quote:'只能来自遗漏引文的额外内容'}]}})
})


test('the verifier checks the complete record with server-owned scope rather than demanding attribution prose in every narrative',async()=>{
 const f=factsFixture({raw:'今天脚小拇指被踢破了',entries:[['symptom','脚小拇指被踢破了']],timeText:'今天'}),model=fakeModel(),structured=model.structured
 Object.assign(f.item,{subject:'current',subjectConfirmed:true,subjectMemberId:'server-owned-member'})
 model.structured=async input=>{
  if(input.task==='professional-summary-verify'){
   const data=JSON.parse(input.input)
   assert.deepEqual(data.candidates[0].recordScope,{subject:'current',timeText:'今天',phase:'candidate',subjectConfirmationRequired:false})
   assert.deepEqual(data.candidates[0].recordScope,data.facts[0].scope)
   assert.equal(data.sourceInventory[0].text,f.sources[0].text)
   assert.deepEqual(Object.keys(data.candidates[0].recordScope).sort(),['phase','subject','subjectConfirmationRequired','timeText'])
  }
  return structured(input)
 }
 const [item]=await run(f,model,{sourceCoverage:true})
 assert.equal(item.professionalSummary.verification.status,'verified')
 assert.equal(validSemanticSummary(item.professionalSummary,item,{sources:f.sources}),true)
})

test('legacy items without ledger metadata retain the existing evidence and source-inventory digests',async()=>{
 const f=factsFixture(),[item]=await run(f,fakeModel(),{sourceCoverage:true})
 const expected=fingerprint({id:item.id,category:item.category,timeText:item.timeText??null,fields:item.fields.map(({name,value,sources,editedBy})=>({name,value,sources,editedBy})),unresolvedItems:item.unresolvedItems??[],answers:item.answerObservations??[],superseded:item.supersededAnswers??[]})
 assert.equal(summaryEvidenceKey(item),expected)
 assert.equal(item.professionalSummary.verification.sourceKey,fingerprint(f.sources.map(({id,page,text,sourceKind})=>({id,page,text,sourceKind})).sort((a,b)=>a.id.localeCompare(b.id)||a.page-b.page)))
})

test('semantic seals bind canonical question, retained-source and amendment metadata',async()=>{
 const f=factsFixture()
 Object.assign(f.sources[0],{factId:'fact-1',retainedFromFactId:'old-fact',amendedBy:'new-fact',changeType:'add',polarity:'affirmed',questionContext:{id:'q',text:'刚才什么部位不舒服？',messageId:'q-message',target:'location'}})
 const [item]=await run(f,fakeModel(),{sourceCoverage:true}),seal=item.professionalSummary
 const reordered=clone(f.sources);reordered[0].questionContext={target:'location',messageId:'q-message',text:'刚才什么部位不舒服？',id:'q'}
 assert.equal(validSemanticSummary(seal,item,{sources:reordered}),true)
 for(const mutate of [
  source=>{source.questionContext.text='刚才是不是没有疼痛？'},source=>{source.questionContext.target='pain'},source=>{source.questionContext.messageId='new-question'},
  source=>{source.retainedFromFactId='different-old'},source=>{source.amendedBy='different-amendment'},source=>{source.factId='different-fact'},source=>{source.polarity='unknown'}
 ]){const sources=clone(f.sources);mutate(sources[0]);assert.equal(validSemanticSummary(seal,item,{sources}),false)}
})

test('contextual question answers remain canonical question-answer claims, with visual-source qualifiers preserved',()=>{
 const question={id:'q-fever',text:'有发热吗？',messageId:'nurse-q',target:'fever'}
 const sources=[{id:'answer',page:1,text:'没有',questionContext:question},{id:'photo',page:1,text:'发红',sourceKind:'visual_observation'}]
 const item={id:'qa-photo',category:'symptom',fields:[{name:'conclusion',value:'没有',sources:[{sourceId:'answer',page:1,quote:'没有'}],editedBy:'model'},{name:'symptom',value:'发红',sources:[{sourceId:'photo',page:1,quote:'发红',sourceKind:'visual_observation'}],editedBy:'model'}]}
 bindFrontDeskAnswerContext([item],sources)
 const summary=buildProfessionalSummary(item,{sources})
 assert.match(summary.text,/照片中可见：发红/u)
 assert.match(summary.text,/问：有发热吗？答：没有/u)
 assert.doesNotMatch(summary.text,/结论原话：没有/u)
 const original=summaryEvidenceKey(item),same=clone(item)
 same.contextualAnswers=same.contextualAnswers.map(answer=>Object.fromEntries(Object.entries(answer).reverse()))
 assert.equal(summaryEvidenceKey(same),original)
 same.contextualAnswers[0].questionText='有呕吐吗？'
 assert.notEqual(summaryEvidenceKey(same),original)
})

test('the verifier receives actual question context while questions cannot manufacture a new numeric clinical fact',async()=>{
 const f=factsFixture({raw:'39',category:'other',entries:[['conclusion','39']]})
 f.sources[0].questionContext={id:'temperature-q',text:'刚才体温是多少℃？',messageId:'temperature-nurse',target:'temperature'}
 bindFrontDeskAnswerContext([f.item],f.sources)
 const model=fakeModel({generate:p=>candidate(p,'问：刚才体温是多少℃？答：39','问答记录')}),structured=model.structured
 model.structured=async input=>{
  if(input.task==='professional-summary-verify'){
   const data=JSON.parse(input.input)
   assert.deepEqual(data.sourceInventory[0].questionContext,f.sources[0].questionContext)
   assert.deepEqual(data.facts[0].sourceEvidence[0].references[0].questionContext,f.sources[0].questionContext)
   assert.equal(data.sourceInventory[0].text,'39')
  }
  return structured(input)
 }
 const [item]=await run(f,model,{sourceCoverage:true})
 assert.equal(validSemanticSummary(item.professionalSummary,item,{sources:f.sources}),true)
 await assert.rejects(()=>run(f,fakeModel({generate:p=>candidate(p,'体温40℃','体温记录')}),{sourceCoverage:true}),{code:'AI_SUMMARY_UNSUPPORTED'})
})

// Captured synthetic regressions: regression-1792964728764 T09/T15/C01/C04/Q02
// and flow-1792964728379 sleep. These stubs check the transport contract only;
// a real independent subject-conflict verdict must still reject the candidate.
test('captured T09 keeps the literal numeric answer and the actual question Celsius unit',async()=>{
 const f=factsFixture({raw:'39',category:'other',entries:[['conclusion','39']]})
 f.item.subject='unknown'
 f.sources[0].questionContext={id:'eval-temperature',text:'刚量的体温是多少摄氏度？',messageId:'ab382ad7-4ac7-44fa-a21a-682ead6bd935',target:'temperature_celsius'}
 bindFrontDeskAnswerContext([f.item],f.sources)
 const model=fakeModel({generate:p=>candidate(p,'刚量的体温是39摄氏度。','体温39℃')})
 const [item]=await run(f,model,{sourceCoverage:true})
 assert.equal(item.subject,'unknown')
 assert.equal(item.fields[0].value,'39')
 assert.equal(item.professionalSummary.title,'体温39℃')
 assert.deepEqual(model.calls,['professional-summary-generate','professional-summary-verify'])
})

for(const fixture of [
 {id:'T15',raw:'没有',category:'other',entries:[['conclusion','没有']],question:'孩子这次发热了吗？',text:'孩子这次没有发热。',title:'孩子无发热'},
 {id:'C01',raw:'没有发烧，但是咳得厉害',entries:[['symptom','咳得厉害'],['reaction','没有发烧']],text:'咳嗽剧烈，没有发烧。',title:'咳嗽剧烈且无发热'},
 {id:'C04',raw:'昨晚开始咳嗽',entries:[['symptom','开始咳嗽']],timeText:'昨晚',text:'昨晚开始咳嗽。',title:'咳嗽'},
 {id:'Q02',raw:'孩子昨晚碰伤右足小趾，今天能走，碰到疼，要去医院吗？挂哪个科？',entries:[['symptom','孩子昨晚碰伤右足小趾'],['reaction','碰到疼'],['activity','今天能走']],text:'孩子昨晚碰伤右足小趾，碰到疼，今天能走。',title:'右足小趾碰伤后触痛，今日可行走'},
 {id:'sleep',raw:'2026-10-24晚上10点睡到2026-10-25早上7点醒',category:'sleep',entries:[['sleepAt','2026-10-24晚上10点'],['wakeAt','2026-10-25早上7点']],timeText:'2026-10-24',text:'2026-10-24晚上10点睡到2026-10-25早上7点醒',title:'睡眠时段记录'}
])test(`captured ${fixture.id} unknown subject is a temporary candidate rather than a subject conflict`,async()=>{
 const f=factsFixture(fixture);f.item.subject='unknown'
 if(fixture.question){f.sources[0].questionContext={id:'eval-fever',text:fixture.question,messageId:'captured-fever-question',target:'fever'};bindFrontDeskAnswerContext([f.item],f.sources)}
 const model=fakeModel({generate:p=>candidate(p,fixture.text,fixture.title),verify:items=>({items:approved(items).items.map((v,i)=>items[i].recordScope?.phase==='candidate'&&items[i].recordScope?.subjectConfirmationRequired===true?v:{...v,complete:false,problems:['subject_conflict']})})})
 const [item]=await run(f,model,{sourceCoverage:true})
 assert.equal(item.subject,'unknown')
 assert.notEqual(item.subjectConfirmed,true)
 assert.equal(validSemanticSummary(item.professionalSummary,item,{sources:f.sources}),true)
})

test('an independent subject conflict is never overridden by candidate phase',async()=>{
 for(const subject of ['unknown','other']){
  const f=factsFixture();f.item.subject=subject
  const model=fakeModel({verify:items=>({items:approved(items).items.map(v=>({...v,complete:false,problems:['subject_conflict']}))})})
  await assert.rejects(()=>run(f,model,{sourceCoverage:true}),error=>error.code==='AI_SUMMARY_UNSUPPORTED'&&error.details.verification.codes.includes('subject_conflict'))
 }
})

function capturedCorrectionFixture(newValue='打喷嚏',oldValue='咳嗽'){
 const before=`孩子今天${oldValue}。`,after=`不是${oldValue}，是${newValue}`
 const sources=buildFrontDeskFactSources({facts:[{id:'old',contextId:'c',status:'superseded',text:before,polarity:'affirmed',subject:{kind:'unknown'},sources:[{messageId:'m1',quote:before}]},{id:'new',contextId:'c',status:'active',replaces:'old',text:after,polarity:'affirmed',subject:{kind:'unknown'},sources:[{messageId:'m2',quote:after}]}],messages:[{id:'m1',contextId:'c',kind:'text',status:'completed',text:before},{id:'m2',contextId:'c',kind:'text',status:'completed',text:after}]})
 const item={id:'item-1',category:'symptom',subject:'unknown',timeText:'今天',timeSources:[{sourceId:sources[1].id,page:1,quote:'今天'}],fields:[['symptom',newValue],['symptom',`不是${oldValue}`],['statusRaw',after]].map(([name,value])=>({name,value,sources:[{sourceId:'new',page:1,quote:after}],confirmed:false,editedBy:'model'}))}
 bindFrontDeskAnswerContext([item],sources)
 return {item,sources}
}
test('captured regression-1792967389569 C05 cannot turn a withdrawn cough label into no cough even with an approving verifier',async()=>{
 const f=capturedCorrectionFixture(),model=fakeModel({generate:p=>candidate(p,'今天出现打喷嚏。没有咳嗽。','今日打喷嚏且无咳嗽')})
 await assert.rejects(()=>run(f,model,{sourceCoverage:true}),{code:'AI_SUMMARY_UNSUPPORTED'})
 assert.deepEqual(model.calls,['professional-summary-generate'])
})
test('a corrected label retains only the actual replacement observation and its original time',async()=>{
 const f=capturedCorrectionFixture(),originalSources=clone(f.sources)
 const model=fakeModel({generate:p=>candidate(p,'今天打喷嚏。','打喷嚏记录')}),structured=model.structured
 model.structured=async input=>{
  const data=JSON.parse(input.input),packet=data.items?.[0]??data.facts[0]
  assert.ok(packet.facts.every(fact=>!fact.text.includes('不是咳嗽')))
  if(input.task==='professional-summary-verify')assert.deepEqual(data.sourceInventory[0].literalCorrection,f.sources[0].literalCorrection)
  return structured(input)
 }
 const [item]=await run(f,model,{sourceCoverage:true})
 assert.equal(item.professionalSummary.text,'今天打喷嚏。')
 assert.deepEqual(f.sources,originalSources)
 const changed=clone(f.sources);changed[0].literalCorrection.oldValue='呕吐'
 assert.equal(validSemanticSummary(item.professionalSummary,item,{sources:changed}),false)
})
test('a correction may explicitly replace an old label with a real negative observation',async()=>{
 const f=capturedCorrectionFixture('没有咳嗽')
 const [item]=await run(f,fakeModel({generate:p=>candidate(p,'今天没有咳嗽。','没有咳嗽')}),{sourceCoverage:true})
 assert.equal(item.professionalSummary.text,'今天没有咳嗽。')
})
test('a separate current negative source remains valid alongside a label replacement',async()=>{
 const f=capturedCorrectionFixture()
 f.sources.push({id:'independent-negative',page:1,text:'没有咳嗽',polarity:'negated',changeType:'add'})
 f.item.fields.push({name:'reaction',value:'没有咳嗽',sources:[{sourceId:'independent-negative',page:1,quote:'没有咳嗽'}],editedBy:'model'})
 const [item]=await run(f,fakeModel({generate:p=>candidate(p,'今天打喷嚏，没有咳嗽。','打喷嚏，无咳嗽')}),{sourceCoverage:true})
 assert.equal(item.professionalSummary.text,'今天打喷嚏，没有咳嗽。')
})
test('a withdrawn clinical label cannot remain an affirmed finding or a synonymous negative',async()=>{
 for(const text of ['今天咳嗽，打喷嚏。','今天打喷嚏，没有咳嗽。','今天打喷嚏，否认咳嗽。']){
  const f=capturedCorrectionFixture()
  await assert.rejects(()=>run(f,fakeModel({generate:p=>candidate(p,text,'今日观察')}),{sourceCoverage:true}),error=>error.code==='AI_SUMMARY_UNSUPPORTED'&&error.details.verification.codes.includes('withdrawn_label_as_observation'))
 }
 const f=capturedCorrectionFixture('打喷嚏','发烧')
 await assert.rejects(()=>run(f,fakeModel({generate:p=>candidate(p,'今天打喷嚏，没有发热。','今日观察')}),{sourceCoverage:true}),{code:'AI_SUMMARY_UNSUPPORTED'})
})

async function realCorrectionFixture(t,{inventNegative=false}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'front-correction-role-'))
 t.after(()=>rm(directory,{recursive:true,force:true}))
 const account='synthetic-correction-role',now=()=>new Date('2026-10-26T08:00:00.000Z')
 const member=await new FamilyMemberRepository(directory).create({accountId:account,name:'合成更正人物',relationship:'child'})
 const contextId='correction-context',before='孩子今天咳嗽。',after='不是咳嗽，是打喷嚏',subject={kind:'unknown',memberId:null,confirmed:false,sources:[]}
 const old={id:'old',contextId,status:'superseded',supersededBy:'corr',text:before,polarity:'affirmed',subject,sources:[{messageId:'m1',quote:before}]}
 const current={id:'new',contextId,status:'active',replaces:'old',changeId:'corr',text:after,polarity:'affirmed',subject,sources:[{messageId:'m2',quote:after}]}
 await new JsonStore(path.join(directory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({contexts:[{id:contextId,accountId:account,memberId:member.id,version:4,evidenceVersion:2,originalsVersion:0,semanticVersion:3,subject,understanding:{version:'front-desk-understanding-v2',recordChanges:[{id:'corr',type:'correct',targetId:'old',text:after,polarity:'affirmed',subject,sources:current.sources,scope:'record'}]},facts:[old,current],createdAt:now().toISOString(),updatedAt:now().toISOString()}],messages:[before,after].map((text,i)=>({id:`m${i+1}`,accountId:account,memberId:member.id,contextId,kind:'text',status:'completed',recordable:true,text,at:now().toISOString(),inputAt:now().getTime()+i,files:[],voices:[]}))}))
 const calls=[],model={sourceReferences:true,async structured({task,input}){
  calls.push(task)
  const data=JSON.parse(input)
  if(task==='draft-extraction'){
   const source=data.sources.find(source=>source.id==='new')
   assert.equal(source.literalCorrection.oldValue,'咳嗽')
   assert.equal(source.literalCorrection.newValue,'打喷嚏')
   assert.equal(source.segments.map(segment=>segment.text).join(''),after)
   const evidenceId=source.segments.find(segment=>segment.text.includes(after)).evidenceId
   return {value:{items:[{category:'symptom',title:'咳嗽或喷嚏',subject:'unknown',timeText:'今天',archiveCategory:null,relationKey:null,fields:[['symptom','打喷嚏'],['symptom','不是咳嗽'],['statusRaw',after]].map(([name,value])=>({name,value,evidenceId}))}]},diagnostics:{provider:'local-correction-fixture'}}
  }
  const packet=data.items?.[0]??data.facts[0]
  assert.ok(packet.sourceEvidence.flatMap(field=>field.references).some(ref=>ref.literalCorrection?.oldValue==='咳嗽'&&ref.literalCorrection?.newValue==='打喷嚏'))
  assert.ok(packet.facts.every(fact=>!fact.text.includes('不是咳嗽')))
  if(task==='professional-summary-generate')return {value:{items:[candidate(packet,inventNegative?'今天打喷嚏，没有咳嗽。':'今天打喷嚏。','打喷嚏记录')]},diagnostics:{provider:'local-correction-fixture'}}
  assert.equal(task,'professional-summary-verify')
  assert.equal(data.sourceInventory.find(source=>source.id==='new').literalCorrection.quote,after)
  return {value:approved(data.candidates),diagnostics:{provider:'local-correction-fixture'}}
 }}
 const business=new AIBusinessService({dataDirectory:directory,model,now,env:{},logger:{info(){},warn(){}}})
 const prepare=()=>business.prepare(account,member.id,{text:before+'\n'+after,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,followUp:false})
 return {business,account,member,calls,prepare,after}
}
test('real business C05 extraction/generation/verification keep replacement roles and never create a negative cough fact',async t=>{
 const f=await realCorrectionFixture(t),draft=await f.prepare()
 assert.equal(draft.state,'ready')
 assert.equal(draft.items[0].professionalSummary.text,'今天打喷嚏。')
 assert.ok(draft.items[0].fields.every(field=>field.value==='打喷嚏'))
 assert.equal(draft.sources.find(source=>source.id==='new').text,f.after)
 assert.equal(validSemanticSummary(draft.items[0].professionalSummary,draft.items[0],{sources:draft.sources}),true)
 assert.equal((await f.business.read(f.account,f.member.id,draft.id)).items[0].professionalSummary.text,'今天打喷嚏。')
 await assert.rejects(()=>f.business.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true}),{code:'FRONT_SUBJECT_UNCONFIRMED'})
 assert.equal((await f.business.records.repository.findByAccountId(f.account)).length,0)
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate','professional-summary-verify'])
})
test('real business C05 fails before independent verification when generated prose invents a negative from the withdrawn label',async t=>{
 const f=await realCorrectionFixture(t,{inventNegative:true})
 await assert.rejects(f.prepare,error=>error.code==='AI_SUMMARY_UNSUPPORTED'&&error.details.verification.codes.includes('withdrawn_label_as_observation'))
 assert.equal((await f.business.records.repository.findByAccountId(f.account)).length,0)
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate'])
})

for(const [name,question,text] of [
 ['multiple units','刚量的体温是多少摄氏度或华氏度？','体温39℃'],
 ['multiple unit names','刚量的体温是多少摄氏度还是华氏？','体温39℃'],
 ['ambiguous degrees','刚量的体温是多少度？','体温39℃'],
 ['no unit','刚量的体温是多少？','体温39℃'],
 ['different unit','刚量的体温是多少摄氏度？','体温39℉'],
 ['numeric conversion','刚量的体温是多少摄氏度？','体温102.2℉'],
 ['question example number','刚量的体温是多少摄氏度，例如37摄氏度？','体温37℃'],
 ['new patient fact','刚量的体温是多少摄氏度？','体温39℃，诊断为合成诊断'],
])test(`bound numeric Q&A refuses ${name}`,async()=>{
 const f=factsFixture({raw:'39',category:'other',entries:[['conclusion','39']]})
 f.sources[0].questionContext={id:'q',text:question,messageId:'nurse-q',target:'temperature'}
 bindFrontDeskAnswerContext([f.item],f.sources)
 const model=fakeModel({generate:p=>candidate(p,text,'体温记录')})
 await assert.rejects(()=>run(f,model,{sourceCoverage:true}),{code:'AI_SUMMARY_UNSUPPORTED'})
 assert.equal(model.calls.length,1)
})

test('numeric Q&A requires both real question and answer IDs on each numeric claim',async()=>{
 const f=factsFixture({raw:'39',category:'other',entries:[['conclusion','39']]})
 f.sources[0].questionContext={id:'q',text:'刚量的体温是多少摄氏度？',messageId:'nurse-q',target:'temperature'}
 bindFrontDeskAnswerContext([f.item],f.sources)
 for(const id of ['question:nurse-q','answer:input']){
  const model=fakeModel({generate:p=>({...candidate(p,'体温39℃','体温记录'),claims:[{text:'体温39℃',factIds:[id]},{text:'原问答已保留',factIds:allIds(p)}]})})
  await assert.rejects(()=>run(f,model,{sourceCoverage:true}),{code:'AI_SUMMARY_UNSUPPORTED'})
  assert.equal(model.calls.length,1)
 }
})

test('unbound question metadata cannot supply a unit and a literal Q&A cannot turn example numbers into findings',async()=>{
 const f=factsFixture({raw:'39',category:'other',entries:[['conclusion','39']]})
 f.sources[0].questionContext={id:'q',text:'刚量的体温是多少摄氏度，例如37摄氏度？',messageId:'nurse-q',target:'temperature'}
 await assert.rejects(()=>run(f,fakeModel({generate:p=>candidate(p,'体温39℃','体温记录')})),{code:'AI_SUMMARY_UNSUPPORTED'})
 bindFrontDeskAnswerContext([f.item],f.sources)
 const literal=`问：${f.sources[0].questionContext.text}答：39`
 const [item]=await run(f,fakeModel({generate:p=>candidate(p,literal,'问答记录')}),{sourceCoverage:true})
 assert.equal(item.professionalSummary.text,literal+'。')
 await assert.rejects(()=>run(f,fakeModel({generate:p=>candidate(p,literal+'，体温37℃','体温记录')})),{code:'AI_SUMMARY_UNSUPPORTED'})
})

async function ownershipFixture(){
 const f=factsFixture({raw:'孩子咳嗽',entries:[['symptom','孩子咳嗽']]})
 Object.assign(f.item,{subject:'unknown',subjectConfirmed:false,subjectMemberId:null,subjectResolution:{kind:'unknown',confirmed:false,memberId:null}})
 f.sources[0].subject={kind:'unknown',confirmed:false,memberId:null}
 const [previousItem]=await run(f,fakeModel({generate:p=>candidate(p,'孩子咳嗽','咳嗽记录')}),{sourceCoverage:true})
 const item={...clone(previousItem),subject:'current',subjectConfirmed:true,subjectConfirmedBy:'user',subjectMemberId:'member-1',subjectResolution:{kind:'current',confirmed:true,memberId:'member-1'}}
 const previousScope={contextId:'context-1',contextVersion:7,originalsVersion:2,memberId:'member-1'},scope={...previousScope,contextVersion:8}
 return {previousItem,item,sources:f.sources,previousScope,scope,confirmation:{...scope,at:'2026-10-26T08:00:00.000Z'}}
}
const rebind=args=>semanticSummary.rebindSemanticSummaryOwnership(args)
test('a pure ownership confirmation invalidates the old seal and narrowly rebinds its user ownership audit',async()=>{
 const f=await ownershipFixture(),before=clone(f)
 assert.equal(validSemanticSummary(f.previousItem.professionalSummary,f.previousItem,{sources:f.sources}),true)
 assert.equal(validSemanticSummary(f.item.professionalSummary,f.item,{sources:f.sources}),false)
 const summary=rebind(f)
 assert.equal(validSemanticSummary(summary,f.item,{sources:f.sources}),true)
 assert.deepEqual({title:summary.title,text:summary.text,claims:summary.claims},{title:f.previousItem.professionalSummary.title,text:f.previousItem.professionalSummary.text,claims:f.previousItem.professionalSummary.claims})
 assert.equal(summary.verification.outputKey,f.previousItem.professionalSummary.verification.outputKey)
 assert.deepEqual(summary.verification.ownershipRebind,{version:'user-subject-confirmation-v1',previousEvidenceKey:f.previousItem.professionalSummary.verification.evidenceKey,sourceKey:f.previousItem.professionalSummary.verification.sourceKey,confirmation:f.confirmation})
 assert.deepEqual(f,before,'the helper does not mutate items, sources, receipt or context snapshots')
 assert.deepEqual(rebind(f),summary,'the same trusted transition is deterministic')
})

for(const [name,mutate] of [
 ['old context receipt',f=>{f.confirmation.contextVersion--}],
 ['nonadjacent context transition',f=>{f.scope.contextVersion++;f.confirmation.contextVersion++}],
 ['foreign context',f=>{f.confirmation.contextId='foreign-context'}],
 ['foreign member receipt',f=>{f.confirmation.memberId='foreign-member'}],
 ['foreign target member',f=>{f.item.subjectMemberId='foreign-member'}],
 ['foreign old member',f=>{f.previousItem.subjectMemberId='foreign-member'}],
 ['new originals',f=>{f.scope.originalsVersion++;f.confirmation.originalsVersion++}],
 ['stale originals receipt',f=>{f.confirmation.originalsVersion--}],
 ['invalid timestamp',f=>{f.confirmation.at='yesterday'}],
 ['missing expected scope',f=>{delete f.scope}],
 ['missing previous scope',f=>{delete f.previousScope}],
 ['unconfirmed target',f=>{f.item.subjectConfirmed=false}],
 ['not explicitly user confirmed',f=>{f.item.subjectConfirmedBy='model'}],
 ['unresolved target',f=>{f.item.subjectResolution={kind:'unknown',confirmed:false,memberId:null}}],
 ['other original item',f=>{f.previousItem.subject='other'}],
 ['multiple original item',f=>{f.previousItem.subject='multiple'}],
 ['edited field',f=>{f.item.fields[0].value='孩子咳嗽加重'}],
 ['edited time',f=>{f.item.timeText='昨晚'}],
 ['edited time provenance outside the digest',f=>{f.item.timeSources=[{sourceId:'input',page:1,quote:'孩子咳嗽'}]}],
 ['edited source reference metadata',f=>{f.item.fields[0].sources[0].amendedBy='another-amendment'}],
 ['edited question metadata',f=>{f.item.contextualAnswers=[{sourceId:'input',questionText:'有发热吗？',answerText:'有'}]}],
 ['edited summary',f=>{f.item.professionalSummary.text='孩子持续高热。'}],
 ['edited summary title',f=>{f.item.professionalSummary.title='高热记录'}],
 ['edited source inventory',f=>{f.sources[0].text='孩子高热'}],
 ['IDs-only inventory',f=>{f.sources=f.sources.map(({id,page})=>({id,page}))}],
 ['unverified summary',f=>{f.previousItem.professionalSummary.verification.status='failed'}],
 ['legacy v1 entailment',f=>{f.previousItem.professionalSummary.verification.protocol='source-entailment-v1'}],
])test(`ownership rebind refuses ${name}`,async()=>{
 const f=await ownershipFixture();mutate(f)
 assert.throws(()=>rebind(f),error=>error.code==='AI_SUMMARY_OWNERSHIP_REBIND')
})

for(const subject of [{kind:'other',confirmed:true,memberId:'member-other'},{kind:'multiple',confirmed:true,memberId:null},{kind:'current',confirmed:true,memberId:'member-other'}])test(`ownership rebind refuses sealed explicit source subject ${subject.kind}/${subject.memberId}`,async()=>{
 const f=await ownershipFixture()
 f.sources[0].subject=subject
 // Re-seal from the independent injected verifier, so rejection cannot depend
 // solely on an altered inventory hash.
 const [previousItem]=await run({item:f.previousItem,sources:f.sources},fakeModel({generate:p=>candidate(p,'孩子咳嗽','咳嗽记录')}),{sourceCoverage:true})
 f.previousItem=previousItem;f.item.professionalSummary=clone(previousItem.professionalSummary)
 assert.throws(()=>rebind(f),error=>error.code==='AI_SUMMARY_OWNERSHIP_REBIND')
})

for(const revisionIssue of ['saved_fact_is_immutable','revision_target_ambiguous','revision_category_ambiguous'])test(`ownership rebind cannot clear ${revisionIssue} review gates`,async()=>{
 const f=await ownershipFixture()
 Object.assign(f.previousItem,{unassigned:true,needsReview:true,revisionIssue})
 const [previousItem]=await run({item:f.previousItem,sources:f.sources},fakeModel({generate:p=>candidate(p,'孩子咳嗽','咳嗽记录')}),{sourceCoverage:true})
 f.previousItem=previousItem
 f.item={...clone(previousItem),subject:'current',subjectConfirmed:true,subjectConfirmedBy:'user',subjectMemberId:'member-1',subjectResolution:{kind:'current',confirmed:true,memberId:'member-1'},unassigned:false,needsReview:false}
 assert.equal(validSemanticSummary(previousItem.professionalSummary,previousItem,{sources:f.sources}),true)
 assert.throws(()=>rebind(f),error=>error.code==='AI_SUMMARY_OWNERSHIP_REBIND')
})

test('new ledger scopes never become current from UI selection or unproved subject labels',async()=>{
 for(const [metadata,expected] of [
  [{subject:'unknown'},'unknown'],[{subject:'current'},'unknown'],[{subject:'current',subjectConfirmed:true},'unknown'],
  [{subject:'current',subjectConfirmed:true,subjectMemberId:'member-1'},'current'],
  [{subject:'other',subjectConfirmed:true,subjectMemberId:'member-1'},'other'],
  [{subject:'current',subjectConfirmed:true,subjectResolution:{kind:'current',confirmed:true,memberId:'member-1'}},'current'],
  [{subject:'current',subjectConfirmed:true,subjectMemberId:'member-1',unassigned:true},'unknown']
 ]){
  const f=factsFixture();Object.assign(f.item,metadata)
  const model=fakeModel(),structured=model.structured
  model.structured=async input=>{const data=JSON.parse(input.input);assert.equal((data.items?.[0]??data.facts[0]).scope.subject,expected);return structured(input)}
  const [item]=await run(f,model,{sourceCoverage:true})
  assert.equal(validSemanticSummary(item.professionalSummary,item,{sources:f.sources}),true)
 }
})

test('merged extraction contract preserves unassigned provenance, verbatim/visual safeguards, amended time and bounded time evidence',()=>{
 const output=(value,subject='current',timeText=null,sourceId='s')=>({items:[{category:'symptom',title:'待核对',subject,timeText,archiveCategory:null,relationKey:null,fields:[{name:'symptom',value,quote:value,sourceId,page:1}]}]})
 const other=[{id:'s',page:1,text:'爸爸咳嗽',sourceKind:'visual_observation'}]
 const kept=validateExtraction(output('爸爸咳嗽','other'),other,{preserveUnassigned:true,verbatimObservations:true})
 assert.equal(kept[0].subject,'other');assert.equal(kept[0].fields[0].sources[0].sourceKind,'visual_observation')
 assert.deepEqual(validateExtraction(output('爸爸咳嗽','other'),other),[])
 assert.throws(()=>validateExtraction(output('爸爸咳嗽'),other,{preserveUnassigned:true,verbatimObservations:true}),{code:'AI_EVIDENCE_MISMATCH'})
 const projected=output('咳嗽');projected.items[0].fields[0].quote='咳得厉害'
 assert.equal(validateExtraction(projected,[{id:'s',page:1,text:'咳得厉害'}],{verbatimObservations:true})[0].fields[0].value,'咳得厉害')
 for(const [fieldSource,timeSource] of [
  [{id:'s',page:1,text:'开始咳嗽',factId:'old',amendedBy:'new'},{id:'t',page:1,text:'昨晚',factId:'new'}],
  [{id:'s',page:1,text:'开始咳嗽',factId:'new'},{id:'t',page:1,text:'昨晚',factId:'old',amendedBy:'new'}]
 ])assert.equal(validateExtraction(output('咳嗽','current','昨晚'),[fieldSource,timeSource],{preserveUnassigned:true})[0].timeSources[0].sourceId,'t')
 const independent=[{id:'s',page:1,text:'咳嗽'},{id:'t',page:1,text:'昨晚'}]
 assert.throws(()=>validateExtraction(output('咳嗽','current','昨晚'),independent,{preserveUnassigned:true}))
 assert.equal(validateExtraction(output('咳嗽','current','昨晚'),independent,{timeEvidence:()=>[{sourceId:'t',page:1,quote:'昨晚',start:0,end:2}]})[0].timeText,'昨晚')
 assert.throws(()=>validateExtraction(output('咳嗽','current','昨晚'),independent,{timeEvidence:()=>[{sourceId:'t',page:1,quote:'昨晚',start:1,end:3}]}))
 const repeated=[{id:'a',category:'symptom',fields:[{name:'symptom',value:'咳嗽',sources:[{sourceId:'one',page:1,quote:'咳嗽'}]}]},{id:'b',category:'symptom',fields:[{name:'symptom',value:'咳嗽',sources:[{sourceId:'two',page:1,quote:'咳嗽'}]}]}]
 assert.equal(mergeItems(repeated).length,1);assert.equal(mergeItems(repeated,{preserveOccurrences:true}).length,2)
 assert.equal(buildJournal({category:'symptom',fields:[{name:'chiefComplaint',value:'小腿有红点'}]},{semanticVersion:2}).symptom.narrative,'小腿有红点')
})
