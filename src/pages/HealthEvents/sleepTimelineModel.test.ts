import assert from 'node:assert/strict'
import test from 'node:test'
import { projectSleepEndpoints, sleepEndpointStatus } from './sleepTimelineModel'
import { getLocalDateKey } from '../../utils/localCalendarDate'

const date = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute)
const kinds = (start: Date, end: Date | undefined, day: Date) => projectSleepEndpoints(start, end, getLocalDateKey(day)!).map(point => [point.kind, point.hour, point.minute])

test('ongoing sleep emits only its actual start, including a zero elapsed start', () => {
  assert.deepEqual(kinds(date(30, 13), undefined, date(30, 0)), [['start', 13, 0]])
  assert.deepEqual(kinds(date(30, 23, 10), undefined, date(31, 0)), [])
  assert.equal(sleepEndpointStatus('start', true, 100), '开始入睡 · 持续')
  assert.equal(sleepEndpointStatus('open', true, 0), '开始入睡 · 持续')
})
test('completed same-day sleep has exactly two endpoints and replaces the running copy', () => {
  assert.deepEqual(kinds(date(30, 13), date(30, 14, 30), date(30, 0)), [['start', 13, 0], ['end', 14, 30]])
  assert.equal(sleepEndpointStatus('start', false, 90, date(30, 13)), '开始于13点00分入睡')
  assert.equal(sleepEndpointStatus('end', false, 90), '醒了 · 共1小时30分钟')
})
test('cross-day sleep has one endpoint on each actual date, without a midnight continuation', () => {
  assert.deepEqual(kinds(date(30, 21, 10), date(31, 6), date(30, 0)), [['start', 21, 10]])
  assert.deepEqual(kinds(date(30, 21, 10), date(31, 6), date(31, 0)), [['end', 6, 0]])
})
test('long sleep has no intermediate-day or hourly endpoints and retains its total duration', () => {
  assert.deepEqual(kinds(date(28, 13), date(30, 14, 30), date(29, 0)), [])
  assert.equal(sleepEndpointStatus('end', false, 24 * 60), '醒了 · 共24小时0分钟')
  assert.equal(sleepEndpointStatus('end', false, 25 * 60 + 30), '醒了 · 共25小时30分钟')
})
test('midnight wake is only an end on the new date and sub-hour duration is readable', () => {
  assert.deepEqual(kinds(date(30, 23, 10), date(31, 0), date(31, 0)), [['end', 0, 0]])
  assert.equal(sleepEndpointStatus('end', false, 50), '醒了 · 共50分钟')
})
test('invalid times never invent a wake endpoint', () => {
  assert.deepEqual(projectSleepEndpoints('invalid', undefined, '2026-09-30'), [])
  assert.deepEqual(kinds(date(30, 13), date(30, 12), date(30, 0)), [['start', 13, 0]])
})
test('completed start copy uses its actual local sleep time, not wake or current time', () => {
  assert.equal(sleepEndpointStatus('start', false, 530, date(30, 21, 10)), '开始于21点10分入睡')
  assert.equal(sleepEndpointStatus('start', false, 90, date(30, 0, 5)), '开始于0点05分入睡')
  assert.equal(sleepEndpointStatus('start', true, 90, date(30, 21, 10)), '开始入睡 · 持续')
  assert.equal(sleepEndpointStatus('start', false, 90, 'invalid'), '开始入睡')
})
