import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAgeFromBirthday } from './formatAgeFromBirthday.ts'

test('age formatting supports a birthday recorded to year precision', () => {
  const today = new Date('2026-08-12T12:00:00+08:00')

  assert.equal(formatAgeFromBirthday('1990', today), '36岁')
})

test('完整出生日期按设备时区精确显示到日', () => {
  const instant = new Date('2026-09-03T16:30:00.000Z')
  assert.equal(formatAgeFromBirthday('2026-09-04', instant, 'Asia/Shanghai'), '0天')
  assert.equal(formatAgeFromBirthday('2026-09-03', instant, 'Asia/Shanghai'), '1天')
})
