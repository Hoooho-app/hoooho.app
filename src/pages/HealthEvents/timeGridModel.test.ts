import test from 'node:test'
import assert from 'node:assert/strict'
import { entriesForDay, hourForEntry, isCurrentOngoingSleep, minutePosition, orderedHours, projectSleepInterval } from './timeGridModel'
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

test('historical unfinished sleep stays on its original date instead of projecting through today', () => {
  const entry = { id: 'sleep-old', eventId: 'event-old', content: '睡眠', occurredAt: '2026-09-14T23:11:00+08:00', createdAt: '2026-09-14T23:11:00+08:00', attachmentCount: 0, status: 'ongoing', categories: ['sleep'], timePrecision: 'exact', sleep: { sleepAt: '2026-09-14T23:11:00+08:00', wakeAt: '', durationMinutes: 0, kind: 'night', status: 'ongoing' } } as JournalEntry
  const now = new Date('2026-09-24T13:04:00+08:00')
  assert.equal(isCurrentOngoingSleep(entry, now), false)
  assert.deepEqual(entriesForDay([entry], '2026-09-14', now), [entry])
  assert.deepEqual(entriesForDay([entry], '2026-09-24', now), [])
})

test('a valid ongoing cross-midnight sleep projects onto today without inventing an end', () => {
  const entry = { id: 'sleep-live', eventId: 'event-live', content: '睡眠', occurredAt: '2026-09-23T23:11:00+08:00', createdAt: '2026-09-23T23:11:00+08:00', attachmentCount: 0, status: 'ongoing', categories: ['sleep'], timePrecision: 'exact', sleep: { sleepAt: '2026-09-23T23:11:00+08:00', wakeAt: '', durationMinutes: 0, kind: 'night', status: 'ongoing' } } as JournalEntry
  const now = new Date('2026-09-24T01:04:00+08:00')
  assert.equal(isCurrentOngoingSleep(entry, now), true)
  assert.deepEqual(entriesForDay([entry], '2026-09-24', now), [entry])
  assert.deepEqual(projectSleepInterval(entry.sleep!.sleepAt, now, '2026-09-24', false).map((point) => [point.kind, point.hour, point.minute]), [['segment', 0, 0], ['segment', 1, 0]])
})

test('cross-night projection emits hourly segments and one end summary without stored duplicates', () => {
  const points = projectSleepInterval('2026-09-23T21:00:00+08:00', '2026-09-24T08:28:00+08:00', '2026-09-24')
  assert.deepEqual(points.map((point) => [point.kind, point.hour, point.minute]), [
    ['segment', 0, 0], ['segment', 1, 0], ['segment', 2, 0], ['segment', 3, 0], ['segment', 4, 0], ['segment', 5, 0], ['segment', 6, 0], ['segment', 7, 0], ['segment', 8, 0], ['summary', 8, 28]
  ])
})
