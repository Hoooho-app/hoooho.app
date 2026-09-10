import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
const names = ['nurses-idle-intro-0', 'nurses-idle-loop-1', 'nurses-idle-loop-2', 'nurse-save-success-ok']
const boxesOf = (buffer) => {
  const boxes = []
  for (let offset = 0; offset < buffer.length;) {
    const size = buffer.readUInt32BE(offset)
    assert.ok(size >= 8 && offset + size <= buffer.length)
    boxes.push(buffer.toString('ascii', offset + 4, offset + 8))
    offset += size
  }
  return boxes
}
const rows = names.map((name) => {
  const base = new URL('../src/assets/nurse-triage/', import.meta.url)
  const before = statSync(new URL(`${name}.mp4`, base)).size
  const buffer = readFileSync(new URL(`${name}-mobile.mp4`, base))
  const boxes = boxesOf(buffer)
  assert.ok(boxes.indexOf('moov') >= 0 && boxes.indexOf('moov') < boxes.indexOf('mdat'), `${name}: faststart`)
  assert.ok(buffer.length < before * 0.2, `${name}: mobile size budget`)
  return { name, before, after: buffer.length, reductionPercent: +(100 * (1 - buffer.length / before)).toFixed(1) }
})
console.table(rows)

const stationBase = new URL('../src/assets/nurse-triage/', import.meta.url)
const stationVideo = readFileSync(new URL('nurse-station-idle-1.mp4', stationBase))
const stationPosterSize = statSync(new URL('nurse-station-idle-1-poster.webp', stationBase)).size
const stationBoxes = boxesOf(stationVideo)
assert.ok(stationBoxes.indexOf('moov') >= 0 && stationBoxes.indexOf('moov') < stationBoxes.indexOf('mdat'), 'nurse-station-idle-1: faststart')
assert.ok(stationVideo.length >= 350 * 1024 && stationVideo.length <= 650 * 1024, 'nurse-station-idle-1: 350-650 KB production budget')
assert.ok(stationPosterSize >= 20 * 1024 && stationPosterSize <= 50 * 1024, 'nurse-station-idle-1-poster: 20-50 KB production budget')
console.table([{ name: 'nurse-station-idle-1', video: stationVideo.length, poster: stationPosterSize }])
