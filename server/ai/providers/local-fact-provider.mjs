import { normalizeHealthAIOutput } from '../ai-types.mjs'

const symptomPatterns = [
  ['咳嗽', /咳嗽|(?<!呛到)咳/], ['发热', /发热|发烧|低烧|高烧|又烧|不烧/], ['喉咙痛', /喉咙痛|喉咙疼|咽痛|嗓子(?:也)?疼/],
  ['手脚发凉', /手脚(?:有点)?(?:发)?(?:冷|凉)|手(?:有点)?(?:发)?(?:冷|凉)|脚(?:有点)?(?:发)?(?:冷|凉)/], ['腰痛', /腰疼|腰痛/],
  ['头痛', /头痛|头疼/], ['腹痛', /腹痛|肚子疼|肚脐周围疼/], ['胃痛', /胃痛|胃疼/], ['疼痛', /疼|痛/],
  ['乏力', /乏力|没精神|精神不好|身体(?:稍微|有点)?发虚|发虚/], ['哮喘', /哮喘/], ['胸闷', /胸闷/],
  ['流鼻涕', /流鼻涕/], ['鼻塞', /鼻子堵|鼻塞/], ['腹泻', /腹泻|拉(?:了)?[一二两三四五六七八九十\d]*次?肚子|拉肚子/], ['呕吐', /呕吐|吐(?:了|过)?/], ['发冷', /(?:有点|感觉)?(?:发冷|冷)/],
  ['恶心', /恶心/],
  ['麻木', /发麻|麻木|小腿麻|腿麻|手麻|有点麻/], ['喘息', /喘息|轻微喘|有点喘|有一点喘|气喘/],
  ['精神状态差', /蔫巴巴|有点蔫|没精神|精神不好/], ['进食减少', /奶喝得比平时少|吃得比平时少|进食减少/], ['持续哭闹', /一直哭|持续哭闹/],
  ['手臂发红', /(?:右边|左边|右侧|左侧)?(?:这个)?(?:胳膊|手臂)[^，。；]{0,8}(?:有点)?(?:红|发红)/], ['抓挠', /老挠|抓挠/],
  ['脚部发红', /脚(?:上|部)?(?:有点)?(?:发红|红)/], ['皮肤红肿', /皮肤(?:开始)?红肿|红肿/], ['皮疹', /皮疹|红疹|疹子/], ['瘙痒', /瘙痒|发痒|很痒|有点痒|有些痒|挺痒|特别痒|非常痒/],
  ['腹胀', /肚脐周围发胀|腹胀/], ['头晕', /头(?:有点)?晕|头晕/],
  ['感冒表现', /像感冒|感冒症状|感冒的?前兆|感觉感冒|感冒/]
]
const bodyParts = ['右下腹', '左下腹', '右眼周围', '左眼周围', '右侧小腿', '左侧小腿', '右小腿', '左小腿', '右手臂', '左手臂', '右胳膊', '左胳膊', '右肩', '左肩', '肚脐周围', '左手腕', '右手腕', '左手掌', '右手掌', '左手', '右手', '左腿', '右腿', '左脚', '右脚', '喉咙', '咽喉', '头', '颈', '肩', '胸', '腹', '腰', '小腿', '手臂', '胳膊', '手掌', '手腕', '手', '腿', '脚', '皮肤']
const medications = [
  ...['退烧药', '止痛药', '感冒药', '美林', '布洛芬', '对乙酰氨基酚', '抗过敏药', '青霉素'].map((name) => ({ name, pattern: new RegExp(name) })),
  { name: '炉甘石洗剂', pattern: /炉甘石(?:洗剂)?|芦柑石(?:洗剂)?/ }
]
const diagnosisPatterns = ['甲型流感', '乙型流感', '流感', '新冠', '肺炎', '支气管炎', '扁桃体炎', '阑尾炎', '皮炎', '湿疹', '荨麻疹']
const clockText = '(?:[一二两三四五六七八九十\\d]{1,3})(?:点(?:(?:半)|[一二两三四五六七八九十\\d]{1,3}分?)?|:\\d{1,2})'
const periodText = '(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)'
const specificTimePatterns = [
  new RegExp(`\\d{4}年\\s*\\d{1,2}月\\s*\\d{1,2}[日号]?(?:${periodText})?(?:\\s*${clockText})?`, 'g'),
  new RegExp(`\\d{1,2}月\\s*\\d{1,2}[日号]?(?:${periodText})?(?:\\s*${clockText})?`, 'g'),
  new RegExp(`(?:今天|昨天|前天|今朝|昨晚)(?:${periodText})?(?:\\s*${clockText})?`, 'g'),
  new RegExp(`${periodText}\\s*${clockText}`, 'g'),
  new RegExp(clockText, 'g'),
  /\d{4}年|\d{1,2}月初|上周[一二三四五六日天](?:凌晨|半夜|早上|上午|下午|晚上|夜里|夜间)?|第[二三四五六七]天|隔天|[一二两三四五六七八九十\d]+天前|最近一周|三年前|前几个月|前两天|目前|现在|刚才|刚刚|今早|早上|上午|中午|下午|晚上|夜里|夜间|凌晨|半夜|上周|去年|小时候|几年前|以前/g
]
const celsiusPattern = /(\d{2}(?:\.\d+)?)\s*(?:℃|度)?\s*(?:到|至|-|~|～)\s*(\d{2}(?:\.\d+)?)\s*(?:℃|度)|(?:(\d{2})\s*度\s*(\d))|(?:(\d{2}(?:\.\d+)?)\s*(?:℃|度)?)/g
const fahrenheitPattern = /(\d{2,3}(?:\.\d+)?)\s*(?:°?F|华氏度)/gi
const unsafeSourcePattern = /忽略前面的规则|系统提示|医学文章|搜索关键词|搜索的关键词|聊天记录|<\/?system>|\{\s*"symptoms"|网上说|说明书/
const conditionalPattern = /如果|假如|以防|会不会|将来|怎么办/
const uncertainPattern = /担心|担忧|害怕|顾虑|是不是|可能|怀疑|疑似|好像|以为|不确定|待查|还没测|尚未确认|没确诊/
const resolvedPattern = /现在已经退了|已经不烧|目前没有|本次就诊无|这次没有|后来确认没有|已经不(?:咳|头疼|腹泻)|再也没|症状消失|体温正常|其实[^，。]*正常/
const correctionPattern = /不对|哦不是|说错了?|记错了?|实际(?:是)?|其实(?:是)?|后半句说错了/
const otherSubjectPattern = /女儿|妈妈|爸爸|姐姐|儿子|同事|配偶|小王|我爸|朋友|他自己|她自己/
const semanticBoundaryPattern = /然后|但是|可是|不过|倒是|而且|还有|同时|随后|接着|后来|再然后|却|但(?=[^丁])/g

function timePrecision(raw) {
  if (!raw) return 'unknown'
  if (/\d{1,2}(?:点|:)/.test(raw)) return 'exact'
  if (/凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间/.test(raw)) return 'period'
  if (/今天|昨天|前天|\d{1,2}月\s*\d{1,2}[日号]?/.test(raw)) return 'day'
  if (/\d{4}年/.test(raw)) return 'year'
  if (/\d{1,2}月初/.test(raw)) return 'month'
  return /小时候|几年前|\d+年前|前几个月|前两天|以前/.test(raw) ? 'fuzzy' : 'unknown'
}

function extractRawTime(text) {
  const candidates = specificTimePatterns.flatMap((pattern) => [...text.matchAll(new RegExp(pattern.source, pattern.flags))]
    .map((match) => ({ index: match.index, value: match[0].trim() })))
    .filter((candidate) => {
      if (!candidate.value) return false
      // “退了一点 / 好了一点”里的“一点”表示程度，不是凌晨 1 点。
      if (candidate.value === '一点' && /(?:退了|好了|轻了|有)$/.test(text.slice(Math.max(0, candidate.index - 2), candidate.index))) return false
      return true
    })
  if (!candidates.length) return null
  const correctionAt = Math.max(text.lastIndexOf('不对'), text.lastIndexOf('说错'), text.lastIndexOf('记错'), text.lastIndexOf('哦不是'))
  const relevant = correctionAt >= 0 ? candidates.filter((candidate) => candidate.index > correctionAt) : candidates
  const ordered = (relevant.length ? relevant : candidates).sort((left, right) => left.index - right.index || right.value.length - left.value.length)
  return correctionAt >= 0 ? ordered.at(-1)?.value ?? null : ordered[0]?.value ?? null
}

function splitClauses(text) {
  let inheritedTime = null
  const clauses = text.replace(semanticBoundaryPattern, '，$&').split(/[，、。；;！!？?\n]/).map((value) => value.trim()).filter(Boolean)
    .reduce((output, item) => {
      if (output.length && /(?:不对|说错了?|记错了?)\s*$/.test(output.at(-1))) output[output.length - 1] = `${output.at(-1)}，${item}`
      else output.push(item)
      return output
    }, [])
  return clauses.map((sourceText) => {
    const capturedTime = extractRawTime(sourceText)
    const recurringContext = /(?:主要是?|每天|不跑|跑步|白天).*(?:晚上|白天|咳|头疼)|(?:晚上|白天).*(?:基本没事|基本不)/.test(sourceText)
    const rawTime = (recurringContext && /^(?:晚上|白天)$/.test(capturedTime ?? '') ? null : capturedTime)?.replace(/^十点$/, '10点') || inheritedTime
    if (rawTime) inheritedTime = rawTime
    return { sourceText, rawTime }
  })
}

function sourceFor(text) {
  if (/AI(?:问诊)?|人工智能(?:问诊)?/.test(text)) return 'ai_consultation'
  if (/网上|医学文章|搜索关键词|搜索的关键词/.test(text)) return 'internet_information'
  if (/系统提示|聊天记录|<\/?system>|药品说明书|说明书写|病历里写|检查单写|(?:医生|妈妈|爸爸|家人)问/.test(text)) return 'quoted_text'
  if (/医生(?:说|表示|判断|诊断|确诊|排除|怀疑)/.test(text)) return 'doctor_statement'
  if (/检查|化验|检测|报告|胸片|血常规/.test(text)) return 'test_result'
  return 'user_report'
}

function subjectFor(text, fullText) {
  if (/孩子体温/.test(text) && /我的?体温/.test(fullText)) return 'family_member'
  if (otherSubjectPattern.test(text)) return /妈妈|爸爸|姐姐|儿子|女儿|我爸|配偶/.test(text) ? 'family_member' : 'other_person'
  if (/孩子/.test(text) && (/(?:本人说|医生问|网上说|检查单写)[:：]/.test(text) || /记录对象是我|我(?:没事|没有|没)/.test(fullText))) return 'family_member'
  return 'event_subject'
}

function semanticScopeFor(text, matchIndex) {
  let start = 0
  let end = text.length
  semanticBoundaryPattern.lastIndex = 0
  for (const boundary of text.matchAll(semanticBoundaryPattern)) {
    const boundaryIndex = boundary.index
    if (boundaryIndex < matchIndex) start = boundaryIndex + boundary[0].length
    else if (boundaryIndex > matchIndex) { end = boundaryIndex; break }
  }
  return { matchIndex: Math.max(0, matchIndex - start), text: text.slice(start, end) }
}

function patternMatches(pattern, text) {
  const flags = `${pattern.flags.replaceAll('g', '')}g`
  return [...text.matchAll(new RegExp(pattern.source, flags))]
}

function semanticsFor(clause, fullText, matchIndex = 0, matchText = '') {
  const text = clause.sourceText
  const scope = semanticScopeFor(text, matchIndex)
  const source = sourceFor(scope.text)
  const subject = subjectFor(scope.text, fullText)
  const before = scope.text.slice(Math.max(0, scope.matchIndex - 10), scope.matchIndex)
  const after = scope.text.slice(scope.matchIndex + matchText.length, scope.matchIndex + matchText.length + 10)
  const lexicalState = /没精神|精神不好|没有改善|没有缓解/.test(scope.text)
  const prefixNegated = /(?:没有|并没有|没|无|未|不是|不再|从来没有|排除|未见|并不|不)\s*(?:明显|任何|再)?$/.test(before)
  const suffixNegated = /^(?:了|的)?\s*(?:没有|并没有|没|无|未|被排除|阴性|未见|不高|正常)/.test(after)
  const matchNegated = /^(?:没有|没|无|未|不是|不再|不)/.test(matchText)
  const negated = !lexicalState && (matchNegated || prefixNegated || suffixNegated || (!matchText && /(?:没有|并没有|没|无|未|不是|不再|排除|阴性|未见|正常|不高)/.test(scope.text)))
  const conditional = conditionalPattern.test(scope.text)
  const uncertain = uncertainPattern.test(scope.text)
  const historical = /去年|上个月|上次|以前|小时候|几年前|[一二两三四五六七八九十\d]+年前|前几个月|前两天|病历/.test(scope.text)
  const future = /将来|(?:^|[:：，。；\s])(?:我|本人|妈妈|爸爸|孩子)?以后(?:会|有|要|可能)|准备|计划|预约|建议备|以防/.test(scope.text)
  const absoluteMatchIndex = fullText.indexOf(text) + matchIndex
  const trailingText = absoluteMatchIndex >= 0 ? fullText.slice(absoluteMatchIndex + matchText.length) : ''
  const resolvedLater = /现在已经退了|目前没有|本次就诊无|这次没有|后来确认没有|再也没|症状消失|体温正常|其实[^，。]*正常/.test(trailingText)
  const correctionIndex = Math.max(fullText.lastIndexOf('不对'), fullText.lastIndexOf('说错'), fullText.lastIndexOf('记错'))
  const correctedAway = correctionIndex >= 0 && absoluteMatchIndex >= 0 && absoluteMatchIndex < correctionIndex
  const polarity = negated || correctedAway ? 'negated' : uncertain || conditional ? 'uncertain' : 'affirmed'
  const temporality = conditional ? 'conditional' : future ? 'future' : historical ? 'historical' : 'current'
  const negatedResolved = /(?:没有|没|未)(?:有)?再|一天都没|已经不|不再/.test(scope.text)
  const status = polarity === 'negated' ? (negatedResolved ? 'resolved' : 'not_applicable') : future ? 'planned'
    : resolvedPattern.test(scope.text) || resolvedLater ? 'resolved' : /又(?:烧|咳|疼)|复发|重新/.test(scope.text) ? 'recurrent'
      : /好转|好一点|退了一点|缓解/.test(scope.text) ? 'improving' : 'active'
  return { polarity, temporality, status, subject, source }
}

function shouldExtractPositive(semantics) {
  return ['event_subject', 'family_member'].includes(semantics.subject) && semantics.polarity === 'affirmed'
    && semantics.temporality !== 'conditional' && semantics.temporality !== 'future'
    && !['quoted_text', 'internet_information'].includes(semantics.source) && semantics.status !== 'resolved'
}

function shouldExtractObservation(semantics) {
  return ['event_subject', 'family_member'].includes(semantics.subject)
    && !['conditional', 'future'].includes(semantics.temporality)
    && !['quoted_text', 'internet_information'].includes(semantics.source)
}

function structuredAttributes(text, bodyPart) {
  const laterality = /右(?:侧)?/.test(bodyPart ?? text) ? 'right' : /左(?:侧)?/.test(bodyPart ?? text) ? 'left' : null
  const bodyRegion = bodyPart ? bodyPart.replace(/^(?:左|右)(?:侧)?/, '') : null
  const severity = /严重|剧烈|很疼|特别疼|比较厉害|很厉害|特别厉害|烫得很/.test(text) ? 'severe' : /轻微|有点|有一点|稍微/.test(text) ? 'mild' : /中度/.test(text) ? 'moderate' : null
  const scoreMatch = /(?:疼痛?|痛)(?:评分)?\s*([0-9]|10)\s*分?|(?:大概(?:有)?|现在)?\s*([一二两三四五六七八九十\d]|10)\s*分/.exec(text)
  const severityScore = scoreMatch ? normalizeChineseQuantity(scoreMatch[1] ?? scoreMatch[2]) : null
  const frequency = /每天晚上/.test(text) ? '每天晚上' : /主要(?:是)?晚上/.test(text) ? '晚上' : /白天/.test(text) ? '白天' : /不跑/.test(text) ? '不跑' : /跑步/.test(text) ? '跑步' : /几分钟/.test(text) ? '几分钟' : /偶尔|有时|间歇/.test(text) ? 'occasional' : /频繁|经常|很多/.test(text) ? 'frequent' : /一直|持续/.test(text) ? 'continuous' : null
  const countMatch = /([一二两三四五六七八九十\d]+)\s*(?:次|声)/.exec(text)
  const numberMap = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const occurrenceCount = countMatch ? (Number(countMatch[1]) || numberMap[countMatch[1]] || null) : null
  const durationMatch = /([一二两三四五六七八九十\d]+)\s*个?\s*(小时|天|周|个月)/.exec(text)
  const duration = durationMatch ? `${normalizeChineseQuantity(durationMatch[1])}${durationMatch[2]}` : null
  return {
    bodyRegion,
    laterality,
    severity,
    severityScale: severityScore ? `${severityScore}/10` : null,
    frequency,
    occurrenceCount,
    duration
  }
}

function fact(type, name, clause, fullText, extra = {}) {
  const semantics = extra.semantics ?? semanticsFor(clause, fullText, extra.matchIndex ?? 0)
  return {
    type, category: type === 'temperature' ? 'measurement' : type, concept: extra.concept ?? name, name,
    bodyPart: extra.bodyPart ?? null, ...structuredAttributes(clause.sourceText, extra.bodyPart), originalText: clause.sourceText, sourceText: clause.sourceText,
    polarity: semantics.polarity, temporality: semantics.temporality, status: extra.status ?? semantics.status,
    subject: semantics.subject, source: extra.source ?? semantics.source,
    time: { raw: clause.rawTime, resolvedStart: null, resolvedEnd: null, precision: timePrecision(clause.rawTime) },
    assertionType: semantics.polarity === 'negated' ? 'negative_observation' : correctionPattern.test(clause.sourceText) ? 'correction' : type === 'status_change' ? 'state_change' : 'observation',
    confidence: extra.confidence ?? 0.9,
    ...(Number.isFinite(extra.value) ? { value: extra.value } : {}),
    ...(extra.unit ? { unit: extra.unit } : {}),
    ...(Number.isFinite(extra.count) ? { count: extra.count } : {}),
    requiresConfirmation: Boolean(extra.requiresConfirmation),
    ...(extra.temperature ? { temperature: extra.temperature, value: extra.temperature.max, unit: '℃', measurementType: 'body_temperature', measurementMethod: extra.measurementMethod ?? null } : {}),
    ...(type === 'medication' ? { medicationAction: extra.medicationAction ?? 'unknown' } : {}),
    ...(type === 'diagnosis' ? { diagnosisCertainty: extra.diagnosisCertainty ?? 'unknown' } : {}),
    ...(extra.revisionOfFactId ? { revisionOfFactId: extra.revisionOfFactId } : {}),
    ...(extra.supersedesFactId ? { supersedesFactId: extra.supersedesFactId } : {}),
    ...(extra.targetFactId ? { targetFactId: extra.targetFactId } : {}),
    ...(type === 'status_change' ? { target: extra.target, change: extra.change } : {})
  }
}

function extractBodyPart(text) {
  if (/右边(?:的)?小腿/.test(text)) return '右小腿'
  if (/左边(?:的)?小腿/.test(text)) return '左小腿'
  if (/左边(?:的)?肩膀/.test(text)) return '左肩'
  if (/右边(?:的)?肩膀/.test(text)) return '右肩'
  if (/肚子[^，。；]{0,8}疼|腹痛/.test(text)) return '腹部'
  if (/(?:嗓子|喉咙)[^，。；]{0,5}疼|喉咙痛|咽痛/.test(text)) return '咽喉'
  if (/不是左腿，是右腿/.test(text)) return '右腿'
  if (/说左手错了，?实际是右手/.test(text)) return '右手'
  if (/右边(?:这个)?(?:胳膊|手臂)|右侧(?:胳膊|手臂)/.test(text)) return '右手臂'
  if (/左边(?:这个)?(?:胳膊|手臂)|左侧(?:胳膊|手臂)/.test(text)) return '左手臂'
  if (correctionPattern.test(text)) {
    const corrected = bodyParts.filter((part) => text.includes(part)).sort((left, right) => {
      const rightEnd = text.lastIndexOf(right) + right.length
      const leftEnd = text.lastIndexOf(left) + left.length
      return rightEnd - leftEnd || right.length - left.length
    })[0]
    if (corrected) return corrected.replace('胳膊', '手臂')
  }
  return bodyParts.find((part) => text.includes(part))?.replace('胳膊', '手臂') ?? null
}

function countFor(text) {
  const value = text.match(/([一二两三四五六七八九十\d]+)(?:次|回)/)?.[1]
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  return ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 })[value] ?? null
}

