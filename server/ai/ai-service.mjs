import { assertRawInput, normalizeOrganizedHealthData } from './ai-types.mjs'
import { LocalFactProvider } from './providers/local-fact-provider.mjs'
import { OpenAIProvider } from './providers/openai-provider.mjs'

export class AIService {
  constructor(options = {}) {
    this.fallbackProvider = options.fallbackProvider ?? new LocalFactProvider()
    this.primaryProvider = options.primaryProvider ?? (process.env.OPENAI_API_KEY ? new OpenAIProvider(options) : null)
  }

  async organizeHealthRecord(rawInput) {
    const input = assertRawInput(rawInput)
    if (this.primaryProvider) {
      try {
        return {
          provider: this.primaryProvider.name,
          organizedHealthData: normalizeOrganizedHealthData(await this.primaryProvider.organize(input))
        }
      } catch (error) {
        console.warn('[Hoooho AI] primary provider failed, using conservative fallback', error?.code ?? error?.message)
      }
    }
    return {
      provider: this.fallbackProvider.name,
      organizedHealthData: normalizeOrganizedHealthData(await this.fallbackProvider.organize(input))
    }
  }
}
