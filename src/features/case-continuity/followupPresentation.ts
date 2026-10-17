import { symptomCorePhrase } from '../../../shared/symptom-core-phrase.mjs'
import type { FollowedCase } from './types'
import type { HealthEventRecordApiDto } from '../../types'

// A read-only projection for both old and new follow-ups. Never rewrite source text.
export function followupCorePhrase(value: string, fallback = '症状记录'): string {
  const source = value.trim().replace(/不知道|不知是否/gu, '不确定').replace(/(?:不确定)?是不是/gu, '可能').replace(/估计(?:是)?/gu, '可能')
  const body = source.match(/嘴角|嘴唇|头部|头皮|颈部|脖子|手臂|腿部|脚踝/u)?.[0] || (/头(?:总是|一直|经常|很|有点)*痒/u.test(source) ? '头部' : '')
  const phrase = symptomCorePhrase(source, { location: body })
  const concepts = phrase.split('、')
  const selected: string[] = []
  for (const concept of concepts) {
    if ([...selected, concept].join('、').length > 9) break
    selected.push(concept)
    if (selected.length === 2) break
  }
  // Unknown conversational/ASR text is a neutral location label, not a diagnosis.
  if (!selected.length || phrase === '症状记录' || /[的了这个那个]|怎么|时候|一下|感觉|不确定是什么/u.test(phrase)) return body ? `${body === '脖子' ? '颈部' : body}症状` : fallback
  return selected.join('、')
}

export function followupTitle(item: FollowedCase): string {
  // Short explicit names survive editing; long legacy names follow the same projection.
  const named = (item.event as FollowedCase['event'] & { caseTitle?: string | null }).caseTitle?.trim()
  if (named && named.length <= 9 && !/[\n。；]/u.test(named)) return named
  return followupCorePhrase(named || item.followup.description || item.followup.title)
}

export function recordOriginal(record: HealthEventRecordApiDto): string {
  return record.caseContext?.originalText || record.sourceText || record.content
}
export function recordCorePhrase(record: HealthEventRecordApiDto): string {
  return followupCorePhrase(record.journal?.symptom?.narrative || recordOriginal(record), '补充记录')
}
