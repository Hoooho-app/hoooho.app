import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {reconcileFrontDeskFields} from './front-desk-field-contract.mjs'

test('front-desk field contracts reconcile wrong symptom metadata and duration-as-clock without changing quotes or other entrypoints',async t=>{
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-front-field-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic',name:'小禾（虚构）',relationship:'child'})
 const text='昨天吃了半碗粥，睡了一个小时。'
 const output={items:[{category:'symptom',title:'饮食情况',timeText:'昨天',archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'food',value:'半碗粥',quote:'昨天吃了半碗粥',sourceId:'input',page:1}]},{category:'symptom',title:'睡眠时长',timeText:'昨天',archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'sleepAt',value:'睡了一个小时',quote:'昨天吃了半碗粥，睡了一个小时。',sourceId:'input',page:1}]}]}
 const model={structured:async()=>({value:structuredClone(output),diagnostics:{provider:'test'}})},service=new AIBusinessService({dataDirectory,model})
 await assert.rejects(()=>service.prepare('synthetic',member.id,{text,smartRecord:true}),{code:'INVALID_JOURNAL_SYMPTOM'})
 const draft=await service.prepare('synthetic',member.id,{text,smartRecord:true,frontDeskRecord:true,confirmOccurrenceTime:true})
 assert.deepEqual(draft.items.map(i=>i.category),['diet','sleep'])
 assert.equal(draft.items[1].fields[0].name,'durationMinutes');assert.equal(draft.items[1].fields[0].value,'睡了一个小时')
 assert.equal(draft.items[1].fields[0].sources[0].quote,text)
 const saved=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})
 assert.equal(saved.result.count,2)
})
test('explicit symptoms, clock phrases and human edits are never reclassified',()=>{
 const physical={category:'symptom',fields:[{name:'food',value:'鸡蛋'},{name:'symptom',value:'脸上有红点'}]};assert.equal(reconcileFrontDeskFields(physical).category,'symptom')
 const manual={category:'symptom',categoryEditedBy:'user',fields:[{name:'food',value:'粥'}]};assert.equal(reconcileFrontDeskFields(manual).category,'symptom')
 for(const field of [{name:'sleepAt',value:'昨天13:00'},{name:'sleepAt',value:'一个小时',editedBy:'user'}])assert.equal(reconcileFrontDeskFields({category:'sleep',fields:[field]}).fields[0].name,'sleepAt')
})

test('front-desk quoted duration rejects invented minute values and retains a retryable exact draft',async t=>{
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-front-duration-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic',name:'小禾（虚构）',relationship:'child'})
 const text='Yesterday she slept for one hour.',calls=[]
 const model={structured:async input=>{calls.push(input);return {value:{items:[{category:'sleep',title:'睡眠时长',timeText:'Yesterday',archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'durationMinutes',value:'60',quote:'slept for one hour',sourceId:'input',page:1}]}]},diagnostics:{provider:'test'}}}}
 const service=new AIBusinessService({dataDirectory,model})
 const retained=await service.prepare('synthetic',member.id,{text,smartRecord:true,frontDeskRecord:true,deferRecognition:true})
 await assert.rejects(()=>service.prepare('synthetic',member.id,{text,id:retained.id,version:retained.version}),{code:'AI_EVIDENCE_MISMATCH'})
 const failed=await service.get('synthetic',member.id,retained.id);assert.equal(failed.state,'failed');assert.equal(failed.raw,text);assert.equal(failed.items.length,0)
 assert.ok(calls[0].instructions.includes('时长字段durationMinutes的value'))
 await assert.rejects(()=>service.prepare('synthetic',member.id,{text,smartRecord:true}),{code:'AI_EVIDENCE_MISMATCH'})
 assert.equal(calls[1].instructions.includes('时长字段durationMinutes的value'),false,'other extraction entrypoints keep their existing instruction')
})
