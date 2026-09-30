import { OpenAIProvider } from './providers/openai-provider.mjs'
import { safeOpenAIErrorDetails, safeOpenAIFailureCodes } from './providers/openai-error.mjs'

export class MedicalSummaryError extends Error {
  constructor(message, code = 'AI_MEDICAL_SUMMARY_UNAVAILABLE', cause = null) {
    const upstream = cause ? safeOpenAIErrorDetails(cause.upstream ?? { httpStatus: cause.status }) : null
    const failureCodes = safeOpenAIFailureCodes(cause)
    const safeCause = upstream ? Object.assign(new Error('AI upstream request failed'), { upstream, ...failureCodes }) : null
    super(message, safeCause ? { cause: safeCause } : undefined)
    this.status = 503
    this.code = code
    if (upstream) {
      this.upstream = upstream
      this.failureCodes = failureCodes
    }
  }
}

export class MedicalSummaryService {
  constructor(options = {}) {
    this.logger = options.logger ?? console
    this.provider = Object.prototype.hasOwnProperty.call(options, 'provider')
      ? options.provider
      : (process.env.OPENAI_API_KEY ? new OpenAIProvider(options) : null)
  }

  async generate(summary) {
    if (!this.provider) {
      throw new MedicalSummaryError('AI 病情摘要服务尚未配置，请稍后重试。', 'AI_MEDICAL_SUMMARY_NOT_CONFIGURED')
    }
    try {
      const result = await this.provider.summarizeMedicalPreparation(summary)
      return {
        ...result,
        provider: this.provider.name,
        model: this.provider.model
      }
    } catch (error) {
      const failure = new MedicalSummaryError('AI 病情摘要暂时没有生成成功，请稍后重试。', 'AI_MEDICAL_SUMMARY_UNAVAILABLE', error)
      this.logger.warn('[Hoooho AI] medical summary failed', { ...failure.upstream, ...failure.failureCodes })
      throw failure
    }
  }
}
