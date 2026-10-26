import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import os from 'node:os'
import {regressionCases,scenarioCases,diagnosticCases,holdoutCases,suiteMetadata} from './scenarios.mjs'
import {scoreReview,combineReviewScores} from './score-review.mjs'
import {materializeAsset} from './assets.mjs'
const execute=promisify(execFile)
test('owner checklist retains all 96 stable IDs, with 24 context contrasts and one separate ASR diagnostic making 121 replay definitions',()=>{
 assert.equal(scenarioCases.length,96);assert.equal(regressionCases.length,121);assert.equal(regressionCases.filter(sample=>sample.history.length>=2).length,56)
 for(const [group,count] of Object.entries({T:32,C:16,I:30,V:12,Q:6}))assert.deepEqual(scenarioCases.filter(sample=>sample.group===group).map(sample=>sample.id),Array.from({length:count},(_,index)=>`${group}${String(index+1).padStart(2,'0')}`))
 assert.equal(new Set([...regressionCases,...holdoutCases].map(sample=>sample.id)).size,133);assert.equal(holdoutCases.length,12);assert(holdoutCases.every(sample=>sample.split==='holdout'))
 assert.equal(suiteMetadata.regressionSamples,121);assert.equal(suiteMetadata.diagnosticSamples,1)
 assert.equal(suiteMetadata.realModelExecuted,false);assert.equal(suiteMetadata.goalsMeasured,false)
})

test('ASR01 is an unseeded clear-speech diagnostic with unknown subject, exact numeric/negative oracles and independent manual review',()=>{
 const sample=regressionCases.find(sample=>sample.id==='ASR01')
 assert.equal(diagnosticCases.length,1);assert.equal(sample,diagnosticCases[0]);assert(!scenarioCases.some(sample=>sample.id==='ASR01'))
 assert.equal(sample.group,'ASR');assert.equal(sample.source,'offline_synthetic_clear_speech_v1');assert.equal(sample.variant,'independent_asr_diagnostic')
 assert.equal(sample.latestInput.kind,'voice');assert.equal(sample.latestInput.text,'');assert.equal(sample.latestInput.attachments.length,1);assert.equal(sample.latestInput.attachments[0].fixtureId,'clear-observation-speech')
 assert.deepEqual(sample.history,[]);assert.deepEqual(sample.setup,{});assert.deepEqual(sample.requires,[])
 assert.equal(sample.expected.subject,'unknown');assert(sample.unknowns.includes('subject'));assert.equal(sample.expected.saveReceiptRequired,false);assert.deepEqual(sample.allowedActions,['reply'])
 assert(sample.expectedChanges.some(change=>change.field==='food'&&change.value==='牛奶'))
 assert(sample.expectedChanges.some(change=>change.field==='intakeMl'&&change.value===120))
 assert(sample.expectedChanges.some(change=>change.field==='vomiting'&&change.value===false&&change.polarity==='negative'))
 assert(sample.expectedChanges.every(change=>change.sourceIds.length===1&&change.sourceIds[0]==='latest'))
 assert.equal(sample.semanticReview,'REQUIRES_INDEPENDENT_REVIEW');assert(sample.diagnostic.doesNotCover.includes('crying'));assert(sample.diagnostic.doesNotCover.includes('asr_errors'))
 assert(sample.acceptance.includes('不代表原96项'))
})

