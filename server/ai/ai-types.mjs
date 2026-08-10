const maxTextLength = 500

export const HEALTH_PARSER_VERSION = '1.1.0'
export const HEALTH_PROMPT_VERSION = 'health-facts-v2-status-change'
export const HEALTH_FACT_TYPES = ['symptom', 'temperature', 'medication', 'visit', 'examination', 'concern', 'status_change']
export const HEALTH_STATUS_CHANGES = ['improved', 'worsened', 'persistent']
export const HEALTH_TIME_PRECISIONS = ['exact', 'period', 'day', 'month', 'year', 'fuzzy', 'unknown']
export const HEALTH_TIME_SOURCES = ['user_text', 'selected_time', 'document']

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().slice(0, maxTextLength) : ''
}

function normalizeNullableText(value) {
  return normalizeText(value) || null
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
  const min = Number(value.min ?? value.value)
  const max = Number(value.max ?? value.min ?? value.value)
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

function normalizeConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0.5
  return Math.min(1, Math.max(0, number))
}

function normalizeFactTime(value) {
  const source = value && typeof value === 'object' ? value : {}
  const precision = HEALTH_TIME_PRECISIONS.includes(source.precision) ? source.precision : 'unknown'
  return {
    raw: normalizeNullableText(source.raw),
    resolvedStart: normalizeNullableText(source.resolvedStart),
    resolvedEnd: normalizeNullableText(source.resolvedEnd),
    precision,
    source: HEALTH_TIME_SOURCES.includes(source.source) ? source.source : 'user_text'
  }
}

function normalizeTimeConflict(value) {
  const source = value && typeof value === 'object' ? value : {}
  const conflict = source.conflict && typeof source.conflict === 'object' ? source.conflict : null
  if (!source.hasConflict || !conflict) return { hasConflict: false, conflict: null }
  const selected = normalizeText(conflict.selected)
  const mentioned = normalizeText(conflict.mentioned)
  if (!selected || !mentioned) return { hasConflict: false, conflict: null }
  return { hasConflict: true, conflict: { type: 'time_conflict', selected, mentioned } }
}

function normalizeHealthFact(value, index) {
  const source = value && typeof value === 'object' ? value : {}
  if (!HEALTH_FACT_TYPES.includes(source.type)) return null
  const name = normalizeText(source.name ?? source.content)
  if (!name) return null
  const temperature = source.type === 'temperature' ? normalizeTemperature(source.temperature ?? source) : null
  const target = source.type === 'status_change' ? normalizeNullableText(source.target) : null
  const change = source.type === 'status_change' && HEALTH_STATUS_CHANGES.includes(source.change) ? source.change : null
  if (source.type === 'status_change' && (!target || !change)) return null
  return {
    id: normalizeText(source.id) || `fact-${index + 1}`,
    type: source.type,
    name,
    bodyPart: normalizeNullableText(source.bodyPart),
    sourceText: normalizeText(source.sourceText) || name,
    time: normalizeFactTime(source.time),
    confidence: normalizeConfidence(source.confidence),
    ...(temperature ? { temperature } : {}),
    ...(source.type === 'status_change' ? { target, change } : {})
  }
}

export function emptyHealthAIOutput() {
  return {
    facts: [],
    confidence: 0,
    parserVersion: HEALTH_PARSER_VERSION,
    promptVersion: HEALTH_PROMPT_VERSION,
    timeConflict: { hasConflict: false, conflict: null }
  }
}

export function normalizeHealthAIOutput(value) {
  const source = value && typeof value === 'object' ? value : {}
  const facts = (Array.isArray(source.facts) ? source.facts : [])
    .map(normalizeHealthFact)
    .filter(Boolean)
    .slice(0, 50)
  return {
    facts,
    confidence: facts.length ? normalizeConfidence(source.confidence ?? Math.min(...facts.map((fact) => fact.confidence))) : 0,
    parserVersion: normalizeText(source.parserVersion) || HEALTH_PARSER_VERSION,
    promptVersion: normalizeText(source.promptVersion) || HEALTH_PROMPT_VERSION,
    timeConflict: normalizeTimeConflict(source.timeConflict)
  }
}

export function hasHealthFacts(value) {
  return normalizeHealthAIOutput(value).facts.length > 0
}

function legacyFact(fact) {
  return {
    content: fact.name,
    keywords: [...new Set([fact.name, fact.bodyPart].filter(Boolean))]
  }
}

export function projectOrganizedHealthData(value) {
  const output = normalizeHealthAIOutput(value)
  const factsByType = (type) => output.facts.filter((fact) => fact.type === type)
  const temperatures = factsByType('temperature').map((fact) => fact.temperature).filter(Boolean)
  const sourceSymptoms = factsByType('symptom')
  const symptomFacts = sourceSymptoms.length ? [{
    content: [...new Set(sourceSymptoms.map((fact) => fact.name))].join('、'),
    keywords: [...new Set(sourceSymptoms.flatMap((fact) => [fact.name, fact.bodyPart]).filter(Boolean))]
  }] : []
  if (temperatures.some((item) => item.max >= 37.3) && !symptomFacts.some((item) => item.content === '发热')) {
    symptomFacts.push({ content: '发热', keywords: ['发热'] })
  }
  const groupedTimeline = new Map()
  for (const fact of output.facts) {
    if (fact.type === 'status_change') continue
    if (!fact.time.raw) continue
    const item = groupedTimeline.get(fact.time.raw) ?? { time: fact.time.raw, content: [], relatedSymptoms: [] }
    item.content.push(fact.sourceText)
    if (fact.type === 'symptom') item.relatedSymptoms.push(fact.name)
    groupedTimeline.set(fact.time.raw, item)
  }
  return normalizeOrganizedHealthData({
    symptoms: symptomFacts,
    temperature: temperatures.length ? {
      min: Math.min(...temperatures.map((item) => item.min)),
      max: Math.max(...temperatures.map((item) => item.max)),
      unit: '℃'
    } : null,
    medications: factsByType('medication').map(legacyFact),
    visits: factsByType('visit').map(legacyFact),
    examinations: factsByType('examination').map(legacyFact),
    concerns: factsByType('concern').map(legacyFact),
    attachments: [],
    timeline: [...groupedTimeline.values()].map((item) => ({
      time: item.time.replace(/^(?:今天|昨天|前天)?(?:早上|上午|下午|晚上|夜里|夜间|凌晨|半夜)?\s*(\d{1,2})点(?:\s*(\d{1,2})分?)?.*$/, (_, hour, minute) => `${String(hour).padStart(2, '0')}:${String(minute ?? '00').padStart(2, '0')}`),
      content: [...new Set(item.content)].join('；'),
      relatedSymptoms: [...new Set(item.relatedSymptoms)]
    }))
  })
}

export function emptyOrganizedHealthData() {
  return {
    symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: []
  }
}

export function hasOrganizedHealthFacts(value) {
  const data = normalizeOrganizedHealthData(value)
  return Boolean(
    data.symptoms.length
    || data.temperature
    || data.medications.length
    || data.visits.length
    || data.examinations.length
    || data.concerns.length
    || data.attachments.length
  )
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
