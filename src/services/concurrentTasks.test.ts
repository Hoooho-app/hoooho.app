import assert from 'node:assert/strict'
import test from 'node:test'
import { mapWithConcurrency } from './concurrentTasks'

const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
test('two uploads overlap while preserving file order for the recognition request', async () => {
  const pending = Array.from({ length: 4 }, () => deferred<string>()), started: number[] = []
  const result = mapWithConcurrency([0, 1, 2, 3], 2, async index => { started.push(index); return pending[index].promise })
  assert.deepEqual(started, [0, 1])
  pending[1].resolve('second'); await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(started, [0, 1, 2])
  pending[2].resolve('third'); await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(started, [0, 1, 2, 3])
  pending[3].resolve('fourth'); pending[0].resolve('first')
  assert.deepEqual(await result, ['first', 'second', 'third', 'fourth'])
})
test('an upload failure stops new work and waits for the other started upload before rejecting', async () => {
  const pending = [deferred<string>(), deferred<string>()], started: number[] = [], failure = new Error('upload failed')
  let settled = false
  const result = mapWithConcurrency([0, 1, 2], 2, async index => { started.push(index); return pending[index].promise })
  const rejected = assert.rejects(result, error => error === failure).then(() => { settled = true })
  pending[0].reject(failure); await Promise.resolve(); await Promise.resolve()
  assert.equal(settled, false); assert.deepEqual(started, [0, 1])
  pending[1].resolve('retained asset'); await rejected
})
test('cancelling a batch prevents queued uploads and rejects before a recognition job can be posted', async () => {
  const pending = [deferred<string>(), deferred<string>()], controller = new AbortController(), started: number[] = []
  const result = mapWithConcurrency([0, 1, 2], 2, async index => { started.push(index); return pending[index].promise }, controller.signal)
  const rejected = assert.rejects(result, { name: 'AbortError' })
  controller.abort(); pending[0].resolve('first'); pending[1].resolve('second'); await rejected
  assert.deepEqual(started, [0, 1])
})
