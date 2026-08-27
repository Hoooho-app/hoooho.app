import type { HealthAIOutput, OrganizedHealthData } from '../types'

export const conciseSymptomTitles: Array<[RegExp, string]> = [
  [/发热|发烧|低烧|高烧/, '发热'],
  [/头(?:部|上)?[^，。；]{0,6}(?:胀痛|疼|痛)|头痛|头疼/, '头痛'],
  [/腹(?:部)?[^，。；]{0,6}(?:疼|痛)|肚子疼/, '腹痛'],
  [/胃[^，。；]{0,6}(?:疼|痛)/, '胃痛'],
  [/喉咙痛|喉咙疼|咽痛/, '喉咙痛'],
  [/咳嗽|咳/, '咳嗽'],
  [/流鼻涕/, '流鼻涕'],
  [/手脚(?:发凉|冰凉|冷)/, '手脚发凉'],
  [/皮疹|红疹|出疹/, '皮疹'],
  [/红肿/, '红肿'],
  [/腹泻|拉肚子/, '腹泻'],
  [/呕吐|吐了/, '呕吐']
]

export function findConciseSymptomTitle(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(' ')
  return conciseSymptomTitles.find(([pattern]) => pattern.test(text))?.[1] ?? null
}

export function normalizeSymptomTitle(name: string, sourceText?: string, bodyPart?: string | null) {
  const recognized = findConciseSymptomTitle(name, sourceText, bodyPart)
  if (recognized) return recognized
  if (/疼痛|不舒服|不适|疼|痛/.test(name) && bodyPart) return `${bodyPart}不适`.slice(0, 8)
  const cleaned = name.trim().replace(/[，。；;].*$/, '')
  if (cleaned.length >= 2 && cleaned.length <= 8) return cleaned
  return bodyPart ? `${bodyPart}不适`.slice(0, 8) : '身体不适'
}

export function normalizeHealthEventTitle(title: string, sourceText?: string) {
  return normalizeSymptomTitle(title, sourceText)
}

export function deriveHealthEventTitleFromFacts(output: HealthAIOutput, hasAttachments = false) {
  const facts = output.facts ?? []
  const symptom = facts.find((fact) => fact.type === 'symptom')
  if (symptom?.name) return normalizeSymptomTitle(symptom.name, symptom.sourceText, symptom.bodyPart)
  const temperature = facts.find((fact) => fact.type === 'temperature')
  if (temperature?.name) return `体温${temperature.name}`
  if (facts.some((fact) => fact.type === 'medication')) return '用药记录'
  if (facts.some((fact) => fact.type === 'visit')) return '就诊记录'
  if (facts.some((fact) => fact.type === 'examination')) return '检查记录'
  if (facts.some((fact) => fact.type === 'concern')) return '健康担心'
  if (hasAttachments) return '图片记录'
  return ''
}

export function deriveHealthEventTitle(data: OrganizedHealthData, hasAttachments = false) {
  const symptom = data.symptoms[0]
  if (symptom?.keywords[0]) return normalizeSymptomTitle(symptom.keywords[0], symptom.content)
  if (symptom?.content) return normalizeSymptomTitle(symptom.content)
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
  if (hasAttachments) return '图片记录'
  return ''
}
