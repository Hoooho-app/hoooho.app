import { OpenAIProvider } from './providers/openai-provider.mjs'

export class MedicalSummaryError extends Error {
  constructor(message, code = 'AI_MEDICAL_SUMMARY_UNAVAILABLE', cause = null) {
    super(message, cause ? { cause } : undefined)
    this.status = 503
    this.code = code
  }
}

export class MedicalSummaryService {
  constructor(options = {}) {
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
      throw new MedicalSummaryError('AI 病情摘要暂时没有生成成功，请稍后重试。', 'AI_MEDICAL_SUMMARY_UNAVAILABLE', error)
    }
  }
}
