// Real service/storage, deterministic fault injection, no live model calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'
import {validateProfessionalSummary} from './professional-summary.mjs'
import {currentSituation} from '../../visit-sheets/current-situation.mjs'
const clone=value=>structuredClone(value)
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const raw='今天脚小趾表面破皮。\n今天被踢到。\n尚未做处理。\n能正常走路。\n红肿情况暂不清楚。'
const sequence={
 summary_success:['draft-extraction','professional-summary-generate','professional-summary-generate','professional-summary-verify'],
 summary_persistent:['draft-extraction','professional-summary-generate','professional-summary-generate'],
 source_then_summary:['draft-extraction','professional-summary-generate','professional-summary-verify','draft-extraction','professional-summary-generate'],
 summary_then_source:['draft-extraction','professional-summary-generate','professional-summary-generate','professional-summary-verify'],
}

async function fixture(t,{mode='summary_success',holdSecond=false}={}){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-summary-repair-'))
 t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const account='synthetic-summary-repair',now=()=>new Date('2026-10-25T08:00:00Z')
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:account,name:'虚构摘要补齐验收',relationship:'child'})
 await new JsonStore(path.join(dataDirectory,'front-desk-records.json'),{contexts:[],messages:[]}).update(()=>({
  contexts:[{id:'context',accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:[]}}],
  messages:[{id:'source',contextId:'context',accountId:account,memberId:member.id,status:'completed',kind:'text',text:raw,recordable:true,files:[],voices:[]}],
 }))
 const calls=[],requests=[],secondEntered=deferred(),releaseSecond=deferred()
 t.after(()=>releaseSecond.resolve())
 let extractions=0,generations=0,verifications=0,firstMissing=[]
 const model={sourceReferences:true,async structured(input){
  calls.push(input.task)
  const data=JSON.parse(input.input)
  requests.push({task:input.task,data:clone(data)})
  if(input.task==='draft-extraction'){
   extractions++
   const segments=data.sources[0].segments
   assert.equal(segments.map(s=>s.text).join(''),raw)
   assert.equal(Object.hasOwn(data.sources[0],'text'),false)
   const field=(name,value)=>({name,value,evidenceId:segments.find(s=>s.text.includes(value)).evidenceId})
   const omitMechanism=mode==='source_then_summary'&&extractions===1
   const omitUnknown=mode==='summary_then_source'
   const fields=[field('symptom','脚小趾表面破皮'),...(!omitMechanism?[field('statusRaw','今天被踢到')]:[]),field('handling','尚未做处理'),field('statusRaw','能正常走路'),...(!omitUnknown?[field('statusRaw','红肿情况暂不清楚')]:[])]
   if(extractions===2){
    assert.equal(mode,'source_then_summary','summary-only repair cannot re-extract sources')
    assert.equal(data.sourceCoverageRepair.missingFacts[0].quote,'今天被踢到。')
   }
   return {value:{items:[{category:'symptom',subject:'current',title:'足趾观察',timeText:'今天',archiveCategory:null,relationKey:null,fields}]},diagnostics:{provider:'synthetic'}}
  }
  if(input.task==='professional-summary-generate'){
   generations++
   const shouldOmit=mode==='summary_persistent'||mode==='source_then_summary'&&extractions===2||mode!=='source_then_summary'&&generations===1
   if(generations===1&&mode!=='source_then_summary')firstMissing=data.items.flatMap(p=>p.facts.filter(f=>f.text.includes('尚未做处理')).flatMap(f=>f.factIds))
   if(generations===2&&mode!=='source_then_summary'){
    const hints=data.repairHints
    assert.ok(hints&&Array.isArray(hints.items),'summary retry supplies only checked repair hints')
    const hint=hints.items.find(h=>h.itemId===data.items[0].itemId)
    assert.ok(hint)
    assert.deepEqual([...hint.requiredFactIds].sort(),[...firstMissing].sort(),'required IDs are exactly the known IDs omitted on the first attempt')
    assert.equal(hint.requiredTimeText,'今天')
    const known=new Set(data.items[0].facts.flatMap(f=>f.factIds))
    assert.ok(hint.reviewFactIds.every(id=>known.has(id)))
    assert.ok(Object.keys(hint).every(key=>['itemId','requiredFactIds','reviewFactIds','requiredTimeText'].includes(key)))
    assert.equal(JSON.stringify(hints).includes('quote'),false,'repair hints do not carry raw quotes or model reasoning')
   }
   if(generations===2&&holdSecond){secondEntered.resolve();await releaseSecond.promise}
   const items=data.items.map(p=>({itemId:p.itemId,title:'足小趾表皮破损',claims:p.facts.filter(f=>!shouldOmit||!f.text.includes('尚未做处理')).map(f=>({text:f.text,factIds:f.factIds}))}))
   if(generations===2&&mode==='summary_then_bad_number')items[0].claims[0].text+='，体温39℃'
   if(generations===2&&mode==='summary_then_foreign_id')items[0].claims[0].factIds=['foreign-item:field:0']
   return {value:{items},diagnostics:{provider:'synthetic'}}
  }
  assert.equal(input.task,'professional-summary-verify')
  verifications++
  assert.equal(data.sourceInventory[0].text,raw)
  assert.deepEqual(data.candidates[0].recordScope,{subject:'current',timeText:'今天',phase:'candidate',subjectConfirmationRequired:false})
  const missingQuote=mode==='source_then_summary'&&extractions===1?'今天被踢到。':mode==='summary_then_source'?'红肿情况暂不清楚。':null
  return {value:{items:data.candidates.map(c=>({itemId:c.itemId,titleSupported:true,complete:!missingQuote,problems:missingQuote?['missing_fact']:[],missingFacts:missingQuote?[{itemId:c.itemId,sourceId:'input',page:1,quote:missingQuote}]:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))},diagnostics:{provider:'synthetic'}}
 }}
 const service=new AIBusinessService({dataDirectory,model,now,logger:{info(){},warn(){}}})
 const prepare=()=>service.prepare(account,member.id,{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:'context',semanticVersion:2,followUp:false})
 return {service,account,member,calls,requests,prepare,secondEntered,releaseSecond,counts:()=>({extractions,generations,verifications})}
}
const records=f=>f.service.records.repository.findByAccountId(f.account)
async function expectFailed(f,code='AI_SUMMARY_INCOMPLETE'){
 await assert.rejects(f.prepare,{code})
 const draft=await f.service.latest(f.account,f.member.id)
 assert.equal(draft.state,'failed')
 assert.equal((await records(f)).length,0)
 return draft
}

