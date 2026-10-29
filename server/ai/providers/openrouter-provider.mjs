import Ajv from 'ajv'
import { createHash } from 'node:crypto'
import { OpenAIProvider } from './openai-provider.mjs'
import { openRouterConfiguration, configurationError } from './provider-config.mjs'
import { controlledCall } from './call-control.mjs'
import { linkedAISignal, traceMetadata } from './telemetry.mjs'
import { readOpenAIErrorDetails, safeOpenAIErrorDetails, safeOpenAIFailureCodes } from './openai-error.mjs'
import { outputFailure, schemaFailureDiagnostic } from './output-diagnostics.mjs'
import { readablePreview, quarantinePreview } from './readable-preview.mjs'
import { syntheticEvidenceProof, safeSyntheticStage } from '../business/synthetic-evidence-proof.mjs'

const validator = new Ajv({ strict: false, allowUnionTypes: true, allErrors: false })
const validators = new Map()
const tokenCount = value => Number.isInteger(value) && value >= 0 && value < 10000000 ? value : null
const failures = {
  400: ['AI_OPENROUTER_INPUT_UNSUPPORTED', '所选模型未接受本次输入或结构化参数，请核对模型能力；原内容保留'],
  401: ['AI_OPENROUTER_AUTHENTICATION', 'OpenRouter 鉴权失败，请检查后端 API Key；原内容保留'],
  402: ['AI_OPENROUTER_CREDIT_BALANCE', 'OpenRouter 可用额度不足，请补充额度后主动重试；原内容保留'],
  403: ['AI_OPENROUTER_PERMISSION', 'OpenRouter 拒绝模型访问，请核对账号、地区和模型权限；原内容保留'],
  404: ['AI_OPENROUTER_MODEL_UNAVAILABLE', 'OpenRouter 模型或可用端点不存在，请核对模型 ID；原内容保留'],
  429: ['AI_OPENROUTER_RATE_LIMIT', 'OpenRouter 请求达到限额，请稍后主动重试；原内容保留'],
}
function upstreamFailure(status, upstream) {
  const [code, message] = failures[status] ?? ['AI_OPENROUTER_UNAVAILABLE', 'OpenRouter 暂不可用；原内容与已有草稿保留']
  return Object.assign(configurationError(message, code), { upstream, ...(status === 429 ? { status: 429 } : {}) })
}