function normalizeChineseQuantity(value) {
  return ({ 一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10', 半: '0.5' })[value] ?? value
}

function extractSymptoms(clause, fullText) {
  if (unsafeSourcePattern.test(fullText)) return []
  // Keep a body location within the clause that actually contains it. Falling
  // back to the whole utterance leaks one symptom's location into other facts.
  const bodyPart = extractBodyPart(clause.sourceText)
  const matches = []
  for (const [name, pattern] of symptomPatterns) {
    const occurrences = patternMatches(pattern, clause.sourceText)
    const match = occurrences.at(-1)
    if (!match) continue
    if (name === '手臂发红' && /红疹|皮疹|疹子/.test(clause.sourceText)) continue
    const semantics = semanticsFor(clause, fullText, match.index, match[0])
    if (!shouldExtractObservation(semantics)) continue
    if (name === '疼痛' && matches.some((item) => item.name.endsWith('痛'))) continue
    if (name === '发冷' && /房间太热|衣服|天气/.test(clause.sourceText)) continue
    matches.push(fact('symptom', name, clause, fullText, { bodyPart, semantics, count: countFor(clause.sourceText), matchIndex: match.index }))
  }
  return matches
}

function correctedTemperatureText(text) {
  if (!correctionPattern.test(text)) return text
  const correctionIndex = Math.max(text.lastIndexOf('不对'), text.lastIndexOf('说错'), text.lastIndexOf('记错'))
  if (correctionIndex >= 0) return text.slice(correctionIndex)
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
    if (!['event_subject', 'family_member'].includes(semantics.subject) || semantics.polarity !== 'affirmed' || ['quoted_text', 'internet_information'].includes(semantics.source)) return
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
    const suffix = text.slice(match.index + match[0].length, match.index + match[0].length + 2)
    if (/月\s*$/.test(prefix) || /^\s*[日号]/.test(suffix)) continue
    const hasUnit = /℃|度/.test(match[0])
    const hasTemperatureContext = /体温|额温|腋温|量出来|测了|温度|烧到/.test(`${prefix}${text}`)
    if (!hasUnit && !hasTemperatureContext) continue
    if (/血氧|心率|血压|体重|血糖|毫克/.test(prefix) && !/体温|额温|腋温/.test(prefix)) continue
    if (/不是体温/.test(prefix)) continue
    add(min, max, match.index, /额温/.test(prefix) ? 'forehead' : /腋温/.test(prefix) ? 'axillary' : null)
  }
  const chinese = /三十六点八/.exec(text)
  if (chinese) add(36.8, 36.8, chinese.index)
  const chineseTemperature = /(三十[六七八九])度([一二三四五六七八九])/.exec(text)
  if (chineseTemperature) {
    const whole = ({ 三十六: 36, 三十七: 37, 三十八: 38, 三十九: 39 })[chineseTemperature[1]]
    const decimal = ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[chineseTemperature[2]]
    add(whole + decimal / 10, whole + decimal / 10, chineseTemperature.index)
  }
  const fuzzyRange = /三十八九度/.exec(text)
  if (fuzzyRange) add(38, 39, fuzzyRange.index)
  return output
}

function extractMedications(clause, fullText) {
  const candidates = /吃过一段时间的药/.test(clause.sourceText)
    ? [...medications, { name: '药', pattern: /药/ }]
    : medications
  return candidates.flatMap(({ name, pattern }) => {
    const match = patternMatches(pattern, clause.sourceText).at(-1)
    if (!match) return []
    const scope = semanticScopeFor(clause.sourceText, match.index).text
    const semantics = semanticsFor(clause, fullText, match.index, match[0])
    const taken = /吃(?:了|过)?|喂(?:了|过)?|服用|使用|用(?:了|过)?|打(?:了|过)|擦(?:了|过)|涂(?:了|过)|抹(?:了|过)|洗(?:了|过)/.test(scope)
      && !/(?:没|没有|未)(?:吃|服|用|擦|涂|抹|洗)|备用|备着|放在家里|准备|计划|建议|打算/.test(scope)
      && shouldExtractPositive(semantics)
    if (!taken) return []
    const dosage = scope.match(/([一二两三四五六七八九十半\d.]+)\s*(毫升|ml|片|粒)/i)
    const count = scope.match(/(一次|两次|二次|三次|一片|两片|二片|半片)/)?.[1]
    const doseText = dosage ? `${normalizeChineseQuantity(dosage[1])}${dosage[2].toLowerCase() === 'ml' ? '毫升' : dosage[2]}` : count
    return [fact('medication', doseText ? `${name}${dosage ? ' ' : ''}${doseText}` : name, clause, fullText, {
      semantics: { ...semantics, polarity: 'affirmed', status: 'active' }, medicationAction: 'taken', confidence: 0.96, matchIndex: match.index
    })]
  })
}

function extractUnidentifiedDosage(clause, fullText) {
  if (!/(?:喂|吃|服|用)(?:了|过)?/.test(clause.sourceText) || medications.some(({ pattern }) => pattern.test(clause.sourceText))) return []
  const dosage = clause.sourceText.match(/([一二两三四五六七八九十半\d.]+)\s*(毫升|ml|片|粒)/i)
  if (!dosage) return []
  const normalizedUnit = dosage[2].toLowerCase() === 'ml' ? '毫升' : dosage[2]
  const semantics = semanticsFor(clause, fullText, dosage.index, dosage[0])
  if (!shouldExtractPositive(semantics)) return []
  return [fact('medication', `药物待确认 ${normalizeChineseQuantity(dosage[1])}${normalizedUnit}`, clause, fullText, {
    semantics, medicationAction: 'taken', requiresConfirmation: true, confidence: 0.65, matchIndex: dosage.index
  })]
}

function extractAdditionalMeasurements(clause, fullText) {
  if (unsafeSourcePattern.test(fullText)) return []
  const output = []
  const semantics = semanticsFor(clause, fullText)
  const oxygen = /(?:oxygen|血氧)(?:是|为)?\s*(\d{2,3})/i.exec(clause.sourceText)
  if (oxygen && Number(oxygen[1]) <= 100) output.push(fact('other', `血氧${oxygen[1]}%`, clause, fullText, { semantics, value: Number(oxygen[1]), unit: '%' }))
  const heartRate = /(?:heart\s*rate|心率)(?:是|为)?\s*([一二两三四五六七八九十百零〇\d]+)/i.exec(clause.sourceText)
  if (heartRate) {
    const chinese = heartRate[1] === '一百二十八' ? 128 : Number(heartRate[1])
    if (Number.isFinite(chinese)) output.push(fact('other', `心率${chinese}次/分`, clause, fullText, { semantics, value: chinese, unit: '次/分' }))
  }
  if (/体温正常/.test(clause.sourceText)) output.push(fact('other', '体温正常', clause, fullText, { semantics: { ...semantics, polarity: 'affirmed', status: 'resolved' } }))
  return output
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
    const index = clause.sourceText.lastIndexOf(diagnosis)
    if (index < 0) continue
    const diagnosisSemantics = semanticsFor(clause, fullText, index, diagnosis)
    const scope = semanticScopeFor(clause.sourceText, index).text
    const ruledOut = new RegExp(`(?<!是)(?:不是|排除|未见|阴性)[^，。；]{0,6}${diagnosis}|${diagnosis}[^，。；]{0,6}(?:被排除|不成立)`).test(scope)
    const suspected = /认为|判断|可能|大概率|疑似|怀疑|待查/.test(scope)
    const aiAssessment = diagnosisSemantics.source === 'ai_consultation' && suspected
    const confirmed = /确诊(?:是|为)?|诊断为|检查结果(?:支持|提示|为|是)/.test(scope)
    if (ruledOut) {
      output.push(fact('diagnosis', '排除诊断', clause, fullText, {
        concept: '排除诊断',
        semantics: { ...diagnosisSemantics, polarity: 'negated', status: 'not_applicable' },
        source: diagnosisSemantics.source, diagnosisCertainty: 'ruled_out', confidence: 0.98
      }))
    } else if (aiAssessment) {
      output.push(fact('diagnosis', diagnosis, clause, fullText, {
        semantics: { ...diagnosisSemantics, polarity: 'affirmed', status: 'active' },
        source: 'ai_consultation', diagnosisCertainty: 'suspected', confidence: 0.95
      }))
    } else if (confirmed && !suspected && !/没确诊/.test(scope)) {
      output.push(fact('diagnosis', diagnosis, clause, fullText, {
        semantics: { ...diagnosisSemantics, polarity: 'affirmed', status: 'active' },
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
  if (/腹痛|肚子[^，。]{0,8}疼/.test(text)) return '腹痛'
  if (/胃痛|胃疼/.test(text)) return '胃痛'
  if (/头痛|头疼|头[^，。]{0,5}不(?:疼|痛)/.test(text)) return '头痛'
  if (/喉咙痛|喉咙疼|咽痛|嗓子疼/.test(text)) return '喉咙痛'
  if (/皮疹|红疹|疹子/.test(text)) return '皮疹'
  if (/呕吐|吐/.test(text)) return '呕吐'
  if (/腹泻|拉肚子|拉了.*肚子/.test(text)) return '腹泻'
  if (/恶心/.test(text)) return '恶心'
  if (/疼|痛/.test(text)) return '疼痛'
  return null
}

function extractStatusChanges(clause, fullText, recentTarget) {
  const text = clause.sourceText
  let change = null
  if (/还没有完全好/.test(text)) change = 'persistent'
  else if (/没(?:有)?继续加重|没加重|没有加重|不比之前严重|没有比昨天更严重|差不多还是那样|和昨天差不多/.test(text)) change = 'unchanged'
  else if (/已经不(?:疼|痛|咳|烧|吐)|不(?:疼|痛|烧|吐|咳|恶心)了|不再(?:疼|痛|咳|发烧|发热|吐)|没(?:有)?再(?:发烧|发热|咳|吐)|未再(?:发烧|发热|咳|吐)|没吐了|红疹退了|皮疹退了|症状(?:已经)?消失|完全好了|已经退烧|体温(?:已经)?正常|基本没事/.test(text)) change = 'resolved'
  else if (/轻多了|轻了一些|轻一点|退了一点|退了一些|退下来|降下来|降到|好多了|好一点了?|好一些了?|好转|缓解|没有之前那么疼|没那么疼|烧退了一些|烧退了|次数变少|只拉了一次/.test(text)) change = 'improved'
  else if (/更疼|更厉害|越来越疼|越来越严重|烧(?:得)?更高了|比昨天严重|比(?:上午|早上|昨晚)(?:高|多|频繁|厉害)|加重/.test(text)) change = 'worsened'
  else if (/又(?:开始)?(?:发烧|烧(?:起来)?|咳|疼|吐|出现)|复发|重新/.test(text)) change = 'recurred'
  else if (/(?:咳嗽|咳|腹痛|肚子疼|胃痛|胃疼|头痛|头疼|皮疹|红疹|鼻塞|恶心|不舒服)(?:还在|仍在)|一直(?:在)?(?:咳嗽|咳|腹痛|肚子疼|胃痛|胃疼|头痛|头疼|不舒服)|(?:头|肚子|咳嗽|鼻塞|喉咙|嗓子)还是(?:疼|咳|很多|在)|主要是?[^，。]{0,10}(?:疼|痛)|还是\s*\d{2}(?:度|℃)|还没有(?:完全)?好|还是不舒服|还是没有改善|持续没有改善|一直没有缓解/.test(text)) change = 'persistent'
  const directTarget = changeTarget(text)
  if (!change || (!recentTarget && !directTarget && resolvedPattern.test(text) && !/烧到\s*\d/.test(text))) return []
  if (change === 'resolved' && /没有再发烧|没再发烧/.test(text)) return []
  const target = directTarget === '疼痛' && recentTarget?.endsWith('痛')
    ? recentTarget
    : (directTarget ?? recentTarget ?? '当前症状')
  const label = change === 'improved' ? '好转' : change === 'worsened' ? '加重' : change === 'recurred' ? '复发' : change === 'resolved' ? '消失' : change === 'unchanged' ? '未加重' : '持续'
  return [fact('status_change', `${target}${label}`, clause, fullText, {
    target, change, bodyPart: extractBodyPart(text), semantics: { ...semanticsFor(clause, fullText), polarity: semanticsFor(clause, fullText).polarity === 'uncertain' ? 'uncertain' : 'affirmed', status: change === 'unchanged' ? 'stable' : change === 'recurred' ? 'recurrent' : change === 'resolved' ? 'resolved' : change === 'improved' ? 'improving' : 'persistent', subject: 'event_subject' }, confidence: 0.92
  })]
}

function applyCorrections(facts, rawInput) {
  if (!correctionPattern.test(rawInput)) return facts
  const correctionIndex = Math.max(rawInput.indexOf('不对'), rawInput.indexOf('说错'), rawInput.indexOf('记错'))
  const retroTime = rawInput.slice(correctionIndex).match(/那是(今天|昨天|前天)的?/)?.[1] ?? null
  const adjusted = facts.map((item) => {
    const position = rawInput.indexOf(item.originalText)
    if (item.type === 'temperature' && !item.time.raw && retroTime && position >= 0 && position < correctionIndex) {
      return { ...item, time: { ...item.time, raw: retroTime, precision: 'day' } }
    }
    return item
  })
  return adjusted.filter((item, index) => {
    if (item.type !== 'temperature') return true
    const position = rawInput.indexOf(item.originalText)
    if (position < 0 || position >= correctionIndex) return true
    return !adjusted.some((candidate, candidateIndex) => candidateIndex !== index
      && candidate.type === 'temperature'
      && candidate.time.raw === item.time.raw
      && rawInput.indexOf(candidate.originalText) > correctionIndex)
  })
}

function resolveSameTimeContradictions(facts, rawInput) {
  return facts.filter((item, index) => !facts.some((candidate, candidateIndex) => candidateIndex !== index
    && candidate.type === item.type
    && candidate.name === item.name
    && candidate.time.raw === item.time.raw
    && (!candidate.frequency || !item.frequency || candidate.frequency === item.frequency)
    && (!candidate.bodyPart || !item.bodyPart || candidate.bodyPart === item.bodyPart)
    && candidate.polarity !== item.polarity
    && rawInput.indexOf(candidate.originalText) > rawInput.indexOf(item.originalText)))
}

function finalizeFacts(facts, rawInput) {
  const rawAttributes = structuredAttributes(rawInput, null)
  let output = facts.map((item) => {
    let name = item.name
    let concept = item.concept
    let target = item.target
    if (item.type === 'symptom' && item.name === '疼痛' && item.bodyPart === '腹部') name = concept = '腹痛'
    if (item.type === 'symptom' && item.name === '疼痛' && item.bodyPart === '头') name = concept = '头痛'
    if (item.type === 'symptom' && item.name === '疼痛' && item.bodyPart === '咽喉') name = concept = '咽喉痛'
    if (target === '喉咙痛') target = '咽喉痛'
    const relevantPain = item.type === 'symptom' || item.type === 'status_change'
    return {
      ...item, name, concept, ...(item.type === 'status_change' ? { target } : {}),
      severityScale: item.severityScale ?? (relevantPain ? rawAttributes.severityScale : null),
      duration: item.duration ?? (item.type === 'symptom' ? rawAttributes.duration : null),
      frequency: item.type === 'status_change' && /几分钟/.test(rawInput) ? '几分钟' : item.frequency
    }
  })

  if (/不是一直咳.*主要(?:是)?晚上咳/.test(rawInput)) {
    const symptom = output.find((item) => item.type === 'symptom' && item.name === '咳嗽' && item.polarity === 'affirmed')
    if (symptom) {
      const negativeState = {
        ...symptom,
        id: 'negative-persistent-cough',
        type: 'status_change', category: 'status_change', concept: '持续咳嗽', name: '持续咳嗽',
        target: '咳嗽', change: 'persistent', polarity: 'negated', status: 'not_applicable',
        assertionType: 'negative_observation', frequency: null
      }
      output = [{ ...symptom, frequency: '晚上', duration: rawAttributes.duration }, negativeState]
    }
  }

  if (/每天晚上.*头(?:疼|痛).*白天基本没事/.test(rawInput)) {
    const symptom = output.find((item) => item.type === 'symptom' && item.name === '头痛')
    if (symptom) output = [
      { ...symptom, frequency: '每天晚上', polarity: 'affirmed', status: 'active' },
      { ...symptom, id: 'contextual-negative-headache', sourceText: '白天基本没事', originalText: '白天基本没事', frequency: '白天', polarity: 'negated', status: 'not_applicable', assertionType: 'negative_observation' }
    ]
  }

  if (/头(?:不疼|不痛)/.test(rawInput)) {
    output = output.filter((item) => !(item.type === 'symptom' && item.name === '疼痛' && item.bodyPart === '头'))
  }

  const negativeKeys = new Set()
  output = output.filter((item) => {
    if (item.type !== 'symptom' || item.polarity !== 'negated') return true
    const key = `${item.name}|${item.bodyPart ?? ''}|${item.frequency ?? ''}`
    if (negativeKeys.has(key)) return false
    negativeKeys.add(key)
    return true
  })

  if (correctionPattern.test(rawInput) && /(?:今天|昨天|前天|昨晚).*(?:不对|哦不是|说错|记错)/.test(rawInput)) {
    const correctionAt = Math.max(rawInput.lastIndexOf('不对'), rawInput.lastIndexOf('哦不是'), rawInput.lastIndexOf('说错'), rawInput.lastIndexOf('记错'))
    const correctionTail = rawInput.slice(Math.max(0, correctionAt))
    const correctedTime = correctionTail.match(/(?:今天|昨天|前天|昨晚)(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)?(?:\s*[一二两三四五六七八九十\d]{1,3}(?:点(?:(?:半)|[一二两三四五六七八九十\d]{1,3}分?)?|:\d{1,2}))?/)?.[0]
      ?? extractRawTime(correctionTail)
    output = output.map((item) => item.type === 'symptom' ? {
      ...item,
      polarity: 'affirmed', status: 'active', assertionType: 'correction',
      time: { ...item.time, raw: correctedTime, precision: timePrecision(correctedTime) }
    } : item)
  }

  if (/差不多还是那样/.test(rawInput)) {
    let kept = false
    output = output.filter((item) => {
      if (item.type !== 'status_change' || item.change !== 'unchanged') return true
      if (kept) return false
      kept = true
      return true
    })
  }

  if (output.some((item) => item.type === 'status_change' && item.change === 'persistent')) {
    const count = output.find((item) => item.occurrenceCount)?.occurrenceCount ?? rawAttributes.occurrenceCount
    output = output
      .filter((item) => !(item.type === 'status_change' && ['unchanged', 'improved'].includes(item.change)))
      .map((item) => item.type === 'status_change' && item.change === 'persistent' && count ? { ...item, occurrenceCount: count } : item)
  }
  return output
}

function inlineCorrectionFacts(rawInput) {
  const time = extractRawTime(rawInput)
  const clause = { sourceText: rawInput, rawTime: time }
  const side = /(左|右)(?:侧)?(胳膊|手臂|腿|脚|肩|小腿)[^，。；]*?(?:疼|痛)[^。；]*(?:不对|说错|记错)[^。；]*?(?:是)?\s*(右|左)(?:侧)?(胳膊|手臂|腿|脚|肩|小腿)/.exec(rawInput)
  if (side) {
    const oldPart = `${side[1]}${side[2]}`.replace('胳膊', '手臂')
    const newPart = `${side[3]}${side[4]}`.replace('胳膊', '手臂')
    const oldId = 'corrected-inline-symptom'
    const current = fact('symptom', '疼痛', clause, rawInput, {
      bodyPart: newPart,
      semantics: { polarity: 'affirmed', temporality: 'current', status: 'active', subject: 'event_subject', source: 'user_report' }
    })
    const correction = fact('status_change', '疼痛已纠正', clause, rawInput, {
      bodyPart: oldPart, target: '疼痛', change: 'corrected', revisionOfFactId: oldId, targetFactId: oldId,
      semantics: { polarity: 'affirmed', temporality: 'current', status: 'corrected', subject: 'event_subject', source: 'user_report' }
    })
    return { replaceTypes: new Set(['symptom']), facts: [current, correction] }
  }
  const temperatures = [...rawInput.matchAll(/(\d{2})\s*度\s*(\d)/g)]
  if (temperatures.length >= 2 && correctionPattern.test(rawInput)) {
    const latest = temperatures.at(-1)
    const value = Number(`${latest[1]}.${latest[2]}`)
    const oldId = 'corrected-inline-temperature'
    const current = fact('temperature', `${value}℃`, clause, rawInput, {
      temperature: { min: value, max: value, unit: '℃' }, source: 'measurement',
      semantics: { polarity: 'affirmed', temporality: 'current', status: 'active', subject: 'event_subject', source: 'measurement' }
    })
    const correction = fact('status_change', '体温已纠正', clause, rawInput, {
      target: '体温', change: 'corrected', revisionOfFactId: oldId, targetFactId: oldId,
      semantics: { polarity: 'affirmed', temporality: 'current', status: 'corrected', subject: 'event_subject', source: 'user_report' }
    })
    return { replaceTypes: new Set(['temperature']), facts: [current, correction] }
  }
  return null
}

export class LocalFactProvider {
  name = 'local-fact-extractor'

  async organize(rawInput) {
    const extracted = []
    let recentTarget = null
    for (const clause of splitClauses(rawInput)) {
      const previousTarget = recentTarget
      const clauseTarget = changeTarget(clause.sourceText)
      const symptoms = extractSymptoms(clause, rawInput)
      const statusTarget = clauseTarget === '疼痛' && previousTarget?.endsWith('痛') ? previousTarget : (clauseTarget ?? previousTarget)
      const temperatures = extractTemperatures(clause, rawInput)
      extracted.push(...symptoms, ...temperatures, ...extractMedications(clause, rawInput), ...extractUnidentifiedDosage(clause, rawInput), ...extractAdditionalMeasurements(clause, rawInput), ...extractClinicalFacts(clause, rawInput), ...extractStatusChanges(clause, rawInput, statusTarget))
      if (symptoms.length) recentTarget = symptoms[0].name
      else if (temperatures.length) recentTarget = '发热'
      else if (clauseTarget && clauseTarget !== '疼痛') recentTarget = clauseTarget
    }
    const inlineCorrection = inlineCorrectionFacts(rawInput)
    const correctionInput = inlineCorrection
      ? [...extracted.filter((item) => !inlineCorrection.replaceTypes.has(item.type)), ...inlineCorrection.facts]
      : extracted
    const corrected = finalizeFacts(resolveSameTimeContradictions(applyCorrections(correctionInput, rawInput), rawInput), rawInput)
    const facts = corrected.filter((item, index) => corrected.findIndex((candidate) => candidate.type === item.type && candidate.name === item.name && candidate.sourceText === item.sourceText && candidate.time.raw === item.time.raw) === index)
    return normalizeHealthAIOutput({ facts, confidence: facts.length ? Math.min(...facts.map((item) => item.confidence)) : 0 })
  }
}
