import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAgeFromBirthday } from './formatAgeFromBirthday.ts'

test('age formatting supports a birthday recorded to year precision', () => {
  const today = new Date('2026-08-12T12:00:00+08:00')

  assert.equal(formatAgeFromBirthday('1990', today), '36岁')
})

test('当天出生在设备时区内始终显示未满1个月', () => {
  const instant = new Date('2026-09-03T16:30:00.000Z')
  assert.equal(formatAgeFromBirthday('2026-09-04', instant, 'Asia/Shanghai'), '未满1个月')
})
