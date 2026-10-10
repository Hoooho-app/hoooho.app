import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AIBusinessService } from './service.mjs'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { isCurrentPositiveSymptom } from '../health-fact-policy.mjs'

// Test doubles reconstructed from the visible draft, NOT a replay of the lost
// provider response. No production session, account or upstream is used.
async function fixture(t,raw,entries,referenceNow='2026-10-02T16:30:00Z',timezone='Asia/Shanghai'){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-quality-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'quality-fixture',name:'虚构验收',relationship:'child'})
 let calls=0
 const model={structured:async()=>{calls++;return {value:{items:entries.map(e=>({category:e.category??'examination',title:'测试替身',timeText:e.timeText??null,subject:'current',archiveCategory:null,relationKey:null,fields:(e.fields??[['symptom',e.quote]]).map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))}))},diagnostics:{provider:'bailian',model:'qwen3.7-plus'}}}}
 const service=new AIBusinessService({dataDirectory,model,structuredMode:'enabled',now:()=>new Date(referenceNow)}) // fixture-only; no production mode change
 const prepare=()=>service.prepare('quality-fixture',member.id,{text:raw,timezone})
 return {prepare,service,member,calls:()=>calls}
}
for(const c of [
 {name:'今天否定与当前症状',raw:'今天没有呕吐，只是恶心',quote:'今天没有呕吐，只是恶心',day:'2026-10-02T16:00:00.000Z',timeRaw:'今天'},
 {name:'昨天',raw:'昨天没有发热，只是头痛',quote:'昨天没有发热，只是头痛',day:'2026-10-01T16:00:00.000Z',timeRaw:'昨天'},
 {name:'昨日别名',raw:'昨日没有发热，只是头痛',quote:'昨日没有发热，只是头痛',day:'2026-10-01T16:00:00.000Z',timeRaw:'昨日'},
 {name:'跨午夜上海',raw:'今天恶心',quote:'恶心',day:'2026-10-02T16:00:00.000Z',timeRaw:'今天'},
 {name:'同一参考时刻洛杉矶仍是前一天',raw:'今天恶心',quote:'恶心',timezone:'America/Los_Angeles',day:'2026-10-02T07:00:00.000Z',timeRaw:'今天'},
 {name:'多症状同日',raw:'今天恶心、头痛，没有呕吐',quote:'今天恶心、头痛，没有呕吐',day:'2026-10-02T16:00:00.000Z',timeRaw:'今天'},
])test(`领域修正 ${c.name} 保留原话和日精度`,async t=>{
 const f=await fixture(t,c.raw,[{quote:c.quote}],undefined,c.timezone)
 const draft=await f.prepare();assert.equal(draft.items[0].category,'symptom');assert.equal(draft.items[0].time.raw,c.timeRaw);assert.equal(draft.items[0].time.precision,'day');assert.equal(draft.items[0].time.resolvedStart,c.day)
 assert.equal(draft.inputText,c.raw);assert.equal(draft.items[0].fields[0].sources[0].quote,c.quote);assert.equal(f.calls(),1)
})
test('确认后保存：恶心为当前事实，否定呕吐不计入阳性症状；没有保存时刻伪发病',async t=>{
 const raw='今天没有呕吐，只是恶心',f=await fixture(t,raw,[{quote:raw}])
 const d=await f.prepare();assert.equal((await f.service.records.repository.findByAccountId('quality-fixture')).length,0)
 const saved=await f.service.save('quality-fixture',f.member.id,d.id,{version:d.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord('quality-fixture',saved.result.records[0].recordId)
 assert.equal(record.type,'symptom');assert.equal(record.occurredAt,'2026-10-02T16:00:00.000Z');assert.equal(record.journal.timePrecision,'period');assert.equal(record.aiProvenance.time.precision,'day')
 const organizations=await f.service.records.organizations.repository.findByEventId(record.eventId)
 const facts=organizations.find(o=>o.recordId===record.id).healthAIOutput.facts
 assert.ok(facts.some(x=>x.name==='恶心'&&isCurrentPositiveSymptom(x)));assert.ok(facts.some(x=>x.name==='呕吐'&&x.polarity==='negated'));assert.ok(!facts.some(x=>x.name==='呕吐'&&isCurrentPositiveSymptom(x)));assert.equal(f.calls(),1)
})
test('不同症状不同日不交叉继承；真实检查字段不被改成症状',async t=>{
 const raw='昨天发热，今天恶心。血常规报告提示正常。',f=await fixture(t,raw,[{quote:'发热'},{quote:'恶心'},{fields:[['testName','血常规'],['conclusion','正常']],category:'examination'}])
 const d=await f.prepare();assert.deepEqual(d.items.map(x=>x.timeText),['昨天','今天',null]);assert.equal(d.items[2].category,'examination')
})
test('时间冲突：同一条跨日/或日期、模型选错日期均拒绝而非猜测，失败不保存',async t=>{
 for(const [raw,entry] of [['昨天发热，今天恶心',{quote:'昨天发热，今天恶心'}],['昨天还是今天恶心，记不清了',{quote:'恶心'}],['昨天恶心，今天头痛',{quote:'恶心',timeText:'今天'}]]){
  const f=await fixture(t,raw,[entry]);await assert.rejects(()=>f.prepare(),{code:'AI_TIME_CONFLICT'});assert.equal((await f.service.records.repository.findByAccountId('quality-fixture')).length,0);assert.equal(f.calls(),1)
 }
})
test('无时间保持未知，不能用保存时间；诊疗信息不按纯症状字段重新分类',async t=>{
 const f=await fixture(t,'恶心，医生要求血常规检查',[{quote:'恶心',category:'symptom'},{fields:[['chiefComplaint','恶心'],['testName','血常规']],category:'examination'}])
 const d=await f.prepare();assert.equal(d.items[0].time.precision,'unknown');assert.equal(d.items[1].category,'examination')
})
test('不能跨句继承日期或补全缺失的否定事实',async t=>{
 const f=await fixture(t,'昨天恶心。头痛',[{quote:'头痛'}]);const d=await f.prepare();assert.equal(d.items[0].timeText,null)
 const omitted=await fixture(t,'今天没有呕吐，只是恶心',[{quote:'恶心'}]);await assert.rejects(()=>omitted.prepare(),e=>{assert.equal(e.code,'AI_EVIDENCE_MISMATCH');assert.equal(e.validation.stage,'source_validation');return true})
})

 test('明确未用药只保存原话背景，不能建立服药事实或用药归档', async t=>{
  const f=await fixture(t,'昨晚未用药',[{category:'medication',timeText:'昨晚',fields:[['medicationName','未用药']]}])
  const draft=await f.prepare()
  assert.equal(draft.items[0].category,'other')
  const saved=await f.service.save('quality-fixture',f.member.id,draft.id,{version:draft.version,confirmed:true})
  const record=await f.service.records.getOwnedRecord('quality-fixture',saved.result.records[0].recordId)
  assert.equal(record.type,'note'); assert.deepEqual(record.journal.categories,['other']); assert.ok(!record.journal.medication); assert.match(record.content,/未用药/)
 })

test('旧草稿的状态原话未用药在缓存预览与直接保存时都不成为服药事实', async t=>{
 const f=await fixture(t,'昨晚未用药',[{category:'medication',timeText:'昨晚',fields:[['statusRaw','未用药']]}])
 const draft=await f.prepare();assert.equal(draft.items[0].category,'other')
 const makeLegacy=()=>f.service.store.update(data=>({...data,drafts:data.drafts.map(d=>d.id===draft.id?{...d,items:d.items.map(item=>({...item,category:'medication',archiveCategory:'medication',journal:{...item.journal,categories:['medication']}}))}:d)}))
 await makeLegacy()
 for(const restored of [await f.service.read('quality-fixture',f.member.id,draft.id),await f.service.latest('quality-fixture',f.member.id)]){
  assert.equal(restored.items[0].category,'other');assert.deepEqual(restored.items[0].journal.categories,['other']);assert.equal(restored.version,draft.version)
 }
 assert.equal((await f.service.get('quality-fixture',f.member.id,draft.id)).items[0].category,'medication');assert.equal(f.calls(),1)
 await makeLegacy();const cached=await f.prepare();assert.equal(cached.items[0].category,'other');assert.equal(f.calls(),1)
 await makeLegacy();const saved=await f.service.save('quality-fixture',f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord('quality-fixture',saved.result.records[0].recordId)
 assert.equal(record.type,'note');assert.deepEqual(record.journal.categories,['other']);assert.ok(!record.journal.medication);assert.match(record.content,/未用药/)
})

test('真实药名和剂量仍保留实际用药分类',async t=>{
 const f=await fixture(t,'今天吃了AD一滴',[{category:'medication',timeText:'今天',fields:[['medicationName','AD'],['doseOriginal','一滴']]}])
 const draft=await f.prepare();assert.equal(draft.items[0].category,'medication')
 const saved=await f.service.save('quality-fixture',f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord('quality-fixture',saved.result.records[0].recordId)
 assert.equal(record.type,'medication');assert.deepEqual(record.journal.categories,['medication']);assert.equal(record.aiProvenance.fields.find(field=>field.name==='medicationName').value,'AD')
})
