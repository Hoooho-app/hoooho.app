import assert from 'node:assert/strict'
import test from 'node:test'
import { createSerialPoller } from './serialPolling'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
test('slow media status requests cannot overlap even when start is called repeatedly', async () => {
  let calls = 0, active = 0, peak = 0, release!: () => void
  const poller = createSerialPoller(async () => { calls++; peak = Math.max(peak, ++active); await new Promise<void>(resolve => { release = resolve }); active-- }, 1)
  poller.start(); poller.start(); await wait(12)
  assert.equal(calls, 1); assert.equal(peak, 1)
  release(); await wait(12); assert.equal(calls, 2)
  poller.stop(); release(); await wait(12); assert.equal(calls, 2)
})
test('hiding the page cancels the request and stops polling until visibility resumes', async () => {
  const signals: AbortSignal[] = []
  const poller = createSerialPoller(async signal => { signals.push(signal); await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true })) }, 1)
  poller.start(); poller.pause(); await wait(8)
  assert.equal(signals.length, 1); assert.equal(signals[0].aborted, true)
  poller.start(); await wait(8); assert.equal(signals.length, 2)
  poller.stop(); await wait(8); assert.equal(signals.length, 2); assert.equal(signals[1].aborted, true)
})
