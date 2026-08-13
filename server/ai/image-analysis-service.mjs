import { randomUUID } from 'node:crypto'
import { OpenAIProvider } from './providers/openai-provider.mjs'

export const IMAGE_ANALYSIS_CATEGORIES = [
  'temperature',
  'report',
  'medication',
  'prescription',
  'receipt',
  'body_photo',
  'other'
]

function cleanText(value, maxLength = 240) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeTemperature(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 30 && number <= 45 ? number : null
}

function createFact(type, name, attachment, now, extra = {}) {
  return {
    id: randomUUID(),
    type,
    name,
    bodyPart: null,
    sourceText: extra.sourceText ?? name,
    time: {
      raw: null,
      resolvedStart: attachment.createdAt ?? now.toISOString(),
      resolvedEnd: null,
      precision: 'exact',
      source: 'document'
    },
    confidence: extra.confidence ?? 0.8,
    ...(extra.temperature ? { temperature: extra.temperature } : {})
  }
}

export function normalizeImageAnalysis(value, attachment, providerName, now = new Date()) {
  const source = value && typeof value === 'object' ? value : {}
  const category = IMAGE_ANALYSIS_CATEGORIES.includes(source.category) ? source.category : 'other'
  const confidence = Math.min(1, Math.max(0, Number(source.confidence) || 0))
  const temperatureValue = normalizeTemperature(source.temperatureValue)
  const medicationName = cleanText(source.medicationName, 80)
  const examinationName = cleanText(source.examinationName, 100)
  const observedText = cleanText(source.observedText, 300)
  const facts = []

  if (temperatureValue !== null) {
    facts.push(createFact('temperature', `${temperatureValue}℃`, attachment, now, {
      confidence,
      temperature: { min: temperatureValue, max: temperatureValue, unit: '℃' }
    }))
  }
  if (category === 'report' && examinationName) {
    facts.push(createFact('examination', examinationName, attachment, now, { confidence }))
  }

  const fallbackSummaries = {
    temperature: temperatureValue === null ? '体温计照片' : `体温计显示 ${temperatureValue}℃`,
    report: examinationName ? `${examinationName}报告` : '检查报告',
    medication: medicationName ? `图片中可见药品“${medicationName}”` : '药品照片',
    prescription: '处方图片',
    receipt: '医院单据',
    body_photo: '身体部位照片',
    other: '图片记录'
  }

  return {
    status: 'completed',
    category,
    summary: cleanText(source.summary) || fallbackSummaries[category],
    observedText,
    medicationName: medicationName || null,
    examinationName: examinationName || null,
    temperatureValue,
    extractedFacts: facts,
    confidence,
    provider: providerName,
    sourceAttachmentId: attachment.id,
    analyzedAt: now.toISOString()
  }
}

export class ImageAnalysisService {
  constructor(options = {}) {
    this.provider = Object.prototype.hasOwnProperty.call(options, 'provider')
      ? options.provider
      : (process.env.OPENAI_API_KEY ? new OpenAIProvider(options) : null)
  }

  async analyze(attachment, now = new Date()) {
    if (!this.provider?.analyzeImage) {
      return {
        status: 'unavailable',
        category: 'other',
        summary: '图片记录',
        extractedFacts: [],
        provider: null,
        sourceAttachmentId: attachment.id,
        analyzedAt: now.toISOString(),
        errorCode: 'VISION_NOT_CONFIGURED'
      }
    }

    try {
      const result = await this.provider.analyzeImage({
        name: attachment.name,
        mimeType: attachment.mimeType,
        dataUrl: attachment.dataUrl
      })
      return normalizeImageAnalysis(result, attachment, this.provider.name, now)
    } catch (error) {
      console.warn('[Hoooho Vision] image analysis failed after attachment was saved', error?.code ?? error?.message)
      return {
        status: 'failed',
        category: 'other',
        summary: '图片记录',
        extractedFacts: [],
        provider: this.provider.name,
        sourceAttachmentId: attachment.id,
        analyzedAt: now.toISOString(),
        errorCode: error?.code ?? 'VISION_ANALYSIS_FAILED'
      }
    }
  }
}
