import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {Readable} from 'node:stream'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {createBailianTransport} from '../../server/ai/providers/bailian-transport.mjs'
import {installModelBudget} from './model-budget.mjs'
import {localEvaluationEnvironment} from './environment.mjs'
import {budgetPlan} from './budget-plan.mjs'
import os from 'node:os'
import path from 'node:path'
import {syntheticOutputCaptureAllowed,completionOutputText} from './model-budget.mjs'
import {captureRuntime,runtimeSources} from './runtime.mjs'
const base='https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const environment={HOOOHO_EVAL_MAX_MODEL_REQUESTS:'2',BAILIAN_BASE_URL:base}
function fakeRequests(payload={usage:{prompt_tokens:13,completion_tokens:7},text:'fixture response'}){
 return {calls:0,request(...args){
  this.calls++;const request=new EventEmitter()
  request.end=()=>queueMicrotask(()=>{
   const incoming=Readable.from([Buffer.from(JSON.stringify(payload))])
   incoming.statusCode=200;incoming.headers={'content-type':'application/json'}
   const callback=args.at(-1);if(typeof callback==='function')callback(incoming)
   request.emit('response',incoming)
  })
  return request
 },get(){throw new Error('get must use wrapped request')}}
}
test('Bailian node:https transport and fetch share one hard budget and retain response bytes',async()=>{
 const emitted=[],httpsTarget=fakeRequests(),httpTarget=fakeRequests(),fetchTarget={fetch:async()=>new Response(JSON.stringify({usage:{input_tokens:5,output_tokens:2}}))}
 const installed=installModelBudget({environment,httpsTarget,httpTarget,fetchTarget,emit:event=>emitted.push(event)})
 try{
  const transport=createBailianTransport(base,{requestImpl:httpsTarget.request.bind(httpsTarget)})
  const response=await transport(base+'/chat/completions',{method:'POST',body:'synthetic fixture'});assert.equal((await response.json()).text,'fixture response')
  await fetchTarget.fetch(base+'/chat/completions');assert.equal(installed.count,2)
  await assert.rejects(()=>transport(base+'/chat/completions'),{code:'EVAL_MODEL_BUDGET'});assert.equal(httpsTarget.calls,1)
  assert.equal(emitted.filter(event=>event.type==='model-result').length,2);assert(emitted.some(event=>event.inputTokens===13&&event.outputTokens===7));assert(!JSON.stringify(emitted).includes('fixture response'))
 }finally{installed.restore()}
})
test('unconfigured external destinations and plaintext provider requests are blocked before transport',async()=>{
 const httpsTarget=fakeRequests(),httpTarget=fakeRequests(),fetchTarget={fetch:async()=>new Response('{}')},installed=installModelBudget({environment,httpsTarget,httpTarget,fetchTarget,emit:()=>{}})
 try{assert.throws(()=>httpsTarget.request('https://example.invalid'),{code:'EVAL_EXTERNAL_HOST_BLOCKED'});assert.throws(()=>httpTarget.request('http://fixture.cn-beijing.maas.aliyuncs.com'),{code:'EVAL_EXTERNAL_HOST_BLOCKED'});await assert.rejects(()=>fetchTarget.fetch('https://example.invalid'),{code:'EVAL_EXTERNAL_HOST_BLOCKED'});assert.equal(installed.count,0);assert.equal(httpsTarget.calls,0)}finally{installed.restore()}
})
test('only existing provider configuration survives Railway environment injection into local application',()=>{
 const env=localEvaluationEnvironment({PATH:'existing-path',BAILIAN_API_KEY:'synthetic-key',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'30',DATABASE_URL:'synthetic-db',RESEND_API_KEY:'synthetic-mail',AUTH_TOKEN_SECRET:'synthetic-production-auth',RAILWAY_TOKEN:'synthetic-platform',RAILWAY_ENVIRONMENT_ID:'synthetic-production',NODE_OPTIONS:'--inspect'},{AUTH_TOKEN_SECRET:'synthetic-eval-auth',NODE_ENV:'development'})
 assert.equal(env.BAILIAN_API_KEY,'synthetic-key');assert.equal(env.AI_MAX_CALLS_PER_ACCOUNT_HOUR,'30');assert.equal(env.AUTH_TOKEN_SECRET,'synthetic-eval-auth')
 for(const key of ['DATABASE_URL','RESEND_API_KEY','RAILWAY_TOKEN','RAILWAY_ENVIRONMENT_ID','NODE_OPTIONS'])assert.equal(env[key],undefined,key)
})
test('recommended plan contains <=60 available cases, preserves holdout and fits strictly under 200 outbound attempts',()=>{
 const plan=budgetPlan(),ids=plan.batches.flatMap(batch=>batch.ids);assert.equal(ids.length,60);assert.equal(new Set(ids).size,60);assert.equal(plan.maximumRequests,188);assert.equal(plan.reserveFrom200,12);assert(plan.batches.every(batch=>batch.eligible));assert(plan.batches.filter(batch=>batch.split==='regression').every(batch=>batch.ids.length<=8&&batch.maxModelRequests<=24));assert.equal(plan.batches.at(-1).split,'holdout');assert.equal(plan.realModelExecuted,false)
 assert(plan.batches.every(batch=>batch.command.includes(`'--ids=${batch.ids.join(',')}'`)))
})
test('--help gives actual flags without launching the application or creating a results report',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['tests/nurse-conversation-upgrade/run-live.mjs','--help']);assert(stdout.includes('--max-model-requests'));assert(stdout.includes('--split=regression|holdout'));assert(stdout.includes("'--ids=T02,T03,I11'"));assert(!stdout.includes('"output":'))
})
test('IDs damaged by PowerShell comma parsing fail before the app or model starts',async()=>{
 await assert.rejects(()=>promisify(execFile)(process.execPath,['tests/nurse-conversation-upgrade/run-live.mjs','--ids=T02T03T09','--max-cases=3']),error=>error.code===1&&error.stderr.includes('quote the complete --ids argument'))
})
test('raw completion capture is opt-in, synthetic local only, bounded and excludes request credentials',async()=>{
 const captureEnv={...environment,NODE_ENV:'development',HOST:'127.0.0.1',DATA_DIRECTORY:path.join(os.tmpdir(),'hoooho-nurse-flow-eval-fixture','data'),HOOOHO_EVAL_CAPTURE_MODEL_OUTPUT:'1',HOOOHO_EVAL_SYNTHETIC_ONLY:'1'}
 assert(syntheticOutputCaptureAllowed(captureEnv))
 for(const change of [{NODE_ENV:'production'},{HOST:'0.0.0.0'},{DATA_DIRECTORY:path.resolve('data')},{HOOOHO_EVAL_SYNTHETIC_ONLY:'0'},{HOOOHO_EVAL_CAPTURE_MODEL_OUTPUT:'0'}])assert.equal(syntheticOutputCaptureAllowed({...captureEnv,...change}),false)
 const events=[],httpsTarget=fakeRequests({choices:[{message:{content:'synthetic https completion'}}]}),httpTarget=fakeRequests(),fetchTarget={fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"reply":"synthetic raw response","recordChanges":[]}'}}],authorization:'not part of completion',usage:{prompt_tokens:2,completion_tokens:3}}))}
 const installed=installModelBudget({environment:captureEnv,httpsTarget,httpTarget,fetchTarget,emit:event=>events.push(event)})
 try{await fetchTarget.fetch(base+'/chat/completions',{headers:{Authorization:'synthetic-secret-not-to-log'}});assert.equal(events.at(-1).outputText,'{"reply":"synthetic raw response","recordChanges":[]}');const response=await createBailianTransport(base,{requestImpl:httpsTarget.request.bind(httpsTarget)})(base+'/chat/completions',{method:'POST',body:'synthetic request not logged'});await response.json();assert.equal(events.at(-1).outputText,'synthetic https completion');assert(!JSON.stringify(events).includes('synthetic-secret-not-to-log'));assert(!JSON.stringify(events).includes('synthetic request not logged'));assert(!JSON.stringify(events).includes('not part of completion'))}finally{installed.restore()}
 assert.equal(completionOutputText({choices:[{message:{content:[{type:'text',text:'one'},{type:'text',text:'two'}]}}]}),'onetwo')
 assert.equal(completionOutputText({choices:[{message:{content:'x'.repeat(120001)}}]}).length,120000)
})
test('runtime fingerprint includes base commit and the actual model plus all requested source boundaries',async()=>{
 const runtime=await captureRuntime(path.resolve(import.meta.dirname,'../..'));assert.match(runtime.baseCommit,/^[a-f0-9]{40}$/u)
 for(const file of runtimeSources)assert.match(runtime.sources[file],/^[a-f0-9]{64}$/u)
 for(const file of ['server/ai/business/model.mjs','server/ai/front-desk-actions.mjs','server/ai/front-desk-reply-safety.mjs','server/ai/business/front-desk-source-context.mjs','server/ai/business/front-desk-answer-context.mjs'])assert(Object.hasOwn(runtime.sources,file),file)
})
