import assert from 'node:assert/strict'
import test from 'node:test'
import { clockMinutesFromPoint, defaultSleepType, durationMinutes, formatSleepDuration, sleepRangeFromClocks, sleepTimelineSummary, snapClockMinutes } from './sleepTime.ts'

test('ring maps cardinal points to a 24 hour clock and snaps to five minutes', () => {
  assert.equal(clockMinutesFromPoint(100, 0, 100, 100), 0)
  assert.equal(clockMinutesFromPoint(200, 100, 100, 100), 360)
  assert.equal(clockMinutesFromPoint(100, 200, 100, 100), 720)
  assert.equal(clockMinutesFromPoint(0, 100, 100, 100), 1080)
  assert.equal(snapClockMinutes(1302), 1300)
})

test('sleep range crosses midnight and equal nodes stay zero', () => {
  const reference = new Date(2026, 8, 6, 12)
  const overnight = sleepRangeFromClocks(reference, reference, 21 * 60 + 40, 6 * 60 + 35)
  assert.equal(durationMinutes(overnight.start, overnight.end), 8 * 60 + 55)
  const equal = sleepRangeFromClocks(reference, reference, 8 * 60, 8 * 60)
  assert.equal(durationMinutes(equal.start, equal.end), 0)
})

test('duration labels and daytime default remain neutral', () => {
  assert.equal(formatSleepDuration(45), '45分钟')
  assert.equal(formatSleepDuration(480), '8小时')
  assert.equal(formatSleepDuration(535), '8小时55分钟')
  assert.equal(sleepTimelineSummary('night', 480), '夜间睡眠 · 8小时')
  assert.equal(sleepTimelineSummary('nap', 230), '白天小睡 · 3小时50分钟')
  const daytime = sleepRangeFromClocks(new Date(2026, 8, 6), new Date(2026, 8, 6), 13 * 60 + 26, 14 * 60 + 48)
  assert.equal(durationMinutes(daytime.start, daytime.end), 82)
  assert.equal(defaultSleepType(daytime.start, daytime.end), 'nap')
})
