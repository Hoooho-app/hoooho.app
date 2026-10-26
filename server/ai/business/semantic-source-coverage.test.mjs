// All provider responses are injected. Source validation, recursive preparation,
// storage versions, task leases, cancellation, and publication are real.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {JsonStore} from '../../auth/storage/json-store.mjs'
import {FrontDeskRecord} from '../front-desk-record.mjs'
import {RecognitionJobs} from '../recognition-jobs.mjs'

const coverageFoot='今天右脚小拇指皮肤破损',coverageForce='被踢到凳角',coverageRaw=coverageFoot+'，'+coverageForce+'。'
const coverageDeferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const coverageWait=async fn=>{for(let i=0;i<400;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,10))}throw new Error('Timed out waiting for coverage checkpoint')}
const coverageItem=(entries,timeText='今天')=>({category:'symptom',title:'观察记录',subject:'current',timeText,archiveCategory:null,relationKey:null,fields:entries.map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))})
const coverageInitial=()=>[coverageItem([['symptom',coverageFoot],['location','右脚小拇指']])]
const coverageComplete=()=>[coverageItem([['symptom',coverageFoot],['location','右脚小拇指'],['statusRaw',coverageForce]])]
const coverageDecision={intent:'record',subject:'current',subjectResolution:null,status:'ready',topic:'injury',question:null,unresolvedItems:[],media:'none'}

async function coverageFixture(t,{raw=coverageRaw,firstItems=coverageInitial,secondItems=coverageComplete,missingQuote=coverageForce,persistent=false,withJobs=false,holdSecond=false,missingOverride}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-source-coverage-')),account='synthetic-coverage',now=()=>new Date('2026-10-25T08:00:00Z')
 let jobs
 t.after(async()=>{if(jobs){await jobs.close();await coverageWait(()=>!jobs.active.size);jobs.db.close()}await rm(directory,{recursive:true,force:true})})
 const member=await new FamilyMemberRepository(directory).create({accountId:account,name:'虚构覆盖回归',relationship:'child'})
 const contextId='coverage-context',store=new JsonStore(path.join(directory,'front-desk-records.json'),{contexts:[],messages:[]})
 if(!withJobs)await store.update(()=>({contexts:[{id:contextId,accountId:account,memberId:member.id,semanticVersion:2,decision:{organize:true,unresolvedItems:[]}}],messages:[{id:'coverage-source',contextId,accountId:account,memberId:member.id,status:'completed',kind:'text',text:raw,recordable:true,inputAt:now().getTime(),files:[],voices:[]}]}))
 const calls=[],entered=coverageDeferred(),release=coverageDeferred();let extractions=0,verifications=0
 const model={async structured(input){
  input.signal?.throwIfAborted()
  const parsed=JSON.parse(input.input);calls.push({task:input.task,parsed,instructions:input.instructions})
  if(input.task==='draft-extraction'){
   extractions++
   if(holdSecond&&extractions===2){entered.resolve();await release.promise} // adversarial late supplier ignores abort while held
   const value=extractions===1?firstItems(parsed):persistent?firstItems(parsed):secondItems(parsed)
   return {value:{items:structuredClone(value)},diagnostics:{provider:'synthetic'}}
  }
  if(input.task==='professional-summary-generate')return {value:{items:parsed.items.map(p=>({itemId:p.itemId,title:'观察记录',claims:p.facts.map(f=>({text:f.text,factIds:f.factIds}))}))},diagnostics:{provider:'synthetic'}}
  assert.equal(input.task,'professional-summary-verify');verifications++
  return {value:{items:parsed.candidates.map(c=>{
   const missing=verifications===1||persistent
   return {itemId:c.itemId,titleSupported:true,complete:!missing,claims:c.claims.map((_,index)=>({index,supported:true})),problems:missing?['missing_fact']:[],missingFacts:missing?[{itemId:c.itemId,sourceId:'input',page:1,quote:missingQuote,...missingOverride}]:[]}
  })},diagnostics:{provider:'synthetic'}}
 }}
 const service=new AIBusinessService({dataDirectory:directory,model,now,maxDraftCalls:4,logger:{info(){},warn(){}}})
 const input={text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:contextId,semanticVersion:2,followUp:false,selectedOccurredAt:now().toISOString(),timezone:'Asia/Shanghai'}
 const prepare=signal=>service.prepare(account,member.id,input,signal)
 if(withJobs){
  const frontModel={async structured(input){
   const data=JSON.parse(input.input[0].content[0].text)
   return {value:{reply:'嗯，我了解了。',action:'record',contextId:data.history.at(-1)?.id??'new',questionId:null,emergency:{currentChild:false,quote:''},decision:coverageDecision},diagnostics:{provider:'synthetic'}}
  }}
  const front=new FrontDeskRecord({dataDirectory:directory,events:service.events,business:service,now,model:frontModel})
  jobs=new RecognitionJobs({dataDirectory:directory,events:service.events,business:service,frontDesk:front,audio:{},now:()=>now().getTime(),autoStart:false,logger:{info(){},warn(){}}})
  service.assertRecognitionCurrent=d=>jobs.assertCurrent(d)
 }
 const submit=(id,text)=>jobs.submit(account,member.id,{id:'coverage-job',mode:'front',input:{id,kind:'text',text},options:{task:'record',smartRecord:true,semanticVersion:2,followUp:false,selectedOccurredAt:now().toISOString(),timezone:'Asia/Shanghai'}})
 return {directory,account,member,service,calls,entered,release,prepare,input,store,jobs,submit,snapshot:()=>jobs.get(account,member.id,'coverage-job')}
}

