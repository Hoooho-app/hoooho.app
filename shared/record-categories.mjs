// Categories index observations, never diagnoses, polarity or causal relations.
const symptom = /红屁股|(?:屁股|臀部)(?:上|有点|有些|出现|明显|皮肤|又|也|发|变|很|了|的|一片|一点)*红|红疹|皮疹|疹子|红点|红肿|瘙痒|发痒|发热|发烧|咳嗽|呕吐|恶心|腹泻|腹痛|肚子疼|鼻塞|喘息/u
export function hasSymptomObservation(value) {
  return String(value ?? '').split(/[。；;\n]/u).some(clause => symptom.test(clause) && !/如果|要是|假如|一旦|预防|防止|担心会|怕会|会不会|怎么办|网上说|说明书|搜索|妈妈|爸爸|哥哥|姐姐|同学/u.test(clause))
}
export function itemRecordCategories(item) {
  if (Array.isArray(item.visibilityCategories)) return [...new Set([item.category, ...item.visibilityCategories])]
  const result = new Set([item.category])
  if (item.fields?.some(f => f.name === 'food' && f.value?.trim())) result.add('diet')
  if (item.fields?.some(f => ['symptom', 'reaction'].includes(f.name) && hasSymptomObservation(f.value))) result.add('symptom')
  return [...result]
}
export function visibleRecordCategories(record, includeOriginal = false) {
  const existing = record.journal?.categories?.length ? record.journal.categories : [['symptom','medication','visit','examination'].includes(record.type) ? record.type : 'other']
  if (record.aiProvenance?.visibilityCategories || ['external_ai', 'pending'].includes(record.caseContext?.identity)) return existing
  const result = new Set(existing)
  // Only this occurrence's text and fields. sourceText may contain an entire
  // multi-occurrence conversation, so it must never assign sibling categories.
  const ownText = [record.content, ...(includeOriginal ? [record.sourceText] : []), record.journal?.diet?.note, ...(record.journal?.diet?.reactions ?? [])].filter(Boolean).join('\n')
  if (hasSymptomObservation(ownText)) result.add('symptom')
  if (record.aiProvenance?.fields?.some(f => f.name === 'food' && f.value?.trim())) result.add('diet')
  return [...result]
}
