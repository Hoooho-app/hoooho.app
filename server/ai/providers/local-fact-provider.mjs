import { normalizeOrganizedHealthData } from '../ai-types.mjs'

const symptomPatterns = [
  ['咳嗽', /咳嗽|咳/], ['发热', /发热|发烧|低烧|高烧/], ['喉咙疼痛', /喉咙疼|咽痛/],
  ['手脚发凉', /手脚(?:有点)?(?:冷|凉)|手(?:有点)?(?:冷|凉)|脚(?:有点)?(?:冷|凉)/], ['腰疼', /腰疼|腰痛/], ['头痛', /头痛|头疼/],
  ['腹痛', /腹痛|肚子疼/], ['乏力', /乏力|没精神|精神不好|身体(?:稍微|有点)?发虚|发虚/], ['胸闷', /胸闷/],
  ['流鼻涕', /流鼻涕/], ['腹泻', /腹泻|拉肚子/], ['呕吐', /呕吐|吐了/],
  ['皮疹', /皮疹|红疹/], ['瘙痒', /瘙痒|发痒/], ['感冒表现', /像感冒|疑似感冒|感冒症状|感冒(?:的)?前兆|感觉感冒|感冒/]
]

const medicationNames = ['退烧药', '感冒药', '美林', '布洛芬', '对乙酰氨基酚', '抗过敏药']
const negationWords = ['没有', '没', '无', '未', '不']

function isNegated(text, pattern) {
  const match = text.match(pattern)
  if (!match || match.index === undefined) return false
  const prefix = text.slice(Math.max(0, match.index - 4), match.index)
  return negationWords.some((word) => prefix.includes(word))
}

function extractTemperature(text) {
  const range = text.match(/(\d{2}(?:\.\d)?)\s*(?:℃|度)?\s*(?:到|至|-|~|～)\s*(\d{2}(?:\.\d)?)\s*(?:℃|度)/)
  if (range) {
    const first = Number(range[1])
    const second = Number(range[2])
    return { min: Math.min(first, second), max: Math.max(first, second), unit: '℃' }
  }
  const chineseDecimal = text.match(/(\d{2})\s*度\s*(\d)/)
  if (chineseDecimal) {
    const value = Number(`${chineseDecimal[1]}.${chineseDecimal[2]}`)
    return { min: value, max: value, unit: '℃' }
  }
  const standard = text.match(/(\d{2}(?:\.\d)?)\s*(?:℃|度)/)
  if (!standard) return null
  const value = Number(standard[1])
  return { min: value, max: value, unit: '℃' }
}

const timelineMarkerPattern = /(?:到了?)?(?:(?:今天|昨天|前天)\s*)?(?:今早|早上|上午|中午|下午|晚上|夜里|夜间|凌晨|半夜)\s*\d{1,2}点(?:\s*\d{1,2}分)?(?:的时候)?|(?:到了?)?(?:今天|昨天|前天)?(?:今早|早上|上午|中午|下午|晚上|夜里|夜间|凌晨|半夜)|(?:今天|昨天|前天)\s*\d{1,2}点(?:\s*\d{1,2}分)?(?:的时候)?/g

function normalizeTimelineTime(marker) {
  const hourMatch = marker.match(/(\d{1,2})点(?:\s*(\d{1,2})分)?/)
  if (hourMatch) return `${hourMatch[1].padStart(2, '0')}:${(hourMatch[2] ?? '00').padStart(2, '0')}`
  return marker.replace(/^(?:到了?|到)/, '').trim()
}

function cleanTimelineContent(value) {
  return value
    .replace(/^[，,。；;\s]+/, '')
    .replace(/^(?:的时候|然后|就|有一点|有点)\s*/, '')
    .replace(/[，,。；;\s]+$/, '')
    .trim()
}

function extractSymptomKeywords(text) {
  return symptomPatterns
    .filter(([, pattern]) => pattern.test(text) && !isNegated(text, pattern))
    .map(([label]) => label)
}

function extractTimeline(text) {
  const markers = [...text.matchAll(timelineMarkerPattern)]
  return markers.map((match, index) => {
    const nextIndex = markers[index + 1]?.index ?? text.length
    const content = cleanTimelineContent(text.slice((match.index ?? 0) + match[0].length, nextIndex))
    return {
      time: normalizeTimelineTime(match[0]),
      content,
      relatedSymptoms: extractSymptomKeywords(content)
    }
  }).filter((item) => item.time && item.content)
}

function extractMedication(text) {
  return medicationNames.filter((name) => text.includes(name)).map((name) => {
    const countAfter = text.match(new RegExp(`${name}[^，。；]{0,8}(一次|两次|二次|三次|一片|两片|二片)`))
    const countBefore = text.match(new RegExp(`(一次|两次|二次|三次|一片|两片|二片)[^，。；]{0,8}${name}`))
    const count = countAfter?.[1] ?? countBefore?.[1]
    return { content: count ? `${name}${count}` : name, keywords: [name] }
  })
}

function clauses(text, pattern) {
  return text.split(/[。！；\n]/).map((item) => item.trim()).filter((item) => item && pattern.test(item)).slice(0, 10)
}

const facts = (items) => items.map((content) => ({ content, keywords: [] }))

export class LocalFactProvider {
  name = 'local-fact-extractor'

  async organize(rawInput) {
    const symptomKeywords = extractSymptomKeywords(rawInput)
    const temperature = extractTemperature(rawInput)
    const explicitlyDeniesFever = /(?:没有|没|无|未)\s*(?:发热|发烧|高烧)/.test(rawInput)
    if (temperature && temperature.max >= 37.3 && !explicitlyDeniesFever && !symptomKeywords.includes('发热')) symptomKeywords.push('发热')

    return normalizeOrganizedHealthData({
      symptoms: symptomKeywords.length ? [{ content: symptomKeywords.join('、'), keywords: symptomKeywords }] : [],
      temperature,
      medications: extractMedication(rawInput),
      visits: facts(clauses(rawInput, /医院|就诊|医生/)),
      examinations: facts(clauses(rawInput, /检查|化验|验血|血常规|报告/)),
      concerns: facts(clauses(rawInput, /担心|害怕|顾虑|是不是/)),
      attachments: [],
      timeline: extractTimeline(rawInput)
    })
  }
}
