import { bailianConfiguration, boundedSetting, configurationError } from './provider-config.mjs'
import { controlledCall } from './call-control.mjs'
import { readOpenAIErrorDetails, safeOpenAIErrorDetails, safeOpenAIFailureCodes } from './openai-error.mjs'

const messages = {
  authentication: '百炼语音鉴权失败，请检查北京业务空间的模型权限；文字和图片仍可使用',
  permission: '当前百炼密钥没有语音模型访问权限，请在北京模型广场开通 qwen3-asr-flash；文字和图片仍可使用',
  model_not_found: '北京语音模型未开通或模型名无效；文字和图片仍可使用',
  free_quota_exhausted: '百炼语音免费额度已用尽，已停止转写；不会切换模型，仍可输入文字',
  credit_balance: '百炼语音可用额度不足，已停止转写；仍可输入文字',
  quota_unknown: '百炼语音额度已达限制，请查看语音模型额度；仍可输入文字',
  rate_limit: '语音转写请求过于频繁，请稍后手动重试或输入文字',
}
const count = value => Number.isInteger(value) && value >= 0 && value < 10000000 ? value : null

// Separate ASR protocol: no Responses, JSON schema, thinking, tools or TTS.
// Raw audio and transcript never enter logs or durable application storage.
export class BailianASRProvider {
  name = 'bailian'
  constructor(options = {}) {
    this.env = options.env ?? process.env
    this.config = bailianConfiguration(options)
    this.model = this.env.BAILIAN_ASR_MODEL ?? 'qwen3-asr-flash'
    if (!/^qwen3-asr-flash(?:-2025-09-08|-2026-02-10)?$/.test(this.model)) throw configurationError('BAILIAN_ASR_MODEL 必须是北京同步 Qwen3-ASR-Flash 模型，不可使用文字或异步模型', 'ASR_CONFIGURATION_INVALID')
    this.apiKey = this.config.apiKey
    this.transport = options.fetchImpl ?? fetch
    this.timeoutMs = boundedSetting(this.env, 'BAILIAN_ASR_TIMEOUT_MS', 60000, 1000, 120000)
    this.logger = options.logger ?? console
  }
  async transcribeAudio({ mimeType, buffer }, signal) {
    // Safari MP4 is decoded to PCM WAV in the browser. Official Qwen3-ASR
    // format table does not list MP4, so never relabel MP4 bytes as WAV.
    if (!['audio/wav','audio/x-wav','audio/webm','audio/mpeg'].includes(mimeType)) throw configurationError('请使用 WAV、WebM 或 MP3 录音；Safari 录音需先转换为 WAV', 'ASR_AUDIO_FORMAT_UNSUPPORTED')
    const data = `data:${mimeType === 'audio/x-wav' ? 'audio/wav' : mimeType};base64,${buffer.toString('base64')}`
    if (data.length > 10 * 1024 * 1024) throw configurationError('录音编码后超过百炼10 MB限制，请缩短录音', 'ASR_AUDIO_TOO_LARGE')
    const started = Date.now()
    let upstream, diagnostics
    if(signal?.aborted)throw configurationError('已取消语音转写','ASR_CANCELLED')
    try { return await controlledCall(async () => {
      try {
        const response = await this.transport(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
          body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data } }] }], stream: false, asr_options: { enable_itn: false } }),
        })
        upstream = safeOpenAIErrorDetails({httpStatus:response.status,requestId:response.headers.get('x-request-id')??response.headers.get('x-dashscope-request-id')})
        if (!response.ok) {
          upstream = await readOpenAIErrorDetails(response)
          throw configurationError(messages[upstream.failureKind] ?? '百炼语音转写暂不可用，原输入仍保留，请继续文字记录', `ASR_BAILIAN_${upstream.failureKind.toUpperCase()}`)
        }
        let result
        try { result = await response.json() } catch { throw configurationError('语音响应无法读取，请手动重试或输入文字', 'ASR_OUTPUT_INVALID') }
        upstream = safeOpenAIErrorDetails({...upstream,requestId:upstream.requestId??result?.request_id??result?.id})
        const choice = result?.choices?.[0], transcript = choice?.message?.content
        if (choice?.finish_reason === 'length') throw configurationError('语音转写未完整返回，请缩短录音；原输入仍保留', 'ASR_OUTPUT_INCOMPLETE')
        if (choice?.finish_reason !== 'stop' || choice?.message?.tool_calls || choice?.message?.refusal || typeof transcript !== 'string' || transcript.length > 15000) throw configurationError('语音结果格式不完整，未采用该结果，请手动重试', 'ASR_OUTPUT_INVALID')
        if (!transcript.trim()) throw configurationError('未识别到语音，请重新录音或继续输入文字', 'ASR_NO_SPEECH')
        diagnostics = {provider:this.name,model:this.model,task:'audio-transcription',elapsedMs:Date.now()-started,requestId:upstream.requestId,inputTokens:count(result.usage?.prompt_tokens),outputTokens:count(result.usage?.completion_tokens),audioSeconds:count(result.usage?.seconds),supplierRequestSent:true,success:true}
        this.logger.info('[Hoooho AI] provider usage', JSON.stringify(diagnostics))
        return {transcript:transcript.trim(),model:this.model,diagnostics}
      } catch (error) {
        const codes = safeOpenAIFailureCodes(error)
        const safe = typeof error?.code==='string' && /^(?:ASR_|AI_)/.test(error.code) ? error : signal?.aborted?configurationError('已取消语音转写','ASR_CANCELLED'):configurationError('百炼语音连接超时或暂不可用，请继续输入文字，原内容与结果仍保留',error?.name==='TimeoutError'?'ASR_TIMEOUT':'ASR_NETWORK_ERROR')
        safe.supplierRequestSent=true
        if (upstream) safe.upstream = upstream
        this.logger.warn('[Hoooho AI] provider failed', JSON.stringify({provider:this.name,model:this.model,task:'audio-transcription',elapsedMs:Date.now()-started,success:false,...upstream,...codes,code:safe.code}))
        throw safe
      }
    }, this.env) } catch(error) {
      if(['AI_CONCURRENCY_LIMIT','AI_ACCOUNT_CALL_LIMIT'].includes(error?.code))throw configurationError('语音服务繁忙或本小时次数已达上限，请稍后主动重试',error.code==='AI_CONCURRENCY_LIMIT'?'ASR_BUSY':'ASR_CALL_LIMIT')
      throw error
    }
  }
}
