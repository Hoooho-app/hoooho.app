const maxTextLength = 500

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().slice(0, maxTextLength) : ''
}

function normalizeKeywords(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normalizeText).filter(Boolean))].slice(0, 20)
}

function normalizeFacts(value) {
  if (!Array.isArray(value)) return []
  const facts = value.map((item) => {
    if (typeof item === 'string') return { content: normalizeText(item), keywords: [] }
    const source = item && typeof item === 'object' ? item : {}
    return { content: normalizeText(source.content), keywords: normalizeKeywords(source.keywords) }
  }).filter((item) => item.content)
  return facts.filter((item, index) => facts.findIndex((candidate) => candidate.content === item.content) === index).slice(0, 20)
}

function normalizeTemperature(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const numbers = value.match(/\d{2}(?:\.\d)?/g)?.map(Number) ?? []
    if (!numbers.length) return null
    return { min: numbers[0], max: numbers[1] ?? numbers[0], unit: '℃' }
  }
  if (Array.isArray(value)) return normalizeTemperature(value[0]?.content ?? value[0])
  if (typeof value !== 'object') return null
  const min = Number(value.min)
  const max = Number(value.max ?? value.min)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min: Math.min(min, max), max: Math.max(min, max), unit: '℃' }
}

function normalizeTimeline(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const source = item && typeof item === 'object' ? item : {}
    return {
      time: normalizeText(source.time),
      content: normalizeText(source.content),
      relatedSymptoms: normalizeKeywords(source.relatedSymptoms)
    }
  }).filter((item) => item.time && item.content).slice(0, 30)
}

export function emptyOrganizedHealthData() {
  return {
    symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: []
  }
}

export function normalizeOrganizedHealthData(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    symptoms: normalizeFacts(source.symptoms),
    temperature: normalizeTemperature(source.temperature),
    medications: normalizeFacts(source.medications ?? source.medication),
    visits: normalizeFacts(source.visits),
    examinations: normalizeFacts(source.examinations),
    concerns: normalizeFacts(source.concerns),
    attachments: [],
    timeline: normalizeTimeline(source.timeline)
  }
}

export function assertRawInput(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw Object.assign(new Error('原始健康描述不能为空'), { status: 400, code: 'EMPTY_RAW_INPUT' })
  if (text.length > 5000) throw Object.assign(new Error('原始健康描述不能超过 5000 个字符'), { status: 400, code: 'RAW_INPUT_TOO_LONG' })
  return text
}