test('clear-speech media uses only explicit external fixture bytes and consent; no speech is fabricated by the asset loader',async t=>{
 const descriptor=diagnosticCases[0].latestInput.attachments[0]
 await assert.rejects(()=>materializeAsset(descriptor),{code:'FIXTURE_NOT_AVAILABLE'})
 const directory=await mkdtemp(path.join(os.tmpdir(),'nurse-asr-fixture-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 // Byte-only fixture plumbing check, not a clear-speech recognition test.
 const bytes=Buffer.from('RIFF explicit external unit-fixture bytes WAVE'),file=path.join(directory,'explicit-synthetic.wav')
 await writeFile(file,bytes)
 const declaration={path:file,mimeType:'audio/wav',synthetic:true,allowModelTransmission:true}
 const asset=await materializeAsset(descriptor,{'clear-observation-speech':declaration})
 assert.equal(asset.id,'clear-observation-speech');assert.equal(asset.mimeType,'audio/wav');assert.equal(asset.synthetic,true);assert.deepEqual(asset.bytes,bytes)
 await assert.rejects(()=>materializeAsset(descriptor,{'clear-observation-speech':{...declaration,allowModelTransmission:false}}),{code:'FIXTURE_CONSENT_REQUIRED'})
})
test('every replay contains complete input, expected deltas, unknowns, explicit action and prohibited write contracts',()=>{
 for(const sample of [...regressionCases,...holdoutCases]){
  assert(sample.acceptance.length>10,sample.id);assert.equal(typeof sample.latestInput.text,'string',sample.id);assert.equal(sample.latestInput.id,'latest')
  for(const field of ['history','expectedChanges','unknowns','allowedActions','forbiddenWrites','requires'])assert(Array.isArray(sample[field]),`${sample.id}:${field}`)
  for(const [index,turn] of sample.history.entries()){assert.equal(turn.id,`h${index+1}`);assert(turn.text.length>0);assert(['user','assistant'].includes(turn.role));assert.equal(turn.sourceType,turn.role==='user'?'caregiver_statement':'assistant_context')}
  assert(sample.forbiddenWrites.includes('wrong_subject'));assert(sample.forbiddenWrites.includes('unconfirmed_save'));assert(sample.forbiddenWrites.includes('stale_overwrite'))
  assert.equal(sample.risk,'blocker');for(const change of sample.expectedChanges){assert(Array.isArray(change.sourceIds)&&change.sourceIds.length);assert(['upsert','supersede','retract'].includes(change.operation))}
  assert(['conversation','clarification','consultation','record','operation','history'].includes(sample.expected.responseMode),`${sample.id}: response mode must match runtime schema`)
 }
})
test('the same short answer deliberately has different facts or no facts in different full contexts',()=>{
 const cases=regressionCases.filter(sample=>sample.latestInput.text==='39');assert(cases.length>=3);assert(cases.some(sample=>sample.expectedChanges.some(change=>change.field==='temperatureCelsius')));assert(cases.some(sample=>sample.expectedChanges.some(change=>change.field==='outsideTemperature')))
 const good=regressionCases.filter(sample=>sample.latestInput.text==='好');assert(good.some(sample=>sample.allowedActions.includes('save')));assert(good.some(sample=>!sample.allowedActions.includes('save')))
 assert.equal(scenarioCases.find(sample=>sample.id==='T15').expectedChanges[0].polarity,'negative');assert.equal(scenarioCases.find(sample=>sample.id==='T17').expectedChanges[0].polarity,'unknown')
})
test('image and voice cases declare actual asset requirements; absent clinical photos are not replaced by model answers',()=>{
 const images=scenarioCases.filter(sample=>sample.group==='I'&&sample.id!=='I30');assert.equal(images.length,29);assert(images.every(sample=>sample.latestInput.attachments.length))
 assert.equal(scenarioCases.find(sample=>sample.id==='V12').latestInput.attachments.length,2)
 assert(scenarioCases.find(sample=>sample.id==='I23').forbiddenWrites.includes('attachment_instruction_execution'))
 assert(scenarioCases.find(sample=>sample.id==='I06').forbiddenWrites.includes('packaging_as_ingestion'))
})
test('generated media has actual image/audio bytes, and absent clinical fixtures or arbitrary secret paths are rejected',async()=>{
 const geometry=await materializeAsset({fixtureId:'geometry'}),black=await materializeAsset({fixtureId:'black'}),audio=await materializeAsset({fixtureId:'silence'})
 assert.equal(geometry.bytes.subarray(1,4).toString(),'PNG');assert.equal(black.bytes.subarray(1,4).toString(),'PNG');assert.notDeepEqual(geometry.bytes,black.bytes)
 assert.equal(audio.bytes.subarray(0,4).toString(),'RIFF');assert.equal(audio.bytes.subarray(8,12).toString(),'WAVE')
 await assert.rejects(()=>materializeAsset({fixtureId:'skin-photo'}),{code:'FIXTURE_NOT_AVAILABLE'})
 await assert.rejects(()=>materializeAsset({fixtureId:'skin-photo'},{'skin-photo':{path:path.resolve('.env.production'),mimeType:'image/png',synthetic:true,allowModelTransmission:true}}),{code:'FIXTURE_PATH_INVALID'})
 await assert.rejects(()=>materializeAsset({fixtureId:'skin-photo'},{'skin-photo':{path:path.resolve('synthetic.png'),mimeType:'image/png',synthetic:false,allowModelTransmission:false}}),{code:'FIXTURE_CONSENT_REQUIRED'})
})
test('all 96 original cases are explicitly present in the human-readable implementation/acceptance mapping',async()=>{
 const document=await readFile(new URL('../../docs/nurse-conversation-upgrade-96-scenarios.md',import.meta.url),'utf8')
 for(const sample of scenarioCases)assert(document.includes(`| ${sample.id} |`),sample.id)
 assert(document.includes('不是 96 项真实模型已通过'))
})
test('live runner defaults to NOT_RUN without starting any provider, regardless of credential presence',async()=>{
 const {stdout}=await execute(process.execPath,['tests/nurse-conversation-upgrade/run-live.mjs','--ids=T01','--max-cases=1'],{cwd:path.resolve(import.meta.dirname,'../..')})
 const summary=JSON.parse(stdout.trim());assert.equal(summary.status,'NOT_RUN');assert.equal(summary.executed,0);assert.equal(summary.modelRequests,0);assert.equal(summary.understandingAccuracy,null)
 const report=JSON.parse(await readFile(path.join(summary.output,'report.json'),'utf8'));assert.equal(report.productionRequests,0);assert.equal(report.goalsMeasured,false)
})
test('ASR01 dry selection remains NOT_RUN with zero provider requests and no fabricated semantic score',async()=>{
 const {stdout}=await execute(process.execPath,['tests/nurse-conversation-upgrade/run-live.mjs','--ids=ASR01','--max-cases=1'],{cwd:path.resolve(import.meta.dirname,'../..')})
 const summary=JSON.parse(stdout.trim());assert.equal(summary.requested,1);assert.equal(summary.status,'NOT_RUN');assert.equal(summary.executed,0);assert.equal(summary.modelRequests,0);assert.equal(summary.understandingAccuracy,null)
 const report=JSON.parse(await readFile(path.join(summary.output,'report.json'),'utf8'));assert.equal(report.goalsMeasured,false);assert.equal(report.productionRequests,0);assert.deepEqual(report.modelReceipts,[])
 assert.throws(()=>scoreReview({...report,results:[{id:'ASR01',status:'MODEL_OUTPUT_CAPTURED'}]},[]))
})

test('suite completeness follows all 121 regression definitions while synthetic review bookkeeping cannot establish provider quality',()=>{
 const review={id:'T03',reviewer:'explicit-unit-fixture-reviewer',understoodInput:true,relatedContextCorrectly:true,factChangesCorrect:true,responseAppropriate:true,askedQuestion:false,unnecessaryQuestion:false,criticalErrors:[]}
 // Bookkeeping inputs only; no actual output or provider evidence is claimed.
 const results=regressionCases.map(sample=>({id:sample.id,status:sample.id==='T03'?'MODEL_OUTPUT_CAPTURED':'PROGRAM_INVARIANTS_PASS'}))
 const report={split:'regression',executed:121,modelRequests:0,modelReceipts:[],results}
 const complete=scoreReview(report,[review]);assert.equal(complete.datasetComplete,true);assert.equal(complete.realProviderEvidence,false);assert.equal(complete.measuredSubsetMeetsTargets,false);assert.equal(complete.fullChecklistAcceptance,false)
 assert.equal(scoreReview({...report,executed:120,results:results.filter(result=>result.id!=='ASR01')},[review]).datasetComplete,false)
})

test('review cannot turn a schema pass, an incomplete review, or critical errors into a quality claim',()=>{
 const report={split:'regression',executed:1,results:[{id:'T03',status:'MODEL_OUTPUT_CAPTURED'}]}
 assert.throws(()=>scoreReview(report,[]));assert.throws(()=>scoreReview(report,[{id:'T03',reviewer:'one'}]))
 const review={id:'T03',reviewer:'independent-reviewer',understoodInput:true,relatedContextCorrectly:true,factChangesCorrect:true,responseAppropriate:true,askedQuestion:false,unnecessaryQuestion:false,criticalErrors:[]}
 const score=scoreReview(report,[review]);assert.equal(score.understandingAccuracy,1);assert.equal(score.fullChecklistAcceptance,false)
 assert.equal(score.realProviderEvidence,false);assert.equal(score.measuredSubsetMeetsTargets,false)
 assert.equal(scoreReview(report,[{...review,criticalErrors:['WRONG_SUBJECT']}]).blocked,true)
 assert.throws(()=>scoreReview(report,[{...review,unnecessaryQuestion:true}]))
 assert.throws(()=>combineReviewScores(score,score));assert.equal(combineReviewScores({...score,split:'regression'},{...score,split:'holdout'}).fullChecklistAcceptance,false)
})
