import { Agent } from 'node:https'
import { randomUUID } from 'node:crypto'
import { bailianConfiguration } from './providers/provider-config.mjs'

const failure = (message, status = 503, code = 'ASR_LIVE_UNAVAILABLE') => Object.assign(new Error(message), { status, code })
const unavailable = () => failure('实时文字暂不可用，录音仍在继续，松开后会完整整理')
const MAX_PCM_BYTES = 16000 * 2 * 91
const MAX_CHUNK_BYTES = 32000
const MODEL = 'qwen3-asr-flash-realtime'

// A short-lived preview only. No audio/text is written to disk, logged, or
// promoted into health facts. The existing original-audio pipeline remains
// authoritative after the user releases the recording button.
export class LiveAudioPreviewService {
  constructor(options = {}) {
    this.env = options.env ?? process.env
    this.assertMember = options.assertMember ?? (async () => { throw failure('对象无法核对', 403, 'FORBIDDEN') })
    this.socketFactory = options.socketFactory
    this.now = options.now ?? Date.now
    this.connectTimeoutMs = options.connectTimeoutMs ?? 12000
    this.sessionTtlMs = options.sessionTtlMs ?? 100000
    this.agent=new Agent({keepAlive:true,autoSelectFamily:true,autoSelectFamilyAttemptTimeout:1000})
    this.sessions = new Map()
    this.opening = new Set()
    this.calls = new Map()
  }
  configuration() {
    if ((this.env.ASR_PROVIDER ?? this.env.AI_PROVIDER) !== 'bailian') throw unavailable()
    const config = bailianConfiguration({ env: this.env })
    const url = new URL(config.baseUrl)
    url.protocol = 'wss:'
    url.pathname = '/api-ws/v1/realtime'
    url.searchParams.set('model', MODEL)
    return { url: url.href, apiKey: config.apiKey }
  }
  capabilities() {
    try { this.configuration(); return { configured: true, model: MODEL } }
    catch { return { configured: false, model: MODEL } }
  }
  snapshot(session) {
    const text = [...session.final.values(), ...session.partial.values()].join('').slice(0, 15000)
    return { id: session.id, text, state: session.state, sequence: session.sequence, revision: session.revision, ...(session.state === 'failed' ? { message: '实时文字连接已中断，录音仍在继续，松开后会完整整理' } : {}) }
  }
  owned(accountId, id) {
    const session = this.sessions.get(id)
    if (!session || session.accountId !== accountId) throw failure('实时文字已结束，请继续录音或重新开始', 404, 'ASR_LIVE_NOT_FOUND')
    if (this.now() - session.started >= this.sessionTtlMs) { this.remove(session); throw failure('实时文字已结束', 410, 'ASR_LIVE_EXPIRED') }
    return session
  }
  remove(session) {
    clearTimeout(session.timer)
    clearTimeout(session.connectTimer)
    this.sessions.delete(session.id)
    session.closed = true
    try { session.socket?.close() } catch { /* Already disconnected. */ }
  }
  async open(accountId, memberId, signal) {
    if (!accountId || typeof memberId !== 'string' || memberId.length>180) throw failure('请先选择记录对象', 400, 'MEMBER_REQUIRED')
    if(memberId)await this.assertMember(accountId, memberId)
    signal?.throwIfAborted()
    const config = this.configuration(), now = this.now()
    for (const [id, count] of this.calls) if (now - count.started >= 3600000) this.calls.delete(id)
    for (const session of this.sessions.values()) if (now - session.started >= this.sessionTtlMs) this.remove(session)
    if (this.opening.has(accountId) || [...this.sessions.values()].some(s => s.accountId === accountId)) throw failure('已有一段录音正在显示实时文字', 409, 'ASR_LIVE_BUSY')
    const usage = this.calls.get(accountId) ?? { started: now, count: 0 }
    if (usage.count >= 60) throw failure('实时文字本小时使用次数已达上限，录音仍可继续', 429, 'ASR_LIVE_LIMIT')
    if (this.sessions.size + this.opening.size >= 20) throw failure('实时文字暂忙，录音仍可继续', 429, 'ASR_LIVE_BUSY')
    usage.count++; this.calls.set(accountId, usage); this.opening.add(accountId)
    let session
    try {
      let factory = this.socketFactory
      if (!factory) {
        const { default: WebSocket } = await import('ws')
        factory = (url, options) => new WebSocket(url, options)
      }
      signal?.throwIfAborted()
      const socket = factory(config.url, { headers: { Authorization: `Bearer ${config.apiKey}` }, agent:this.agent, handshakeTimeout: this.connectTimeoutMs, maxPayload: 65536, followRedirects: false })
      session = { id: randomUUID(), accountId, memberId, socket, started: this.now(), final: new Map(), partial: new Map(), state: 'connecting', revision: 0, sequence: -1, bytes: 0, closed: false }
      this.sessions.set(session.id, session)
      session.timer = setTimeout(() => this.remove(session), this.sessionTtlMs)
      session.timer.unref?.()
      await new Promise((resolve, reject) => {
        let settled = false
        const finish = error => {
          if (settled) return
          settled = true; clearTimeout(session.connectTimer); signal?.removeEventListener('abort', cancel)
          error ? reject(error) : resolve()
        }
        const cancel = () => { this.remove(session); finish(signal.reason ?? unavailable()) }
        const fail = () => { if (session.closed) return; if (session.state !== 'failed') session.revision++; session.state = 'failed'; if (!settled) { this.remove(session); finish(unavailable()) } else { try { socket.close() } catch {} } }
        session.connectTimer = setTimeout(fail, this.connectTimeoutMs)
        session.connectTimer.unref?.()
        signal?.addEventListener('abort', cancel, { once: true })
        socket.on('open', () => {
          if (session.closed) return
          try { socket.send(JSON.stringify({ event_id: randomUUID(), type: 'session.update', session: { modalities:['text'], input_audio_format: 'pcm', sample_rate: 16000, input_audio_transcription: { language: 'zh' }, turn_detection: { type: 'server_vad', threshold: 0.2, silence_duration_ms: 400 } } })) } catch { fail() }
        })
        socket.on('message', data => {
          if (session.closed) return
          if (data.length > 65536) { fail(); return }
          let event
          try { event = JSON.parse(String(data)) } catch { fail(); return }
          if(!event||typeof event!=='object'||Array.isArray(event)){fail();return}
          if (event.type === 'session.updated' && session.state === 'connecting') { session.state = 'listening'; session.revision++; finish() }
          else if (event.type === 'conversation.item.input_audio_transcription.text') {
            if (typeof event.item_id !== 'string' || typeof event.text !== 'string' || typeof event.stash !== 'string') { fail(); return }
            const text = event.text + event.stash
            if (text.length > 15000) { fail(); return }
            if (!session.final.has(event.item_id) && session.partial.get(event.item_id) !== text) { session.partial.set(event.item_id, text); session.revision++ }
          } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
            if (typeof event.item_id !== 'string' || typeof event.transcript !== 'string') { fail(); return }
            if (event.transcript.length > 15000) { fail(); return }
            if (session.partial.has(event.item_id) || session.final.get(event.item_id) !== event.transcript) session.revision++
            session.partial.delete(event.item_id); session.final.set(event.item_id, event.transcript)
          } else if (event.type === 'error' || event.type === 'conversation.item.input_audio_transcription.failed') fail()
          if (session.final.size + session.partial.size > 300 || [...session.final.values(), ...session.partial.values()].reduce((length, text) => length + text.length, 0) > 15000) fail()
        })
        socket.on('error', fail)
        socket.on('close', () => { if (!session.closed) { session.state = 'failed'; session.revision++; finish(unavailable()) } })
        if (signal?.aborted) cancel()
      })
      signal?.throwIfAborted()
      return this.snapshot(session)
    } catch (error) {
      if (session) this.remove(session)
      if (signal?.aborted) throw signal.reason ?? unavailable()
      // Do not expose supplier bodies, URLs, handshakes, or auth headers.
      throw error?.code?.startsWith('ASR_LIVE_') ? error : unavailable()
    } finally { this.opening.delete(accountId) }
  }
  append(accountId, id, input) {
    const session = this.owned(accountId, id)
    if (session.state !== 'listening') return this.snapshot(session)
    const sequence = input?.sequence, audio = input?.audio
    if (!Number.isInteger(sequence) || sequence < 0 || sequence > 1000 || typeof audio !== 'string' || audio.length > MAX_CHUNK_BYTES * 4 / 3 + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio)) throw failure('实时音频格式无效', 400, 'ASR_LIVE_INVALID_AUDIO')
    const bytes = Buffer.from(audio, 'base64')
    if (!bytes.length || bytes.length % 2 || bytes.length > MAX_CHUNK_BYTES) throw failure('实时音频格式无效', 400, 'ASR_LIVE_INVALID_AUDIO')
    if (sequence === session.sequence) return this.snapshot(session) // Safe duplicate HTTP delivery.
    if (sequence !== session.sequence + 1) throw failure('实时音频顺序已中断', 409, 'ASR_LIVE_SEQUENCE')
    if (session.bytes + bytes.length > MAX_PCM_BYTES) { this.remove(session); throw failure('实时录音已达时长上限', 413, 'ASR_LIVE_LIMIT') }
    if (session.socket.bufferedAmount > 128000) { session.state = 'failed'; session.revision++; try { session.socket.close() } catch {} ; return this.snapshot(session) }
    try { session.socket.send(JSON.stringify({ event_id: randomUUID(), type: 'input_audio_buffer.append', audio })) }
    catch { session.state = 'failed'; session.revision++; try { session.socket.close() } catch {} ; return this.snapshot(session) }
    session.sequence = sequence; session.bytes += bytes.length
    return this.snapshot(session)
  }
  read(accountId, id) { return this.snapshot(this.owned(accountId, id)) }
  close(accountId, id) {
    const session = this.owned(accountId, id), snapshot = this.snapshot(session)
    this.remove(session)
    return { ...snapshot, state: 'closed', revision: snapshot.revision + 1 }
  }
  destroy() { for (const session of this.sessions.values()) this.remove(session);this.agent.destroy() }
}

export async function liveAudioPreviewApiResult(service, accountId, method, pathname, readInput, signal) {
  const match = /^\/api\/ai\/audio\/live(?:\/([a-f0-9-]{36}))?$/.exec(pathname)
  if (!match) return null
  const id = match[1]
  if (!id && method === 'POST') return { status: 201, data: await service.open(accountId, (await readInput(2000)).memberId, signal) }
  if (!id && method === 'GET') return { status: 200, data: service.capabilities() }
  if (id && method === 'POST') return { status: 200, data: service.append(accountId, id, await readInput(45000)) }
  if (id && method === 'GET') return { status: 200, data: service.read(accountId, id) }
  if (id && method === 'DELETE') return { status: 200, data: service.close(accountId, id) }
  return { status: 405, data: { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } } }
}
