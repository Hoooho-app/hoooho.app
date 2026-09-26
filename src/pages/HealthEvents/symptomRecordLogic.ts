import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalSymptomDetails, JournalSymptomLocation, SymptomCategory } from '../../types/journal'

const optionalImpactLabels = { little: '轻度', some: '中度', clear: '重度' } as const
const optionalTrendLabels: Partial<Record<NonNullable<JournalSymptomDetails['trend']>, string>> = {
  improving: '减轻', same: '无明显变化', more_noticeable: '加重', returned: '再次出现', recurrent: '反复出现', unclear: '变化不明确'
}

export function symptomOptionalSummary(draft: Pick<JournalSymptomDetails, 'impactLevel' | 'triggerText' | 'trend' | 'shortNote'>) {
  return [
    draft.impactLevel ? optionalImpactLabels[draft.impactLevel] : '',
    draft.triggerText?.trim() ?? '',
    draft.trend ? optionalTrendLabels[draft.trend] ?? draft.trend : '',
    draft.shortNote?.trim() ?? ''
  ].filter(Boolean).join(' · ')
}

export interface SymptomNarrativeExtraction {
  transcript: string
  keywords: string[]
  bodyLocation?: string
  occurredAtText?: string
  confidence?: Record<string, number>
}

const keywordPatterns = ['红疹', '皮疹', '发红', '瘙痒', '痒', '发热', '发烧', '咳嗽', '鼻塞', '流鼻涕', '呕吐', '腹泻', '腹痛', '头痛', '疼痛', '肿', '起泡']
const bodyLocationPatterns = ['左手肘', '右手肘', '左肘窝', '右肘窝', '左手', '右手', '左脚', '右脚', '头部', '额头', '脸部', '面部', '胸口', '腹部', '肚子', '背部', '腰部', '左腿', '右腿']

const negationPrefix = /(?:没(?:有)?|未|无|不|并未|目前没(?:有)?|没有明显|目前没有明显)$/
const currentTimeWords = /今天|现在|目前|刚刚/
const pastTimeWords = /昨天|昨晚|此前|之前/

function keywordIsPositive(text: string, keyword: string) {
  const matches = [...text.matchAll(new RegExp(keyword, 'g'))]
  if (!matches.length) return false
  const evidence = matches.map((match) => {
    const index = match.index ?? 0
    const clauseStart = Math.max(text.lastIndexOf('，', index), text.lastIndexOf('。', index), text.lastIndexOf('；', index), text.lastIndexOf(',', index), text.lastIndexOf(';', index)) + 1
    const clauseEndCandidates = ['，', '。', '；', ',', ';'].map((separator) => text.indexOf(separator, index)).filter((value) => value >= 0)
    const clauseEnd = clauseEndCandidates.length ? Math.min(...clauseEndCandidates) : text.length
    const clause = text.slice(clauseStart, clauseEnd)
    const prefix = text.slice(Math.max(clauseStart, index - 8), index).replace(/\s/g, '')
    return { positive: !negationPrefix.test(prefix), current: currentTimeWords.test(clause), past: pastTimeWords.test(clause) }
  })
  if (evidence.some((item) => !item.positive && item.current) && evidence.some((item) => item.positive && item.past)) return false
  return evidence.some((item) => item.positive)
}

const keywordFamilies = [
  ['发热', '发烧'],
  ['瘙痒', '痒'],
] as const

function keywordFamily(keyword: string) {
  return keywordFamilies.find((family) => family.includes(keyword as never)) ?? [keyword]
}

export function visibleSymptomKeywords(narrative: string, keywords: readonly string[]) {
  const source = narrative.trim()
  const positive = new Set(extractSymptomNarrative(source).keywords)
  return [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].filter((keyword) => {
    if (source === keyword) return false
    const family = keywordFamily(keyword)
    const mentioned = family.some((alias) => source.includes(alias))
    return !mentioned || family.some((alias) => positive.has(alias))
  })
}

