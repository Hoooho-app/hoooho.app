import assert from 'node:assert/strict'
import test from 'node:test'
import { angleDelta, draggedSleepInstant, sleepAngle, sleepInstant, sleepLocal, sleepMinute, sleepPeriod } from './sleepEditorTime.ts'
import { durationMinutes } from './sleepTime.ts'
test('A-F: twelve-hour geometry, endpoint periods and untruncated duration', () => {
  for (const [start, end, expected, a, b] of [
    ['2026-09-30T21:10','2026-10-01T06:00',530,'夜间','白天'],
    ['2026-09-30T21:10','2026-10-01T03:00',350,'夜间','夜间'],
    ['2026-09-30T13:00','2026-09-30T14:30',90,'白天','白天'],
    ['2026-09-30T17:30','2026-09-30T19:00',90,'白天','夜间'],
    ['2026-09-30T13:00','2026-10-01T13:00',1440,'白天','白天'],
    ['2026-09-30T13:00','2026-10-02T01:00',2160,'白天','夜间']
  ] as const) { const s = sleepInstant(start); const e = sleepInstant(end); assert.equal(durationMinutes(s,e),expected); assert.equal(sleepPeriod(s).label,a); assert.equal(sleepPeriod(e).label,b) }
  assert.equal(sleepAngle(sleepInstant('2026-09-30T21:10')),275)
  assert.equal(sleepAngle(sleepInstant('2026-09-30T13:00')),30)
  assert.equal(sleepAngle(sleepInstant('2026-09-30T14:30')),75)
  assert.equal(sleepAngle(sleepInstant('2026-09-30T03:00')),90)
})
test('G-J: two full turns, reverse, seam, multiple gestures and input reseeding', () => {
  const initial = sleepInstant('2026-09-30T14:30')
  const next = draggedSleepInstant(initial,720)
  assert.equal(sleepLocal(next),'2026-10-01T14:30')
  assert.equal(durationMinutes(sleepInstant('2026-09-30T13:00'), next),1530)
  assert.equal(draggedSleepInstant(next,-720),initial)
  assert.equal(angleDelta(359,1),2); assert.equal(angleDelta(1,359),-2)
  assert.equal(draggedSleepInstant(draggedSleepInstant(initial,360),360),next)
  assert.equal(sleepLocal(draggedSleepInstant(sleepInstant('2026-09-30T23:59'),0.5)),'2026-10-01T00:00')
  assert.equal(sleepMinute(draggedSleepInstant(sleepInstant('2026-09-30T11:59'),0.5)),720)
})
test('H: period switches at 06:00 and 18:00, independently from AM/PM', () => {
  for (const [time, period] of [['05:59','夜间'],['06:00','白天'],['17:59','白天'],['18:00','夜间']]) assert.equal(sleepPeriod(sleepInstant(`2026-09-30T${time}`)).label, period)
})
