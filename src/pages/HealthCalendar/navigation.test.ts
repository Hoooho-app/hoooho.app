import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarNavigationParams, normalizeCalendarNavigation, shiftCalendarMonth, switchCalendarView, monthOccurrenceEntries } from './navigation'
import { calendarMonthDays } from './model'
import { entriesForDay } from '../HealthEvents/timeGridModel'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
const today = '2026-10-11'
test('invalid URL state normalizes without discarding unrelated business parameters', () => {
  const params = new URLSearchParams('view=wrong&day=2026-02-30&month=2026-99&category=measurement&sort=wrong&recordId=record')
  const state = normalizeCalendarNavigation(params, today)
  assert.deepEqual(state, { view: 'day', day: today, month: '2026-10', category: '', sort: 'desc' })
  assert.equal(calendarNavigationParams(state, params).get('recordId'), 'record')
  assert.equal(normalizeCalendarNavigation(new URLSearchParams('day=2099-01-01&month=2099-01'), today).day, today)
})
test('view changes preserve filter/sort, selected month and valid day without future dates', () => {
  const state = normalizeCalendarNavigation(new URLSearchParams('day=2026-09-30&category=sleep&sort=asc'), today)
  const monthly = switchCalendarView(state, 'month', today)
  assert.equal(monthly.month, '2026-09')
  assert.equal(switchCalendarView(monthly, 'day', today).day, state.day)
  assert.deepEqual(switchCalendarView({ ...monthly, month: '2026-08' }, 'day', today), { ...state, day: '2026-08-01', month: '2026-08' })
})
test('month navigation handles year boundaries, leap years and four/five/six week grids', () => {
  assert.equal(shiftCalendarMonth('2025-12', 1), '2026-01')
  assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12')
  assert.ok(calendarMonthDays('2024-02').includes('2024-02-29'))
  assert.equal(Math.ceil(calendarMonthDays('2021-02').length / 7), 4)
  assert.equal(Math.ceil(calendarMonthDays('2026-10').length / 7), 5)
  assert.equal(Math.ceil(calendarMonthDays('2026-03').length / 7), 6)
})
test('month and day share one completed occurrence date, not start or creation date; unknown times excluded', () => {
  const sleep = { id: 'sleep', eventId: 'event', content: '睡眠', categories: ['sleep'], timePrecision: 'exact', occurredAt: '2026-09-30T21:00:00', createdAt: '2026-10-05T10:00:00', attachmentCount: 0, status: 'observing', sleep: { status: 'completed', sleepAt: '2026-09-30T21:00:00', wakeAt: '2026-10-01T07:00:00', kind: 'night', durationMinutes: 600 } } as JournalEntry
  const rows = [sleep, { ...sleep, id: 'unknown', timePrecision: 'unknown' as const }]
  assert.equal(monthOccurrenceEntries(rows, '2026-09').size, 0)
  assert.equal(monthOccurrenceEntries(rows, '2026-10').get('2026-10-01')?.length, 1)
  assert.equal(entriesForDay(rows, '2026-10-01').length, 1)
  assert.equal(entriesForDay(rows, '2026-09-30').length, 0)
})
