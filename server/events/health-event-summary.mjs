import { isConsumedMedication, isCurrentPositiveFact, isUsableMeasurement } from '../ai/health-fact-policy.mjs'

const evidenceLabels = {
  symptom: '症状记录', temperature: '体温记录', medication: '用药记录', visit: '就诊记录',
  examination: '检查结果', diagnosis: '诊断记录', concern: '关注记录', status_change: '状态变化'
}

const diagnosisSourcePriority = { doctor_statement: 100, test_result: 90, ai_consultation: 80 }

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function factTime(item) {
  return item.fact.time?.resolvedStart ?? item.record?.occurredAt ?? item.organization.createdAt
}

function normalizedBodyPart(value) {
  return String(value ?? '').replace(/^左|^右/, '').replace(/部位$/, '')
}

function canonicalSymptom(fact) {
  const name = String(fact.name ?? '').trim()
  const bodyPart = normalizedBodyPart(fact.bodyPart)
  if (/脑袋疼|头疼|头痛/.test(name) || (/疼痛|疼|痛/.test(name) && bodyPart === '头')) return '头痛'
  if (/脚疼|脚痛/.test(name) || (/疼痛|疼|痛/.test(name) && /脚/.test(bodyPart))) return '脚痛'
  if (/手疼|手痛/.test(name) || (/疼痛|疼|痛/.test(name) && /手/.test(bodyPart))) return '手痛'
  if (/腿疼|腿痛/.test(name) || (/疼痛|疼|痛/.test(name) && /腿/.test(bodyPart))) return '腿痛'
  if (/颈|脖子/.test(bodyPart) && /疼痛|疼|痛|不舒服/.test(name)) return '颈部不适'
  if (/脚.*(?:红|发红)|皮肤红肿/.test(name) && /脚/.test(bodyPart || name)) return '脚部发红'
  if (/发烧|高烧|低烧|发热/.test(name)) return '发热'
  if (/瘙痒|发痒|很痒|有点痒/.test(name)) return '瘙痒'
  return name.replace('脑袋疼', '头痛').replace('头疼', '头痛').replace('脚疼', '脚痛')
}

function canonicalTarget(value) {
  return canonicalSymptom({ name: value, bodyPart: null })
}

function collectCurrentSymptoms(chronological) {
  const symptoms = new Map()
  for (const item of chronological) {
    const { fact } = item
    if (fact.subject !== 'event_subject') continue
    if (fact.type === 'symptom') {
      const label = canonicalSymptom(fact)
      if (!label) continue
      if (fact.polarity === 'affirmed' && fact.temporality === 'current' && ['active', 'improving', 'recurrent'].includes(fact.status)) {
        if (!symptoms.has(label)) symptoms.set(label, { label, firstAt: factTime(item), latestAt: factTime(item) })
        else symptoms.get(label).latestAt = factTime(item)
      } else if (fact.polarity === 'negated' || fact.status === 'resolved') symptoms.delete(label)
    }
    if (fact.type === 'status_change' && fact.polarity === 'affirmed') {
      const target = canonicalTarget(fact.target)
      if (fact.change === 'resolved') symptoms.delete(target)
      else if (fact.change === 'recurred' && target) symptoms.set(target, { label: target, firstAt: factTime(item), latestAt: factTime(item) })
    }
  }
  return [...symptoms.values()]
}

function collectDiagnoses(chronological) {
  const diagnoses = new Map()
  for (const item of chronological) {
    const { fact } = item
    if (fact.type !== 'diagnosis' || fact.subject !== 'event_subject') continue
    const name = String(fact.name ?? '').trim()
    if (!name) continue
    if (fact.polarity === 'negated' || fact.diagnosisCertainty === 'ruled_out' || fact.status === 'not_applicable') {
      const sourceText = `${fact.originalText ?? ''} ${fact.sourceText ?? ''}`
      for (const existingName of diagnoses.keys()) {
        if (name === existingName || sourceText.includes(existingName)) diagnoses.delete(existingName)
      }
      continue
    }
    const sourcePriority = diagnosisSourcePriority[fact.source] ?? 0
    const allowed = sourcePriority > 0 && fact.polarity === 'affirmed'
      && ['confirmed', 'suspected'].includes(fact.diagnosisCertainty)
    if (!allowed) continue
    const candidate = { name, source: fact.source, certainty: fact.diagnosisCertainty, occurredAt: factTime(item), sourcePriority }
    const previous = diagnoses.get(name)
    if (!previous || candidate.sourcePriority >= previous.sourcePriority) diagnoses.set(name, candidate)
  }
  return [...diagnoses.values()].sort((left, right) => right.sourcePriority - left.sourcePriority || right.occurredAt.localeCompare(left.occurredAt))
}

function buildTags({ diagnoses, symptoms, maxTemperature }) {
  const tags = []
  for (const diagnosis of diagnoses) {
    const aiAssessment = diagnosis.source === 'ai_consultation'
    tags.push({
      label: aiAssessment ? `疑似${diagnosis.name}` : diagnosis.name,
      kind: aiAssessment ? 'assessment' : 'diagnosis',
      source: diagnosis.source,
      certainty: aiAssessment ? 'suspected' : diagnosis.certainty,
      priority: diagnosis.sourcePriority
    })
  }
  symptoms.forEach((symptom, index) => tags.push({
    label: symptom.label, kind: 'symptom', source: 'user_report', certainty: null, priority: index === 0 ? 70 : 60
  }))
  if (maxTemperature !== null) tags.push({
    label: `最高${maxTemperature}℃`, kind: 'measurement', source: 'measurement', certainty: null, priority: 40
  })
  return tags.filter((tag, index) => tags.findIndex((candidate) => candidate.label === tag.label) === index)
    .sort((left, right) => right.priority - left.priority)
}

