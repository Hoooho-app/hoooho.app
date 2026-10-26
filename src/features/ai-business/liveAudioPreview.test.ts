import test from 'node:test'
import assert from 'node:assert/strict'
import { StreamingPcm16, startLiveAudioPreview } from './liveAudioPreview'
import type { apiRequest } from '../../services/apiClient'

const tick = () => new Promise(resolve => setImmediate(resolve))
type Snapshot = { id: string; text: string; state: 'listening'; sequence: number; revision: number }
const snapshot = (revision = 1, text = ''): Snapshot => ({ id: '11111111-1111-1111-1111-111111111111', text, state: 'listening', sequence: 0, revision })

test('streaming encoder emits genuine bounded PCM16 at 16kHz across arbitrary callback boundaries', () => {
  for (const rate of [16000, 44100, 48000]) {
    const encoder = new StreamingPcm16(rate), input = new Float32Array(rate).fill(.5)
    let bytes = 0
    for (let at = 0; at < input.length; at += 4096) {
      const output = encoder.push(input.subarray(at, at + 4096))
      bytes += output.length
      for (let i = 0; i < output.length; i += 2) assert.equal(new DataView(output.buffer, output.byteOffset, output.byteLength).getInt16(i, true), 16384)
    }
    assert(Math.abs(bytes - 32000) <= 2, `${rate}: ${bytes}`)
  }
  const bytes = new StreamingPcm16(16000).push(new Float32Array([2, -2, 0]))
  assert.equal(new DataView(bytes.buffer).getInt16(0, true), 32767)
  assert.equal(new DataView(bytes.buffer).getInt16(2, true), -32768)
})

class Node {
  disconnected = false
  connect() {}
  disconnect() { this.disconnected = true }
}
class Processor extends Node {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null = null
  process(input: Float32Array) { this.onaudioprocess?.({ inputBuffer: { getChannelData: () => input } }) }
}
class Context {
  static latest: Context
  sampleRate = 16000
  source = new Node()
  processor = new Processor()
  gain = Object.assign(new Node(), { gain: { value: 1 } })
  destination = {}
  closed = false
  constructor() { Context.latest = this }
  createMediaStreamSource() { return this.source }
  createScriptProcessor() { return this.processor }
  createGain() { return this.gain }
  async resume() {}
  async close() { this.closed = true }
}
const installContext = (t: { after: (fn: () => void) => void }) => {
  const original = globalThis.AudioContext
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context })
  t.after(() => Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: original }))
}
const options = (onText: (value: string) => void, onUnavailable?: () => void) => ({ stream: {} as MediaStream, token: 'synthetic', memberId: 'child', onText, onUnavailable })

test('startup audio buffers while handshake is pending; large backlog drains in ordered bounded chunks', async t => {
  installContext(t)
  let release!: (value: Snapshot) => void, unavailable = false
  const chunks: { sequence: number; audio: string }[] = [], methods: string[] = []
  const request = (async (_path: string, init: Parameters<typeof apiRequest>[1]) => {
    methods.push(init.method ?? 'GET')
    if (init.method === 'DELETE') { assert.deepEqual(init.body,{}); return {} }
    if (init.method === 'POST' && !('sequence' in (init.body as object))) return new Promise<Snapshot>(resolve => { release = resolve })
    if (init.method === 'POST') chunks.push(init.body as { sequence: number; audio: string })
    return snapshot()
  }) as typeof apiRequest
  const stop = startLiveAudioPreview(options(() => undefined, () => { unavailable = true }), request)
  t.after(stop)
  await tick()
  for (let i = 0; i < 24; i++) Context.latest.processor.process(new Float32Array(4096).fill(.1)) // >6 seconds, before ready.
  assert.equal(unavailable, false)
  release(snapshot()); await tick(); await tick()
  assert(chunks.length >= 6)
  assert(chunks.every((chunk, index) => chunk.sequence === index && Buffer.from(chunk.audio, 'base64').length <= 32000))
  assert.equal(Context.latest.gain.gain.value, 0)
  stop(); await tick()
  assert(Context.latest.closed); assert(Context.latest.processor.disconnected); assert(methods.includes('DELETE'))
})

test('an older GET cannot overwrite a newer transcript from chunk response', async t => {
  installContext(t)
  const texts: string[] = []
  let read!: (value: Snapshot) => void
  const request = (async (_path: string, init: Parameters<typeof apiRequest>[1]) => {
    if (init.method === 'DELETE') { assert.deepEqual(init.body,{}); return {} }
    if (!init.method) return new Promise<Snapshot>(resolve => { read = resolve })
    return init.method === 'POST' && 'sequence' in (init.body as object) ? snapshot(3, '今天咳嗽') : snapshot()
  }) as typeof apiRequest
  const stop = startLiveAudioPreview(options(value => texts.push(value)), request); t.after(stop)
  await tick()
  Context.latest.processor.process(new Float32Array(4096).fill(.1)); await tick()
  assert.equal(texts.at(-1), '今天咳嗽')
  read(snapshot(2, '今天')); await tick()
  assert.equal(texts.at(-1), '今天咳嗽')
})

test('stop during pending open cancels preview and closes late session without text delivery', async t => {
  installContext(t)
  let release!: (value: Snapshot) => void
  const texts: string[] = [], methods: string[] = []
  const request = (async (_path: string, init: Parameters<typeof apiRequest>[1]) => {
    methods.push(init.method ?? 'GET')
    if (init.method === 'DELETE') { assert.deepEqual(init.body,{}); return {} }
    return new Promise<Snapshot>(resolve => { release = resolve })
  }) as typeof apiRequest
  const stop = startLiveAudioPreview(options(value => texts.push(value)), request)
  await tick(); stop(); release(snapshot(5, '迟到的文字')); await tick()
  assert.deepEqual(texts, []); assert(methods.includes('DELETE')); assert(Context.latest.closed)
})

test('preview errors never stop the original MediaStream and produce a single fallback notice', async t => {
  installContext(t)
  let warnings = 0, stoppedTrack = false
  const input = { ...options(() => undefined, () => { warnings++ }), stream: { getTracks: () => [{ stop: () => { stoppedTrack = true } }] } as unknown as MediaStream }
  const request = (async () => { throw new Error('preview only error') }) as typeof apiRequest
  const stop = startLiveAudioPreview(input, request); t.after(stop)
  await tick(); await tick()
  assert.equal(warnings, 1); assert.equal(stoppedTrack, false); assert(Context.latest.closed)
})

test('hung preview GET has a deadline and releases preview audio without stopping original recording', async t => {
  installContext(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let warnings = 0
  const request = (async (_path: string, init: Parameters<typeof apiRequest>[1]) => {
    if (init.method === 'DELETE') { assert.deepEqual(init.body,{}); return {} }
    if (init.method === 'POST') return snapshot()
    return new Promise(() => undefined)
  }) as typeof apiRequest
  const stop = startLiveAudioPreview(options(() => undefined, () => { warnings++ }), request); t.after(stop)
  await tick()
  t.mock.timers.tick(8001); await tick()
  assert.equal(warnings, 1); assert(Context.latest.closed)
})
