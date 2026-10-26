import { apiRequest } from '../../services/apiClient'

type Snapshot = { id: string; text: string; state: 'connecting' | 'listening' | 'failed' | 'closed'; sequence: number; revision: number }
type Options = { stream: MediaStream; memberId: string; token: string; onText: (text: string) => void; onUnavailable?: () => void }

// Maintains the fractional source-frame offset across Web Audio callbacks.
// Each output is genuine 16 kHz signed little-endian PCM, never relabelled AAC.
export class StreamingPcm16 {
  private carry = new Float32Array(0)
  private position = 0
  private sampleRate: number
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Unsupported audio sample rate')
  }
  push(input: Float32Array): Uint8Array {
    const samples = new Float32Array(this.carry.length + input.length)
    samples.set(this.carry); samples.set(input, this.carry.length)
    const ratio = this.sampleRate / 16000
    const count = Math.max(0, Math.ceil((samples.length - 1 - this.position) / ratio))
    const bytes = new Uint8Array(count * 2), view = new DataView(bytes.buffer)
    let written = 0
    while (this.position < samples.length - 1 && written < count) {
      const index = Math.floor(this.position), fraction = this.position - index
      const value = Math.max(-1, Math.min(1, samples[index] * (1 - fraction) + samples[index + 1] * fraction))
      view.setInt16(written++ * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
      this.position += ratio
    }
    const consumed = Math.min(samples.length, Math.floor(this.position))
    this.carry = samples.slice(consumed); this.position -= consumed
    return bytes.subarray(0, written * 2)
  }
}

const base64 = (bytes: Uint8Array) => {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}

// Uses the already-authorized recording stream. It never asks for another
// microphone, saves interim text, or invokes a second dialogue model.
export function startLiveAudioPreview(options: Options, request = apiRequest) {
  const controller = new AbortController()
  let stopped = false, unavailable = false, id = '', revision = -1, context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined, processor: ScriptProcessorNode | undefined, gain: GainNode | undefined
  let buffers: Uint8Array[] = [], queuedBytes = 0, pending = false, sequence = 0
  let poll: ReturnType<typeof setTimeout> | undefined
  let requestTimer: ReturnType<typeof setTimeout> | undefined
  let readTimer: ReturnType<typeof setTimeout> | undefined
  let openingTimer: ReturnType<typeof setTimeout> | undefined
  const path = '/api/ai/audio/live'
  const releaseAudio = () => {
    if (processor) processor.onaudioprocess = null
    processor?.disconnect(); source?.disconnect(); gain?.disconnect()
    void context?.close().catch(() => undefined)
    processor = undefined; source = undefined; gain = undefined; context = undefined
  }
  const closeRemote = (sessionId: string) => {
    // Independent cancellation: stopping recording aborts uploads, but the
    // cleanup request must still reach the server. The server also enforces TTL.
    const cleanup = new AbortController(), timeout = setTimeout(() => cleanup.abort(), 5000)
    void request(`${path}/${sessionId}`, { method: 'DELETE', token: options.token, body:{}, signal: cleanup.signal }).catch(() => undefined).finally(() => clearTimeout(timeout))
  }
  const stop = () => {
    if (stopped) return
    stopped = true; controller.abort(); releaseAudio(); buffers = []; queuedBytes = 0
    if (poll) clearTimeout(poll)
    if (requestTimer) clearTimeout(requestTimer)
    if (readTimer) clearTimeout(readTimer)
    if (openingTimer) clearTimeout(openingTimer)
    if (id) closeRemote(id)
  }
  const fail = () => {
    if (stopped) return
    if (!unavailable) { unavailable = true; options.onUnavailable?.() }
    stop()
  }
  const accept = (snapshot: Snapshot) => {
    if (stopped || snapshot.revision < revision) return
    revision = snapshot.revision
    if (snapshot.state === 'failed' || snapshot.state === 'closed') { fail(); return }
    options.onText(snapshot.text)
  }
  const flush = async () => {
    if (stopped || pending || !id || queuedBytes < 6400) return // 200 ms PCM.
    if (queuedBytes > 512000) { fail(); return } // Slow network never drops/reorders audio silently.
    const count = Math.min(queuedBytes, 32000), bytes = new Uint8Array(count)
    let at = 0
    while (at < count) {
      const chunk = buffers.shift()!
      const take = Math.min(chunk.length, count - at)
      bytes.set(chunk.subarray(0, take), at); at += take
      if (take < chunk.length) buffers.unshift(chunk.subarray(take))
    }
    queuedBytes -= count; pending = true
    requestTimer = setTimeout(fail, 8000)
    try {
      const snapshot = await request<Snapshot>(`${path}/${id}`, { method: 'POST', token: options.token, body: { sequence: sequence++, audio: base64(bytes) }, signal: controller.signal })
      accept(snapshot)
    } catch { fail() }
    finally {
      if (requestTimer) clearTimeout(requestTimer)
      requestTimer = undefined; pending = false
      if (!stopped) void flush()
    }
  }
  const read = async () => {
    if (stopped || !id) return
    readTimer = setTimeout(fail, 8000)
    try { accept(await request<Snapshot>(`${path}/${id}`, { token: options.token, signal: controller.signal })) }
    catch { fail() }
    finally { if (readTimer) clearTimeout(readTimer); readTimer = undefined; if (!stopped) poll = setTimeout(() => void read(), 400) }
  }
  void (async () => {
    try {
      context = new AudioContext()
      source = context.createMediaStreamSource(options.stream)
      // ScriptProcessor preserves iOS support and uses a zero-gain destination;
      // no microphone audio is played. This is a preview, not the audio original.
      processor = context.createScriptProcessor(4096, 1, 1)
      gain = context.createGain(); gain.gain.value = 0
      const encoder = new StreamingPcm16(context.sampleRate)
      processor.onaudioprocess = event => {
        if (stopped) return
        const bytes = encoder.push(event.inputBuffer.getChannelData(0))
        if (bytes.length) { buffers.push(bytes); queuedBytes += bytes.length }
        if (queuedBytes > 512000) { fail(); return }
        void flush()
      }
      source.connect(processor); processor.connect(gain); gain.connect(context.destination)
      openingTimer = setTimeout(fail, 4000)
      await context.resume()
      if (openingTimer) clearTimeout(openingTimer)
      if (stopped) return
      openingTimer = setTimeout(fail, 15000)
      const snapshot = await request<Snapshot>(path, { method: 'POST', token: options.token, body: { memberId: options.memberId }, signal: controller.signal })
      id = snapshot.id
      if (openingTimer) clearTimeout(openingTimer)
      openingTimer = undefined
      if (stopped) { closeRemote(id); return }
      accept(snapshot); void flush(); void read()
    } catch { fail() }
  })()
  return stop
}
