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

const imageAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category', 'summary', 'observedText', 'temperatureValue',
    'medicationName', 'examinationName', 'confidence'
  ],
  properties: {
    category: {
      type: 'string',
      enum: ['temperature', 'report', 'medication', 'prescription', 'receipt', 'body_photo', 'other']
    },
    summary: { type: 'string' },
    observedText: { type: 'string' },
    temperatureValue: { type: ['number', 'null'] },
    medicationName: { type: ['string', 'null'] },
    examinationName: { type: ['string', 'null'] },
    confidence: { type: 'number' }
  }
}

const imageAnalysisInstructions = `你负责把健康记录图片整理为可观察事实，不做诊断、不判断严重程度、不提供治疗建议。
只描述图片中直接可见或清晰可读的内容。药盒照片只表示“可见某药品”，不能推断用户已经服用。
身体照片只能描述图片类型或清晰可见的表面情况，不能给出疾病名称。无法可靠识别时 category 使用 other，summary 使用“图片记录”。`

export class OpenAIProvider {
  name = 'openai'

  constructor(options = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    this.model = options.model ?? process.env.AI_MODEL ?? 'gpt-5-mini'
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
    this.fetch = options.fetchImpl ?? fetch
  }

  async organize(rawInput) {
    if (!this.apiKey) throw Object.assign(new Error('AI 服务尚未配置'), { code: 'AI_NOT_CONFIGURED' })
    const response = await this.fetch(`${this.baseUrl}/responses`, {
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

  async analyzeImage(input) {
    if (!this.apiKey) throw Object.assign(new Error('AI 服务尚未配置'), { code: 'AI_NOT_CONFIGURED' })
    const response = await this.fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        instructions: imageAnalysisInstructions,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: `分析这张健康记录图片。文件名仅供参考：${input.name}` },
            { type: 'input_image', image_url: input.dataUrl, detail: 'auto' }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'health_image_analysis',
            strict: true,
            schema: imageAnalysisSchema
          }
        }
      }),
      signal: AbortSignal.timeout(30_000)
    })

    if (!response.ok) throw Object.assign(new Error('图片整理暂时不可用'), { code: 'VISION_PROVIDER_ERROR', status: response.status })
    const text = readOutputText(await response.json())
    if (!text) throw Object.assign(new Error('图片整理未返回可用结果'), { code: 'EMPTY_VISION_OUTPUT' })
    return JSON.parse(text)
  }
}
