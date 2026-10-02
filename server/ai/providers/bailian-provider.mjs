import Ajv from 'ajv'
import { createHash } from 'node:crypto'
import { OpenAIProvider } from './openai-provider.mjs'
import { bailianConfiguration, configurationError } from './provider-config.mjs'
import { controlledCall } from './call-control.mjs'
import { readOpenAIErrorDetails, safeOpenAIErrorDetails, safeOpenAIFailureCodes } from './openai-error.mjs'

const validator = new Ajv({ strict: false, allowUnionTypes: true, allErrors: false })
const validators = new Map()
const tokenCount = value => Number.isInteger(value) && value >= 0 && value < 10000000 ? value : null
const messages = {
  authentication: '百炼鉴权失败，请检查后端新密钥与北京地域是否匹配；原内容仍保留',
  permission: '百炼业务空间或模型访问权限不足；原内容仍保留',
  model_not_found: '百炼模型不存在或未开通，请检查模型名和北京地域；原内容仍保留',
  free_quota_exhausted: '百炼免费额度已用尽，已停止调用，不会自动改用其他模型；原内容仍保留，仍可手动记录和导出',
  credit_balance: '百炼账户可用额度不足；已停止调用，仍可手动记录和导出',
  quota_unknown: '百炼使用额度已达限制，请查看控制台具体限额；原内容仍保留',
  rate_limit: '百炼请求过于频繁，请稍后重试；原内容仍保留',
  image_unavailable: '百炼无法读取图片，请重新选择可读图片；原内容仍保留',
}

