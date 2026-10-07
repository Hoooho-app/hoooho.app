import { nurseApi } from './api'
import type { NurseState, NurseTurn } from './types'

// One transport per explicit start. No media recorder, raw audio store, retry loop or long key.
export class RealtimeNurse {
  private pc?: RTCPeerConnection
  private channels = new Set<RTCDataChannel>()
  private channel?: RTCDataChannel
  private stream?: MediaStream
  private audio = new Audio()
  private remote?: MediaStream
  private abort = new AbortController()
  private stopped = false
  private ready = false
  private created = false
  private configured = false
  private instructions = ''
  private timeout?: ReturnType<typeof setTimeout>
  private responseId = ''
  private cancelled = new Set<string>()
  private text = new Map<string, string>()
  private seen = new Set<string>()
  private sequence = Promise.resolve()
  private options: { memberId: string; token: string; draftId: string; state: (state: NurseState) => void; turn: (turn: NurseTurn) => Promise<void>; preview: (text: string) => void; error: (text: string) => void; usage: (responseId: string, usage: unknown) => void; playbackBlocked: (blocked: boolean) => void }
  constructor(options: { memberId: string; token: string; draftId: string; state: (state: NurseState) => void; turn: (turn: NurseTurn) => Promise<void>; preview: (text: string) => void; error: (text: string) => void; usage: (responseId: string, usage: unknown) => void; playbackBlocked: (blocked: boolean) => void }) { this.options = options }
  async start() {
    this.options.state('connecting')
    try {
      this.timeout = setTimeout(() => this.failure('语音连接超时，可继续文字记录'), 25000)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      if (this.stopped) { stream.getTracks().forEach(t => t.stop()); return }
      this.stream = stream
      const pc = new RTCPeerConnection(); this.pc = pc
      pc.addTransceiver('audio', { direction: 'sendrecv' }) // Empty sender until session.updated.
      const remote = new MediaStream(); this.remote = remote
      this.audio.autoplay = true
      pc.ontrack = event => { if (this.stopped) return; remote.addTrack(event.track); this.audio.srcObject = remote; void this.audio.play().catch(() => { if (this.stopped) return; this.stream?.getTracks().forEach(t => t.stop()); void pc.getSenders().find(s => s.track?.kind === 'audio')?.replaceTrack(null); this.options.state('paused'); this.options.playbackBlocked(true) }) }
      pc.ondatachannel = event => this.bind(event.channel)
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') this.initialize(); else if (['failed', 'disconnected'].includes(pc.connectionState)) this.failure('语音连接已断开，已确认文字仍保留；点击后才能重新连接') }
      this.bind(pc.createDataChannel('oai-events'))
      await pc.setLocalDescription(await pc.createOffer())
      await new Promise<void>((resolve, reject) => {
        const check = () => { if (pc.iceGatheringState === 'complete') finish() }
        const cancel = () => finish(new DOMException('Cancelled', 'AbortError'))
        const timer = setTimeout(() => finish(new Error('ICE连接超时')), 12000)
        const finish = (error?: Error) => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); this.abort.signal.removeEventListener('abort', cancel); error ? reject(error) : resolve() }
        pc.addEventListener('icegatheringstatechange', check); this.abort.signal.addEventListener('abort', cancel, { once: true }); check()
      })
      if (this.stopped) return
      const result = await nurseApi.sdp(this.options.memberId, this.options.token, this.options.draftId, pc.localDescription!.sdp, this.abort.signal)
      if (this.stopped) return
      this.instructions = result.instructions
      await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp.trim().replace(/\r?\n/g, '\r\n') + '\r\n' })
      this.initialize()
    } catch (error) { if (!this.stopped) this.failure(error instanceof Error ? error.message : '语音未连接，可继续文字') }
  }
  private send(event: object) { if (!this.stopped && this.pc?.connectionState === 'connected' && this.channel?.readyState === 'open') this.channel.send(JSON.stringify({ event_id: crypto.randomUUID(), ...event })) }
  private initialize() {
    if (!this.stopped && !this.configured && this.created && this.instructions && this.pc?.connectionState === 'connected' && this.channel?.readyState === 'open') {
      this.configured = true
      this.send({ type: 'session.update', session: { modalities: ['text', 'audio'], voice: 'Tina', instructions: this.instructions, input_audio_transcription: { model: 'qwen3-asr-flash-realtime' }, turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 800, create_response: true, interrupt_response: true } } })
    }
  }
  private bind(channel: RTCDataChannel) {
    this.channels.add(channel)
    channel.onopen = () => this.initialize()
    channel.onclose = () => { if (!this.stopped && channel === this.channel) this.failure('语音事件通道已关闭，可继续文字') }
    channel.onerror = () => this.failure('语音事件通道异常，可继续文字')
    channel.onmessage = event => {
      if (this.stopped) return
      let data: Record<string, any>
      try { data = JSON.parse(event.data) } catch { return }
      if (data.event_id && this.seen.has(data.event_id)) return
      if (data.event_id) this.seen.add(data.event_id)
      if (data.type === 'session.created') { this.created = true; this.channel = channel; this.initialize() }
      else if (data.type === 'session.updated' && this.configured && !this.ready) {
        this.ready = true; clearTimeout(this.timeout)
        this.timeout = setTimeout(() => this.failure('本段语音已结束，已确认文字保留；如需继续，请再次点击开启语音'), 300000)
        const sender = this.pc?.getSenders().find(s => !s.track || s.track.kind === 'audio')
        void sender?.replaceTrack(this.stream!.getAudioTracks()[0]).then(() => { if (!this.stopped) this.options.state('listening') }).catch(() => this.failure('麦克风未连接，可继续文字'))
      } else if (data.type === 'conversation.item.input_audio_transcription.delta') this.options.preview((data.text ?? '') + (data.stash ?? ''))
      else if (data.type === 'conversation.item.input_audio_transcription.completed' && data.transcript?.trim()) {
        this.options.preview(''); this.options.state('processing')
        this.queue({ id: data.item_id, role: 'user', text: data.transcript, at: new Date().toISOString(), order: 0, final: true, status: 'completed' })
      } else if (data.type === 'input_audio_buffer.speech_started') {
        if (this.responseId) { this.cancelled.add(this.responseId); this.send({ type: 'response.cancel' }); const visible = this.text.get(this.responseId); if (visible) this.queue({ id: this.responseId, role: 'assistant', text: visible, at: new Date().toISOString(), order: 0, final: true, status: 'interrupted' }); this.text.delete(this.responseId) }
        this.audio.muted = true; this.audio.pause(); this.audio.srcObject = null; this.options.preview(''); this.options.state('listening')
      } else if (data.type === 'response.created') { this.responseId = data.response?.id ?? ''; this.audio.srcObject = this.remote ?? null; this.audio.muted = false; void this.audio.play().catch(() => { if (!this.stopped) { this.stream?.getTracks().forEach(t => t.stop()); this.options.state('paused'); this.options.playbackBlocked(true) } }); this.options.state('speaking') }
      else if (['response.audio_transcript.delta', 'response.text.delta'].includes(data.type) && !this.cancelled.has(data.response_id)) {
        this.text.set(data.response_id, (this.text.get(data.response_id) ?? '') + (data.delta ?? '')); this.options.preview(this.text.get(data.response_id) ?? '')
      } else if (data.type === 'response.done') {
        this.options.usage(data.response?.id, data.response?.usage)
        const id = data.response?.id
        if (this.cancelled.has(id) && id !== this.responseId) { this.text.delete(id); return }
        if (data.response?.status === 'completed' && !this.cancelled.has(id)) {
          const text = data.response?.output?.flatMap((item: any) => item.role === 'assistant' ? item.content?.map((c: any) => c.transcript ?? c.text ?? '') ?? [] : []).join('')
          if (text?.trim()) this.queue({ id, role: 'assistant', text, at: new Date().toISOString(), order: 0, final: true, status: 'completed' })
        } else if (!this.cancelled.has(id) && this.text.get(id)?.trim()) {
          this.queue({ id, role: 'assistant', text: this.text.get(id)!, at: new Date().toISOString(), order: 0, final: true, status: 'interrupted' })
        }
        this.text.delete(id); if (id === this.responseId) { this.responseId = ''; this.options.preview(''); this.options.state('listening') }
      } else if (data.type === 'error' || data.type === 'conversation.item.input_audio_transcription.failed') this.failure('本轮语音未成功，已确认文字保留，可手动补充')
    }
  }
  private queue(turn: NurseTurn) { this.sequence = this.sequence.then(() => this.stopped && turn.role === 'assistant' && turn.status === 'completed' ? undefined : this.options.turn(turn)).catch(() => this.failure('对话文字未同步，请检查网络后重试，原内容保留')) }
  private failure(text: string) { if (this.stopped) return; this.stop(); this.options.state('error'); this.options.error(text) }
  async resumePlayback() {
    if (this.stopped) return
    try { await this.audio.play(); const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:false}); if (this.stopped) { stream.getTracks().forEach(t => t.stop()); return }; this.stream = stream; await this.pc?.getSenders().find(s => !s.track || s.track.kind === 'audio')?.replaceTrack(stream.getAudioTracks()[0]); this.options.playbackBlocked(false); this.options.state('listening') } catch { this.failure('语音播放或麦克风仍不可用，可以继续文字输入') }
  }
  async drain() { await this.sequence }
  stop() {
    if (this.stopped) return
    if (this.responseId) { this.send({ type: 'response.cancel' }); const visible = this.text.get(this.responseId); if (visible) this.queue({ id: this.responseId, role: 'assistant', text: visible, at: new Date().toISOString(), order: 0, final: true, status: 'interrupted' }) }
    this.stopped = true; this.ready = false; this.abort.abort(); clearTimeout(this.timeout)
    this.stream?.getTracks().forEach(t => t.stop()); this.channels.forEach(c => c.close()); this.channels.clear(); this.pc?.close()
    this.audio.pause(); (this.audio.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); this.audio.srcObject = null; this.audio.remove(); this.options.playbackBlocked(false); this.text.clear(); this.options.preview('')
  }
}