test('source coverage repairs omitted mechanism once and completes within exactly six provider calls',async t=>{
 const f=await coverageFixture(t),draft=await f.prepare()
 assert.equal(draft.state,'ready');assert.equal(draft.items[0].professionalSummary.verification.protocol,'source-entailment-v2')
 assert.ok(draft.items[0].fields.some(field=>field.name==='statusRaw'&&field.value===coverageForce))
 assert.match(draft.items[0].professionalSummary.text,/踢到凳角/)
 assert.deepEqual(f.calls.map(c=>c.task),['draft-extraction','professional-summary-generate','professional-summary-verify','draft-extraction','professional-summary-generate','professional-summary-verify'])
 const extractions=f.calls.filter(c=>c.task==='draft-extraction'),checks=f.calls.filter(c=>c.task==='professional-summary-verify')
 assert.equal(extractions[0].parsed.sourceCoverageRepair,undefined)
 assert.deepEqual(extractions[1].parsed.sourceCoverageRepair.missingFacts,[{itemId:'item-1',sourceId:'input',page:1,quote:coverageForce}])
 assert.ok(checks.every(c=>c.parsed.sourceInventory.some(s=>s.id==='input'&&s.page===1&&s.text===coverageRaw)))
 const stored=await f.service.get(f.account,f.member.id,draft.id)
 assert.equal(stored.coverageRecoveryCount,1);assert.equal(stored.callCount,6)
 const saved=await f.service.save(f.account,f.member.id,draft.id,{version:draft.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,coverageRaw);assert.match(record.content,/踢到凳角/);assert.equal(f.calls.length,6)
})

test('source coverage remaining incomplete after one retry fails with six calls and cannot start a third extraction',async t=>{
 const f=await coverageFixture(t,{persistent:true})
 await assert.rejects(f.prepare,e=>e.code==='AI_SUMMARY_UNSUPPORTED'||e.code==='AI_SUMMARY_INCOMPLETE')
 const stored=(await f.service.store.read()).drafts.at(-1)
 assert.equal(stored.state,'failed');assert.equal(stored.coverageRecoveryCount,1);assert.equal(stored.callCount,6);assert.equal(f.calls.length,6)
 assert.equal(f.calls.filter(c=>c.task==='draft-extraction').length,2)
 await assert.rejects(()=>f.service.prepare(f.account,f.member.id,{...f.input,id:stored.id,version:stored.version}),{code:'AI_DRAFT_CALL_LIMIT'})
 assert.equal(f.calls.length,6)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})

for(const scenario of [
 {name:'mother observation',raw:coverageRaw+'妈妈手指皮肤破损。',missingQuote:'妈妈手指皮肤破损'},
 {name:'ambiguous repeated quote',raw:coverageRaw+coverageForce+'。',missingQuote:coverageForce},
 {name:'unknown item',missingOverride:{itemId:null}},
 {name:'invented source',missingOverride:{sourceId:'missing-source'}},
 {name:'wrong page',missingOverride:{page:2}},
])test(`source coverage ${scenario.name} cannot authorize a repair`,async t=>{
 const f=await coverageFixture(t,scenario)
 await assert.rejects(f.prepare,e=>/^AI_SUMMARY_/u.test(e.code??'')&&!e.coverageRepair)
 assert.equal(f.calls.length,3);assert.equal(f.calls.filter(c=>c.task==='draft-extraction').length,1)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})

test('source coverage retry still rejects putting yesterday hand evidence on today foot',async t=>{
 const hand='昨天左手皮肤破损',f=await coverageFixture(t,{raw:coverageRaw+hand+'。',missingQuote:hand,secondItems:()=>[coverageItem([['symptom',coverageFoot],['location','右脚小拇指'],['statusRaw',hand]])]})
 await assert.rejects(f.prepare,e=>e.code==='AI_TIME_CONFLICT'||e.validation?.rule==='time_context')
 assert.equal(f.calls.filter(c=>c.task==='draft-extraction').length,2)
 assert.equal(f.calls.length,4,'all original source and grounding validators run before repaired summary generation')
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})

test('source coverage repair may split yesterday hand into its own dated item instead of merging it with today foot',async t=>{
 const hand='昨天左手皮肤破损',f=await coverageFixture(t,{raw:coverageRaw+hand+'。',missingQuote:hand,secondItems:()=>[...coverageComplete(),coverageItem([['symptom',hand],['location','左手']],'昨天')]})
 const draft=await f.prepare();assert.equal(draft.items.length,2);assert.equal(f.calls.length,6)
 const foot=draft.items.find(i=>i.timeText==='今天'),oldHand=draft.items.find(i=>i.timeText==='昨天')
 assert.ok(foot&&oldHand);assert.equal(foot.fields.some(field=>field.value.includes('左手')),false)
 assert.ok(oldHand.fields.some(field=>field.value===hand));assert.notEqual(foot.time.resolvedStart,oldHand.time.resolvedStart)
})

test('cancellation while recursive extraction is held prevents a late response from restoring a deleted draft',async t=>{
 const f=await coverageFixture(t,{holdSecond:true}),controller=new AbortController()
 const pending=f.prepare(controller.signal),rejected=assert.rejects(()=>pending,e=>e.name==='AbortError'||e.code==='AI_DRAFT_VERSION_CONFLICT')
 await f.entered.promise
 const retained=(await f.service.store.read()).drafts.at(-1)
 controller.abort();await f.service.cancel(f.account,f.member.id,retained.id);f.release.resolve()
 await rejected
 assert.equal((await f.service.store.read()).drafts.some(d=>d.id===retained.id),false)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,0)
})