export function isSemanticSymptomLocation(value: string) {
  const normalized = value.normalize('NFKC').trim()
  if (!normalized) return true
  const withoutNumbering = normalized.replace(/[\d\s#\-_.，。号区域位置部位]/gu, '')
  return /\p{L}/u.test(withoutNumbering)
}

export function symptomLocationDisplay(details?: Pick<JournalSymptomDetails, 'locationText' | 'locations'>) {
  if (!details) return ''
  const labels = details.locations.map((item) => `${item.label}${item.locationNumber ? ` · ${item.locationNumber}号区域` : ''}`)
  const manual = details.locationText?.trim()
  if (manual && isSemanticSymptomLocation(manual) && !details.locations.some(item => item.label === manual)) labels.push(manual)
  return labels.join('、')
}

export function extractSymptomNarrative(transcript: string): SymptomNarrativeExtraction {
  const normalized = transcript.trim()
  const keywords = keywordPatterns.filter((keyword) => keywordIsPositive(normalized, keyword))
  const bodyLocation = bodyLocationPatterns.find((location) => normalized.includes(location))
  const occurredAtText = ['昨天晚上', '昨晚', '昨天', '今天早上', '今早', '今天中午', '今天下午', '今天晚上', '今晚', '刚刚'].find((value) => normalized.includes(value))
  return {
    transcript: normalized,
    keywords: [...new Set(keywords.map((keyword) => keyword === '痒' ? '瘙痒' : keyword))],
    ...(bodyLocation ? { bodyLocation } : {}),
    ...(occurredAtText ? { occurredAtText } : {}),
    confidence: { keywords: keywords.length ? 1 : 0, bodyLocation: bodyLocation ? 1 : 0, occurredAtText: occurredAtText ? 1 : 0 },
  }
}

export function inferSymptomCategory(keywords: readonly string[]): SymptomCategory {
  const text = keywords.join(' ')
  if (/红疹|皮疹|发红|瘙痒|肿|起泡/.test(text)) return 'skin'
  if (/发热|发烧/.test(text)) return 'fever'
  if (/咳嗽/.test(text)) return 'respiratory'
  if (/鼻塞|流鼻涕/.test(text)) return 'ent'
  if (/呕吐|腹泻|腹痛/.test(text)) return 'gastrointestinal'
  if (/头痛|疼痛/.test(text)) return 'pain'
  return 'other'
}

export const symptomCategoryOptions: ReadonlyArray<[SymptomCategory, string]> = [
  ['skin', '皮肤变化'], ['fever', '发热'], ['respiratory', '咳嗽或呼吸'], ['ent', '眼、鼻、口或咽喉'],
  ['gastrointestinal', '呕吐或腹泻'], ['pain', '疼痛'], ['other', '其他']
]

export const descriptorOptions: Record<SymptomCategory, string[]> = {
  skin: ['发红', '一片小疹子', '一个个凸起', '痒', '肿起来', '干燥', '脱皮', '起泡', '渗液', '结痂', '抓破了'],
  fever: ['身体发热', '手脚发凉', '反复发热', '持续发热'],
  respiratory: ['干咳', '有痰', '喘息', '呼吸费力', '咽喉不适'],
  ent: ['发红', '眼皮肿', '流眼泪', '分泌物增多', '鼻塞', '流清鼻涕', '鼻涕黏稠', '连续打喷嚏', '咽喉疼', '吞咽时抗拒', '流口水增多', '声音变化'],
  gastrointestinal: ['呕吐', '腹泻', '腹痛', '腹胀', '恶心', '尿量变少'],
  pain: ['疼', '胀', '刺痛', '发紧', '触碰时躲避', '捂着该位置', '活动该部位时明显', '孩子太小，说不清'],
  other: []
}

export const associatedOptions: Record<SymptomCategory, string[]> = {
  skin: ['其他地方也有', '影响睡觉', '精神变差', '食欲变差', '发热', '没有特别发现'],
  fever: ['精神变差', '食欲变差', '咳嗽', '呕吐', '没有特别发现'],
  respiratory: ['影响睡觉', '精神变差', '食欲变差', '发热', '没有特别发现'],
  ent: ['影响睡觉', '精神变差', '食欲变差', '发热', '咳嗽', '没有特别发现'],
  gastrointestinal: ['精神变差', '食欲变差', '发热', '没有特别发现'],
  pain: ['影响睡觉', '精神变差', '食欲变差', '发热', '呕吐', '没有特别发现'],
  other: ['影响睡觉', '精神变差', '食欲变差', '发热', '咳嗽', '呕吐', '没有特别发现']
}

export function descriptorsFor(category: SymptomCategory, locations: readonly BodyLocationSelection[]) {
  if (category !== 'ent') return descriptorOptions[category]
  const ids = locations.map((item) => item.id).join(' ')
  if (/eye/.test(ids)) return ['发红', '眼皮肿', '流眼泪', '分泌物增多', '频繁眨眼', '反复揉眼', '睁眼困难']
  if (/nose/.test(ids)) return ['鼻塞', '流清鼻涕', '鼻涕黏稠', '连续打喷嚏', '鼻腔痒', '反复揉鼻子', '张口呼吸']
  if (/lip|mouth|throat/.test(ids)) return ['嘴唇发红', '嘴唇肿', '口腔内发红', '咽部发红', '有白色或黄色分泌物', '咽喉疼', '吞咽时抗拒', '流口水增多', '声音变化']
  return descriptorOptions.ent
}

const categoryLabel = Object.fromEntries(symptomCategoryOptions)
const onsetLabels = { just_now: '刚刚开始', today: '今天开始', yesterday: '昨天开始', two_three_days: '2—3天前开始', within_week: '一周内开始', earlier: '更早开始' } as const
const trendLabels = { same: '与刚出现时差不多', more_noticeable: '与刚出现时相比更明显', improving: '正在减轻', returned: '消失后又出现', recurrent: '反复出现', unclear: '变化暂时看不出来' } as const
const impactLabels = { little: '不太影响照常活动', some: '对日常活动有些影响', clear: '已明显影响吃饭、睡觉或活动' } as const

export function toSymptomLocations(values: readonly BodyLocationSelection[]): JournalSymptomLocation[] {
  return values.map((item, index) => ({ ...item.recordSnapshot, id: item.id, label: item.label, locationNumber: index + 1, locationLayer: item.locationType, bodySide: item.laterality, bodyView: item.view, bodyRegion: item.parentId, localRegion: item.recordSnapshot?.localRegion ?? item.label, markedArea: item.recordSnapshot ? item.recordSnapshot.markedArea : `${index + 1}号区域`, ...(item.schemaVersion ? { schemaVersion: item.schemaVersion, surface: item.surface, coverage: item.coverage, modelAtSelection: item.modelAtSelection } : {}) }))
}

export function fromSymptomLocations(values: readonly JournalSymptomLocation[]): BodyLocationSelection[] {
  return values.map(item => ({ id: item.id, label: item.label, locationType: item.locationLayer, laterality: item.bodySide, view: item.bodyView, parentId: item.bodyRegion, schemaVersion: item.schemaVersion, surface: item.surface, coverage: item.coverage, modelAtSelection: item.modelAtSelection, recordSnapshot: { ...item } }))
}

export function toggleExclusive(values: readonly string[], value: string) {
  if (value === '没有特别发现') return values.includes(value) ? [] : [value]
  const withoutNone = values.filter((item) => item !== '没有特别发现')
  return withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value]
}

export function generateSymptomSummary(details: JournalSymptomDetails, photoCount = 0) {
  if (details.narrative?.trim()) return details.narrative.trim()
  const locations = details.locations.map((item) => `${item.label}${item.locationNumber}号区域`).join('、')
  const subject = details.symptomCategory === 'other' ? details.otherCategoryText?.trim() || '不舒服' : categoryLabel[details.symptomCategory]
  const facts = [locations && `${locations}${subject}`, details.descriptors.length ? `表现为${details.descriptors.join('、')}` : '', details.impactLevel ? impactLabels[details.impactLevel] : ''].filter(Boolean).join('，')
  const specific = details.symptomSpecificData ?? {}
  const specificFacts = [specific.currentTemperature ? `当前体温${specific.currentTemperature}℃` : '', specific.maxTemperature ? `最高体温${specific.maxTemperature}℃` : '', specific.approximateCount ? `今天大概${specific.approximateCount}次` : '', Array.isArray(specific.stoolAppearance) && specific.stoolAppearance.length ? `大便呈${specific.stoolAppearance.join('、')}` : ''].filter(Boolean)
  const extras = [details.onsetApprox ? onsetLabels[details.onsetApprox] : '', details.trend ? trendLabels[details.trend] : '', details.associatedSymptoms?.length ? `同时记录了${details.associatedSymptoms.join('、')}` : '', ...specificFacts, details.shortNote?.trim() || ''].filter(Boolean)
  const photo = photoCount ? `已上传${photoCount}张现场照片。` : ''
  return [`孩子${facts || subject}。`, extras.length ? `${extras.join('；')}。` : '', photo].filter(Boolean).join('')
}
