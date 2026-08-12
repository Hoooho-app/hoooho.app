import assert from 'node:assert/strict'
import test from 'node:test'
import { compareHealthChronologyAsc, compareHealthChronologyDesc } from './healthChronology.ts'

const item = (id: string, occurredAt: string, createdAt: string) => ({ id, occurredAt, createdAt })

test('健康时间线默认按 occurredAt 倒序，跨天和跨年均保持最新记录在前', () => {
  const records = [
    item('history-2025', '2025-01-12T13:00:00.000Z', '2026-08-12T08:00:00.000Z'),
    item('same-day-earlier', '2026-08-12T14:10:00.000Z', '2026-08-12T06:10:00.000Z'),
    item('same-day-later', '2026-08-12T15:25:00.000Z', '2026-08-12T07:25:00.000Z')
  ]

  assert.deepEqual(records.sort(compareHealthChronologyDesc).map(({ id }) => id), [
    'same-day-later',
    'same-day-earlier',
    'history-2025'
  ])
})

test('历史补录按 occurredAt 定位，不会因 createdAt 较新越过当前记录', () => {
  const records = [
    item('current', '2026-08-12T15:25:00.000Z', '2026-08-12T07:25:00.000Z'),
    item('backfilled', '2025-01-12T13:00:00.000Z', '2026-08-12T08:30:00.000Z')
  ]

  assert.deepEqual(records.sort(compareHealthChronologyDesc).map(({ id }) => id), ['current', 'backfilled'])
})

test('occurredAt 相同时按 createdAt DESC，再按 id DESC 保持稳定顺序', () => {
  const occurredAt = '2026-08-12T15:25:00.000Z'
  const records = [
    item('record-a', occurredAt, '2026-08-12T07:26:00.000Z'),
    item('record-b', occurredAt, '2026-08-12T07:27:00.000Z'),
    item('record-c', occurredAt, '2026-08-12T07:27:00.000Z')
  ]

  assert.deepEqual(records.sort(compareHealthChronologyDesc).map(({ id }) => id), [
    'record-c',
    'record-b',
    'record-a'
  ])
})

test('用户切换最早优先时使用完全相反的稳定顺序', () => {
  const occurredAt = '2026-08-12T15:25:00.000Z'
  const records = [
    item('record-c', occurredAt, '2026-08-12T07:27:00.000Z'),
    item('record-a', occurredAt, '2026-08-12T07:26:00.000Z'),
    item('record-b', occurredAt, '2026-08-12T07:27:00.000Z')
  ]

  assert.deepEqual(records.sort(compareHealthChronologyAsc).map(({ id }) => id), [
    'record-a',
    'record-b',
    'record-c'
  ])
})
