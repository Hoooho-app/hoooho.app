import test from 'node:test'
import assert from 'node:assert/strict'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {completedSleepInput,loadSavedGuideImplementation,requireRealCandidate,assertSavedFlow} from './flow-contract.mjs'
const root=path.resolve(import.meta.dirname,'../..')
test('continuous-flow runner defaults to NOT_RUN with zero provider or production writes',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['tests/nurse-conversation-upgrade/run-flow.mjs'],{cwd:root}),summary=JSON.parse(stdout.trim())
 assert.equal(summary.status,'NOT_RUN');assert.equal(summary.modelRequests,0);assert.deepEqual(summary.flows,[])
 const report=JSON.parse(await readFile(path.join(summary.output,'report.json'),'utf8'));assert.equal(report.seededContext,false);assert.equal(report.productionRequests,0);assert.equal(report.maxModelRequests,20);assert.equal(report.uiBrowser,'NOT_RUN')
})
test('sleep evidence always refers to an ended Shanghai interval, including early morning',()=>{
 for(const now of [Date.parse('2026-10-25T19:00:00Z'),Date.parse('2026-10-26T02:00:00Z')]){
  const evidence=completedSleepInput(now);assert(Date.parse(evidence.wakeDay+'T07:00:00+08:00')<=now);assert(evidence.text.includes('SYNTHETIC-CHILD'));assert(evidence.text.includes('暂不保存'))
 }
})
test('a selected flow reports its exact scope and cannot duplicate, omit or invent a kind',async()=>{
 const run=args=>promisify(execFile)(process.execPath,['tests/nurse-conversation-upgrade/run-flow.mjs',...args],{cwd:root})
 const {stdout}=await run(['--kinds=sleep']),summary=JSON.parse(stdout.trim())
 const report=JSON.parse(await readFile(path.join(summary.output,'report.json'),'utf8'))
 assert.deepEqual(report.requestedKinds,['sleep']);assert.equal(report.status,'NOT_RUN');assert.equal(report.modelRequests,0);assert.deepEqual(report.flows,[])
 for(const selection of ['', 'sleep,sleep','unknown'])await assert.rejects(()=>run([`--kinds=${selection}`]))
})
test('the flow cannot manufacture a candidate from a failed job, conversation or empty draft',()=>{
 for(const job of [{state:'failed'},{state:'ready',frontDesk:{context:{id:'c',version:1}}},{state:'ready',frontDesk:{context:{id:'c',version:1}},review:{id:'d',state:'ready',items:[]}}])assert.throws(()=>requireRealCandidate(job))
 const draft={id:'d',state:'ready',items:[{id:'real-item'}]},context={id:'c',version:1};assert.equal(requireRealCandidate({state:'ready',review:draft,frontDesk:{context}}).draft,draft)
})
test('actual application guide implementation requires saved receipt IDs and opens the exact journal or profile entry',async()=>{
 const guideApi=await loadSavedGuideImplementation(root)
 const fixture=kind=>{
  const record={memberId:'m',eventId:'e',recordId:'r',category:kind,...(kind==='vaccination'?{profileEntries:[{sectionId:'vaccination',entryId:'r/vaccine-1'}]}:{})}
  const draft={id:'d',state:'saved',followUp:false,result:{records:[record]}}
  return {kind,memberId:'m',job:{resultKind:'saved',operationReceipt:{state:'saved',operationId:'op',savedDraft:draft}},eventRecords:[{id:'r',eventId:'e',journal:{categories:[kind]}}],cases:{active:[]},profileRows:[{id:'r/vaccine-1',recordId:'r'}],guideApi}
 }
 for(const kind of ['sleep','vaccination']){
  const result=assertSavedFlow(fixture(kind));assert.equal(result.guides[0].recordId,'r')
  assert.throws(()=>assertSavedFlow({...fixture(kind),eventRecords:[]}))
  assert.throws(()=>assertSavedFlow({...fixture(kind),cases:{active:[{id:'unexpected-symptom'}]}}))
 }
 assert.throws(()=>assertSavedFlow({...fixture('vaccination'),profileRows:[]}))
})
