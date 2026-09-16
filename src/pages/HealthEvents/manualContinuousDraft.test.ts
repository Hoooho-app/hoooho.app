import assert from 'node:assert/strict'
import test from 'node:test'
import { freshManualContinuousDraft, loadManualContinuousDraft, manualContinuousDraftKey } from './manualContinuousDraft'

test('continuous drafts are isolated by member, situation, mode and edited entry', () => {
  const first = manualContinuousDraftKey('child-a', 'event-a', 'edit', 'record-a')
  assert.notEqual(first, manualContinuousDraftKey('child-b', 'event-a', 'edit', 'record-a'))
  assert.notEqual(first, manualContinuousDraftKey('child-a', 'event-b', 'edit', 'record-a'))
  assert.notEqual(first, manualContinuousDraftKey('child-a', 'event-a', 'followup', 'record-a'))
  assert.notEqual(first, manualContinuousDraftKey('child-a', 'event-a', 'edit', 'record-b'))
})

test('new continuous drafts start unknown and receive independent stable operation ids', () => {
  const first = freshManualContinuousDraft()
  const second = freshManualContinuousDraft()
  assert.equal(first.precision, 'unknown')
  assert.equal(first.narrative, '')
  assert.notEqual(first.operationId, second.operationId)
})

test('invalid stored drafts fail closed to the supplied fallback', () => {
  const fallback = freshManualContinuousDraft()
  const original = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => '{invalid-json' } })
  try { assert.deepEqual(loadManualContinuousDraft('draft-key', fallback), fallback) } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    else delete (globalThis as { localStorage?: Storage }).localStorage
  }
})
