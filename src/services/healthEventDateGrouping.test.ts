import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventListItemViewModel } from '../types/index.ts'
import { groupHealthEventsByLocalDate } from './healthEventDateGrouping.ts'

function event(id: string, occurredAt: string, createdAt = occurredAt): HealthEventListItemViewModel {
  return {
    id,
    memberId: 'member-1',
    memberName: '测试成员',
    title: '测试事件',
    displayTitle: '测试事件',
    definitionTitle: '未定性',
    durationLabel: '已持续1天',
    summaryFragments: [],
    category: 'other',
    status: 'observing',
    startTime: occurredAt,
    recoveredAt: null,
    occurredAt,
    createdAt,
    updatedAt: createdAt
  }
}

test('北京时间午夜前后进入正确日期组，历史事件日期保持不变', () => {
  const groups = groupHealthEventsByLocalDate([
    event('before', '2026-08-27T15:59:59.000Z'),
    event('after', '2026-08-27T16:00:00.000Z')
  ], 'Asia/Shanghai')

  assert.deepEqual(groups.map(({ date, events }) => [date, events.map(({ id }) => id)]), [
    ['2026-08-28', ['after']],
    ['2026-08-27', ['before']]
  ])
})

test('同一本地自然日内继续按 occurredAt、createdAt、id 倒序', () => {
  const groups = groupHealthEventsByLocalDate([
    event('earlier', '2026-08-27T16:01:00.000Z'),
    event('later-a', '2026-08-27T16:02:00.000Z', '2026-08-27T16:03:00.000Z'),
    event('later-b', '2026-08-27T16:02:00.000Z', '2026-08-27T16:04:00.000Z')
  ], 'Asia/Shanghai')

  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.date, '2026-08-28')
  assert.deepEqual(groups[0]?.events.map(({ id }) => id), ['later-b', 'later-a', 'earlier'])
})

test('其他浏览器时区使用对应本地自然日分组', () => {
  const instant = event('same-instant', '2026-08-28T06:30:00.000Z')
  assert.equal(groupHealthEventsByLocalDate([instant], 'Asia/Shanghai')[0]?.date, '2026-08-28')
  assert.equal(groupHealthEventsByLocalDate([instant], 'America/Los_Angeles')[0]?.date, '2026-08-27')
})
