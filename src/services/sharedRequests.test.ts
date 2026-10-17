import assert from 'node:assert/strict'
import test from 'node:test'
import { createSharedRequests } from './sharedRequests'
import { abortable } from './abortable'

test('concurrent identical scopes share only in-flight work; accounts, members and tokens stay separate', async () => {
  const scopes = [['a','token','child'], ['b','token','child'], ['a','token','other'], ['a','new-token','child']].map(v=>JSON.stringify(v))
  let calls = 0
  const queue = createSharedRequests(async key => { calls++; return key })
  const first = queue.get(scopes[0]), joined = queue.get(scopes[0])
  assert.equal(first, joined)
  assert.deepEqual(await Promise.all(scopes.map(key => queue.get(key))), scopes)
  assert.equal(calls, 4)
  await queue.get(scopes[0]); assert.equal(calls, 5)
})
test('deadline ends an uncooperative request and lets the next attempt run', async () => {
  let calls = 0
  const queue = createSharedRequests(() => { calls++; return calls === 1 ? new Promise(()=>{}) : Promise.resolve('fresh') }, 10)
  await assert.rejects(queue.get('a'), {name:'TimeoutError'})
  assert.equal(await queue.get('a'), 'fresh')
})
test('invalidating a snapshot cannot let its late finally remove the replacement', async () => {
  let calls = 0, release!: (value: string) => void
  const queue = createSharedRequests(() => { calls++; return new Promise<string>(resolve => { release = resolve }) })
  const stale = queue.get('a'); await Promise.resolve()
  const staleRejected = assert.rejects(stale, {name:'AbortError'})
  queue.invalidate('a')
  const fresh = queue.get('a'); await staleRejected; await Promise.resolve()
  assert.equal(queue.get('a'), fresh); assert.equal(calls, 2)
  release('new'); assert.equal(await fresh, 'new')
})
test('aborting a wait ends it without cancelling a shared operation for another consumer', async () => {
  let release!: (value: string) => void
  const shared = new Promise<string>(resolve => { release = resolve }), controller = new AbortController()
  const stopped = abortable(shared, controller.signal), rejected = assert.rejects(stopped, {name:'AbortError'})
  controller.abort(); await rejected
  release('still available'); assert.equal(await shared, 'still available')
})
