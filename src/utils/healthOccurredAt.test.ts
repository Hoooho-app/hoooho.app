import assert from 'node:assert/strict'
import test from 'node:test'
import { clampOccurredAtToNow, isFutureOccurredAt } from './healthOccurredAt.ts'

test('前端发生时间规则按绝对时刻判断并恢复未来值', () => {
  const now = new Date('2026-08-12T15:35:00+08:00')
  assert.equal(isFutureOccurredAt('2026-08-12T15:35', now), false)
  assert.equal(isFutureOccurredAt('2026-08-12T10:00', now), false)
  assert.equal(isFutureOccurredAt('2025-01-12T00:00', now), false)
  assert.equal(isFutureOccurredAt('2026-08-12T16:35', now), true)
  assert.equal(isFutureOccurredAt('2026-08-13T00:00', now), true)
  assert.equal(isFutureOccurredAt('2037-01-01T00:00', now), true)
  assert.equal(clampOccurredAtToNow('2037-01-01T00:00', now), '2026-08-12T15:35')
})
