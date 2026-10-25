import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { LiveAudioPreviewService, liveAudioPreviewApiResult } from './live-audio-preview.mjs'

const env = { AI_PROVIDER: 'bailian', BAILIAN_API_KEY: 'synthetic-key', BAILIAN_BASE_URL: 'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' }
const pcm = Buffer.alloc(6400).toString('base64')
class Socket extends EventEmitter {
  sent = []
  closed = false
  bufferedAmount = 0
  send(value) {
    const data = JSON.parse(value); this.sent.push(data)
    if (data.type === 'session.update') queueMicrotask(() => this.event({ type: 'session.updated' }))
  }
  close() { this.closed = true; this.emit('close') }
  event(event) { this.emit('message', Buffer.from(JSON.stringify(event))) }
}
function fixture(options = {}) {
  const sockets = [], checks = [], requests = []
  const service = new LiveAudioPreviewService({ env, assertMember: async (account, member) => { checks.push([account, member]); if (member === 'foreign') throw Object.assign(new Error('Forbidden'), { status: 403 }) }, socketFactory: (url, init) => { const socket = new Socket(); sockets.push(socket); requests.push([url, init]); setImmediate(() => socket.emit('open')); return socket }, ...options })
  return { service, sockets, checks, requests }
}

test('workspace/key stay server-side; exact ASR model, PCM16 config and no automatic assistant response', async t => {
  const f = fixture(); t.after(() => f.service.destroy())
  const result = await f.service.open('account', 'child')
  assert.deepEqual(f.checks, [['account', 'child']])
  assert.equal(f.requests[0][0], 'wss://fixture.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime')
  assert.equal(f.requests[0][1].headers.Authorization, 'Bearer synthetic-key')
  const update = f.sockets[0].sent[0]
  assert.equal(update.session.input_audio_format, 'pcm'); assert.equal(update.session.sample_rate, 16000)
  assert.equal(update.session.turn_detection.type, 'server_vad')
  assert(!JSON.stringify(result).includes('synthetic-key')); assert.equal(result.state, 'listening')
  assert.deepEqual(f.service.capabilities(), { configured: true, model: 'qwen3-asr-flash-realtime' })
})

test('text+stash replaces partials and completed utterances survive subsequent updates', async t => {
  const f = fixture(); t.after(() => f.service.destroy())
  const { id } = await f.service.open('account', 'child'), socket = f.sockets[0]
  const initialRevision = f.service.read('account', id).revision
  socket.event({ type: 'conversation.item.input_audio_transcription.text', item_id: 'one', text: '今天', stash: '有点' })
  assert.equal(f.service.read('account', id).text, '今天有点')
  assert(f.service.read('account', id).revision > initialRevision)
  socket.event({ type: 'conversation.item.input_audio_transcription.text', item_id: 'one', text: '今天有点', stash: '咳嗽' })
  assert.equal(f.service.read('account', id).text, '今天有点咳嗽')
  socket.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'one', transcript: '今天有点咳嗽。' })
  socket.event({ type: 'conversation.item.input_audio_transcription.text', item_id: 'two', text: '', stash: '没有发烧' })
  assert.equal(f.service.read('account', id).text, '今天有点咳嗽。没有发烧')
  socket.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'two', transcript: '没有发烧。' })
  const finalRevision = f.service.read('account', id).revision
  socket.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'two', transcript: '没有发烧。' })
  socket.event({ type: 'conversation.item.input_audio_transcription.text', item_id: 'two', text: '', stash: '迟到旧预览' })
  assert.equal(f.service.read('account', id).text, '今天有点咳嗽。没有发烧。')
  assert.equal(f.service.read('account', id).revision, finalRevision)
})

test('PCM chunks are validated, ordered, bounded and duplicate delivery never sends audio twice', async t => {
  const f = fixture(); t.after(() => f.service.destroy())
  const { id } = await f.service.open('account', 'child')
  f.service.append('account', id, { sequence: 0, audio: pcm })
  f.service.append('account', id, { sequence: 0, audio: pcm })
  assert.equal(f.sockets[0].sent.filter(e => e.type === 'input_audio_buffer.append').length, 1)
  assert.throws(() => f.service.append('account', id, { sequence: 2, audio: pcm }), { code: 'ASR_LIVE_SEQUENCE' })
  for (const input of [{ sequence: 1, audio: 'invalid' }, { sequence: 1, audio: Buffer.alloc(3).toString('base64') }, { sequence: 1, audio: '' }, { sequence: 1.5, audio: pcm }, { sequence: 1, audio: Buffer.alloc(32002).toString('base64') }]) assert.throws(() => f.service.append('account', id, input), { code: 'ASR_LIVE_INVALID_AUDIO' })
  f.service.append('account', id, { sequence: 1, audio: pcm })
  assert.equal(f.service.read('account', id).sequence, 1)
})

