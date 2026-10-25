// Provider results are injected; source validation, draft persistence and save are real.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'

const raw='今天脚小拇指破皮，被踢到。\n现在没有出血，能正常走路，还没有做处理。\n红肿情况不清楚。\n次数0。'
const baseFields=[['symptom','脚小拇指破皮'],['statusRaw','被踢到'],['reaction','现在没有出血'],['statusRaw','能正常走路'],['handling','还没有做处理'],['statusRaw','红肿情况不清楚'],['frequency','0']]
const blanks=[['institution',''],['doctorStatement',' \t\n\r '],['followUp','\u200b\u200c\u200d\ufeff\u2060']]
async function fixture(t,{declaredBound=true,onlyEmpty=false,emptyItems=false,extras=blanks,patchField,missingMechanism=false,itemSubject='current'}={}){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-empty-bound-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const account='synthetic-empty-bound',now=()=>new Date('2026-10-25T08:00:00Z')
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'虚构空字段验收',relationship:'child'})
 await new JsonStore(path.join(dataDirectory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({
  contexts:[{id:'context',accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:[]}}],
  messages:[{id:'source',contextId:'context',accountId:account,memberId:member.id,status:'completed',kind:'text',text:raw,recordable:true,files:[],voices:[]}],
 }))
 const calls=[]
 const model={...(declaredBound?{sourceReferences:true}:{}),async structured(input){
  calls.push(input.task)
  const data=JSON.parse(input.input)
  if(input.task==='draft-extraction'){
   const segment=declaredBound?data.sources[0].segments.find(s=>s.text.includes('脚小拇指破皮')):null
   const field=(name,value)=>{
    if(!declaredBound)return {name,value,sourceId:'input',page:1,quote:raw}
    const supporting=data.sources[0].segments.find(s=>value&&s.text.includes(value))??segment
    return {name,value,evidenceId:supporting.evidenceId}
   }
   const entries=[...(onlyEmpty?[]:baseFields.filter(([name,value])=>!missingMechanism||value!=='被踢到')),...extras]
   const fields=entries.map(([name,value])=>field(name,value))
   if(patchField)patchField(fields,data)
   return {value:{items:emptyItems?[]:[{category:'symptom',subject:itemSubject,title:'脚趾观察',timeText:'今天',archiveCategory:null,relationKey:null,fields}]},diagnostics:{provider:'synthetic'}}
  }
  if(input.task==='professional-summary-generate'){
   assert.ok(data.items.every(p=>p.sourceEvidence.every(f=>typeof f.value==='string'&&f.value.replace(/[\s\p{Cf}]/gu,'').length>0)),'no blank slot becomes a summary fact')
   return {value:{items:data.items.map(p=>({itemId:p.itemId,title:'足小趾破皮',claims:p.facts.map(f=>({text:f.text,factIds:f.factIds}))}))},diagnostics:{provider:'synthetic'}}
  }
  assert.equal(input.task,'professional-summary-verify')
  assert.equal(data.sourceInventory[0].text,raw,'full original still reaches independent coverage verification')
  const missing=missingMechanism&&!data.facts[0].facts.some(f=>f.text.includes('被踢到'))
  return {value:{items:data.candidates.map(c=>({itemId:c.itemId,titleSupported:true,complete:!missing,problems:missing?['missing_fact']:[],missingFacts:missing?[{itemId:c.itemId,sourceId:'input',page:1,quote:'被踢到。'}]:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))},diagnostics:{provider:'synthetic'}}
 }}
 const service=new AIBusinessService({dataDirectory,model,now,logger:{info(){},warn(){}}})
 const prepare=()=>service.prepare(account,member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:'context',semanticVersion:2,followUp:false})
 return {service,account,member,calls,prepare}
}
const typedFailure=e=>typeof e?.code==='string'&&/^(?:AI_|INVALID_)/u.test(e.code)&&e.status>=400
async function assertFailedWithoutRecords(f,predicate=typedFailure){
 await assert.rejects(f.prepare,predicate)
 const latest=await f.service.latest(f.account,f.member.id)
 assert.equal(latest.state,'failed')
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
 return latest
}

