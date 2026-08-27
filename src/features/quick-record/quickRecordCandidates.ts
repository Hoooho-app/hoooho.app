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

const titleForFact = (fact: HealthFact) => ({ temperature: '体温', medication: '用药', symptom: '症状', visit: '就诊', examination: '检查', diagnosis: '问诊结论', concern: '备注', status_change: '状态变化', other: '记录' }[fact.type])
const temperatureText = (fact: HealthFact) => fact.temperature ? (fact.temperature.min === fact.temperature.max ? `${fact.temperature.min} ℃` : `${fact.temperature.min}～${fact.temperature.max} ℃`) : fact.name
const dosageFrom = (value: string) => value.match(/\d+(?:\.\d+)?\s*(?:毫升|ml|mL|片|粒|袋|滴|喷)/)?.[0] ?? ''

const occurredAtFor = (fact: HealthFact, fallback: string) => {
  if (!fact.time.resolvedStart) return fallback
  const timestamp = new Date(fact.time.resolvedStart)
  return Number.isNaN(timestamp.getTime()) || timestamp.getTime() > Date.now() ? fallback : timestamp.toISOString()
}

export function createQuickRecordCandidates(preview: HealthRecordOrganizationPreviewApiDto, fallbackOccurredAt: string): QuickRecordCandidate[] {
  return preview.healthAIOutput.facts.map((fact, index) => {
    const occurredAt = occurredAtFor(fact, fallbackOccurredAt)
    const title = titleForFact(fact)
    const temperature = fact.type === 'temperature' ? temperatureText(fact) : ''
    const dosage = fact.type === 'medication' ? dosageFrom(`${fact.name} ${fact.sourceText}`) : ''
    const content = temperature || fact.name || fact.sourceText
    const timeLabel = fact.time.raw || new Date(occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    const fields = [{ label: '发生时间', value: timeLabel }]
    if (fact.type === 'temperature') fields.push({ label: '数值', value: temperature })
    else if (fact.type === 'medication') {
      fields.push({ label: '药物', value: fact.name || '未填写' })
      fields.push({ label: '剂量', value: dosage || '未填写' })
    } else fields.push({ label: title, value: fact.name || '未填写' })
    return { id: fact.id || `quick-record-${index}`, type: recordTypeForFact(fact), title, occurredAt, content, fields }
  })
}
