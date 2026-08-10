import { buildHealthEventOrganizerInput, healthEventOrganizerInstructions, healthAIOutputSchema } from '../ai-prompt.mjs'
import { normalizeHealthAIOutput } from '../ai-types.mjs'

function readOutputText(response) {
  for (const output of response?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return ''
}

export class OpenAIProvider {
  name = 'openai'

  constructor(options = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    this.model = options.model ?? process.env.AI_MODEL ?? 'gpt-5-mini'
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  }

  async organize(rawInput) {
    if (!this.apiKey) throw Object.assign(new Error('AI 服务尚未配置'), { code: 'AI_NOT_CONFIGURED' })
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        instructions: healthEventOrganizerInstructions,
        input: buildHealthEventOrganizerInput(rawInput),
        text: {
          format: {
            type: 'json_schema',
            name: 'health_ai_output',
            strict: true,
            schema: healthAIOutputSchema
          }
        }
      }),
      signal: AbortSignal.timeout(20_000)
    })

    if (!response.ok) throw Object.assign(new Error('AI 整理暂时不可用'), { code: 'AI_PROVIDER_ERROR', status: response.status })
    const text = readOutputText(await response.json())
    if (!text) throw Object.assign(new Error('AI 未返回可用结果'), { code: 'EMPTY_AI_OUTPUT' })
    return normalizeHealthAIOutput(JSON.parse(text))
  }
}
