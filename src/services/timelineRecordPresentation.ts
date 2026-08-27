const explicitMeasurePattern = /(?:服用|吃了|吃过|用了|使用|用药|喝了|喝水|补水|休息|躺下|躺了|卧床|冷敷|冰敷|热敷|雾化|就医|就诊|去医院|挂号|冲洗|消毒|涂抹|喷了|护理)/
const incompleteOrNegatedMeasurePattern = /(?:没有|没|未|不曾)(?:服用|吃|用药|喝|休息|冷敷|热敷|就医|就诊)|(?:准备|打算|计划|想要|考虑)(?:服用|吃|用药|喝|休息|冷敷|热敷|就医|就诊)/

export function normalizeTimelineRecordText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/([，。！？；、])\1+/g, '$1')
    .replace(/[ \t]*([，。！？；、])[ \t]*/g, '$1')
    .trim()
}

export function extractExplicitMeasures(value: string) {
  const normalized = normalizeTimelineRecordText(value)
  if (!normalized) return []
  return [...new Set(normalized
    .split(/[，,。；;！!？?\n]+/u)
    .map((item) => item.trim())
    .filter((item) => item && explicitMeasurePattern.test(item) && !incompleteOrNegatedMeasurePattern.test(item)))]
}

export function createTimelineRecordSummary(value: string, fallback = '') {
  const normalized = normalizeTimelineRecordText(value)
  const source = normalized && normalized !== '图片记录' ? normalized : normalizeTimelineRecordText(fallback)
  if (!source) return '健康记录'
  const firstSentence = source.split(/[。！？\n]/u).find(Boolean) ?? source
  return firstSentence.length > 58 ? `${firstSentence.slice(0, 58).trimEnd()}…` : firstSentence
}

export function createTimelineRecordDetails(value: string) {
  const description = normalizeTimelineRecordText(value)
  if (!description || description === '图片记录') return undefined
  const measures = extractExplicitMeasures(description)
  const hasDetail = measures.length > 0
    || description.length >= 20
    || /[，。；！？\n]/u.test(description)
  return hasDetail ? { description, measures } : undefined
}
