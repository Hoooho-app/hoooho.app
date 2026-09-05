import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNursePlayback } from './nursePlayback'

class Video extends EventTarget {
  dataset = { active: 'false' }
  src = ''
  preload = 'none'
  muted = false
  defaultMuted = false
  playsInline = false
  currentTime = 0
  paused = true
  ended = false
  loads = 0
  plays = 0
  callback?: (now: number, metadata: { mediaTime: number }) => void
  getAttribute() { return this.src || null }
  load() { this.loads++ }
  play() { this.plays++; this.paused = false; this.ended = false; return Promise.resolve() }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  requestVideoFrameCallback(callback: Video['callback']) { this.callback = callback; return 1 }
  cancelVideoFrameCallback() { this.callback = undefined }
  frame(time: number) { this.currentTime = time; this.callback?.(0, { mediaTime: time }) }
  finish() { this.ended = true; this.dispatchEvent(new Event('ended')) }
}

test('frame gate, stale-frame budget, save handoff, visibility and bounded recovery', (t) => {
  let now = 100
  let tick = () => {}
  const win = Object.assign(new EventTarget(), { setInterval: (fn: () => void) => { tick = fn; return 1 }, clearInterval: () => {} })
  const doc = Object.assign(new EventTarget(), { hidden: false })
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc })
  t.mock.method(performance, 'now', () => now)
  t.after(() => {
    for (const [name, descriptor] of [['window', originalWindow], ['document', originalDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  })
  const videos = Array.from({ length: 4 }, () => new Video())
  const controller = createNursePlayback(videos as unknown as HTMLVideoElement[], ['intro', 'idle1', 'idle2', 'saved'])
  controller.setActive(true)
  assert.deepEqual(videos.map((v) => v.loads), [1, 0, 0, 0])
  videos[0].dispatchEvent(new Event('playing'))
  videos[0].frame(0)
  assert.equal(videos[0].dataset.active, 'false')
  videos[0].frame(0.04)
  assert.equal(videos[0].dataset.active, 'true')
  assert.deepEqual(videos.map((v) => v.loads), [1, 1, 0, 0])
  now += 600; tick()
  assert.equal(videos[0].dataset.active, 'true')
  now += 800; tick()
  assert.equal(videos[0].dataset.active, 'false')
  videos[0].frame(0.08)
  assert.equal(videos[0].dataset.active, 'false')
  videos[0].frame(0.12)
  assert.equal(videos[0].dataset.active, 'true')
  videos[0].finish()
  assert.equal(videos[0].dataset.active, 'false')
  videos[1].frame(0); videos[1].frame(0.04)
  controller.saved(1)
  assert.equal(videos[1].dataset.active, 'true')
  videos[3].frame(0); videos[3].frame(0.04)
  assert.equal(videos[1].dataset.active, 'false')
  assert.equal(videos[3].dataset.active, 'true')
  controller.saved(1)
  assert.equal(videos[3].plays, 1)
  videos[3].finish()
  assert.equal(videos[3].dataset.active, 'false')
  videos[1].frame(0); videos[1].frame(0.04)
  assert.equal(videos[1].dataset.active, 'true')
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'))
  assert.ok(videos.every((v) => v.paused && v.dataset.active === 'false'))
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'))
  videos[1].frame(0); videos[1].frame(0.04)
  assert.equal(videos[0].plays, 1)
  assert.equal(videos[1].dataset.active, 'true')
  controller.dispose()
  assert.ok(videos.every((v) => !v.callback && v.dataset.active === 'false'))

  const failed = Array.from({ length: 4 }, () => new Video())
  const blocked = createNursePlayback(failed as unknown as HTMLVideoElement[], ['intro', 'idle1', 'idle2', 'saved'])
  blocked.setActive(true)
  for (let i = 0; i < 20; i++) { now += 8100; tick() }
  assert.deepEqual(failed.map((v) => v.plays), [3, 3, 3, 0])
  assert.ok(failed.every((v) => v.dataset.active === 'false'))
  blocked.setActive(false); blocked.setActive(true)
  assert.deepEqual(failed.map((v) => v.plays), [3, 3, 3, 0])
  blocked.dispose()
})