function joinFacts(values) {
  if (values.length < 2) return values[0] ?? ''
  return `${values.slice(0, -1).join('、')}和${values.at(-1)}`
}

function buildTitle(diagnoses, symptoms, maxTemperature, facts) {
  const diagnosis = diagnoses[0]
  if (diagnosis) return diagnosis.source === 'ai_consultation' ? `疑似${diagnosis.name}` : diagnosis.name
  const fever = symptoms.find(({ label }) => label === '发热')
  if (fever) {
    const companion = symptoms.find(({ label }) => label !== '发热')
    return companion ? `发热伴${companion.label}` : '发热'
  }
  if (symptoms[0]) return symptoms.slice(0, 2).map(({ label }) => label).join('伴').slice(0, 24)
  if (maxTemperature !== null) return '体温变化'
  if (facts.some(({ fact }) => isConsumedMedication(fact))) return '用药记录'
  if (facts.some(({ fact }) => fact.type === 'examination' && isCurrentPositiveFact(fact))) return '检查记录'
  if (facts.some(({ fact }) => fact.type === 'visit' && isCurrentPositiveFact(fact))) return '就诊记录'
  return '健康情况'
}

function buildSummary({ diagnoses, symptoms, maxTemperature, facts, event }) {
  const sentences = []
  const diagnosis = diagnoses[0]
  if (diagnosis?.source === 'doctor_statement') sentences.push(`医生诊断为${diagnosis.name}`)
  else if (diagnosis?.source === 'test_result') sentences.push(`检查结果支持${diagnosis.name}`)
  else if (diagnosis?.source === 'ai_consultation') sentences.push(`通过AI问诊，初步判断可能为${diagnosis.name}`)

  const symptomText = joinFacts(symptoms.map(({ label }) => label))
  if (symptomText) sentences.push(`${diagnosis ? '此前' : '目前'}记录有${symptomText}`)
  if (maxTemperature !== null) sentences.push(`最高体温${maxTemperature}℃`)

  const medications = unique(facts.filter(({ fact }) => isConsumedMedication(fact)).map(({ fact }) => fact.name))
  if (medications.length) sentences.push(`已记录用药${joinFacts(medications.slice(0, 2))}`)
  const latestChange = [...facts].sort((left, right) => factTime(right).localeCompare(factTime(left)))
    .find(({ fact }) => fact.type === 'status_change' && fact.polarity === 'affirmed')?.fact
  const changeTarget = canonicalTarget(latestChange?.target || latestChange?.name?.replace(/好转|加重|持续|复发|消失$/, '')) || '症状'
  if (latestChange?.change === 'improved') sentences.push(`${changeTarget}有所好转`)
  else if (latestChange?.change === 'worsened') sentences.push(`${changeTarget}较之前加重`)
  else if (latestChange?.change === 'persistent') sentences.push(`${changeTarget}仍在持续`)
  else if (latestChange?.change === 'recurred') sentences.push(`${changeTarget}再次出现`)
  else if (latestChange?.change === 'resolved') sentences.push(`${changeTarget}已消失`)
  if (event.status === 'recovered') sentences.push('当前事件已标记为康复')
  return sentences.length ? `${sentences.join('；')}。`.slice(0, 600) : '当前记录中暂无可用于摘要的有效健康事实。'
}

export function buildHealthEventSummary({ event, records, organizations, now = new Date() }) {
  const recordsById = new Map(records.map((record) => [record.id, record]))
  const facts = organizations.flatMap((organization) => (
    (organization.healthAIOutput?.facts ?? []).map((fact) => ({ organization, record: recordsById.get(organization.recordId), fact }))
  ))
  if (!facts.length) return null

  const chronological = [...facts].sort((left, right) => factTime(left).localeCompare(factTime(right)))
  const symptoms = collectCurrentSymptoms(chronological)
  const diagnoses = collectDiagnoses(chronological)
  const temperatures = facts.filter(({ fact }) => isUsableMeasurement(fact) && fact.temperature)
    .flatMap(({ fact }) => [fact.temperature.min, fact.temperature.max]).filter(Number.isFinite)
  const maxTemperature = temperatures.length ? Math.max(...temperatures) : null
  const updatedAt = now.toISOString()
  const systemGenerated = {
    title: buildTitle(diagnoses, symptoms, maxTemperature, facts),
    summary: buildSummary({ diagnoses, symptoms, maxTemperature, facts, event }),
    tags: buildTags({ diagnoses, symptoms, maxTemperature }),
    evidence: unique(facts.filter(({ fact }) => isCurrentPositiveFact(fact)).map(({ fact }) => evidenceLabels[fact.type])),
    updatedAt
  }
  const userCorrection = event.eventSummary?.userCorrection ?? null
  const hasNewEvidenceAfterCorrection = Boolean(userCorrection && updatedAt > userCorrection.updatedAt)
  const displayedResult = userCorrection && !hasNewEvidenceAfterCorrection
    ? { title: userCorrection.title, summary: userCorrection.summary, tags: systemGenerated.tags, evidence: systemGenerated.evidence, updatedAt: userCorrection.updatedAt, source: 'user_corrected' }
    : { ...systemGenerated, source: 'system' }

  return { systemGenerated, userCorrection, displayedResult, hasNewEvidenceAfterCorrection }
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
    displayedResult: { title, summary, tags: eventSummary.systemGenerated.tags ?? [], evidence: eventSummary.systemGenerated.evidence, updatedAt, source: 'user_corrected' },
    hasNewEvidenceAfterCorrection: false
  }
}
