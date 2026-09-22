import test from 'node:test'
import assert from 'node:assert/strict'
import { minutePosition, orderedHours } from './timeGridModel'

test('current time line uses the minute fraction of a fixed hour row', () => {
  assert.equal(minutePosition(0), 0)
  assert.equal(Number(minutePosition(26).toFixed(1)), 43.3)
  assert.equal(Number(minutePosition(59).toFixed(1)), 98.3)
})

test('reverse order reverses the hour scale rather than reusing forward coordinates', () => {
  assert.deepEqual(orderedHours('asc').slice(0, 3), [0, 1, 2])
  assert.deepEqual(orderedHours('desc').slice(0, 3), [23, 22, 21])
})
