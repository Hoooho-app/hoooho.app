import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {validateExtraction,resolveItemTime} from './contract.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
const raw='吃了鸡蛋，脖子起红疹'
const item=(category,fields,timeText=null)=>({category,title:'提取草稿',subject:'current',archiveCategory:null,relationKey:null,timeText,fields:fields.map(([name,value,quote=value])=>({name,value,quote,sourceId:'input',page:1}))})
async function setup(t,items,now='2026-10-17T16:41:00Z'){
 const directory=await mkdtemp(path.join(os.tmpdir(),'audit-ai-boundaries-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(directory).create({accountId:'audit-boundaries',name:'虚构边界验收',relationship:'child'});let calls=0
 const model={structured:async()=>{calls++;return {value:{items},diagnostics:{provider:'fixture'}}}}
 const service=new AIBusinessService({dataDirectory:directory,model,now:()=>new Date(now),logger:{info(){},warn(){}}})
 const prepare=input=>service.prepare('audit-boundaries',member.id,{smartRecord:true,...input})
 return {service,member,prepare,calls:()=>calls}
}
test('negation and uncertainty cannot be clipped from the value, with clause-local scope',()=>{
 for(const text of ['医生说不是过敏','医生认为并非过敏','没有呕吐','疑似湿疹']){
  const value=text.includes('呕吐')?'呕吐':text.includes('湿疹')?'湿疹':'过敏'
  assert.throws(()=>validateExtraction({items:[item('symptom',[['symptom',value]])]},[{id:'input',page:1,text}]),{code:'AI_EVIDENCE_MISMATCH'})
 }
 for(const [text,value,field,category,quote=text] of [
  ['没有呕吐，只有恶心','恶心','symptom','symptom','恶心'],
  ['不是过敏原检测，是皮肤点刺检测','皮肤点刺检测','testName','examination'],
  ['没有脸颊瘙痒','脸颊','location','symptom','脸颊'],
  ['医生说不是过敏','不是过敏','doctorStatement','visit'],
 ])assert.equal(validateExtraction({items:[item(category,[[field,value,quote]])]},[{id:'input',page:1,text}]).length,1)
})
test('mixed diet cannot silently omit an explicit rash; failed draft retains the source',async t=>{
 const f=await setup(t,[item('diet',[['food','鸡蛋']])]);await assert.rejects(()=>f.prepare({text:raw}),e=>e.code==='AI_EVIDENCE_MISMATCH'&&e.validation.rule==='affirmed_fact_coverage')
 const draft=await f.service.latest('audit-boundaries',f.member.id);assert.equal(draft.state,'failed');assert.equal(draft.inputText,raw);assert.equal((await f.service.records.repository.findByAccountId('audit-boundaries')).length,0)
})
test('mixed diet with explicit reaction saves both categories; unrelated/hypothetical subjects are not required',async t=>{
 const f=await setup(t,[item('diet',[['food','鸡蛋'],['reaction','脖子起红疹']])]);const d=await f.prepare({text:raw}),saved=await f.service.save('audit-boundaries',f.member.id,d.id,{version:d.version,confirmed:true}),record=await f.service.records.getOwnedRecord('audit-boundaries',saved.result.records[0].recordId)
 assert.deepEqual(record.journal.categories,['diet','symptom']);assert.equal(record.sourceText,raw)
 for(const text of ['吃了鸡蛋，妈妈起红疹','吃了鸡蛋，如果红疹怎么办']){
  const g=await setup(t,[item('diet',[['food','鸡蛋']])]);assert.equal((await g.prepare({text})).state,'ready')
 }
})
test('valid 15000 character originals persist intact independently of 5000 character content',async t=>{
 const text='甲'.repeat(14995)+'脸颊发红。',f=await setup(t,[item('symptom',[['symptom','脸颊发红']])]);assert.equal(text.length,15000)
 const d=await f.prepare({text}),saved=await f.service.save('audit-boundaries',f.member.id,d.id,{version:d.version,confirmed:true}),id=saved.result.records[0].recordId
 assert.equal((await f.service.records.getOwnedRecord('audit-boundaries',id)).sourceText,text)
 await f.service.records.update('audit-boundaries',id,{sourceText:text+'甲'}).then(()=>assert.fail('must reject'),e=>assert.equal(e.code,'RECORD_METADATA_TOO_LONG'))
 await assert.rejects(()=>f.service.records.update('audit-boundaries',id,{content:'甲'.repeat(5001)}),{code:'RECORD_CONTENT_TOO_LONG'})
})
test('overlong text plus attachment explicitly rejects before touching a previous draft or calling a model',async t=>{
 const f=await setup(t,[item('symptom',[['symptom','脸颊发红']])]),d=await f.prepare({text:'脸颊发红'}),calls=f.calls()
 await assert.rejects(()=>f.prepare({id:d.id,version:d.version,text:'甲'.repeat(15001),files:[{mimeType:'image/png',dataUrl:'invalid-data-is-not-even-prepared'}]}),{code:'AI_INPUT_TEXT_TOO_LONG',status:422})
 const retained=await f.service.read('audit-boundaries',f.member.id,d.id);assert.equal(retained.inputText,'脸颊发红');assert.equal(retained.version,d.version);assert.equal(f.calls(),calls)
})
test('invalid default occurrence calendar or non-string values reject before any model call',async t=>{
 for(const selectedOccurredAt of ['2026-02-30T10:00:00+08:00',true,0]){
  const f=await setup(t,[item('symptom',[['symptom','脸颊发红']])])
  await assert.rejects(()=>f.prepare({text:'脸颊发红',selectedOccurredAt}),{code:'INVALID_OCCURRED_AT',status:422});assert.equal(f.calls(),0)
 }
})
test('manual historical numeric and slash dates preserve their day in early-morning and daytime saves',async t=>{
 for(const time of ['2026-01-01 10:00','2026/01/01 10:00'])for(const now of ['2026-10-17T16:41:00Z','2026-10-18T10:00:00Z']){
  const f=await setup(t,[item('symptom',[['symptom','脸颊发红']])],now),d=await f.prepare({text:'脸颊发红'}),edited=await f.service.edit('audit-boundaries',f.member.id,d.id,{version:d.version,itemId:d.items[0].id,field:'time',value:time})
  const saved=await f.service.save('audit-boundaries',f.member.id,d.id,{version:edited.version,confirmed:true}),record=await f.service.records.getOwnedRecord('audit-boundaries',saved.result.records[0].recordId)
  assert.equal(record.occurredAt,'2026-01-01T02:00:00.000Z')
 }
})
test('local clock validation round-trips DST and preserves seconds and Chinese 23:59',()=>{
 const context={referenceNow:'2026-10-18T10:00:00Z',timezone:'America/Los_Angeles'}
 assert.throws(()=>resolveItemTime({timeText:'2026-03-08 02:30'},context),{code:'INVALID_OCCURRED_AT',status:422})
 assert.equal(resolveItemTime({timeText:'2026-03-08 01:30'},context).resolvedStart,'2026-03-08T09:30:00.000Z')
 assert.equal(resolveItemTime({timeText:'2026-03-08 03:30'},context).resolvedStart,'2026-03-08T10:30:00.000Z')
 const shanghai={...context,timezone:'Asia/Shanghai'}
 assert.equal(resolveItemTime({timeText:'2026/01/01 10:00:59'},shanghai).resolvedStart,'2026-01-01T02:00:59.000Z')
 assert.equal(resolveItemTime({timeText:'2026年1月1日二十三点五十九分'},shanghai).resolvedStart,'2026-01-01T15:59:00.000Z')
 assert.equal(resolveItemTime({timeText:'2026年1月1日十二点零五分'},shanghai).resolvedStart,'2026-01-01T04:05:00.000Z')
})
test('invalid calendar dates, clocks and zoned ISO dates reject without saving',async t=>{
 for(const time of ['2026年2月30日','2026-02-30 10:00','2026/02/30 10:00','2026年9月1日25点90分','2026-01-01 10:60','2026-02-30T10:00:00+08:00']){
  const f=await setup(t,[item('symptom',[['symptom','脸颊发红']],time)])
  await assert.rejects(()=>f.prepare({text:time+'脸颊发红'}),{code:'INVALID_OCCURRED_AT',status:422})
  assert.equal((await f.service.records.repository.findByAccountId('audit-boundaries')).length,0)
 }
})
