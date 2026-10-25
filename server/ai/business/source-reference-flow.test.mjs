// Real draft, evidence validation, summary sealing and record storage; injected model only.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'

const raw='今天脚小拇指破皮。\n被踢到了。\n现在没有出血，能正常走路，还没有做处理。'
async function fixture(t,{repair=false,invalidId=false,returnLegacy=false}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'source-reference-flow-')),account='synthetic-source-reference',contextId='reference-context'
 t.after(()=>rm(directory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(directory).create({accountId:account,name:'虚构引用验收',relationship:'child'})
 await new JsonStore(path.join(directory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({contexts:[{id:contextId,accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:[]}}],messages:[{id:'source-message',contextId,accountId:account,memberId:member.id,status:'completed',kind:'text',text:raw,recordable:true,files:[],voices:[]}]}))
 const calls=[];let extractions=0,verifications=0
 const model={sourceReferences:true,async structured(input){
  const data=JSON.parse(input.input);calls.push(input.task)
  if(input.task==='draft-extraction'){
   extractions++
   const fieldsSchema=input.schema.properties.items.items.properties.fields.items
   assert.ok(fieldsSchema.required.includes('evidenceId'));assert.equal(fieldsSchema.properties.quote,undefined)
   assert.equal(Object.hasOwn(data.sources[0],'text'),false)
   const segments=data.sources[0].segments
   assert.equal(segments.map(s=>s.text).join(''),raw,'source text is supplied once, without newline loss')
   const field=(name,value)=>({name,value,evidenceId:invalidId?'e_invalid':segments.find(s=>s.text.includes(value)).evidenceId})
   if(returnLegacy)return {value:{items:[{category:'symptom',subject:'current',title:'观察',timeText:'今天',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'脚小拇指破皮',sourceId:'input',page:1,quote:raw}]}]},diagnostics:{provider:'synthetic'}}
   if(extractions===2)assert.equal(data.sourceCoverageRepair.missingFacts[0].quote,'被踢到了。')
   return {value:{items:[{category:'symptom',subject:'current',title:'脚趾观察',timeText:'今天',archiveCategory:null,relationKey:null,fields:[field('symptom','脚小拇指破皮'),field('location','脚小拇指'),field('statusRaw','现在没有出血，能正常走路，还没有做处理'),...(!repair||extractions>1?[field('statusRaw','被踢到了')]:[])]}]},diagnostics:{provider:'synthetic'}}
  }
  if(input.task==='professional-summary-generate')return {value:{items:data.items.map(p=>({itemId:p.itemId,title:'足小趾破皮',claims:p.facts.map(f=>({text:f.text,factIds:f.factIds}))}))},diagnostics:{provider:'synthetic'}}
  assert.equal(input.task,'professional-summary-verify');verifications++
  assert.deepEqual(data.facts[0].scope,{subject:'current',timeText:'今天'})
  const missing=repair&&verifications===1
  return {value:{items:data.candidates.map(c=>({itemId:c.itemId,titleSupported:true,complete:!missing,problems:missing?['missing_fact']:[],missingFacts:missing?[{itemId:c.itemId,sourceId:'input',page:1,quote:'被踢到了。'}]:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))},diagnostics:{provider:'synthetic'}}
 }}
 const service=new AIBusinessService({dataDirectory:directory,model,now:()=>new Date('2026-10-25T08:00:00Z'),logger:{info(){},warn(){}}})
 const prepare=()=>service.prepare(account,member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,semanticVersion:2,followUp:false,timezone:'Asia/Shanghai'})
 return {service,account,member,prepare,calls}
}
for(const repair of [false,true])test(`source-reference extraction ${repair?'repairs once then saves':'saves directly'} without model-written quotations`,async t=>{
 const f=await fixture(t,{repair}),draft=await f.prepare()
 assert.equal(draft.state,'ready');assert.equal((await f.service.get(f.account,f.member.id,draft.id)).callCount,repair?6:3)
 assert.match(draft.items[0].professionalSummary.text,/踢到/)
 assert.equal(draft.items[0].professionalSummary.verification.protocol,'source-entailment-v2')
 assert.ok(draft.items[0].fields.every(field=>!Object.hasOwn(field,'evidenceId')&&field.sources.every(ref=>raw.includes(ref.quote))))
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true}),ref=saved.result.records[0]
 const record=await f.service.records.getOwnedRecord(f.account,ref.recordId)
 assert.equal(record.sourceText,raw);assert.equal(record.content,draft.items[0].professionalSummary.text)
 const repeated=await f.service.save(f.account,f.member.id,draft.id,{version:saved.version,confirmed:true})
 assert.deepEqual(repeated.result,saved.result);assert.equal(f.calls.length,repair?6:3)
})
test('unknown source-reference IDs fail without summary calls, fallback or any formal record',async t=>{
 const f=await fixture(t,{invalidId:true})
 await assert.rejects(f.prepare,{code:'AI_SOURCE_REFERENCE_INVALID'})
 assert.deepEqual(f.calls,['draft-extraction'])
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})


test('a declared source-reference model cannot fall back to writing legacy literal quotations',async t=>{
 const f=await fixture(t,{returnLegacy:true})
 await assert.rejects(f.prepare,error=>error.code==='AI_SOURCE_REFERENCE_INVALID'&&error.details.sourceReference.reason==='bound_reference_required')
 assert.deepEqual(f.calls,['draft-extraction'])
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})
