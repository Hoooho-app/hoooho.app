import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffprobe from 'ffprobe-static'
import sharp from 'sharp'
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
assert.ok(stationVideo.length >= 150 * 1024 && stationVideo.length <= 300 * 1024, 'nurse-station-idle-1: 150-300 KB compact production budget')
assert.ok(stationPosterSize >= 6 * 1024 && stationPosterSize <= 18 * 1024, 'nurse-station-idle-1-poster: 6-18 KB compact production budget')
console.table([{ name: 'nurse-station-idle-1', video: stationVideo.length, poster: stationPosterSize }])

const probe = file => JSON.parse(execFileSync(ffprobe.path, ['-v','error','-show_entries','stream=width,height,duration,r_frame_rate:format=duration','-of','json',fileURLToPath(new URL(file,stationBase))], { encoding:'utf8' }))
const original = probe('nurse-station-idle-1.mp4')
for (const extension of ['mp4','webm']) {
  const file = `nurse-station-cutout-packed-20261029.${extension}`
  const meta = probe(file), stream = meta.streams[0]
  assert.equal(stream.width, 360, `${file}: color/matte panel width`)
  assert.equal(stream.height, 720, `${file}: synchronized stacked panels`)
  assert.equal(stream.r_frame_rate, '24/1', `${file}: original frame cadence`)
  assert.ok(Math.abs(Number(meta.format.duration)-Number(original.format.duration)) < .06, `${file}: full original animation`)
  assert.ok(statSync(new URL(file,stationBase)).size < 350*1024, `${file}: compact mobile stream`)
}
const transparentPoster = new URL('nurse-station-cutout-poster-20261029.webp',stationBase)
const meta = await sharp(fileURLToPath(transparentPoster)).metadata()
assert.equal(meta.width,360); assert.equal(meta.height,360); assert.equal(meta.hasAlpha,true)
const alpha = (await sharp(fileURLToPath(transparentPoster)).stats()).channels[3]
assert.equal(alpha.min,0); assert.equal(alpha.max,255)
assert.ok(statSync(transparentPoster).size < 64*1024, 'cutout poster: compact transparent fallback')
console.log('Nurse cutout: complete synchronized video and transparent fallback passed')
