import type { OrganizedHealthData } from '../types'

export function deriveHealthEventTitle(data: OrganizedHealthData, hasAttachments = false) {
  const symptom = data.symptoms[0]
  if (symptom?.keywords[0]) return symptom.keywords[0]
  if (symptom?.content) return symptom.content.split(/[、，,；;]/)[0].trim()
  if (data.temperature) {
    const value = data.temperature.min === data.temperature.max
      ? data.temperature.max
      : `${data.temperature.min}–${data.temperature.max}`
    return `体温${value}℃`
  }
  if (data.medications.length) return '用药记录'
  if (data.visits.length) return '就诊记录'
  if (data.examinations.length) return '检查记录'
  if (data.concerns.length) return '健康担心'
  if (hasAttachments) return '健康附件'
  return ''
}
