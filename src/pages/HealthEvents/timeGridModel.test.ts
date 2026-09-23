import test from 'node:test'
import assert from 'node:assert/strict'
import { entriesForDay, hourForEntry, minutePosition, orderedHours } from './timeGridModel'
import type { JournalEntry } from './timeViewModel'

test('current time line uses the minute fraction inside the current hour row', () => {
  assert.equal(minutePosition(0), 0)
  assert.equal(Number(minutePosition(26).toFixed(1)), 43.3)
  assert.equal(Number(minutePosition(59).toFixed(1)), 98.3)
})

test('cross-day sleep appears on both dates without duplicating stored data', () => {
  const entry = { id: 'sleep-one', eventId: 'event-one', content: '夜间睡眠', occurredAt: '2026-09-21T14:30:00.000Z', createdAt: '2026-09-21T14:30:00.000Z', attachmentCount: 0, status: 'ongoing', categories: ['sleep'], timePrecision: 'exact', sleep: { sleepAt: '2026-09-21T14:30:00.000Z', wakeAt: '2026-09-22T00:30:00.000Z', durationMinutes: 600, kind: 'night', status: 'completed' } } as JournalEntry
  assert.deepEqual(entriesForDay([entry], '2026-09-21'), [entry])
  assert.deepEqual(entriesForDay([entry], '2026-09-22'), [entry])
  assert.equal(hourForEntry(entry, '2026-09-22'), 0)
})

test('reverse order reverses the hour scale rather than reusing forward coordinates', () => {
  assert.deepEqual(orderedHours('asc').slice(0, 3), [0, 1, 2])
  assert.deepEqual(orderedHours('desc').slice(0, 3), [23, 22, 21])
})
