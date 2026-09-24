import test from 'node:test'
import assert from 'node:assert/strict'
import { entriesForDay, formatHourElapsed, hourForEntry, hourProgress, isCurrentOngoingSleep, orderedHours, projectActivityInterval, secondsIntoHour } from './timeGridModel'
import type { JournalEntry } from './timeViewModel'

test('current cell derives elapsed seconds and progress from real wall-clock time', () => {
  const value = new Date('2026-09-24T13:48:12+08:00')
  assert.equal(secondsIntoHour(value), 2892)
  assert.equal(formatHourElapsed(value), '48分12秒')
  assert.equal(Number(hourProgress(value).toFixed(6)), Number((2892 / 3600).toFixed(6)))
  assert.equal(hourProgress(new Date('2026-09-24T14:00:00+08:00')), 0)
})

test('cross-day sleep appears on both dates without duplicating stored data', () => {
  const entry = { id: 'sleep-one', eventId: 'event-one', content: '夜间睡眠', occurredAt: '2026-09-21T14:30:00.000Z', createdAt: '2026-09-21T14:30:00.000Z', attachmentCount: 0, status: 'ongoing', categories: ['sleep'], timePrecision: 'exact', sleep: { sleepAt: '2026-09-21T14:30:00.000Z', wakeAt: '2026-09-22T00:30:00.000Z', durationMinutes: 600, kind: 'night', status: 'completed' } } as JournalEntry
  assert.deepEqual(entriesForDay([entry], '2026-09-21'), [entry])
  assert.deepEqual(entriesForDay([entry], '2026-09-22'), [entry])
  assert.equal(hourForEntry(entry, '2026-09-22'), 0)
})

test('one real meal interval appears on both dates while a point meal stays independent', () => {
  const interval = { id: 'meal-one', eventId: 'event-one', content: '晚餐', occurredAt: '2026-09-21T23:20:00+08:00', createdAt: '2026-09-21T23:20:00+08:00', attachmentCount: 0, status: 'observing', categories: ['diet'], diet: { kind: 'meal', meal: '晚餐', startedAt: '2026-09-21T23:20:00+08:00', endedAt: '2026-09-22T00:40:00+08:00' } } as JournalEntry
  const point = { ...interval, id: 'meal-two', diet: { kind: 'meal' as const, meal: '晚餐' as const }, occurredAt: '2026-09-21T21:00:00+08:00' }
  assert.deepEqual(entriesForDay([interval, point], '2026-09-22').map((entry) => entry.id), ['meal-one'])
  assert.deepEqual(entriesForDay([interval, point], '2026-09-21').map((entry) => entry.id).sort(), ['meal-one', 'meal-two'])
})

test('reverse order reverses the complete hour scale', () => {
  assert.deepEqual(orderedHours('asc').slice(0, 3), [0, 1, 2])
  assert.deepEqual(orderedHours('desc').slice(0, 3), [23, 22, 21])
})

test('historical unfinished sleep stays on its original date', () => {
  const entry = { id: 'sleep-old', eventId: 'event-old', content: '睡眠', occurredAt: '2026-09-14T23:11:00+08:00', createdAt: '2026-09-14T23:11:00+08:00', attachmentCount: 0, status: 'ongoing', categories: ['sleep'], timePrecision: 'exact', sleep: { sleepAt: '2026-09-14T23:11:00+08:00', wakeAt: '', durationMinutes: 0, kind: 'night', status: 'ongoing' } } as JournalEntry
  const now = new Date('2026-09-24T13:04:00+08:00')
  assert.equal(isCurrentOngoingSleep(entry, now), false)
  assert.deepEqual(entriesForDay([entry], '2026-09-14', now), [entry])
  assert.deepEqual(entriesForDay([entry], '2026-09-24', now), [])
})

test('ongoing cross-midnight activity projects continuation points without inventing an end', () => {
  assert.deepEqual(projectActivityInterval('2026-09-23T23:11:00+08:00', '2026-09-24T01:04:00+08:00', '2026-09-24', false).map((point) => [point.kind, point.hour, point.minute]), [['ongoing', 0, 0], ['ongoing', 1, 0]])
})

test('activity projection emits start, hourly continuation and one duration end', () => {
  assert.deepEqual(projectActivityInterval('2026-09-24T21:10:00+08:00', '2026-09-24T23:36:00+08:00', '2026-09-24').map((point) => [point.kind, point.hour, point.minute]), [['start', 21, 10], ['ongoing', 22, 0], ['ongoing', 23, 0], ['end', 23, 36]])
})

test('exact-hour boundaries never duplicate start, continuation or end', () => {
  assert.deepEqual(projectActivityInterval('2026-09-24T18:00:00+08:00', '2026-09-24T20:00:00+08:00', '2026-09-24').map((point) => [point.kind, point.hour, point.minute]), [['start', 18, 0], ['ongoing', 19, 0], ['end', 20, 0]])
})

test('an activity ending at midnight appears once as the next day end boundary', () => {
  assert.deepEqual(projectActivityInterval('2026-09-24T23:00:00+08:00', '2026-09-25T00:00:00+08:00', '2026-09-24').map((point) => [point.kind, point.hour, point.minute]), [['start', 23, 0]])
  assert.deepEqual(projectActivityInterval('2026-09-24T23:00:00+08:00', '2026-09-25T00:00:00+08:00', '2026-09-25').map((point) => [point.kind, point.hour, point.minute]), [['end', 0, 0]])
})
