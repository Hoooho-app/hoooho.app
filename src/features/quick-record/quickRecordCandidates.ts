import type { HealthFact, HealthEventRecordType, HealthMeasurementMethod, HealthRecordOrganizationPreviewApiDto, HealthRecordSourceType } from '../../types'

export interface QuickRecordCandidate {
  id: string
  type: HealthEventRecordType
  title: string
  occurredAt: string
  content: string
  sourceType: HealthRecordSourceType
  measurementMethod: HealthMeasurementMethod
  fields: Array<{ label: string; value: string }>
}

const recordTypeForFact = (fact: HealthFact): HealthEventRecordType => {
  if (fact.type === 'temperature') return 'symptom'
  if (fact.type === 'medication') return 'medication'
  if (fact.type === 'visit') return 'visit'
  if (fact.type === 'examination') return 'examination'
  if (fact.type === 'symptom' || fact.type === 'status_change') return 'symptom'
  return 'note'
}

const titleForFact = (fact: HealthFact) => ({ temperature: '体温', medication: '用药', symptom: '症状', visit: '就诊', examination: '检查', diagnosis: '问诊结论', concern: '备注', status_change: '状态变化', other: '记录' }[fact.type])
const temperatureText = (fact: HealthFact) => fact.temperature ? (fact.temperature.min === fact.temperature.max ? `${fact.temperature.min}℃` : `${fact.temperature.min}～${fact.temperature.max}℃`) : fact.name
const dosageFrom = (value: string) => value.match(/\d+(?:\.\d+)?\s*(?:毫升|ml|mL|片|粒|袋|滴|喷)/)?.[0] ?? ''

const occurredAtFor = (fact: HealthFact, fallback: string) => {
  if (!fact.time.resolvedStart) return fallback
  const timestamp = new Date(fact.time.resolvedStart)
  return Number.isNaN(timestamp.getTime()) || timestamp.getTime() > Date.now() ? fallback : timestamp.toISOString()
}

const displayTimeFor = (fact: HealthFact, occurredAt: string) => {
  const rawTime = fact.time.raw?.trim()
  if (rawTime && !/^\d{4}-\d{2}-\d{2}T/u.test(rawTime)) return rawTime
  return new Date(occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function createQuickRecordCandidates(preview: HealthRecordOrganizationPreviewApiDto, fallbackOccurredAt: string): QuickRecordCandidate[] {
  const facts = preview.healthAIOutput.facts
  if (!facts.length) return []
  return facts.map((fact) => {
    const occurredAt = occurredAtFor(fact, fallbackOccurredAt)
    const timeLabel = displayTimeFor(fact, occurredAt)
    const fields = [
      { label: '发生时间', value: timeLabel },
      { label: '事实状态', value: fact.polarity === 'negated' ? '明确没有' : fact.polarity === 'uncertain' ? '待确认' : '已陈述' },
      { label: '来源', value: fact.source === 'measurement' ? '测量' : fact.source === 'doctor_statement' ? '医生陈述' : '用户描述' }
    ]
    if (fact.bodyPart) fields.push({ label: '身体部位', value: fact.bodyPart })
    const temperature = fact.type === 'temperature' ? temperatureText(fact) : ''
    const dosage = fact.type === 'medication' ? dosageFrom(`${fact.name} ${fact.sourceText}`) : ''
    const value = fact.type === 'medication' && dosage && !fact.name.includes(dosage)
      ? `${fact.name} · ${dosage}`
      : temperature || fact.name || fact.sourceText
    fields.push({ label: titleForFact(fact), value })
    const sourceType: HealthRecordSourceType = fact.type === 'temperature' || fact.source === 'measurement'
      ? 'measurement'
      : fact.time.source === 'document' || fact.source === 'test_result'
        ? 'medical_file'
        : fact.source === 'doctor_statement'
          ? 'doctor_confirmation'
          : 'user_record'
    return {
      id: `quick-record-${fact.id}`,
      type: recordTypeForFact(fact),
      title: value,
      occurredAt,
      content: fact.polarity === 'negated' ? `${value}：无` : fact.type === 'temperature' ? `体温 ${value}` : value,
      sourceType,
      measurementMethod: fact.measurementMethod ?? 'unspecified',
      fields
    }
  })
}
