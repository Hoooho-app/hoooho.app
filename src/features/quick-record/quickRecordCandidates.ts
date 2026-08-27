import type { HealthFact, HealthEventRecordType, HealthRecordOrganizationPreviewApiDto } from '../../types'

export interface QuickRecordCandidate {
  id: string
  type: HealthEventRecordType
  title: string
  occurredAt: string
  content: string
  fields: Array<{ label: string; value: string }>
}

const recordTypeForFact = (fact: HealthFact): HealthEventRecordType => {
  if (fact.type === 'medication') return 'medication'
  if (fact.type === 'visit') return 'visit'
  if (fact.type === 'examination') return 'examination'
  if (fact.type === 'symptom' || fact.type === 'status_change') return 'symptom'
  return 'note'
}

const titleForFact = (fact: HealthFact) => ({ temperature: '体温', medication: '用药', symptom: '症状', visit: '就诊', examination: '检查', concern: '备注', status_change: '状态变化' }[fact.type])
const temperatureText = (fact: HealthFact) => fact.temperature ? (fact.temperature.min === fact.temperature.max ? `${fact.temperature.min} ℃` : `${fact.temperature.min}～${fact.temperature.max} ℃`) : fact.name
const dosageFrom = (value: string) => value.match(/\d+(?:\.\d+)?\s*(?:毫升|ml|mL|片|粒|袋|滴|喷)/)?.[0] ?? ''

const occurredAtFor = (fact: HealthFact, fallback: string) => {
  if (!fact.time.resolvedStart) return fallback
  const timestamp = new Date(fact.time.resolvedStart)
  return Number.isNaN(timestamp.getTime()) || timestamp.getTime() > Date.now() ? fallback : timestamp.toISOString()
}

export function createQuickRecordCandidates(preview: HealthRecordOrganizationPreviewApiDto, fallbackOccurredAt: string): QuickRecordCandidate[] {
  const facts = preview.healthAIOutput.facts
  if (!facts.length) return []
  const primary = facts.find((fact) => fact.time.resolvedStart) ?? facts[0]
  const occurredAt = occurredAtFor(primary, fallbackOccurredAt)
  const timeLabel = primary.time.raw || new Date(occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const fields = [{ label: '发生时间', value: timeLabel }]
  for (const fact of facts) {
    if (fact.bodyPart) fields.push({ label: '身体部位', value: fact.bodyPart })
    const temperature = fact.type === 'temperature' ? temperatureText(fact) : ''
    const dosage = fact.type === 'medication' ? dosageFrom(`${fact.name} ${fact.sourceText}`) : ''
    const value = fact.type === 'medication' && dosage && !fact.name.includes(dosage)
      ? `${fact.name} · ${dosage}`
      : temperature || fact.name || fact.sourceText
    fields.push({ label: titleForFact(fact), value })
  }
  const recordTypes = new Set(facts.map(recordTypeForFact))
  return [{
    id: `quick-record-${facts.map((fact) => fact.id).join('-')}`,
    type: recordTypes.size === 1 ? recordTypeForFact(facts[0]) : 'note',
    title: '本次记录',
    occurredAt,
    content: facts.map((fact) => fact.name || fact.sourceText).filter(Boolean).join('；'),
    fields
  }]
}