test('declared-bound blank optional slots are omitted and counted, while real facts survive save',async t=>{
 const f=await fixture(t),draft=await f.prepare()
 assert.equal(draft.state,'ready')
 assert.equal(draft.items.length,1)
 assert.deepEqual(draft.items[0].fields.map(({name,value})=>[name,value]),baseFields)
 const stored=await f.service.get(f.account,f.member.id,draft.id)
 assert.equal(stored.generation.emptyFieldsOmitted,3)
 const summary=draft.items[0].professionalSummary.text
 for(const value of ['被踢到','没有出血','正常走路','没有做处理','不清楚','0'])assert.ok(summary.includes(value),value)
 assert.doesNotMatch(summary,/红肿正常|无红肿|已处理/u)
 assert.equal(f.calls.length,3)
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,raw)
 assert.equal(record.content,summary)
 assert.ok(!record.aiProvenance.fields.some(field=>['institution','doctorStatement','followUp'].includes(field.name)))
})

for(const name of ['institution','doctorStatement','followUp'])test(`legacy ${name} empty slot remains strictly invalid`,async t=>{
 const f=await fixture(t,{declaredBound:false,extras:[[name,'']]})
 await assertFailedWithoutRecords(f,e=>e.code==='AI_EVIDENCE_MISMATCH'&&e.validation?.rule==='value_missing')
 assert.deepEqual(f.calls,['draft-extraction'])
})

for(const [name,patchField] of [
 ['unknown evidence ID',fields=>{fields.at(-1).evidenceId='e_unknown'}],
 ['unknown field role',fields=>{fields.at(-1).name='inventedClinicalRole'}],
 ['null value',fields=>{fields.at(-1).value=null}],
 ['missing value property',fields=>{delete fields.at(-1).value}],
 ['numeric zero value',fields=>{fields.at(-1).value=0}],
 ['unexpected property',fields=>{fields.at(-1).unapproved=true}],
 ['mixed legacy reference',fields=>{fields.at(-1).quote=''}],
])test(`blank slots cannot conceal an invalid ${name}`,async t=>{
 const f=await fixture(t,{extras:[['institution','']],patchField})
 await assertFailedWithoutRecords(f)
 assert.deepEqual(f.calls,['draft-extraction'])
})

test('a colon placeholder is not treated as an absent field',async t=>{
 const f=await fixture(t,{extras:[['institution',':']]})
 await assertFailedWithoutRecords(f,e=>e.code==='AI_EVIDENCE_MISMATCH'&&e.validation?.rule==='value_not_in_quote')
 assert.deepEqual(f.calls,['draft-extraction'])
})

test('invisible characters attached to real content are not stripped to manufacture a valid value',async t=>{
 const f=await fixture(t,{extras:[['doctorStatement','\u200b表面破皮']]})
 await assertFailedWithoutRecords(f,e=>e.code==='AI_EVIDENCE_MISMATCH'&&e.validation?.rule==='value_not_in_quote')
 assert.deepEqual(f.calls,['draft-extraction'])
})

test('only empty bound slots cannot create a ready draft or call summary generation',async t=>{
 const f=await fixture(t,{onlyEmpty:true})
 await assertFailedWithoutRecords(f)
 assert.deepEqual(f.calls,['draft-extraction'])
})

test('an empty item array with factual input cannot become ready zero',async t=>{
 const f=await fixture(t,{emptyItems:true})
 await assertFailedWithoutRecords(f)
 assert.deepEqual(f.calls,['draft-extraction'])
})

test('a declared-bound result entirely filtered by subject cannot become ready zero',async t=>{
 const f=await fixture(t,{itemSubject:'other',extras:[]})
 await assertFailedWithoutRecords(f)
 assert.deepEqual(f.calls,['draft-extraction'])
})

test('omitting empty placeholders cannot bypass independent verification of an omitted real mechanism',async t=>{
 const f=await fixture(t,{missingMechanism:true})
 await assertFailedWithoutRecords(f,{code:'AI_SUMMARY_INCOMPLETE'})
 assert.deepEqual(f.calls,['draft-extraction','professional-summary-generate','professional-summary-verify','draft-extraction','professional-summary-generate','professional-summary-verify'])
})
