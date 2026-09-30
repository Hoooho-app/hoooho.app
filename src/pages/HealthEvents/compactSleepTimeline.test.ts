import assert from 'node:assert/strict'
import test from 'node:test'
import { compactSleepTimeline } from './compactSleepTimeline'
const row = (kind: string, at: number, key = `${kind}:${at}`) => ({ kind, key, sortTime: at, hour: 0, minute: 0 })
const sleep = (source: string, start: number, end: number) => [start, (start + end) / 2, end].map(at => ({ ...row('activity-record', at), activity: 'sleep', sleepRange: { source, start, end, ongoing: true } }))
test('uninterrupted sleep becomes one segment, removing only its internal hour dividers', () => {
 const input = [...sleep('one', 10, 90), row('hour-divider', 20), row('hour-divider', 100)]
 const copy = structuredClone(input), result = compactSleepTimeline(input)
 assert.deepEqual(input, copy)
 assert.equal(result.length, 2)
 assert.deepEqual(result[1].sleepSegment, { start: 10, end: 90, ongoing: true, first: true, last: true })
})
test('inserted events split sleep and deleting them restores compression without duplicate records', () => {
 const original = sleep('one', 0, 120)
 const events = [row('record', 40), row('record', 40, 'same-minute'), row('record', 80)]
 const result = compactSleepTimeline([...original, ...events])
 assert.equal(result.filter(item => item.kind === 'record').length, 3)
 assert.deepEqual(result.filter(item => item.sleepSegment).map(item => [item.sleepSegment!.start, item.sleepSegment!.end]), [[0, 40], [40, 80], [80, 120]])
 assert.equal(compactSleepTimeline(original).length, 1)
})
test('separate sleep sources are never joined and boundary records stay visible', () => {
 const result = compactSleepTimeline([...sleep('one', 0, 12), ...sleep('two', 24, 36), row('record', 12)])
 assert.equal(result.filter(item => item.sleepSegment).length, 2)
 assert.equal(result.filter(item => item.kind === 'record').length, 1)
})
test('meal, anomalous open sleep and unrelated events retain their existing projections', () => {
 const rows = [{ ...row('activity-record', 5), activity: 'meal' }, { ...row('activity-record', 7), activity: 'sleep' }, row('hour-divider', 8)]
 assert.deepEqual(compactSleepTimeline(rows), rows)
})