test('new recognition input fences a held recursive extraction and publishes only the newer fact version',async t=>{
 const added='已经用清水冲洗',f=await coverageFixture(t,{withJobs:true,holdSecond:true,secondItems:parsed=>[coverageItem([['symptom',coverageFoot],['location','右脚小拇指'],['statusRaw',coverageForce],...(parsed.sources.find(s=>s.id==='input')?.text.includes(added)?[['handling',added]]:[])])]})
 await f.submit('coverage-first',coverageRaw);await f.entered.promise
 const oldDraft=(await f.service.store.read()).drafts.at(-1)
 await f.submit('coverage-new',added);f.release.resolve()
 const current=await coverageWait(async()=>{const j=await f.snapshot();return j.state==='ready'&&j.resultRevision===2&&j})
 assert.equal(current.inputRevision,2);assert.equal(current.review.inputText,coverageRaw+'\n'+added)
 assert.match(current.review.items[0].professionalSummary.text,/清水冲洗/)
 assert.notEqual(current.review.id,oldDraft.id)
 const old=await f.service.get(f.account,f.member.id,oldDraft.id)
 assert.notEqual(old.state,'ready');assert.throws(()=>f.jobs.assertCurrent(old),{code:'RECOGNITION_REVISION_CONFLICT'})
 const saved=await f.service.save(f.account,f.member.id,current.review.id,{version:current.review.version,confirmed:true})
 const record=await f.service.records.getOwnedRecord(f.account,saved.result.records[0].recordId)
 assert.equal(record.sourceText,coverageRaw+'\n'+added);assert.match(record.content,/清水冲洗/)
 assert.equal((await f.service.records.repository.findByAccountId(f.account)).length,1)
})
