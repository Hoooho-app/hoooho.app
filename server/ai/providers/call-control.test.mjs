import test from 'node:test'
import assert from 'node:assert/strict'
import { controlledCall, withAIAccount, withQueuedAIAccount } from './call-control.mjs'

const env={AI_MAX_CONCURRENT_CALLS:'1',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1'}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}

test('food scheduling waits for capacity without changing the default busy response or quota',async()=>{
  const release=deferred(),started=deferred()
  const held=controlledCall(async()=>{started.resolve();await release.promise},env)
  await started.promise
  let invoked=0
  const queued=withQueuedAIAccount('slot-wait-test',()=>controlledCall(async()=>++invoked,env))
  await assert.rejects(()=>controlledCall(async()=>{},env),{code:'AI_CONCURRENCY_LIMIT'})
  assert.equal(invoked,0)
  release.resolve();await held
  assert.equal(await queued,1)
  await assert.rejects(()=>withAIAccount('slot-wait-test',()=>controlledCall(async()=>++invoked,env)),{code:'AI_ACCOUNT_CALL_LIMIT'})
  assert.equal(invoked,1)
})

test('cancelled food requests leave the waiting slot without an outbound call',async()=>{
  const release=deferred(),started=deferred(),controller=new AbortController()
  const held=controlledCall(async()=>{started.resolve();await release.promise},env)
  await started.promise
  let invoked=false
  const queued=withQueuedAIAccount('cancelled-slot-test',()=>controlledCall(async()=>{invoked=true},env),controller.signal)
  controller.abort()
  await assert.rejects(queued,{name:'AbortError'})
  release.resolve();await held
  assert.equal(invoked,false)
  assert.equal(await withAIAccount('cancelled-slot-test',()=>controlledCall(async()=>true,env)),true)
})

test('two slots permit parallel work, a third waits, and failures release capacity',async()=>{
  const two={AI_MAX_CONCURRENT_CALLS:'2'},release=deferred()
  let active=0,peak=0
  const operation=()=>controlledCall(async()=>{active++;peak=Math.max(peak,active);try{await release.promise;throw new Error('fixture')}finally{active--}},two)
  const first=withQueuedAIAccount('parallel-1',operation).catch(e=>e.message)
  const second=withQueuedAIAccount('parallel-2',operation).catch(e=>e.message)
  const third=withQueuedAIAccount('parallel-3',operation).catch(e=>e.message)
  assert.equal(active,2)
  release.resolve()
  assert.deepEqual(await Promise.all([first,second,third]),['fixture','fixture','fixture'])
  assert.equal(peak,2);assert.equal(active,0)
})
