import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'
import {validSemanticSummary} from './semantic-summary.mjs'

async function fixture(t,{raw='今天脚小趾破皮，被踢到',quote='被踢到',alwaysMissing=false,wrongItem=false}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-source-coverage-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const account='synthetic-coverage',now=()=>new Date('2026-10-25T08:00:00Z'),member=await new FamilyMemberRepository(directory).create({accountId:account,name:'覆盖测试（虚构）',relationship:'child'})
 await new JsonStore(path.join(directory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({contexts:[{id:'context',accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:[]}}],messages:[{id:'source',contextId:'context',accountId:account,memberId:member.id,kind:'text',text:raw,status:'completed',recordable:true,inputAt:now().getTime(),files:[],voices:[]}]}))
 const calls=[],requests=[]
 const model={async structured({task,input}){
  calls.push(task);const data=JSON.parse(input);requests.push({task,data})
  if(task==='draft-extraction'){
   const fields=[{name:'symptom',value:'脚小趾破皮',quote:'今天脚小趾破皮',sourceId:'input',page:1}]
   if(data.sourceCoverageRepair&&!alwaysMissing)fields.push({name:'statusRaw',value:quote,quote,sourceId:'input',page:1})
   return {value:{items:[{category:'symptom',title:'脚小趾破皮',subject:'current',timeText:'今天',fields,archiveCategory:null,relationKey:null}]},diagnostics:{provider:'synthetic'}}
  }
  if(task==='professional-summary-generate')return {value:{items:data.items.map(p=>({itemId:p.itemId,title:'脚小趾破皮',claims:p.facts.map(f=>({text:f.text,factIds:f.factIds}))}))}}
  assert.equal(task,'professional-summary-verify');assert.equal(data.sourceInventory[0].text,raw)
  const present=data.facts[0].facts.some(f=>f.text.includes(quote))
  return {value:{items:data.candidates.map(c=>({itemId:c.itemId,titleSupported:true,complete:present,claims:c.claims.map((_,index)=>({index,supported:true})),problems:present?[]:['missing_fact'],missingFacts:present?[]:[{itemId:wrongItem?'foreign':c.itemId,sourceId:'input',page:1,quote}]}))}}
 }}
 const service=new AIBusinessService({dataDirectory:directory,model,now,logger:{info(){}}})
 const prepare=()=>service.prepare(account,member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:'context'})
 return {service,prepare,account,member,calls,requests,raw}
}

test('an omitted injury mechanism triggers one source-backed re-extraction and independent recheck, then saves unchanged',async t=>{
 const f=await fixture(t);let draft=await f.prepare()
 assert.equal(draft.state,'ready');assert.match(draft.items[0].professionalSummary.text,/被踢到/u)
 assert.equal(draft.items[0].professionalSummary.verification.protocol,'source-entailment-v2')
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate','professional-summary-verify','draft-extraction','professional-summary-generate','professional-summary-verify'])
 assert.equal(f.requests.filter(r=>r.task==='draft-extraction')[1].data.sourceCoverageRepair.missingFacts[0].quote,'被踢到')
 const stored=await f.service.get(f.account,f.member.id,draft.id)
 assert.equal(stored.callCount,6);assert.equal(stored.coverageRecoveryCount,1)
 const summary=draft.items[0].professionalSummary
 assert.equal(validSemanticSummary(summary,draft.items[0],{sources:stored.sources}),true)
 assert.equal(validSemanticSummary(summary,draft.items[0],{sources:[{...stored.sources[0],text:f.raw+'，后来又出血'}]}),false)
 draft=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,draft.result.records[0].recordId)
 assert.equal(record.content,summary.text);assert.equal(record.sourceText,f.raw)
 assert.equal(validSemanticSummary(record.aiProvenance.professionalSummary,{...record.aiProvenance,id:record.aiProvenance.itemId}),true)
 assert.deepEqual((await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})).result,draft.result)
 assert.equal(f.calls.length,6)
})

test('a second missing-source verdict stops after one repair without saving or looping',async t=>{
 const f=await fixture(t,{alwaysMissing:true})
 await assert.rejects(f.prepare,{code:'AI_SUMMARY_INCOMPLETE'})
 assert.equal(f.calls.length,6);assert.equal((await f.service.latest(f.account,f.member.id)).state,'failed')
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})

for(const scenario of [
 {name:'another person',raw:'今天脚小趾破皮，妈妈的手被踢到',quote:'妈妈的手被踢到'},
 {name:'a nonexistent quote',quote:'原文没有的伤口说明'},
 {name:'an unknown item',wrongItem:true},
])test('coverage repair cannot promote '+scenario.name,async t=>{
 const f=await fixture(t,scenario)
 await assert.rejects(f.prepare,{code:'AI_SUMMARY_UNSUPPORTED'});assert.equal(f.calls.length,3)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})

test('a source repair from yesterday cannot be attached to today’s foot observation',async t=>{
 const f=await fixture(t,{raw:'今天脚小趾破皮，昨天手被踢到',quote:'昨天手被踢到'})
 await assert.rejects(f.prepare,{code:'AI_TIME_CONFLICT'});assert.equal(f.calls.length,4)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})
