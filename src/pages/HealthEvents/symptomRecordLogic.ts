import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalSymptomDetails, JournalSymptomLocation, SymptomCategory } from '../../types/journal'

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
  return values.map((item, index) => ({ id: item.id, label: item.label, locationNumber: index + 1, locationLayer: item.locationType, bodySide: item.laterality, bodyView: item.view, bodyRegion: item.parentId, localRegion: item.label, markedArea: `${index + 1}号区域` }))
}

export function toggleExclusive(values: readonly string[], value: string) {
  if (value === '没有特别发现') return values.includes(value) ? [] : [value]
  const withoutNone = values.filter((item) => item !== '没有特别发现')
  return withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value]
}

export function generateSymptomSummary(details: JournalSymptomDetails, photoCount = 0) {
  const locations = details.locations.map((item) => `${item.label}${item.locationNumber}号区域`).join('、')
  const subject = details.symptomCategory === 'other' ? details.otherCategoryText?.trim() || '不舒服' : categoryLabel[details.symptomCategory]
  const facts = [locations && `${locations}${subject}`, details.descriptors.length ? `表现为${details.descriptors.join('、')}` : '', details.impactLevel ? impactLabels[details.impactLevel] : ''].filter(Boolean).join('，')
  const specific = details.symptomSpecificData ?? {}
  const specificFacts = [specific.currentTemperature ? `当前体温${specific.currentTemperature}℃` : '', specific.maxTemperature ? `最高体温${specific.maxTemperature}℃` : '', specific.approximateCount ? `今天大概${specific.approximateCount}次` : '', Array.isArray(specific.stoolAppearance) && specific.stoolAppearance.length ? `大便呈${specific.stoolAppearance.join('、')}` : ''].filter(Boolean)
  const extras = [details.onsetApprox ? onsetLabels[details.onsetApprox] : '', details.trend ? trendLabels[details.trend] : '', details.associatedSymptoms?.length ? `同时记录了${details.associatedSymptoms.join('、')}` : '', ...specificFacts, details.shortNote?.trim() || ''].filter(Boolean)
  const photo = photoCount ? `已上传${photoCount}张现场照片。` : ''
  return [`孩子${facts || subject}。`, extras.length ? `${extras.join('；')}。` : '', photo].filter(Boolean).join('')
}
