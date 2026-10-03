import { createAudioProvider } from './providers/provider-factory.mjs'
import { MedicalSummaryError } from './medical-summary-service.mjs'
import { withAIAccount } from './providers/call-control.mjs'
import { randomUUID } from 'node:crypto'

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
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataUrl.slice(prefix.length))) throw new AudioTranscriptionError('音频编码格式错误',400,'INVALID_AUDIO_DATA')
  const buffer = Buffer.from(dataUrl.slice(prefix.length), 'base64')
  if (!buffer.length) throw new AudioTranscriptionError('音频为空，请重新录音',422,'AUDIO_EMPTY')
  if (buffer.length > MAX_AUDIO_BYTES) throw new AudioTranscriptionError('音频超过 15MB，请缩短后重试', 413, 'AUDIO_TOO_LARGE')
  if (mimeType.includes('wav') && !(buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE')) {
    throw new AudioTranscriptionError('WAV 音频无法解码', 422, 'AUDIO_DECODE_FAILED')
  }
  return { name: String(input?.name || 'recording').slice(0, 120), mimeType, buffer }
}

export class AudioTranscriptionService {
  constructor(options = {}) {
    this.provider = Object.prototype.hasOwnProperty.call(options, 'provider') ? options.provider : createAudioProvider('ASR', options)
    const configured=Number(options.maxCallsPerHour??process.env.AI_ASR_MAX_CALLS_PER_HOUR??60)
    this.maxCallsPerHour=Number.isInteger(configured)&&configured>0&&configured<=1000?configured:60
    this.calls=new Map()
    this.ttsProvider=createAudioProvider('TTS',options)
    this.logger=options.logger??console
    const env=options.env??process.env
    this.runtime={commit:/^[a-f0-9]{40}$/.test(env.RAILWAY_GIT_COMMIT_SHA??'')?env.RAILWAY_GIT_COMMIT_SHA:'local',instanceId:randomUUID()}
  }

  capabilities() {
    return {asr:{configured:!!this.provider?.transcribeAudio&&!this.provider.configurationError,provider:this.provider?.name??'none',model:this.provider?.model??null},tts:{configured:!!this.ttsProvider?.apiKey&&!this.ttsProvider.configurationError},runtime:this.runtime}
  }

  async transcribe(input,accountId=null,signal) {
    const requestId=randomUUID(),started=Date.now();let stage='audio_validation',audio,providerInvoked=false
    const diagnostic=(success,extra={})=>({route:'/api/ai/audio/transcriptions',requestId,...this.runtime,provider:this.provider?.name??'none',model:this.provider?.model??null,mimeType:audio?.mimeType??null,bytes:audio?.buffer.length??null,stage,elapsedMs:Date.now()-started,providerInvoked,success,...extra})
    try {
      audio=validateAudio(input);stage='configuration'
      if (!this.provider?.transcribeAudio) throw new AudioTranscriptionError('语音转写服务尚未配置，请改用文字记录', 503, 'ASR_NOT_CONFIGURED')
      if(this.provider.configurationError)throw new AudioTranscriptionError('语音服务配置异常，请继续文字记录',503,'ASR_CONFIGURATION_INVALID')
      stage='call_limit'
      if(accountId){const now=Date.now();for(const [id,c] of this.calls)if(now-c.started>=3600000)this.calls.delete(id);const count=this.calls.get(accountId)??{started:now,count:0};if(count.count>=this.maxCallsPerHour)throw new AudioTranscriptionError('本小时转写次数已达上限，请继续文字记录',429,'ASR_CALL_LIMIT');count.count++;this.calls.set(accountId,count)}
      if(signal?.aborted)throw new AudioTranscriptionError('已取消转写',499,'ASR_CANCELLED')
      stage='provider';providerInvoked=true
      const result = await withAIAccount(accountId,()=>this.provider.transcribeAudio(audio,signal))
      stage='transcript_validation'
      const transcript = typeof result?.transcript === 'string' ? result.transcript.trim() : ''
      if (!transcript) throw new AudioTranscriptionError('未识别到可用语音，请重试或改用文字', 422, 'ASR_NO_SPEECH')
      stage='complete';this.logger.info('[Hoooho AI] audio request',JSON.stringify(diagnostic(true,{supplierRequestSent:result.diagnostics?.supplierRequestSent??null,supplierRequestId:result.diagnostics?.requestId??null,httpStatus:200})))
      return { transcript, provider: this.provider.name, model: result.model ?? null,requestId,runtime:this.runtime,...(result.diagnostics?{diagnostics:result.diagnostics}:{}) }
    } catch (error) {
      const failure=error instanceof AudioTranscriptionError?error:new MedicalSummaryError('语音转写暂时不可用，录音未保存，请稍后重试或改用文字',typeof error?.code==='string'&&error.code.startsWith('ASR_')?error.code:'ASR_UPSTREAM_UNAVAILABLE',error)
      if(['ASR_BUSY','ASR_CALL_LIMIT','ASR_BAILIAN_RATE_LIMIT'].includes(failure.code))failure.status=429
      if(failure.code==='ASR_CANCELLED')failure.status=499
      failure.details={requestId}
      this.logger.warn('[Hoooho AI] audio request',JSON.stringify(diagnostic(false,{code:failure.code,httpStatus:failure.status,supplierRequestSent:error?.supplierRequestSent??false,supplierRequestId:failure.upstream?.requestId??null,transportCode:failure.failureCodes?.transportCode??null})))
      throw failure
    }
  }
}