test('one known-fact summary retry preserves evidence, saves and reads back the verified result',async t=>{
 const f=await fixture(t),draft=await f.prepare()
 assert.equal(draft.state,'ready')
 assert.deepEqual(f.calls,sequence.summary_success)
 assert.deepEqual(f.counts(),{extractions:1,generations:2,verifications:1})
 const stored=await f.service.get(f.account,f.member.id,draft.id)
 assert.equal(stored.callCount,4)
 assert.equal(stored.summaryRecoveryCount,1)
 assert.equal(stored.coverageRecoveryCount??0,0)
 const extraction=f.requests.find(r=>r.task==='draft-extraction').data
 assert.equal(extraction.sourceCoverageRepair,undefined)
 const generated=f.requests.filter(r=>r.task==='professional-summary-generate')
 assert.deepEqual(generated[1].data.items,generated[0].data.items,'summary-only repair uses the identical checked item/fact/source packet')
 const summary=draft.items[0].professionalSummary
 assert.ok(summary.text.includes('今天')&&summary.text.includes('尚未做处理')&&summary.text.includes('被踢到'))
 assert.equal((await f.service.read(f.account,f.member.id,draft.id)).items[0].professionalSummary.text,summary.text)
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,raw)
 assert.equal(record.content,summary.text)
 assert.equal(validateProfessionalSummary(record.aiProvenance.professionalSummary,{...record.aiProvenance,id:record.aiProvenance.itemId}),true)
 const report={focusSourceIds:[`record:${record.id}`],complaintSourceId:`record:${record.id}`,sources:[{id:`record:${record.id}`}],focus:{mode:'source'},photoKey:'none',reading:{onset:'',change:'',description:'',sourceIds:[]}}
 const doctorView=currentSituation(report,{records:[record],organizations:[],member:{id:f.member.id}})
 assert.equal(doctorView.symptoms[0].text,summary.text)
 assert.equal(f.calls.length,4)
})

