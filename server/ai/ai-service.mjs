import { assertRawInput, normalizeHealthAIOutput, projectOrganizedHealthData } from './ai-types.mjs'
import { LocalFactProvider } from './providers/local-fact-provider.mjs'
import { createAIProvider } from './providers/provider-factory.mjs'
import { withAIAccount } from './providers/call-control.mjs'
import { TimeResolverService } from './time-resolver-service.mjs'
import { TimeContextResolver } from './time-context-resolver.mjs'

export class AIService {
  constructor(options = {}) {
    this.fallbackProvider = options.fallbackProvider ?? new LocalFactProvider()
    this.primaryProvider = options.primaryProvider ?? createAIProvider(options)
    this.timeResolver = options.timeResolver ?? new TimeResolverService()
    this.timeContextResolver = options.timeContextResolver ?? new TimeContextResolver({ timeResolver: this.timeResolver })
  }

  async organizeHealthRecord(rawInput, options = {}) {
    const input = assertRawInput(rawInput)
    let provider = this.fallbackProvider
    let result
    if (this.primaryProvider) {
      try {
        provider = this.primaryProvider
        result = await withAIAccount(options.accountId, () => provider.organize(input))
      } catch (error) {
        console.warn('[Hoooho AI] primary provider failed, using conservative fallback', error?.code ?? 'AI_PROVIDER_ERROR')
        provider = this.fallbackProvider
      }
    }
    if (!result) result = await provider.organize(input)
    const parsedOutput = normalizeHealthAIOutput(result)
    const healthAIOutput = normalizeHealthAIOutput(this.timeContextResolver.resolveHealthAIOutput(input, parsedOutput, options))
    return {
      provider: provider.name,
      healthAIOutput,
      organizedHealthData: projectOrganizedHealthData(healthAIOutput)
    }
  }
}
