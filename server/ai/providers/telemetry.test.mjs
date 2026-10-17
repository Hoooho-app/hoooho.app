import test from 'node:test'
import assert from 'node:assert/strict'
import {withAITrace,traceMetadata,linkedAISignal,safeClientTiming,bypassAccountRequestLock} from './telemetry.mjs'

test('a background scope resets HTTP cancellation and independent requests do not mix trace IDs',async()=>{
  const stop=new AbortController(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
  await Promise.all([withAITrace({traceId:a,operation:'product-help',signal:stop.signal},async()=>{
    await Promise.resolve();assert.equal(traceMetadata().traceId,a);assert.equal(linkedAISignal(),stop.signal)
    withAITrace({traceId:b,operation:'recognition-job'},()=>assert.equal(linkedAISignal(),undefined))
  }),withAITrace({traceId:b,operation:'medical-summary'},async()=>{await Promise.resolve();assert.equal(traceMetadata().traceId,b)})])
  assert.deepEqual(traceMetadata(),{})
})
test('timing telemetry projects only numeric allowlisted fields without health text or arbitrary labels',()=>{
  const valid={traceId:'11111111-1111-4111-8111-111111111111',operation:'smart-record',elapsedMs:53.8,outcome:'ready',accountId:'private',text:'private',phases:{upload:2.2,diagnosis:'private',total:-1}}
  assert.deepEqual(safeClientTiming(valid),{traceId:valid.traceId,operation:'smart-record',elapsedMs:54,outcome:'ready',phases:{upload:2}})
  assert.equal(safeClientTiming({...valid,traceId:'private health words'}),null)
  assert.equal(safeClientTiming({...valid,traceId:[valid.traceId]}),null)
  assert.equal(safeClientTiming([]),null)
  assert.equal(safeClientTiming({...valid,operation:'private health words'}),null)
  assert.equal(safeClientTiming({...valid,elapsedMs:Infinity}),null)
})
test('only authorized recognition polling and asset writes bypass the outer account HTTP lock',()=>{
  assert.equal(bypassAccountRequestLock('GET','/api/members/m/recognition-jobs/j'),true)
  assert.equal(bypassAccountRequestLock('POST','/api/members/m/recognition-assets'),true)
  for(const [method,path] of [['POST','/api/members/m/recognition-jobs/j/commands'],['DELETE','/api/account'],['PUT','/api/members/m/visit-sheet'],['GET','/api/members']])assert.equal(bypassAccountRequestLock(method,path),false)
})