test('persistent known-fact omission stops after one retry before any independent verification',async t=>{
 const f=await fixture(t,{mode:'summary_persistent'})
 const failed=await expectFailed(f)
 assert.deepEqual(f.calls,sequence.summary_persistent)
 assert.deepEqual(f.counts(),{extractions:1,generations:2,verifications:0})
 const stored=await f.service.get(f.account,f.member.id,failed.id)
 assert.equal(stored.summaryRecoveryCount,1)
 assert.equal(stored.callCount,3)
})

test('a source repair spends the automatic budget and prevents a subsequent summary-only retry',async t=>{
 const f=await fixture(t,{mode:'source_then_summary'})
 const failed=await expectFailed(f)
 assert.deepEqual(f.calls,sequence.source_then_summary)
 assert.deepEqual(f.counts(),{extractions:2,generations:2,verifications:1})
 const stored=await f.service.get(f.account,f.member.id,failed.id)
 assert.equal(stored.coverageRecoveryCount,1)
 assert.equal(stored.summaryRecoveryCount??0,0)
 assert.equal(stored.callCount,5)
})

test('a summary repair spends the automatic budget and prevents a subsequent source re-extraction',async t=>{
 const f=await fixture(t,{mode:'summary_then_source'})
 const failed=await expectFailed(f)
 assert.deepEqual(f.calls,sequence.summary_then_source)
 assert.deepEqual(f.counts(),{extractions:1,generations:2,verifications:1})
 const stored=await f.service.get(f.account,f.member.id,failed.id)
 assert.equal(stored.summaryRecoveryCount,1)
 assert.equal(stored.coverageRecoveryCount??0,0)
 assert.equal(stored.callCount,4)
})

for(const mode of ['summary_then_bad_number','summary_then_foreign_id'])test(`all original candidate guards run again after repair: ${mode}`,async t=>{
 const f=await fixture(t,{mode})
 await expectFailed(f,'AI_SUMMARY_UNSUPPORTED')
 assert.deepEqual(f.calls,sequence.summary_persistent)
 assert.equal(f.counts().verifications,0)
})

test('cancel during the second generation cannot resurrect a draft or create a record',{timeout:5000},async t=>{
 const f=await fixture(t,{holdSecond:true})
 const pending=f.prepare().then(value=>({ok:true,value}),error=>({ok:false,error}))
 await f.secondEntered.promise
 const draft=(await f.service.store.read()).drafts.find(d=>d.accountId===f.account&&d.memberId===f.member.id)
 assert.ok(draft)
 await f.service.cancel(f.account,f.member.id,draft.id)
 f.releaseSecond.resolve()
 const result=await pending
 assert.equal(result.ok,false)
 assert.ok(['AI_DRAFT_VERSION_CONFLICT','AI_DRAFT_NOT_FOUND'].includes(result.error.code),result.error.code)
 assert.equal((await f.service.store.read()).drafts.some(d=>d.id===draft.id),false)
 assert.equal((await records(f)).length,0)
 assert.equal(f.counts().extractions,1)
 assert.equal(f.counts().generations,2)
 assert.ok(f.calls.length<=4)
})
