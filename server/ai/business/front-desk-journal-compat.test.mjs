// Suggested destination: server/ai/business/front-desk-journal-compat.test.mjs.
// Expected additive API: buildJournal(item,{semanticVersion:2}); the service
// passes 2 only for server-owned frontDeskRecord && draft.semanticVersion===2.
// This is a complete test module; no live model or remote data is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {buildJournal} from './contract.mjs'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'

for(const name of ['chiefComplaint','reaction','statusRaw'])test(`v2 legacy symptom projection accepts ${name} without renaming source fields or relaxing v1`,()=>{
 const item={id:'projection',category:'symptom',title:'观察记录',fields:[{name,value:'小脚趾皮肤破损',sources:[{sourceId:'input',page:1,quote:'小脚趾皮肤破损'}]}]}
 const before=structuredClone(item)
 assert.throws(()=>buildJournal(item),{code:'INVALID_JOURNAL_SYMPTOM'})
 assert.throws(()=>buildJournal(item,{semanticVersion:1}),{code:'INVALID_JOURNAL_SYMPTOM'})
 const journal=buildJournal(item,{semanticVersion:2})
 assert.deepEqual(journal.categories,['symptom']);assert.equal(journal.symptom.narrative,'小脚趾皮肤破损')
 assert.deepEqual(item,before,'projection cannot rewrite or add a source field named symptom')
})

test('v2 projection keeps explicit symptom as the primary narrative and never promotes generic injury or diet reactions',()=>{
 const explicit={category:'symptom',fields:[{name:'symptom',value:'咳嗽'},{name:'chiefComplaint',value:'面部发红'},{name:'reaction',value:'没有呕吐'}]}
 assert.equal(buildJournal(explicit,{semanticVersion:2}).symptom.narrative,'咳嗽')
 for(const item of [
  {category:'diet',fields:[{name:'food',value:'牛奶'},{name:'reaction',value:'奶后打了嗝'}]},
  {category:'injury',fields:[{name:'reaction',value:'小脚趾被踢后皮肤破损'}]},
 ]){
  const before=structuredClone(item),journal=buildJournal(item,{semanticVersion:2})
  assert.deepEqual(journal.categories,[item.category]);assert.equal(journal.symptom,undefined)
  assert.deepEqual(item,before)
 }
})

async function semanticJournalFixture(t,{name,value,semanticVersion=2}={}){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-semantic-journal-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const account='synthetic-semantic-journal',now=()=>new Date('2026-10-25T08:00:00Z')
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'虚构主述投影',relationship:'child'})
 const contextId='synthetic-journal-context'
 if(semanticVersion===2)await new JsonStore(path.join(dataDirectory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({
  contexts:[{id:contextId,accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:[]}}],
  messages:[{id:'source',contextId,accountId:account,memberId:member.id,status:'completed',kind:'text',text:value,recordable:true,inputAt:now().getTime(),files:[],voices:[]}],
 }))
 const calls=[],model={async structured({task,input}){
  calls.push(task)
  const parsed=JSON.parse(input)
  if(task==='draft-extraction')return {value:{items:[{category:'symptom',title:'观察记录',subject:'current',timeText:null,archiveCategory:null,relationKey:null,fields:[{name,value,quote:value,sourceId:'input',page:1}]}]},diagnostics:{provider:'synthetic'}}
  if(task==='professional-summary-generate')return {value:{items:parsed.items.map(p=>({itemId:p.itemId,title:'观察记录',claims:p.facts.map(f=>({text:f.text,factIds:f.factIds}))}))},diagnostics:{provider:'synthetic'}}
  assert.equal(task,'professional-summary-verify')
  return {value:{items:parsed.candidates.map(c=>({itemId:c.itemId,titleSupported:true,complete:true,problems:[],missingFacts:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))},diagnostics:{provider:'synthetic'}}
 }}
 const service=new AIBusinessService({dataDirectory,model,now,logger:{info(){},warn(){}}})
 const prepare=()=>service.prepare(account,member.id,{text:value,smartRecord:true,followUp:false,...(semanticVersion===2?{frontDeskRecord:true,frontContextId:contextId,semanticVersion:2}:{})})
 return {service,account,member,calls,prepare}
}

for(const [name,value] of [
 ['reaction','小脚趾被踢后皮肤破损'],
 ['chiefComplaint','咳嗽'],
 ['statusRaw','没有呕吐'],
])test(`v2 ${name}-only supplier output prepares, reads and saves without changing source facts`,async t=>{
 const f=await semanticJournalFixture(t,{name,value}),draft=await f.prepare()
 assert.equal(draft.state,'ready');assert.equal(draft.items[0].journal.symptom.narrative,value)
 assert.deepEqual(draft.items[0].fields.map(f=>f.name),[name]);assert.equal(draft.items[0].fields[0].value,value)
 assert.equal(draft.items[0].fields[0].sources[0].quote,value)
 const read=await f.service.read(f.account,f.member.id,draft.id)
 assert.equal(read.items[0].journal.symptom.narrative,value)
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,value);assert.equal(record.journal.symptom.narrative,value)
 assert.deepEqual(record.aiProvenance.fields.map(f=>f.name),[name]);assert.equal(record.aiProvenance.fields[0].value,value)
 assert.equal(record.content,draft.items[0].professionalSummary.text)
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate','professional-summary-verify'])
})

for(const name of ['symptom','chiefComplaint','reaction','statusRaw'])test(`v2 long ${name} is retained whole and does not overflow the optional legacy symptom slot`,async t=>{
 const value='小脚趾皮肤破损，'.repeat(140)
 assert.ok(value.length>1000&&value.length<1200)
 const f=await semanticJournalFixture(t,{name,value}),draft=await f.prepare()
 assert.equal(draft.state,'ready');assert.deepEqual(draft.items[0].journal.categories,['symptom'])
 assert.equal(draft.items[0].journal.symptom,undefined,'omit the optional bounded legacy slot; never slice original text')
 assert.equal(draft.items[0].fields[0].name,name);assert.equal(draft.items[0].fields[0].value,value)
 assert.equal(draft.items[0].fields[0].sources[0].quote,value)
 assert.ok(draft.items[0].professionalSummary.text.length>1000,'full supported narrative remains available')
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,value);assert.equal(record.aiProvenance.fields[0].value,value)
 assert.equal(record.aiProvenance.fields[0].sources[0].quote,value);assert.equal(record.content,draft.items[0].professionalSummary.text)
 assert.ok(record.content.length>1000);assert.equal(record.journal.symptom,undefined)
})

test('legacy entrypoints retain their prior rejection for symptom metadata without a symptom field',async t=>{
 const f=await semanticJournalFixture(t,{name:'reaction',value:'小脚趾皮肤破损',semanticVersion:1})
 await assert.rejects(f.prepare,{code:'INVALID_JOURNAL_SYMPTOM'})
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})
