import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatLocalMonthDay,
  formatLocalWeekday,
  formatPlainMonthDay,
  formatPlainWeekday,
  getLocalCalendarDaySerial,
  getLocalDateKey,
  parsePlainDate
} from './localCalendarDate.ts'

test('Asia/Shanghai 在 UTC 16:00 边界切换本地自然日与星期', () => {
  const beforeMidnight = '2026-08-27T15:59:59.000Z'
  const afterMidnight = '2026-08-27T16:00:00.000Z'

  assert.equal(getLocalDateKey(beforeMidnight, 'Asia/Shanghai'), '2026-08-27')
  assert.equal(formatLocalMonthDay(beforeMidnight, 'Asia/Shanghai'), '8月27日')
  assert.equal(formatLocalWeekday(beforeMidnight, 'Asia/Shanghai'), '周四')
  assert.equal(getLocalDateKey(afterMidnight, 'Asia/Shanghai'), '2026-08-28')
  assert.equal(formatLocalMonthDay(afterMidnight, 'Asia/Shanghai'), '8月28日')
  assert.equal(formatLocalWeekday(afterMidnight, 'Asia/Shanghai'), '周五')
})

test('同一 UTC 时间点按浏览器所在时区映射到各自本地自然日', () => {
  const instant = '2026-08-28T06:30:00.000Z'
  assert.equal(getLocalDateKey(instant, 'Asia/Shanghai'), '2026-08-28')
  assert.equal(getLocalDateKey(instant, 'America/Los_Angeles'), '2026-08-27')
})

test('跨本地午夜按日历日递增而不是按 24 小时毫秒数', () => {
  const beforeMidnight = getLocalCalendarDaySerial('2026-08-27T15:59:59.000Z', 'Asia/Shanghai')
  const afterMidnight = getLocalCalendarDaySerial('2026-08-27T16:00:00.000Z', 'Asia/Shanghai')
  assert.equal(afterMidnight! - beforeMidnight!, 86_400_000)
})

test('纯日期只按 YYYY-MM-DD 校验，不经时区时间点转换', () => {
  assert.deepEqual(parsePlainDate('2026-08-28'), { year: 2026, month: 8, day: 28 })
  assert.equal(formatPlainMonthDay('2026-08-28'), '8月28日')
  assert.equal(formatPlainWeekday('2026-08-28'), '周五')
  assert.deepEqual(parsePlainDate('2024-02-29'), { year: 2024, month: 2, day: 29 })
  assert.equal(parsePlainDate('2026-02-29'), null)
  assert.equal(parsePlainDate('2026-08'), null)
})

test('无效时间点不产生日期或错误默认值', () => {
  assert.equal(getLocalDateKey('invalid', 'Asia/Shanghai'), null)
  assert.equal(getLocalCalendarDaySerial('invalid', 'Asia/Shanghai'), null)
})
