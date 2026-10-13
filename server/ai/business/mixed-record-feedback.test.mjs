import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JournalIndexService} from '../../events/journal-index-service.mjs'
import {visibleRecordCategories,hasSymptomObservation} from '../../../shared/record-categories.mjs'

async function setup(t,raw,fields){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'mixed-feedback-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'mixed-fixture',name:'虚构验收',relationship:'child'})
 let calls=0;const logs=[]
 const service=new AIBusinessService({dataDirectory,logger:{info:(...args)=>logs.push(args)},model:{structured:async()=>{calls++;return {value:{items:[{category:'diet',title:'喂养',timeText:'今天',archiveCategory:null,subject:'current',relationKey:null,fields:fields.map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))}]},diagnostics:{provider:'test'}}}}})
 const draft=await service.prepare('mixed-fixture',member.id,{text:raw,smartRecord:true,frontDeskRecord:true})
 return {service,member,draft,dataDirectory,logs,calls:()=>calls}
}
test('feeding + colloquial symptom omitted by model: one source record visible in both categories, no diagnosis or extra call',async t=>{
 const raw='今天喝了配方奶，后来出现红屁股。',f=await setup(t,raw,[['food','配方奶']])
 assert.equal(f.draft.items.length,1);assert.deepEqual(f.draft.items[0].journal.categories,['diet','symptom'])
 const symptom=f.draft.items[0].fields.find(f=>f.name==='symptom');assert.equal(symptom.value,'后来出现红屁股');assert.equal(symptom.sources[0].quote,symptom.value)
 const saved=await f.service.save('mixed-fixture',f.member.id,f.draft.id,{version:f.draft.version,confirmed:true})
 assert.equal(saved.result.count,1);assert.deepEqual(saved.result.records[0].categories,['diet','symptom']);assert.equal(f.calls(),1)
 const index=await new JournalIndexService({dataDirectory:f.dataDirectory}).list('mixed-fixture',f.member.id,'Asia/Shanghai')
 assert.equal(index.records.length,1);assert.deepEqual(index.records[0].journal.categories,['diet','symptom']);assert.equal(index.records[0].sourceText,raw)
 assert.match(index.records[0].content,/红屁股/);assert.doesNotMatch(index.records[0].content,/尿布疹|导致|过敏/)
 assert.ok(f.logs.some(log=>log[0].includes('draft phases')));assert.ok(!JSON.stringify(f.logs).includes('配方奶'))
})
test('mixed model fields retain dual category and source evidence; category corrections survive save and retry',async t=>{
 const f=await setup(t,'今天喝了配方奶，后来出现红屁股。',[['food','配方奶'],['reaction','后来出现红屁股']])
 assert.deepEqual(f.draft.items[0].journal.categories,['diet','symptom'])
 const edited=await f.service.edit('mixed-fixture',f.member.id,f.draft.id,{version:f.draft.version,itemId:f.draft.items[0].id,visibilityCategories:['diet']})
 assert.deepEqual(edited.items[0].journal.categories,['diet'])
 const saved=await f.service.save('mixed-fixture',f.member.id,f.draft.id,{version:edited.version,confirmed:true})
 const index=await new JournalIndexService({dataDirectory:f.dataDirectory}).list('mixed-fixture',f.member.id,'Asia/Shanghai')
 assert.equal(saved.result.count,1);assert.deepEqual(index.records[0].journal.categories,['diet'])
})
test('hypothetical, other-person and denied observations are never recovered as positive symptom facts',async t=>{
 for(const ending of ['如果红屁股怎么办','妈妈有红屁股']){
  const f=await setup(t,`今天喝了配方奶，${ending}。`,[['food','配方奶']]);assert.equal(f.draft.items.length,1);assert.deepEqual(f.draft.items[0].journal.categories,['diet'])
 }
 assert.equal(hasSymptomObservation('预防红屁股'),false)
 assert.equal(hasSymptomObservation('如果出现红屁股怎么办'),false)
 assert.deepEqual(visibleRecordCategories({content:'食物：配方奶',type:'note',journal:{categories:['diet']},sourceText:'今天喝奶，红屁股'}),['diet'])
})
test('legacy mixed text is indexed without rewriting or duplicating it',()=>{
 assert.deepEqual(visibleRecordCategories({content:'今天喝配方奶，后来出现红屁股',journal:{categories:['diet']}}),['diet','symptom'])
 assert.deepEqual(visibleRecordCategories({content:'今天喝配方奶，后来出现红屁股',journal:{categories:['other']},caseContext:{identity:'external_ai'}}),['other'])
})

test('supplier splits same feeding sentence: reconcile into one mixed occurrence, preserving both exact sources',async()=>{
 const {reconcileExtraction}=await import('./extraction-quality.mjs')
 const source={id:'input',page:1,text:'今天喝了配方奶，后来出现红屁股。'}
 const item=(category,name,value,timeText='今天')=>({id:category,category,archiveCategory:null,timeText,fields:[{name,value,sources:[{sourceId:'input',page:1,quote:value,start:source.text.indexOf(value),end:source.text.indexOf(value)+value.length}]}]})
 const reconciled=await reconcileExtraction([item('diet','food','配方奶'),item('symptom','symptom','后来出现红屁股')],[source],{referenceNow:'2026-10-13T12:00:00Z',timezone:'Asia/Shanghai'})
 assert.equal(reconciled.length,1);assert.equal(reconciled[0].category,'diet');assert.deepEqual(reconciled[0].fields.map(f=>f.value),['配方奶','后来出现红屁股'])
 const separate={id:'input',page:1,text:'昨天喝了配方奶。今天出现红屁股。'}
 const fields=(name,value)=>({name,value,sources:[{sourceId:'input',page:1,quote:value,start:separate.text.indexOf(value),end:separate.text.indexOf(value)+value.length}]})
 const different=await reconcileExtraction([{id:'diet',category:'diet',timeText:'昨天',fields:[fields('food','配方奶')]},{id:'symptom',category:'symptom',timeText:'今天',fields:[fields('symptom','今天出现红屁股')]}],[separate],{referenceNow:'2026-10-13T12:00:00Z',timezone:'Asia/Shanghai'})
 assert.equal(different.length,2)
})
