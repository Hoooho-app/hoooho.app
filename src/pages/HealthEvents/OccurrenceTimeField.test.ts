import assert from 'node:assert/strict'
import test from 'node:test'
import { captureOccurrenceTime, occurrenceInitialState } from './occurrenceTimeModel.ts'

test('today starts in now mode while a historical day starts as a fixed local minute', () => {
  const now = new Date(2026, 8, 25, 14, 29, 17)
  assert.deepEqual(occurrenceInitialState('2026-09-25', '2026-09-25', undefined, now), { mode: 'now', value: '2026-09-25T14:29' })
  assert.deepEqual(occurrenceInitialState('2026-09-24', '2026-09-25', undefined, now), { mode: 'specified', value: '2026-09-24T14:29' })
})

test('an existing occurrence is always preserved as specified time', () => {
  const existing = new Date(2026, 8, 24, 9, 10).toISOString()
  assert.deepEqual(occurrenceInitialState('2026-09-25', '2026-09-25', existing), { mode: 'specified', value: '2026-09-24T09:10' })
})

test('now is sampled from the submit instant and specified time rejects the future', () => {
  const submittedAt = new Date(2026, 8, 25, 14, 29, 17)
  assert.equal(captureOccurrenceTime('now', '2026-09-25T10:00', submittedAt), submittedAt.toISOString())
  assert.equal(captureOccurrenceTime('specified', '2026-09-25T14:10', submittedAt), new Date(2026, 8, 25, 14, 10).toISOString())
  assert.throws(() => captureOccurrenceTime('specified', '2026-09-25T14:30', submittedAt), /发生时间不能晚于现在/)
})