// Reuse the existing organizer/summary prompts and factual validators. Only the
// transport boundary changes: our internal Responses-shaped contract becomes
// a Bailian Chat Completions request; no /responses request is sent to Bailian.
export class BailianProvider extends OpenAIProvider {
  name = 'bailian'
  constructor(options = {}) {
    const config = bailianConfiguration(options)
    super({ ...options, apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl })
    this.visionModel = config.visionModel
    this.config = config
    this.requestTimeoutMs = config.timeoutMs
    this.logger = options.logger ?? console
    const transport = options.fetchImpl ?? fetch
    this.fetch = async (url, init = {}) => {
      if (url !== `${config.baseUrl}/responses`) throw configurationError('百炼文字模型不能代替语音识别或朗读服务', 'AI_MODALITY_NOT_CONFIGURED')
      const body = JSON.parse(init.body)
      const format = body.text?.format
      if (format?.type !== 'json_schema' || !format.schema) throw configurationError('整理任务缺少输出结构定义', 'AI_OUTPUT_INVALID')
      const input = typeof body.input === 'string' ? [{ role: 'user', content: [{ type: 'input_text', text: body.input }] }] : body.input
      if (!Array.isArray(input)) throw configurationError('整理任务输入格式无效', 'AI_INPUT_INVALID')
      let imageCount = 0, characters = (body.instructions ?? '').length
      const conversation = input.map(item => {
        if (item.role !== 'user') throw configurationError('资料不能设置系统指令或工具角色', 'AI_INPUT_INVALID')
        return { role: 'user', content: item.content.map(part => {
          if (part.type === 'input_text' && typeof part.text === 'string') { characters += part.text.length; return { type: 'text', text: part.text } }
          if (part.type === 'input_image' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(part.image_url ?? '') && part.image_url.length <= 21 * 1024 * 1024) { imageCount++; return { type: 'image_url', image_url: { url: part.image_url } } }
          throw configurationError('百炼仅接收本次上传的图片；PDF 须先在服务端逐页转图，不能使用公开外链', 'AI_IMAGE_INPUT_INVALID')
        }) }
      })
      if (imageCount > config.maxImages || characters > config.maxInputCharacters) throw configurationError('资料超过单次 AI 输入限制，请分批处理；原文未截断', 'AI_INPUT_LIMIT')
      const model = imageCount ? config.visionModel : config.model
      const task = imageCount ? (format.name === 'health_image_analysis' ? 'image-analysis' : 'document-page') : format.name === 'hoooho_medical_summary' ? 'medical-summary' : format.name === 'health_ai_output' ? 'health-organization' : 'draft-extraction'
      const started = Date.now()
      let upstream
      return controlledCall(async () => {
        try {
          const response = await transport(`${config.baseUrl}/chat/completions`, {
            method: 'POST', redirect: 'error',
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(config.timeoutMs)]) : AbortSignal.timeout(config.timeoutMs),
            body: JSON.stringify({ model, messages: [{ role: 'system', content: body.instructions ?? '' }, ...conversation],
              stream: false, enable_thinking: false, max_tokens: Math.min(config.maxOutputTokens, body.max_output_tokens ?? config.maxOutputTokens),
              response_format: { type: 'json_schema', json_schema: { name: format.name, strict: true, schema: format.schema } } }),
          })
          if (!response.ok) {
            upstream = await readOpenAIErrorDetails(response)
            const message = messages[upstream.failureKind] ?? '百炼整理服务暂不可用；原内容与旧摘要仍保留'
            throw Object.assign(configurationError(message, `AI_BAILIAN_${upstream.failureKind.toUpperCase()}`), { upstream, publicAIMessage: message })
          }
          let result
          try { result = await response.json() } catch { throw configurationError('百炼返回格式无效；原内容未更新', 'AI_OUTPUT_INVALID') }
          upstream = safeOpenAIErrorDetails({ httpStatus: response.status, requestId: response.headers?.get('x-request-id') ?? response.headers?.get('x-dashscope-request-id') ?? result.request_id, retryAfter: response.headers?.get('retry-after') })
          const choice = result.choices?.[0]
          if (choice?.finish_reason === 'length') throw configurationError('百炼输出达到长度上限，请缩小资料范围；原内容未更新', 'AI_OUTPUT_INCOMPLETE')
          if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw configurationError('这份资料暂不能识别，仍可手动记录', 'AI_REFUSAL')
          if (choice?.finish_reason !== 'stop' || choice?.message?.tool_calls || typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw configurationError('没有获得完整可用的百炼结果；原内容未更新', 'AI_OUTPUT_EMPTY')
          let value
          try { value = JSON.parse(choice.message.content) } catch { throw configurationError('百炼输出不是有效 JSON；原内容未更新', 'AI_OUTPUT_INVALID') }
          const schemaKey = createHash('sha256').update(JSON.stringify(format.schema)).digest('hex')
          let validate = validators.get(schemaKey)?.validate
          if (!validate) {
            if (validators.size >= 32) { const [key, cached] = validators.entries().next().value; validator.removeSchema(cached.schema); validators.delete(key) }
            validate = validator.compile(format.schema); validators.set(schemaKey, { validate, schema: format.schema })
          }
          if (!validate(value)) throw configurationError('百炼输出未通过结构校验；原内容未更新', 'AI_OUTPUT_INVALID')
          const diagnostics = { provider: this.name, model, task, elapsedMs: Date.now() - started, inputTokens: tokenCount(result.usage?.prompt_tokens), outputTokens: tokenCount(result.usage?.completion_tokens), requestId: upstream.requestId, success: true }
          this.logger.info('[Hoooho AI] provider usage', diagnostics)
          return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
            usage: { input_tokens: diagnostics.inputTokens, output_tokens: diagnostics.outputTokens }, diagnostics }, { headers: upstream.requestId ? { 'x-request-id': upstream.requestId } : {} })
        } catch (error) {
          const codes = safeOpenAIFailureCodes(error)
          const safe = error?.code?.startsWith('AI_') ? error : configurationError(codes.transportCode === 'TIMEOUT' || codes.transportCode === 'ABORTED' ? '百炼请求超时或已取消；原内容与旧摘要仍保留' : '百炼连接暂不可用；原内容与旧摘要仍保留', codes.transportCode === 'TIMEOUT' ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR')
          if (upstream) safe.upstream = upstream
          this.logger.warn('[Hoooho AI] provider failed', { provider: this.name, model, task, elapsedMs: Date.now() - started, success: false, ...upstream, ...codes, code: safe.code })
          throw safe
        }
      }, options.env)
    }
  }
  transcribeAudio() { throw configurationError('qwen3.7-plus 不是语音识别模型，请配置独立 ASR', 'ASR_NOT_CONFIGURED') }
}