// The superclass supplies existing prompts and factual validators only. Every
// request is intercepted here and sent exclusively to OpenRouter's official
// Chat Completions endpoint; no OpenAI key, endpoint or SDK call is used.
export class OpenRouterProvider extends OpenAIProvider {
  name = 'openrouter'
  constructor(options = {}) {
    const config = openRouterConfiguration(options)
    super({ ...options, apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl })
    this.config = config
    this.visionModel = config.visionModel
    this.requestTimeoutMs = config.timeoutMs
    this.logger = options.logger ?? console
    const transport = options.fetchImpl ?? fetch
    this.fetch = async (url, init = {}) => {
      if (url !== `${config.baseUrl}/responses`) throw configurationError('OpenRouter 此接入仅用于文字与图片整理；语音使用独立配置', 'AI_MODALITY_NOT_CONFIGURED')
      let body
      try { body = JSON.parse(init.body) } catch { throw configurationError('整理任务输入格式无效', 'AI_INPUT_INVALID') }
      const format = body?.text?.format
      if (format?.type !== 'json_schema' || !format.schema) throw configurationError('整理任务缺少输出结构定义', 'AI_OUTPUT_INVALID')
      if (body.instructions !== undefined && typeof body.instructions !== 'string') throw configurationError('整理任务指令格式无效', 'AI_INPUT_INVALID')
      if (body.model && ![config.model, config.visionModel].includes(body.model)) throw configurationError('本次模型与后端 OpenRouter 配置不一致', 'AI_MODEL_INVALID')
      const input = typeof body.input === 'string' ? [{ role: 'user', content: [{ type: 'input_text', text: body.input }] }] : body.input
      if (!Array.isArray(input)) throw configurationError('整理任务输入格式无效', 'AI_INPUT_INVALID')
      let imageCount = 0, characters = (body.instructions ?? '').length
      const conversation = input.map(item => {
        if (item?.role !== 'user' || !Array.isArray(item.content)) throw configurationError('资料不能设置系统指令或工具角色', 'AI_INPUT_INVALID')
        return { role: 'user', content: item.content.map(part => {
          if (part?.type === 'input_text' && typeof part.text === 'string') {
            characters += part.text.length
            return { type: 'text', text: part.text }
          }
          if (part?.type === 'input_image' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(part.image_url ?? '') && part.image_url.length <= 21 * 1024 * 1024) {
            imageCount++
            return { type: 'image_url', image_url: { url: part.image_url } }
          }
          throw configurationError('OpenRouter 仅接收本次上传的内联图片；PDF 须逐页转图，不接受公开外链', 'AI_IMAGE_INPUT_INVALID')
        }) }
      })
      if (imageCount > config.maxImages || characters > config.maxInputCharacters) throw configurationError('资料超过单次 AI 输入限制，请分批处理；原文未截断', 'AI_INPUT_LIMIT')
      const model = imageCount ? config.visionModel : body.model ?? config.model
      const task = typeof init.task === 'string' && /^[a-z][a-z-]{0,79}$/.test(init.task) ? init.task : 'structured-output'
      const signal = linkedAISignal(init.signal)
      signal?.throwIfAborted()
      const started = Date.now()
      let upstream, preview
      return controlledCall(async ({ queueWaitMs }) => {
        try {
          signal?.throwIfAborted()
          const response = await transport(`${config.baseUrl}/chat/completions`, {
            method: 'POST', redirect: 'error',
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]) : AbortSignal.timeout(config.timeoutMs),
            body: JSON.stringify({
              model, messages: [{ role: 'system', content: body.instructions ?? '' }, ...conversation],
              stream: false,
              max_tokens: Math.min(config.maxOutputTokens, Number.isInteger(body.max_output_tokens) && body.max_output_tokens > 0 ? body.max_output_tokens : config.maxOutputTokens),
              ...(Number.isFinite(body.temperature) && body.temperature >= 0 && body.temperature < 2 ? { temperature: body.temperature } : {}),
              response_format: { type: 'json_schema', json_schema: { name: format.name, strict: true, schema: format.schema } },
              // Do not drop unsupported parameters, add model fallbacks, retry,
              // or let another provider attempt a failed request invisibly.
              provider: { require_parameters: true, allow_fallbacks: false },
            }),
          })
          if (!response.ok) {
            upstream = await readOpenAIErrorDetails(response)
            throw upstreamFailure(response.status, upstream)
          }
          upstream = safeOpenAIErrorDetails({ httpStatus: response.status, requestId: response.headers?.get('x-request-id') })
          let result
          try { result = await response.json() } catch { throw outputFailure('OpenRouter 返回格式无效；原内容未更新', 'response_unpack', '/', 'invalid_json') }
          if (!result || typeof result !== 'object' || Array.isArray(result)) throw outputFailure('OpenRouter 响应结构无效；原内容未更新', 'response_unpack', '/', 'invalid_envelope')
          // OpenRouter can return an error envelope after accepting a request.
          // It is never a successful model result, even with HTTP 200.
          if (result.error) throw upstreamFailure(Number(result.error.code), upstream)
          upstream = safeOpenAIErrorDetails({ httpStatus: response.status, requestId: response.headers?.get('x-request-id') ?? result.id })
          const choice = result.choices?.[0]
          if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw configurationError('这份资料暂不能识别，原内容保留，仍可手动记录', 'AI_REFUSAL')
          if (!choice?.message?.tool_calls) {
            preview = readablePreview(choice?.message?.content, { provider: this.name, model, requestId: upstream.requestId, inputTokens: tokenCount(result.usage?.prompt_tokens), outputTokens: tokenCount(result.usage?.completion_tokens) })
            if (preview && typeof init.onReadableOutput === 'function') init.onReadableOutput(preview)
          }
          if (init.syntheticEvidence === syntheticEvidenceProof && typeof init.onSyntheticOutput === 'function') {
            const evidence = safeSyntheticStage({ task, content: choice?.message?.content, requestId: upstream.requestId, inputTokens: tokenCount(result.usage?.prompt_tokens), outputTokens: tokenCount(result.usage?.completion_tokens) })
            if (evidence) init.onSyntheticOutput(evidence)
          }
          if (choice?.finish_reason === 'length') throw outputFailure('OpenRouter 输出达到长度上限，请缩小资料范围；原内容未更新', 'output_truncation', '/choices/0/finish_reason', 'length_limit', 'AI_OUTPUT_INCOMPLETE')
          if (choice?.finish_reason !== 'stop' || choice.message?.tool_calls || typeof choice.message?.content !== 'string' || !choice.message.content.trim()) throw outputFailure('没有获得完整可用的 OpenRouter 结果；原内容未更新', 'response_unpack', '/choices/0/message/content', 'missing_content', 'AI_OUTPUT_EMPTY')
          let value
          try { value = JSON.parse(choice.message.content) } catch { throw outputFailure('OpenRouter 输出不是有效 JSON；原内容未更新', 'json_parse', '/choices/0/message/content', 'invalid_json') }
          const key = createHash('sha256').update(JSON.stringify(format.schema)).digest('hex')
          let validate = validators.get(key)?.validate
          if (!validate) {
            if (validators.size >= 32) { const [oldKey, cached] = validators.entries().next().value; validator.removeSchema(cached.schema); validators.delete(oldKey) }
            validate = validator.compile(format.schema)
            validators.set(key, { validate, schema: format.schema })
          }
          if (!validate(value)) {
            const d = schemaFailureDiagnostic(format.schema, validate.errors?.[0])
            throw outputFailure('OpenRouter 输出未通过结构校验；原内容未更新', d.stage, d.fieldPath, d.reason)
          }
          const diagnostics = { ...traceMetadata(), queueWaitMs, provider: this.name, model, task, elapsedMs: Date.now() - started, inputTokens: tokenCount(result.usage?.prompt_tokens), outputTokens: tokenCount(result.usage?.completion_tokens), requestId: upstream.requestId, success: true }
          this.logger.info('[Hoooho AI] provider usage', JSON.stringify(diagnostics))
          return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: diagnostics.inputTokens, output_tokens: diagnostics.outputTokens }, diagnostics })
        } catch (error) {
          const codes = safeOpenAIFailureCodes(error)
          const safe = typeof error?.code === 'string' && error.code.startsWith('AI_') ? error : configurationError(codes.transportCode === 'TIMEOUT' || codes.transportCode === 'ABORTED' ? 'OpenRouter 请求超时或已取消；原内容与旧稿保留' : 'OpenRouter 连接暂不可用；原内容与旧稿保留', codes.transportCode === 'TIMEOUT' ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR')
          if (upstream) safe.upstream = upstream
          if (preview && safe.validation) Object.defineProperty(safe, 'preview', { value: quarantinePreview(preview, safe.validation), enumerable: false })
          this.logger.warn('[Hoooho AI] provider failed', JSON.stringify({ ...traceMetadata(), queueWaitMs, provider: this.name, model, task, elapsedMs: Date.now() - started, success: false, ...upstream, ...codes, code: safe.code, ...(safe.validation ? { validation: safe.validation } : {}) }))
          throw safe
        }
      }, options.env)
    }
  }
  transcribeAudio() { throw configurationError('此 OpenRouter 接入不提供语音识别，请保留独立 ASR 配置', 'ASR_NOT_CONFIGURED') }
}
