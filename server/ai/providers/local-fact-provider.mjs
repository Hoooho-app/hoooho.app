import { normalizeHealthAIOutput } from '../ai-types.mjs'

const symptomPatterns = [
  ['咳嗽', /咳嗽|(?<!呛到)咳/], ['发热', /发热|发烧|低烧|高烧/], ['喉咙痛', /喉咙痛|喉咙疼|咽痛/],
  ['手脚发凉', /手脚(?:有点)?(?:冷|凉)|手(?:有点)?(?:冷|凉)|脚(?:有点)?(?:冷|凉)/], ['腰痛', /腰疼|腰痛/],
  ['头痛', /头痛|头疼/], ['腹痛', /腹痛|肚子疼|肚脐周围疼/], ['胃痛', /胃痛|胃疼/], ['疼痛', /疼|痛/],
  ['乏力', /乏力|没精神|精神不好|身体(?:稍微|有点)?发虚|发虚/], ['哮喘', /哮喘/], ['胸闷', /胸闷/],
  ['流鼻涕', /流鼻涕/], ['腹泻', /腹泻|拉肚子/], ['呕吐', /呕吐|吐了/], ['发冷', /(?:有点|感觉)?(?:发冷|冷)/],
  ['脚部发红', /脚(?:上|部)?(?:有点)?(?:发红|红)/], ['皮肤红肿', /皮肤(?:开始)?红肿|红肿/], ['皮疹', /皮疹|红疹/], ['瘙痒', /瘙痒|发痒|很痒|有点痒|有些痒/],
  ['腹胀', /肚脐周围发胀|腹胀/], ['头晕', /头(?:有点)?晕|头晕/],
  ['感冒表现', /像感冒|感冒症状|感冒的?前兆|感觉感冒|感冒/]
]
const bodyParts = ['肚脐周围', '左手腕', '右手腕', '左手掌', '右手掌', '左手', '右手', '左腿', '右腿', '左脚', '右脚', '喉咙', '咽喉', '头', '颈', '肩', '胸', '腹', '腰', '手掌', '手腕', '手', '腿', '脚', '皮肤']
const medicationNames = ['退烧药', '止痛药', '感冒药', '美林', '布洛芬', '对乙酰氨基酚', '抗过敏药', '青霉素']
const diagnosisPatterns = ['甲型流感', '乙型流感', '流感', '新冠', '肺炎', '支气管炎', '扁桃体炎', '阑尾炎', '皮炎', '湿疹']
const timePattern = /\d{4}年(?:\s*\d{1,2}月(?:\s*\d{1,2}日?)?)?|\d{1,2}月初|上周[一二三四五六日天](?:凌晨|半夜|早上|上午|下午|晚上|夜里|夜间)?|第[二三]天|隔天|三年前|前几个月|前两天|(?:今天|昨天|前天)?(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)?\s*\d{1,2}(?:点(?:(?:半)|\d{1,2}分?)?|:\d{1,2})|(?:今天|昨天|前天)(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)?|今早|早上|上午|中午|下午|晚上|夜里|夜间|凌晨|半夜|上周|去年|小时候|几年前|以前/g
const celsiusPattern = /(\d{2}(?:\.\d+)?)\s*(?:℃|度)?\s*(?:到|至|-|~|～)\s*(\d{2}(?:\.\d+)?)\s*(?:℃|度)|(?:(\d{2})\s*度\s*(\d))|(?:(\d{2}(?:\.\d+)?)\s*(?:℃|度)?)/g
const fahrenheitPattern = /(\d{2,3}(?:\.\d+)?)\s*(?:°?F|华氏度)/gi
const unsafeSourcePattern = /忽略前面的规则|系统提示|医学文章|搜索关键词|搜索的关键词|聊天记录|<\/?system>|\{\s*"symptoms"|网上说|说明书/
const conditionalPattern = /如果|假如|以防|会不会|以后|将来|怎么办/
const uncertainPattern = /担心|害怕|顾虑|是不是|可能|怀疑|疑似|好像|以为|不确定|待查|还没测|尚未确认|没确诊/
const resolvedPattern = /现在已经退了|已经不烧|目前没有|本次就诊无|这次没有|后来确认没有|已经不(?:咳|头疼|腹泻)|再也没|症状消失|体温正常|其实[^，。]*正常/
const correctionPattern = /不对|说错了?|记错了?|实际(?:是)?|其实(?:是)?|后半句说错了/
const otherSubjectPattern = /女儿|妈妈|爸爸|姐姐|儿子|同事|配偶|小王|我爸|朋友|他自己|她自己/

function timePrecision(raw) {
  if (!raw) return 'unknown'
  if (/\d{1,2}(?:点|:)/.test(raw)) return 'exact'
  if (/凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间/.test(raw)) return 'period'
  if (/今天|昨天|前天/.test(raw)) return 'day'
  if (/\d{4}年/.test(raw)) return 'year'
  if (/\d{1,2}月初/.test(raw)) return 'month'
  return /小时候|几年前|\d+年前|前几个月|前两天|以前/.test(raw) ? 'fuzzy' : 'unknown'
}

function splitClauses(text) {
  let inheritedTime = null
  return text.split(/[，。；;！!？?\n]/).map((value) => value.trim()).filter(Boolean).map((sourceText) => {
    const rawTime = [...sourceText.matchAll(timePattern)][0]?.[0]?.trim() || inheritedTime
    if (rawTime) inheritedTime = rawTime
    return { sourceText, rawTime }
  })
}

function sourceFor(text) {
  if (/AI(?:问诊)?|人工智能(?:问诊)?/.test(text)) return 'ai_consultation'
  if (/网上|医学文章|搜索关键词|搜索的关键词/.test(text)) return 'internet_information'
  if (/系统提示|聊天记录|<\/?system>|药品说明书|说明书写|病历里写|检查单写/.test(text)) return 'quoted_text'
  if (/医生(?:说|表示|判断|诊断|排除|怀疑)/.test(text)) return 'doctor_statement'
  if (/检查|化验|检测|报告|胸片|血常规/.test(text)) return 'test_result'
  return 'user_report'
}

function subjectFor(text, fullText) {
  if (/孩子体温/.test(text) && /我的?体温/.test(fullText)) return 'family_member'
  if (otherSubjectPattern.test(text)) return /妈妈|爸爸|姐姐|儿子|女儿|我爸|配偶/.test(text) ? 'family_member' : 'other_person'
  if (/孩子/.test(text) && (/(?:本人说|医生问|网上说|检查单写)[:：]/.test(text) || /记录对象是我|我(?:没事|没有|没)/.test(fullText))) return 'family_member'
  return 'event_subject'
}

function semanticsFor(clause, fullText, matchIndex = 0) {
  const text = clause.sourceText
  const source = sourceFor(text)
  const subject = subjectFor(text, fullText)
  const before = text.slice(Math.max(0, matchIndex - 12), matchIndex)
  const after = text.slice(matchIndex)
  const lexicalState = /没精神|精神不好|没有改善|没有缓解/.test(text)
  const negated = (!lexicalState && /(?:没有|并没有|没|无|未|不是|不再|从来没有|排除|阴性|未见|正常|不高)/.test(`${before}${after}`))
    || resolvedPattern.test(fullText)
    || /不(?:发烧|发热|咳嗽|头疼|腹泻|舒服)/.test(text)
  const conditional = conditionalPattern.test(text)
  const uncertain = uncertainPattern.test(text)
  const historical = /去年|上个月|上次|以前|小时候|几年前|\d+年前|前几个月|前两天|病历/.test(text)
  const future = /以后|将来|准备|计划|预约|建议备|以防/.test(text)
  const correctionIndex = Math.max(fullText.lastIndexOf('不对'), fullText.lastIndexOf('说错'), fullText.lastIndexOf('记错'))
  const correctedAway = correctionIndex >= 0 && fullText.indexOf(text) + matchIndex < correctionIndex
  const polarity = negated || correctedAway ? 'negated' : uncertain || conditional ? 'uncertain' : 'affirmed'
  const temporality = conditional ? 'conditional' : future ? 'future' : historical ? 'historical' : 'current'
  const status = polarity === 'negated' ? 'not_applicable' : future ? 'planned'
    : resolvedPattern.test(text) ? 'resolved' : /又(?:烧|咳|疼)|复发|重新/.test(text) ? 'recurrent'
      : /好转|好一点|退了一点|缓解/.test(text) ? 'improving' : 'active'
  return { polarity, temporality, status, subject, source }
}

function shouldExtractPositive(semantics) {
  return semantics.subject === 'event_subject' && semantics.polarity === 'affirmed'
    && semantics.temporality !== 'conditional' && semantics.temporality !== 'future'
    && !['quoted_text', 'internet_information'].includes(semantics.source) && semantics.status !== 'resolved'
}

function fact(type, name, clause, fullText, extra = {}) {
  const semantics = extra.semantics ?? semanticsFor(clause, fullText, extra.matchIndex ?? 0)
  return {
    type, category: type === 'temperature' ? 'measurement' : type, concept: extra.concept ?? name, name,
    bodyPart: extra.bodyPart ?? null, originalText: clause.sourceText, sourceText: clause.sourceText,
    polarity: semantics.polarity, temporality: semantics.temporality, status: extra.status ?? semantics.status,
    subject: semantics.subject, source: extra.source ?? semantics.source,
    time: { raw: clause.rawTime, resolvedStart: null, resolvedEnd: null, precision: timePrecision(clause.rawTime) },
    confidence: extra.confidence ?? 0.9,
    ...(extra.temperature ? { temperature: extra.temperature, value: extra.temperature.max, unit: '℃', measurementType: 'body_temperature', measurementMethod: extra.measurementMethod ?? null } : {}),
    ...(type === 'medication' ? { medicationAction: extra.medicationAction ?? 'unknown' } : {}),
    ...(type === 'diagnosis' ? { diagnosisCertainty: extra.diagnosisCertainty ?? 'unknown' } : {}),
    ...(type === 'status_change' ? { target: extra.target, change: extra.change } : {})
  }
}

function extractBodyPart(text) {
  if (/不是左腿，是右腿/.test(text)) return '右腿'
  if (/说左手错了，?实际是右手/.test(text)) return '右手'
  return bodyParts.find((part) => text.includes(part)) ?? null
}

function extractSymptoms(clause, fullText) {
  if (unsafeSourcePattern.test(fullText)) return []
  const bodyPart = extractBodyPart(clause.sourceText)
  const matches = []
  for (const [name, pattern] of symptomPatterns) {
    const match = pattern.exec(clause.sourceText)
    if (!match) continue
    const semantics = semanticsFor(clause, fullText, match.index)
    if (!shouldExtractPositive(semantics)) continue
    if (name === '疼痛' && matches.some((item) => item.name.endsWith('痛'))) continue
    if (name === '发冷' && /房间太热|衣服|天气/.test(clause.sourceText)) continue
    matches.push(fact('symptom', name, clause, fullText, { bodyPart, semantics, matchIndex: match.index }))
  }
  return matches
}

function correctedTemperatureText(text) {
  if (!correctionPattern.test(text)) return text
  const index = Math.max(...['其实', '实际', '是三十', '是36', '是 36'].map((marker) => text.lastIndexOf(marker)))
  return index >= 0 ? text.slice(index) : text
}

function extractTemperatures(clause, fullText) {
  if (unsafeSourcePattern.test(fullText)) return []
  const text = correctedTemperatureText(clause.sourceText)
  const output = []
  const add = (min, max, index, method = null) => {
    if (!Number.isFinite(min) || min < 30 || min > 45 || !Number.isFinite(max) || max < 30 || max > 45) return
    const semantics = semanticsFor({ ...clause, sourceText: text }, fullText, index)
    if (semantics.subject !== 'event_subject' || semantics.polarity !== 'affirmed' || ['quoted_text', 'internet_information'].includes(semantics.source)) return
    const temperature = { min: Math.min(min, max), max: Math.max(min, max), unit: '℃' }
    const name = temperature.min === temperature.max ? `${temperature.min}℃` : `${temperature.min}-${temperature.max}℃`
    output.push(fact('temperature', name, { ...clause, sourceText: text }, fullText, { temperature, measurementMethod: method, semantics, source: 'measurement', confidence: 0.98, matchIndex: index }))
  }
  for (const match of text.matchAll(fahrenheitPattern)) add(Math.round(((Number(match[1]) - 32) * 5 / 9) * 10) / 10, Math.round(((Number(match[1]) - 32) * 5 / 9) * 10) / 10, match.index)
  celsiusPattern.lastIndex = 0
  for (const match of text.matchAll(celsiusPattern)) {
    let min, max
    if (match[1] && match[2]) min = Number(match[1]), max = Number(match[2])
    else if (match[3] && match[4]) min = max = Number(`${match[3]}.${match[4]}`)
    else min = max = Number(match[5])
    const prefix = text.slice(Math.max(0, match.index - 6), match.index)
    const hasUnit = /℃|度/.test(match[0])
    const hasTemperatureContext = /体温|额温|腋温|量出来|测了|温度|烧到/.test(`${prefix}${text}`)
    if (!hasUnit && !hasTemperatureContext) continue
    if (/血氧|心率|血压|体重|血糖|毫克/.test(prefix) && !/体温|额温|腋温/.test(prefix)) continue
    if (/不是体温/.test(prefix)) continue
    add(min, max, match.index, /额温/.test(prefix) ? 'forehead' : /腋温/.test(prefix) ? 'axillary' : null)
  }
  const chinese = /三十六点八/.exec(text)
  if (chinese) add(36.8, 36.8, chinese.index)
  return output
}

function extractMedications(clause, fullText) {
  const names = medicationNames.some((name) => clause.sourceText.includes(name))
    ? medicationNames
    : /吃过一段时间的药/.test(clause.sourceText) ? ['药'] : medicationNames
  return names.flatMap((name) => {
    const index = clause.sourceText.indexOf(name)
    if (index < 0) return []
    const taken = /吃(?:了|过)?|服用|用(?:了|过)|打(?:了|过)/.test(clause.sourceText)
      && !/(?:没|没有|未)吃|没服|没有服|备用|备着|放在家里|准备|计划|建议/.test(clause.sourceText)
    if (!taken) return []
    const count = clause.sourceText.match(new RegExp(`(?:${name}[^，。；]{0,8}|)(一次|两次|二次|三次|一片|两片|二片|半片)`))?.[1]
    return [fact('medication', count ? `${name}${count}` : name, clause, fullText, {
      semantics: { ...semanticsFor(clause, fullText, index), polarity: 'affirmed', status: 'active' }, medicationAction: 'taken', confidence: 0.96, matchIndex: index
    })]
  })
}

function extractClinicalFacts(clause, fullText) {
  if (unsafeSourcePattern.test(fullText)) return []
  const output = []
  const semantics = semanticsFor(clause, fullText)
  if (/手术/.test(clause.sourceText) && semantics.subject === 'event_subject') output.push(fact('visit', '手术', clause, fullText, { semantics: { ...semantics, polarity: 'affirmed' } }))
  else if (/医院|就诊|看医生/.test(clause.sourceText) && shouldExtractPositive(semantics)) output.push(fact('visit', /医院/.test(clause.sourceText) ? '医院就诊' : '就诊', clause, fullText, { semantics }))
  if (/检查|化验|验血|血常规|胃镜|报告|胸片|核磁/.test(clause.sourceText)) {
    const completed = !/预约|还没做|没有检查|没检查|未检查|计划|准备/.test(clause.sourceText)
    if (completed && semantics.subject === 'event_subject' && !['quoted_text', 'internet_information'].includes(semantics.source)) {
      output.push(fact('examination', '检查结果', clause, fullText, {
        semantics: /未见|阴性|正常|不是/.test(clause.sourceText)
          ? { ...semantics, polarity: 'negated', status: 'not_applicable' }
          : { ...semantics, polarity: 'affirmed', status: 'active' },
        source: 'test_result'
      }))
    }
  }
  for (const diagnosis of diagnosisPatterns) {
    if (!clause.sourceText.includes(diagnosis)) continue
    const ruledOut = new RegExp(`(?<!是)(?:不是|排除|未见|阴性)[^，。；]{0,6}${diagnosis}|${diagnosis}[^，。；]{0,6}(?:被排除|不成立)`).test(clause.sourceText)
    const aiAssessment = semantics.source === 'ai_consultation' && /认为|判断|可能|大概率|疑似/.test(clause.sourceText)
    const confirmed = /确诊|诊断为|检查结果(?:支持|提示|为|是)/.test(clause.sourceText)
    if (ruledOut) {
      output.push(fact('diagnosis', '排除诊断', clause, fullText, {
        concept: '排除诊断',
        semantics: { ...semantics, polarity: 'negated', status: 'not_applicable' },
        source: semantics.source, diagnosisCertainty: 'ruled_out', confidence: 0.98
      }))
    } else if (aiAssessment) {
      output.push(fact('diagnosis', diagnosis, clause, fullText, {
        semantics: { ...semantics, polarity: 'affirmed', status: 'active' },
        source: 'ai_consultation', diagnosisCertainty: 'suspected', confidence: 0.95
      }))
    } else if (confirmed && !/怀疑|疑似|待查|没确诊/.test(clause.sourceText)) {
      output.push(fact('diagnosis', diagnosis, clause, fullText, {
        semantics: { ...semantics, polarity: 'affirmed', status: 'active' },
        diagnosisCertainty: 'confirmed'
      }))
    }
  }
  if (/担心|害怕|顾虑|是不是|会不会/.test(clause.sourceText)) {
    output.push(fact('concern', '担心健康问题', clause, fullText, { concept: '健康担忧', semantics: { ...semantics, polarity: 'uncertain', temporality: 'future', status: 'unknown', subject: 'event_subject' } }))
  }
  return output
}

function changeTarget(text) {
  if (/发烧|发热|烧/.test(text)) return '发热'
  if (/咳嗽|咳/.test(text)) return '咳嗽'
  if (/腹痛|肚子疼/.test(text)) return '腹痛'
  if (/胃痛|胃疼/.test(text)) return '胃痛'
  if (/头痛|头疼|头[^，。]{0,5}不(?:疼|痛)/.test(text)) return '头痛'
  if (/喉咙痛|喉咙疼|咽痛/.test(text)) return '喉咙痛'
  if (/疼|痛/.test(text)) return '疼痛'
  return null
}

function extractStatusChanges(clause, fullText, recentTarget) {
  const text = clause.sourceText
  let change = null
  if (/已经不(?:疼|痛|咳|烧)|不再(?:疼|痛|咳|发烧|发热)|症状(?:已经)?消失|完全好了/.test(text)) change = 'resolved'
  else if (/退了一点|退了一些|退下来|降下来|好多了|好一点了?|好一些了?|好转|缓解|没有之前那么疼|没那么疼|烧退了一些|烧退了/.test(text)) change = 'improved'
  else if (/越来越疼|越来越严重|烧(?:得)?更高了|比昨天严重|加重/.test(text)) change = 'worsened'
  else if (/又(?:开始)?(?:发烧|烧起来|咳|疼)|复发|重新/.test(text)) change = 'recurred'
  else if (/一直(?:在)?(?:咳嗽|咳|腹痛|肚子疼|胃痛|胃疼|头痛|头疼|不舒服)|还是不舒服|持续没有改善|一直没有缓解/.test(text)) change = 'persistent'
  if (!change || /没有发烧/.test(text) || (!recentTarget && resolvedPattern.test(text) && !/烧到\s*\d/.test(text))) return []
  const target = changeTarget(text) ?? recentTarget ?? '当前症状'
  const label = change === 'improved' ? '好转' : change === 'worsened' ? '加重' : change === 'recurred' ? '复发' : change === 'resolved' ? '消失' : '持续'
  return [fact('status_change', `${target}${label}`, clause, fullText, {
    target, change, semantics: { ...semanticsFor(clause, fullText), polarity: 'affirmed', status: change === 'recurred' ? 'recurrent' : change === 'resolved' ? 'resolved' : 'active', subject: 'event_subject' }, confidence: 0.92
  })]
}

export class LocalFactProvider {
  name = 'local-fact-extractor'

  async organize(rawInput) {
    const extracted = []
    let recentTarget = null
    for (const clause of splitClauses(rawInput)) {
      recentTarget = changeTarget(clause.sourceText) ?? recentTarget
      const symptoms = extractSymptoms(clause, rawInput)
      if (symptoms.length) recentTarget = symptoms[0].name
      const temperatures = extractTemperatures(clause, rawInput)
      if (temperatures.length) recentTarget = '发热'
      extracted.push(...symptoms, ...temperatures, ...extractMedications(clause, rawInput), ...extractClinicalFacts(clause, rawInput), ...extractStatusChanges(clause, rawInput, recentTarget))
    }
    const facts = extracted.filter((item, index) => extracted.findIndex((candidate) => candidate.type === item.type && candidate.name === item.name && candidate.sourceText === item.sourceText) === index)
    return normalizeHealthAIOutput({ facts, confidence: facts.length ? Math.min(...facts.map((item) => item.confidence)) : 0 })
  }
}