test('foreign member cannot create session; foreign account cannot read, append or close', async t => {
  const f = fixture(); t.after(() => f.service.destroy())
  await assert.rejects(() => f.service.open('account', 'foreign'), { status: 403 })
  assert.equal(f.sockets.length, 0)
  const { id } = await f.service.open('account', 'child')
  for (const fn of [() => f.service.read('other', id), () => f.service.append('other', id, { sequence: 0, audio: pcm }), () => f.service.close('other', id)]) assert.throws(fn, { status: 404 })
  assert.equal(f.service.read('account', id).state, 'listening')
})

test('disconnect preserves preview with a failure state; close releases connection and memory', async t => {
  const f = fixture(); t.after(() => f.service.destroy())
  const { id } = await f.service.open('account', 'child')
  f.sockets[0].event({ type: 'conversation.item.input_audio_transcription.text', item_id: 'one', text: '', stash: '已听到' })
  f.sockets[0].emit('close')
  assert.equal(f.service.read('account', id).text, '已听到'); assert.equal(f.service.read('account', id).state, 'failed')
  f.service.close('account', id)
  assert.equal(f.service.sessions.size, 0); assert(f.sockets[0].closed)
  assert.throws(() => f.service.read('account', id), { status: 404 })
  await f.service.open('account', 'child')
})

test('abort during connection cleans the socket and rejects without retaining session', async t => {
  let socket
  const controller = new AbortController(), f = fixture({ socketFactory: () => { socket = new Socket(); return socket } })
  t.after(() => f.service.destroy())
  const opening = f.service.open('account', 'child', controller.signal)
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await assert.rejects(opening, { name: 'AbortError' })
  assert(socket.closed); assert.equal(f.service.sessions.size, 0); assert.equal(f.service.opening.size, 0)
})

test('one active session/account; expiration releases it; budget does not grow indefinitely', async t => {
  let now = 1, f = fixture({ now: () => now })
  t.after(() => f.service.destroy())
  const { id } = await f.service.open('account', 'child')
  await assert.rejects(() => f.service.open('account', 'child'), { code: 'ASR_LIVE_BUSY' })
  now += 100001
  assert.throws(() => f.service.read('account', id), { code: 'ASR_LIVE_EXPIRED' })
  assert(f.sockets[0].closed)
  f.service.calls.set('account', { started: now, count: 60 })
  await assert.rejects(() => f.service.open('account', 'child'), { code: 'ASR_LIVE_LIMIT' })
  now += 3600001
  await f.service.open('account', 'child')
})

test('unsupported/unconfigured providers fail safely without touching a socket', async t => {
  for (const config of [{}, { AI_PROVIDER: 'openai' }, { ...env, BAILIAN_BASE_URL: 'https://evil.example/compatible-mode/v1' }]) {
    const f = fixture({ env: config }); t.after(() => f.service.destroy())
    assert.equal(f.service.capabilities().configured, false)
    await assert.rejects(() => f.service.open('account', 'child'))
    assert.equal(f.sockets.length, 0)
  }
})

test('safe errors do not expose supplier error payloads or the configured key', async t => {
  let socket
  const f = fixture({ socketFactory: () => { socket = new Socket(); setImmediate(() => socket.event({ type: 'error', error: { message: 'Bearer synthetic-key; private provider details' } })); return socket } })
  t.after(() => f.service.destroy())
  await assert.rejects(() => f.service.open('account', 'child'), error => { assert.equal(error.code, 'ASR_LIVE_UNAVAILABLE'); assert(!error.message.includes('synthetic')); return true })
  assert.equal(f.service.sessions.size, 0); assert(socket.closed)
})

test('API routes bind account once and retain bounded request readers', async t => {
  const f = fixture(); t.after(() => f.service.destroy())
  assert.equal(await liveAudioPreviewApiResult(f.service, 'account', 'GET', '/elsewhere', async () => ({})), null)
  const created = await liveAudioPreviewApiResult(f.service, 'account', 'POST', '/api/ai/audio/live', async limit => { assert.equal(limit, 2000); return { memberId: 'child' } })
  assert.equal(created.status, 201)
  const path = `/api/ai/audio/live/${created.data.id}`
  assert.equal((await liveAudioPreviewApiResult(f.service, 'account', 'POST', path, async limit => { assert.equal(limit, 45000); return { sequence: 0, audio: pcm } })).status, 200)
  assert.equal((await liveAudioPreviewApiResult(f.service, 'account', 'PUT', path, async () => ({}))).status, 405)
  assert.equal((await liveAudioPreviewApiResult(f.service, 'account', 'DELETE', path, async () => ({}))).data.state, 'closed')
})

test('malformed upstream null event cannot throw outside the service or crash the process',async t=>{
 const f=fixture();t.after(()=>f.service.destroy())
 const {id}=await f.service.open('account','child')
 assert.doesNotThrow(()=>f.sockets[0].event(null))
 assert.equal(f.service.read('account',id).state,'failed')
})
test('authenticated first-child capture permits preview without an existing member',async t=>{
 const f=fixture();t.after(()=>f.service.destroy())
 const opened=await f.service.open('account','')
 assert.equal(opened.state,'listening')
 assert.deepEqual(f.checks,[])
})
