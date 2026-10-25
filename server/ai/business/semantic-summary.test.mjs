// All model results are injected; this file never calls a live model.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {generateSemanticSummaries,validSemanticSummary} from './semantic-summary.mjs'
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
const approved=items=>({items:items.map(c=>({itemId:c.itemId,titleSupported:true,complete:true,problems:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))})
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
