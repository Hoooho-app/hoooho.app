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
