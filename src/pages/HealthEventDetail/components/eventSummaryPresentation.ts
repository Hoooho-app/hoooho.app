import type { HealthEventSummaryResult } from '../../../types'

const canonicalSymptoms: Array<{ label: string; pattern: RegExp }> = [
  { label: '发热', pattern: /发热|发烧|高烧|低烧|体温升高/ },
  { label: '咳嗽', pattern: /咳嗽|干咳|咳痰/ },
  { label: '精神不佳', pattern: /精神不佳|精神差|精神萎靡/ },
  { label: '头痛', pattern: /头痛|头疼/ },
  { label: '腹痛', pattern: /腹痛|肚子痛|肚子疼/ },
  { label: '呕吐', pattern: /呕吐|吐了|想吐/ },
  { label: '腹泻', pattern: /腹泻|拉肚子/ },
  { label: '鼻塞', pattern: /鼻塞/ },
  { label: '流涕', pattern: /流鼻涕|流涕/ },
  { label: '乏力', pattern: /乏力|没力气|疲倦/ },
  { label: '症状加重', pattern: /症状加重|明显加重/ },
  { label: '持续中', pattern: /仍在持续|持续中/ },
  { label: '有所好转', pattern: /有所好转|有所改善|有所缓解/ }
]

export function compactSummaryTags(displayed: Pick<HealthEventSummaryResult, 'title' | 'summary'>) {
  const text = `${displayed.title} ${displayed.summary}`
  return canonicalSymptoms.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label).slice(0, 3)
}
