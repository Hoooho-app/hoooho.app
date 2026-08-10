import { normalizeHealthAIOutput } from '../ai-types.mjs'

const symptomPatterns = [
  ['咳嗽', /咳嗽|咳/], ['发热', /发热|发烧|低烧|高烧/], ['喉咙痛', /喉咙痛|喉咙疼|咽痛/],
  ['手脚发凉', /手脚(?:有点)?(?:冷|凉)|手(?:有点)?(?:冷|凉)|脚(?:有点)?(?:冷|凉)/], ['腰痛', /腰疼|腰痛/],
  ['头痛', /头痛|头疼/], ['腹痛', /腹痛|肚子疼/], ['胃痛', /胃痛|胃疼/], ['疼痛', /疼|痛/], ['乏力', /乏力|没精神|精神不好|身体(?:稍微|有点)?发虚|发虚/],
  ['哮喘', /哮喘/],
  ['胸闷', /胸闷/], ['流鼻涕', /流鼻涕/], ['腹泻', /腹泻|拉肚子/], ['呕吐', /呕吐|吐了/], ['症状好转', /好一点|好一些|好转|缓解/], ['发冷', /(?:有点|感觉)?冷/],
  ['皮肤红肿', /皮肤红肿|红肿/], ['皮疹', /皮疹|红疹/], ['瘙痒', /瘙痒|发痒/],
  ['感冒表现', /像感冒|疑似感冒|感冒症状|感冒的?前兆|感觉感冒|感冒/]
]

const bodyParts = ['左手腕', '右手腕', '左手掌', '右手掌', '左手', '右手', '左腿', '右腿', '左脚', '右脚', '喉咙', '咽喉', '头', '颈', '肩', '胸', '腹', '腰', '手掌', '手腕', '手', '腿', '脚', '皮肤']
const medicationNames = ['退烧药', '感冒药', '美林', '布洛芬', '对乙酰氨基酚', '抗过敏药']
const negationWords = ['没有', '没', '无', '未', '不']
const timePattern = /\d{4}年(?:\s*\d{1,2}月(?:\s*\d{1,2}日?)?)?|(?:今天|昨天|前天)?(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)?\s*\d{1,2}(?:点(?:(?:半)|\d{1,2}分?)?|:\d{1,2})|(?:今天|昨天|前天)(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)?|今早|早上|上午|中午|下午|晚上|夜里|夜间|凌晨|半夜|上周|去年|小时候|几年前|以前/g
const temperaturePattern = /(\d{2}(?:\.\d+)?)\s*(?:℃|度)?\s*(?:到|至|-|~|～)\s*(\d{2}(?:\.\d+)?)\s*(?:℃|度)|(?:(\d{2})\s*度\s*(\d))|(?:(\d{2}(?:\.\d+)?)\s*(?:℃|度))/g

function isNegated(text, pattern) {
  const match = text.match(pattern)
  if (!match || match.index === undefined) return false
  const prefix = text.slice(Math.max(0, match.index - 4), match.index)
  return negationWords.some((word) => prefix.includes(word))
}

function timePrecision(raw) {
  if (!raw) return 'unknown'
  if (/\d{1,2}(?:点|:)/.test(raw)) return 'exact'
  if (/凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间/.test(raw)) return 'period'
  if (/今天|昨天|前天/.test(raw)) return 'day'
  return 'unknown'
}

function fact(type, name, sourceText, rawTime = null, extra = {}) {
  return {
    type,
    name,
    bodyPart: extra.bodyPart ?? null,
    sourceText,
    time: { raw: rawTime, resolvedStart: null, resolvedEnd: null, precision: timePrecision(rawTime) },
    confidence: extra.confidence ?? 0.9,
    ...(extra.temperature ? { temperature: extra.temperature } : {}),
    ...(type === 'status_change' ? { target: extra.target, change: extra.change } : {})
  }
}

function splitClauses(text) {
  let inheritedTime = null
  return text.split(/[，。；;！!？?\n]/).map((value) => value.trim()).filter(Boolean).map((sourceText) => {
    const matches = [...sourceText.matchAll(timePattern)]
    const rawTime = matches[0]?.[0]?.trim() || inheritedTime
    if (matches[0]?.[0]) inheritedTime = matches[0][0].trim()
    return { sourceText, rawTime }
  })
}

function extractBodyPart(text) {
  return bodyParts.find((part) => text.includes(part)) ?? null
}

function extractSymptoms(clause) {
  const bodyPart = extractBodyPart(clause.sourceText)
  const matches = []
  for (const [name, pattern] of symptomPatterns) {
    if (!pattern.test(clause.sourceText) || isNegated(clause.sourceText, pattern)) continue
    if (name === '疼痛' && matches.some((item) => item.name.endsWith('痛'))) continue
    matches.push(fact('symptom', name, clause.sourceText, clause.rawTime, { bodyPart }))
  }
  return matches
}

