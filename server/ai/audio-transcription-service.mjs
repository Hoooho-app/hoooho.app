import { OpenAIProvider } from './providers/openai-provider.mjs'

const allowedAudio = new Set(['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/mpeg'])
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

export class AudioTranscriptionError extends Error {
  constructor(message, status = 400, code = 'AUDIO_TRANSCRIPTION_ERROR') { super(message); this.status = status; this.code = code }
}

function validateAudio(input) {
  const mimeType = typeof input?.mimeType === 'string' ? input.mimeType.toLowerCase() : ''
  const dataUrl = typeof input?.dataUrl === 'string' ? input.dataUrl : ''
  if (!allowedAudio.has(mimeType)) throw new AudioTranscriptionError('不支持该音频格式，请使用 WAV、WebM、MP3 或 M4A', 415, 'AUDIO_FORMAT_UNSUPPORTED')
  const prefix = `data:${mimeType};base64,`
  if (!dataUrl.startsWith(prefix)) throw new AudioTranscriptionError('音频内容格式错误', 400, 'INVALID_AUDIO_DATA')
  const buffer = Buffer.from(dataUrl.slice(prefix.length), 'base64')
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) throw new AudioTranscriptionError('音频为空或超过 15MB', 413, 'AUDIO_TOO_LARGE')
  if (mimeType.includes('wav') && !(buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE')) {
    throw new AudioTranscriptionError('WAV 音频无法解码', 422, 'AUDIO_DECODE_FAILED')
  }
  return { name: String(input?.name || 'recording').slice(0, 120), mimeType, buffer }
}

export class AudioTranscriptionService {
  constructor(options = {}) {
    this.provider = Object.prototype.hasOwnProperty.call(options, 'provider') ? options.provider : (process.env.OPENAI_API_KEY ? new OpenAIProvider(options) : null)
  }

  async transcribe(input) {
    const audio = validateAudio(input)
    if (!this.provider?.transcribeAudio) throw new AudioTranscriptionError('语音转写服务尚未配置，请改用文字记录', 503, 'ASR_NOT_CONFIGURED')
    try {
      const result = await this.provider.transcribeAudio(audio)
      const transcript = typeof result?.transcript === 'string' ? result.transcript.trim() : ''
      if (!transcript) throw new AudioTranscriptionError('未识别到可用语音，请重试或改用文字', 422, 'ASR_NO_SPEECH')
      return { transcript, provider: this.provider.name, model: result.model ?? null }
    } catch (error) {
      if (error instanceof AudioTranscriptionError) throw error
      throw new AudioTranscriptionError('语音转写暂时不可用，请稍后重试', 503, error?.code ?? 'ASR_UPSTREAM_UNAVAILABLE')
    }
  }
}
