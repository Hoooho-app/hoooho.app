import type { JournalRelatedClue } from '../../types/journal'
import type { JournalEntry } from './timeViewModel'

const uncertainty = /可能|好像|似乎|不确定|怀疑|是不是|猜/
const negation = /没吃|没有吃|未吃|未食用|没喝|未服|没有服|没用|没有用/
const foodTerms = ['火龙果', '鸡蛋', '牛奶', '配方奶', '母乳', '辅食', '米饭', '粥', '面条', '水果', '零食', '维生素', '益生菌', '营养补剂']
const medicationTerms = ['阿莫西林', '布洛芬', '对乙酰氨基酚', '氯雷他定', '药', '喷雾', '药膏']

function clauses(value: string) {
  return value.split(/[，。！？；,!?;\n]+/).map((item) => item.trim()).filter(Boolean)
}

function clueId(relation: JournalRelatedClue['relation'], sourceField: JournalRelatedClue['sourceField'], sourceText: string, label: string) {
  let hash = 2166136261
  const value = `${relation}|${sourceField}|${sourceText}|${label}`
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return `clue-${(hash >>> 0).toString(36)}`
}

export function extractRelatedClues(narrative: string, trigger: string): JournalRelatedClue[] {
  const output: JournalRelatedClue[] = []
  for (const [sourceField, raw] of [['narrative', narrative], ['trigger', trigger]] as const) {
    for (const sourceText of clauses(raw)) {
      const certainty: JournalRelatedClue['certainty'] = negation.test(sourceText) ? 'negated' : uncertainty.test(sourceText) || sourceField === 'trigger' ? 'uncertain' : 'mentioned'
      for (const label of foodTerms.filter((term) => sourceText.includes(term))) {
        output.push({ id: clueId('daily', sourceField, sourceText, label), relation: 'daily', sourceField, sourceText, label, certainty })
      }
      if (medicationTerms.some((term) => sourceText.includes(term))) {
        output.push({ id: clueId('medication', sourceField, sourceText, '用药相关'), relation: 'medication', sourceField, sourceText, label: '用药相关', certainty })
      }
    }
  }
  return [...new Map(output.map((item) => [item.id, item])).values()]
}

export function relatedCandidates(entries: readonly JournalEntry[], categories: readonly string[], occurredAt: string, nearbyDays?: number) {
  const anchor = Date.parse(occurredAt)
  const windowMs = nearbyDays === undefined ? Number.POSITIVE_INFINITY : nearbyDays * 86_400_000
  return entries.filter((entry) => entry.categories?.some((category) => categories.includes(category)) && (!Number.isFinite(anchor) || Math.abs(Date.parse(entry.occurredAt) - anchor) <= windowMs))
    .sort((left, right) => {
      if (Number.isFinite(anchor)) {
        const distance = Math.abs(Date.parse(left.occurredAt) - anchor) - Math.abs(Date.parse(right.occurredAt) - anchor)
        if (distance) return distance
      }
      return Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    })
}
