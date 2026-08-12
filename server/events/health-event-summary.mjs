const diagnosisPatterns = [
  /甲型流感/, /乙型流感/, /流感/, /新型冠状病毒感染|新冠/, /肺炎/, /支气管炎/, /扁桃体炎/
]

const evidenceLabels = {
  symptom: '症状记录',
  temperature: '体温记录',
  medication: '用药记录',
  visit: '就诊记录',
  examination: '检查结果',
  concern: '关注记录',
  status_change: '状态变化'
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function factTime(fact, record, fallback) {
  return fact.time?.resolvedStart ?? record?.occurredAt ?? fallback
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function findDiagnosis(facts) {
  const candidates = facts.filter(({ fact }) => fact.type === 'examination' || fact.type === 'visit')
  for (const { fact } of candidates) {
    const text = `${fact.name ?? ''} ${fact.sourceText ?? ''}`
    const diagnosis = diagnosisPatterns.find((pattern) => pattern.test(text))?.exec(text)?.[0]
    if (diagnosis) return diagnosis
  }
  return null
}

function buildTitle(facts) {
  const diagnosis = findDiagnosis(facts)
  if (diagnosis) return diagnosis
  const symptoms = unique(facts.filter(({ fact }) => fact.type === 'symptom').map(({ fact }) => fact.name))
  const hasFever = symptoms.some((name) => /发热|发烧|高烧|低烧/.test(name))
  const normalized = symptoms.filter((name) => !/症状好转|感冒表现/.test(name))
  if (hasFever) {
    const companion = normalized.find((name) => !/发热|发烧|高烧|低烧/.test(name))
    return companion ? `发热伴${companion}` : '发热'
  }
  if (normalized[0]) return normalized.slice(0, 2).join('伴').slice(0, 24)
  if (facts.some(({ fact }) => fact.type === 'temperature')) return '体温变化'
  if (facts.some(({ fact }) => fact.type === 'medication')) return '用药记录'
  if (facts.some(({ fact }) => fact.type === 'examination')) return '检查记录'
  if (facts.some(({ fact }) => fact.type === 'visit')) return '就诊记录'
  return '健康情况'
}

function buildSummary(facts, records, event) {
  const chronological = [...facts].sort((left, right) => (
    factTime(left.fact, left.record, left.organization.createdAt)
      .localeCompare(factTime(right.fact, right.record, right.organization.createdAt))
  ))
  const start = chronological[0]
  const startDate = formatDate(start
    ? factTime(start.fact, start.record, start.organization.createdAt)
    : event.startTime)
  const symptoms = unique(facts.filter(({ fact }) => fact.type === 'symptom')
    .map(({ fact }) => fact.name)
    .filter((name) => !/症状好转|感冒表现/.test(name)))
  const temperatures = facts.filter(({ fact }) => fact.type === 'temperature' && fact.temperature)
    .flatMap(({ fact }) => [fact.temperature.min, fact.temperature.max])
    .filter(Number.isFinite)
  const maxTemperature = temperatures.length ? Math.max(...temperatures) : null
  const diagnosis = findDiagnosis(facts)
  const medications = unique(facts.filter(({ fact }) => fact.type === 'medication').map(({ fact }) => fact.name))
  const visits = unique(facts.filter(({ fact }) => fact.type === 'visit').map(({ fact }) => fact.name))
  const changes = facts.filter(({ fact }) => fact.type === 'status_change').map(({ fact }) => fact.change)

  const sentences = []
  const opening = [startDate ? `${startDate}开始记录` : '本次事件记录了', symptoms.slice(0, 3).join('、')]
    .filter(Boolean).join('')
  if (opening) sentences.push(`${opening}。`)
  if (maxTemperature !== null) sentences.push(`记录最高体温${maxTemperature}℃。`)
  if (diagnosis) sentences.push(`后续检查或就诊信息提示${diagnosis}。`)
  else if (visits.length) sentences.push('已记录相关就诊信息。')
  if (medications.length) sentences.push(`期间记录用药：${medications.slice(0, 2).join('、')}。`)
  if (changes.includes('improved')) sentences.push('后续记录显示症状有所好转。')
  else if (changes.includes('worsened')) sentences.push('后续记录显示症状有所加重。')
  else if (changes.includes('persistent')) sentences.push('后续记录显示症状仍在持续。')
  if (event.status === 'recovered') sentences.push('当前事件已标记为康复。')
  return sentences.join('').slice(0, 600)
}

export function buildHealthEventSummary({ event, records, organizations, now = new Date() }) {
  const recordsById = new Map(records.map((record) => [record.id, record]))
  const facts = organizations.flatMap((organization) => (
    (organization.healthAIOutput?.facts ?? []).map((fact) => ({
      organization,
      record: recordsById.get(organization.recordId),
      fact
    }))
  ))
  if (!facts.length) return null

  const updatedAt = organizations.reduce(
    (latest, organization) => organization.updatedAt > latest ? organization.updatedAt : latest,
    event.eventSummary?.systemGenerated?.updatedAt ?? now.toISOString()
  )
  const systemGenerated = {
    title: buildTitle(facts),
    summary: buildSummary(facts, records, event),
    evidence: unique(facts.map(({ fact }) => evidenceLabels[fact.type])).slice(0, 6),
    updatedAt
  }
  const userCorrection = event.eventSummary?.userCorrection ?? null
  const displayedResult = userCorrection
    ? {
        title: userCorrection.title,
        summary: userCorrection.summary,
        evidence: systemGenerated.evidence,
        updatedAt,
        source: 'user_corrected'
      }
    : { ...systemGenerated, source: 'system' }

  return {
    systemGenerated,
    userCorrection,
    displayedResult,
    hasNewEvidenceAfterCorrection: Boolean(userCorrection && updatedAt > userCorrection.updatedAt)
  }
}

export function correctHealthEventSummary(eventSummary, input, now = new Date()) {
  if (!eventSummary?.systemGenerated) throw new Error('当前事件尚未生成摘要')
  const title = typeof input?.title === 'string' ? input.title.trim() : ''
  const summary = typeof input?.summary === 'string' ? input.summary.trim() : ''
  if (!title || title.length > 120) throw new Error('事件名称应为 1–120 个字符')
  if (!summary || summary.length > 1000) throw new Error('摘要应为 1–1000 个字符')
  const updatedAt = now.toISOString()
  const userCorrection = { title, summary, updatedAt }
  return {
    ...eventSummary,
    userCorrection,
    displayedResult: {
      title,
      summary,
      evidence: eventSummary.systemGenerated.evidence,
      updatedAt,
      source: 'user_corrected'
    },
    hasNewEvidenceAfterCorrection: false
  }
}
