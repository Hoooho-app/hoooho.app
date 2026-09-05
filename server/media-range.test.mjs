import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediaRange } from './media-range.mjs'
test('MP4 browser probes, open ranges, suffixes and bounds', () => {
  assert.deepEqual(mediaRange('bytes=0-1', 100), { start: 0, end: 1 })
  assert.deepEqual(mediaRange('bytes=20-', 100), { start: 20, end: 99 })
  assert.deepEqual(mediaRange('bytes=-20', 100), { start: 80, end: 99 })
  assert.deepEqual(mediaRange('bytes=0-999', 100), { start: 0, end: 99 })
  for (const header of ['bytes=100-', 'bytes=20-10', 'bytes=-0']) assert.equal(mediaRange(header, 100), false)
  for (const header of [undefined, 'bytes=-', 'bytes=0-1,5-6', 'bad']) assert.equal(mediaRange(header, 100), null)
})
