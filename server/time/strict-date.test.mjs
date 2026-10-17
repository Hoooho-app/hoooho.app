import assert from 'node:assert/strict'
import test from 'node:test'
import { validCalendarDate, parseStrictInstant } from './strict-date.mjs'

test('calendar dates do not silently roll into another day', () => {
  for (const value of ['2026-02-30', '2025-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', null, true, ['2026-01-01']]) assert.equal(validCalendarDate(value), false, String(value))
  for (const value of ['2024-02-29', '2000-02-29', '2026-10-18']) assert.equal(validCalendarDate(value), true, value)
})

test('instants validate raw types, dates and clock time before ISO parsing', () => {
  for (const value of [null, 0, true, [], {}, '', '2026-02-30T12:00:00Z', '2026-09-01T24:00:00Z', '2026-09-01T25:90:00Z', '2026-09-01T10:00:60Z']) assert.equal(parseStrictInstant(value), null, String(value))
  assert.equal(parseStrictInstant('2026-01-01T10:00:00+08:00').toISOString(), '2026-01-01T02:00:00.000Z')
  assert.equal(parseStrictInstant('2026-01-01T02:00:00Z').toISOString(), '2026-01-01T02:00:00.000Z')
  assert.equal(parseStrictInstant('2026-01-01').toISOString(), '2026-01-01T00:00:00.000Z')
})
