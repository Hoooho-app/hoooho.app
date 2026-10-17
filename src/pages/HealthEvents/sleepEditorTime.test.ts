import assert from 'node:assert/strict'
import test from 'node:test'
import { angleDelta, draggedSleepInstant, sleepAngle, sleepInstant, sleepLocal, sleepMinute, sleepPeriod, sleepRelativeDateLabel } from './sleepEditorTime.ts'
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

test('manual twelve-hour geometry and minute steps retain dates across midnight',()=>{
  const instant=sleepInstant('2026-10-01T21:00')
  assert.equal(sleepAngle(instant),270)
  assert.equal(sleepAngle(sleepInstant('2026-10-01T09:00')),270)
  assert.equal(sleepLocal(draggedSleepInstant(instant,360)),'2026-10-02T09:00')
  assert.equal(sleepLocal(draggedSleepInstant(sleepInstant('2026-10-01T23:59'),.5)),'2026-10-02T00:00')
})

test('endpoint dates are relative to today in the recording timezone, including month/year and DST boundaries', () => {
  const now = '2026-10-17T00:15:00+08:00'
  for (const [value, expected] of [
    ['2026-10-17T00:00:00+08:00', '今天'],
    ['2026-10-16T23:59:00+08:00', '昨天'],
    ['2026-10-15T21:00:00+08:00', '前天'],
    ['2026-10-14T21:00:00+08:00', '2026-10-14'],
    ['2026-10-18T00:00:00+08:00', '2026-10-18']
  ]) assert.equal(sleepRelativeDateLabel(value, now, 'Asia/Shanghai'), expected)
  assert.equal(sleepRelativeDateLabel('2025-12-31T23:30:00+08:00', '2026-01-01T00:15:00+08:00'), '昨天')
  assert.equal(sleepRelativeDateLabel('2026-09-30T23:30:00+08:00', '2026-10-01T00:15:00+08:00'), '昨天')
  assert.equal(sleepRelativeDateLabel('2026-03-08T00:30:00-05:00', '2026-03-09T00:15:00-04:00', 'America/New_York'), '昨天')
  assert.equal(sleepRelativeDateLabel('2026-11-01T00:30:00-04:00', '2026-11-02T00:15:00-05:00', 'America/New_York'), '昨天')
})