function extractTemperatures(clause) {
  if (/(?:没有|没|无|未)\s*(?:发热|发烧|高烧)/.test(clause.sourceText) && !/\d{2}/.test(clause.sourceText)) return []
  const matches = []
  temperaturePattern.lastIndex = 0
  for (const match of clause.sourceText.matchAll(temperaturePattern)) {
    let min
    let max
    if (match[1] && match[2]) {
      min = Number(match[1])
      max = Number(match[2])
    } else if (match[3] && match[4]) {
      min = max = Number(`${match[3]}.${match[4]}`)
    } else {
      min = max = Number(match[5])
    }
    if (!Number.isFinite(min) || min < 30 || min > 45 || !Number.isFinite(max) || max < 30 || max > 45) continue
    const temperature = { min: Math.min(min, max), max: Math.max(min, max), unit: '℃' }
    const name = temperature.min === temperature.max ? `${temperature.min}℃` : `${temperature.min}-${temperature.max}℃`
    matches.push(fact('temperature', name, clause.sourceText, clause.rawTime, { temperature, confidence: 0.98 }))
  }
  return matches
}

function extractMedications(clause) {
  return medicationNames.filter((name) => clause.sourceText.includes(name)).map((name) => {
    const countAfter = clause.sourceText.match(new RegExp(`${name}[^，。；]{0,8}(一次|两次|二次|三次|一片|两片|二片)`))
    const countBefore = clause.sourceText.match(new RegExp(`(一次|两次|二次|三次|一片|两片|二片)[^，。；]{0,8}${name}`))
    const count = countAfter?.[1] ?? countBefore?.[1]
    return fact('medication', count ? `${name}${count}` : name, clause.sourceText, clause.rawTime, { confidence: 0.96 })
  })
}

function extractOtherFacts(clause) {
  const output = []
  if (/医院|就诊|医生/.test(clause.sourceText)) output.push(fact('visit', clause.sourceText, clause.sourceText, clause.rawTime))
  if (/检查|化验|验血|血常规|报告/.test(clause.sourceText)) output.push(fact('examination', clause.sourceText, clause.sourceText, clause.rawTime))
  if (/担心|害怕|顾虑|是不是/.test(clause.sourceText)) output.push(fact('concern', clause.sourceText, clause.sourceText, clause.rawTime, { confidence: 0.85 }))
  return output
}

function explicitChangeTarget(text) {
  if (/发烧|发热|烧(?:退|得|更|高)/.test(text)) return '发热'
  if (/咳嗽|一直咳|咳/.test(text)) return '咳嗽'
  if (/腹痛|肚子疼/.test(text)) return '腹痛'
  if (/胃痛|胃疼/.test(text)) return '胃痛'
  if (/头痛|头疼/.test(text)) return '头痛'
  if (/喉咙痛|喉咙疼|咽痛/.test(text)) return '喉咙痛'
  if (/疼|痛/.test(text)) return '疼痛'
  return null
}

function extractStatusChanges(clause, recentTarget) {
  const text = clause.sourceText
  let change = null
  if (/退了一点|退了一些|好多了|好一点了?|好一些了?|好转|缓解|没有之前那么疼|没那么疼|烧退了一些|烧退了/.test(text)) change = 'improved'
  else if (/越来越疼|越来越严重|烧(?:得)?更高了|比昨天严重|加重/.test(text)) change = 'worsened'
  else if (/一直(?:在)?(?:咳嗽|咳|腹痛|肚子疼|胃痛|胃疼|头痛|头疼|不舒服)|还是不舒服|持续没有改善|一直没有缓解/.test(text)) change = 'persistent'
  if (!change) return []

  const target = explicitChangeTarget(text) ?? recentTarget ?? '当前症状'
  const changeName = change === 'improved' ? '好转' : change === 'worsened' ? '加重' : '持续'
  return [fact('status_change', `${target}${changeName}`, text, clause.rawTime, { target, change, confidence: 0.92 })]
}

export class LocalFactProvider {
  name = 'local-fact-extractor'

  async organize(rawInput) {
    const extracted = []
    let recentTarget = null
    for (const clause of splitClauses(rawInput)) {
      const symptoms = extractSymptoms(clause)
      if (symptoms.length) recentTarget = symptoms[0].name
      extracted.push(
        ...symptoms,
        ...extractTemperatures(clause),
        ...extractMedications(clause),
        ...extractOtherFacts(clause),
        ...extractStatusChanges(clause, recentTarget)
      )
    }
    const facts = extracted.filter((item, index) => extracted.findIndex((candidate) => (
      candidate.type === item.type
      && candidate.name === item.name
      && candidate.sourceText === item.sourceText
    )) === index)
    return normalizeHealthAIOutput({ facts, confidence: facts.length ? Math.min(...facts.map((item) => item.confidence)) : 0 })
  }
}
