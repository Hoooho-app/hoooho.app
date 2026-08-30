import assert from 'node:assert/strict'
import test from 'node:test'
import type { TimelineEntry } from '../types/index.ts'
import { sortAndGroupTimeline, sortTimelineEntries } from './healthTimelineGrouping.ts'

function entry(
  id: string,
  time: string,
  content: string,
  periodLabel: string,
  createdAt = time,
  withAttachment = false
): TimelineEntry {
  return {
    id,
    time,
    createdAt,
    content,
    periodLabel,
    kind: 'text',
    recordType: 'symptom',
    attachments: withAttachment
      ? [{ id: `${id}-image`, name: `${content}.jpg`, type: 'image' }]
      : undefined
  }
}

test('同一天切换排序时，时间标签、内容和附件始终作为完整 TimelineItem 一起移动', () => {
  const original = [
    entry('later', '2026-08-12T15:30:00.000Z', '发热', '15:30'),
    entry('middle', '2026-08-12T14:00:00.000Z', '体温 38℃', '14:00', undefined, true),
    entry('earlier', '2026-08-12T10:00:00.000Z', '用药', '10:00')
  ]

  const desc = sortTimelineEntries(original, 'desc')
  const asc = sortTimelineEntries(original, 'asc')

  assert.deepEqual(desc.map(({ periodLabel, content }) => [periodLabel, content]), [
    ['15:30', '发热'],
    ['14:00', '体温 38℃'],
    ['10:00', '用药']
  ])
  assert.deepEqual(asc.map(({ periodLabel, content }) => [periodLabel, content]), [
    ['10:00', '用药'],
    ['14:00', '体温 38℃'],
    ['15:30', '发热']
  ])
  assert.equal(asc[1]?.attachments?.[0]?.name, '体温 38℃.jpg')
  assert.deepEqual(original.map(({ id }) => id), ['later', 'middle', 'earlier'])
})

test('跨日期切换排序时，日期组和组内记录使用同一完整排序结果', () => {
  const timeline = [
    entry('aug-10', '2026-08-10T09:00:00.000Z', '8月10日记录', '09:00'),
    entry('aug-12', '2026-08-12T09:00:00.000Z', '8月12日记录', '09:00'),
    entry('aug-06', '2026-08-06T09:00:00.000Z', '8月6日记录', '09:00')
  ]

  const desc = sortAndGroupTimeline(timeline, 'desc')
  const asc = sortAndGroupTimeline(timeline, 'asc')

  assert.deepEqual(desc[0]?.dates.map(({ entries }) => entries[0]?.id), ['aug-12', 'aug-10', 'aug-06'])
  assert.deepEqual(asc[0]?.dates.map(({ entries }) => entries[0]?.id), ['aug-06', 'aug-10', 'aug-12'])
})

test('occurredAt 相同时按 createdAt 和 id 稳定切换完整条目顺序', () => {
  const occurredAt = '2026-08-12T15:30:00.000Z'
  const timeline = [
    entry('record-a', occurredAt, '较早保存', '15:30', '2026-08-12T15:31:00.000Z'),
    entry('record-b', occurredAt, '较晚保存 B', '15:30', '2026-08-12T15:32:00.000Z'),
    entry('record-c', occurredAt, '较晚保存 C', '15:30', '2026-08-12T15:32:00.000Z')
  ]

  assert.deepEqual(sortTimelineEntries(timeline, 'desc').map(({ id }) => id), [
    'record-c',
    'record-b',
    'record-a'
  ])
  assert.deepEqual(sortTimelineEntries(timeline, 'asc').map(({ id }) => id), [
    'record-a',
    'record-b',
    'record-c'
  ])
})

test('详情时间线按指定用户时区的自然日与年份分组', () => {
  const timeline = [
    entry('before-midnight', '2026-08-27T15:59:59.000Z', '午夜前', '23:59'),
    entry('after-midnight', '2026-08-27T16:00:00.000Z', '午夜后', '00:00')
  ]
  const groups = sortAndGroupTimeline(timeline, 'desc', 'Asia/Shanghai')

  assert.equal(groups[0]?.year, 2026)
  assert.deepEqual(groups[0]?.dates.map(({ date, entries }) => [date, entries.map(({ id }) => id)]), [
    ['8月28日', ['after-midnight']],
    ['8月27日', ['before-midnight']]
  ])
})

test('日期组固定按本地自然日倒序，同一天按发生时间正序且不依赖接口顺序', () => {
  const timeline = [
    entry('aug-29', '2026-08-29T14:27:00.000Z', '8月29日 22:27', '22:27'),
    entry('aug-31', '2026-08-30T16:27:00.000Z', '8月31日 00:27', '00:27'),
    entry('aug-30-late', '2026-08-30T09:41:00.000Z', '8月30日 17:41', '17:41'),
    entry('aug-30-early', '2026-08-30T01:00:00.000Z', '8月30日 09:00', '09:00')
  ]

  const expected = [
    ['8月31日', ['aug-31']],
    ['8月30日', ['aug-30-early', 'aug-30-late']],
    ['8月29日', ['aug-29']]
  ]
  const grouped = sortAndGroupTimeline(timeline, 'desc', 'Asia/Shanghai')
  const refreshed = sortAndGroupTimeline([timeline[2], timeline[0], timeline[3], timeline[1]], 'desc', 'Asia/Shanghai')
  const snapshot = (groups: typeof grouped) => groups[0]?.dates.map(({ date, entries }) => [date, entries.map(({ id }) => id)])

  assert.deepEqual(snapshot(grouped), expected)
  assert.deepEqual(snapshot(refreshed), expected)
})

test('UTC 时间在上海本地零点前后使用同一有效时间完成排序与分组', () => {
  const groups = sortAndGroupTimeline([
    entry('local-midnight', '2026-08-30T16:00:00.000Z', '本地零点', '00:00'),
    entry('local-before-midnight', '2026-08-30T15:59:59.000Z', '本地零点前', '23:59')
  ], 'desc', 'Asia/Shanghai')

  assert.deepEqual(groups[0]?.dates.map(({ date, entries }) => [date, entries.map(({ id }) => id)]), [
    ['8月31日', ['local-midnight']],
    ['8月30日', ['local-before-midnight']]
  ])
})
