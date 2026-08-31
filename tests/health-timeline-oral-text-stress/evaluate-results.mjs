import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formalCases, groupCounts, variantCases } from './cases.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const artifacts = path.join(here, '.artifacts')
const ui = JSON.parse(await readFile(path.join(artifacts, 'ui-results.json'), 'utf8'))
const recordStore = JSON.parse(await readFile(path.join(artifacts, 'data/health-event-records.json'), 'utf8'))
const organizationStore = JSON.parse(await readFile(path.join(artifacts, 'data/health-record-organizations.json'), 'utf8'))
const session = JSON.parse(await readFile(path.join(artifacts, 'session.json'), 'utf8'))

const aliases = {
  体温: ['体温', '℃', '度'], 发热: ['发热', '发烧'], 腹痛: ['腹痛', '肚子疼', '疼痛'], 腹部不适: ['腹部不适', '肚子不舒服'],
  腹胀: ['腹胀', '胀'], 腹泻: ['腹泻', '拉肚子'], 喉咙痛: ['喉咙痛', '嗓子疼'], 疼痛: ['疼痛', '痛'],
  皮疹: ['皮疹', '红疹', '红点'], 瘙痒: ['瘙痒', '痒'], 用药: ['用药', '吃药'], 药物待确认: ['待确认药物', '未知药物', '药物'],
  退烧药: ['退烧药'], 止痛药: ['止痛药'], 精神状态: ['精神'], 精神状态差: ['精神差', '精神状态差'], 精神正常: ['精神正常'],
  饮水: ['饮水', '喝水'], 饮水减少: ['饮水减少', '喝水少'], 进食减少: ['进食减少', '食欲下降', '不想吃'],
  就诊: ['就诊', '看医生'], 发红: ['发红', '红'], 破皮: ['破皮'], 哮喘: ['哮喘', '喘'], 肿胀: ['肿胀', '肿'],
  头痛: ['头痛', '头疼'], 头晕: ['头晕'], 胸痛: ['胸痛'], 胸闷: ['胸闷'], 乏力: ['乏力', '累'],
  咳嗽: ['咳嗽', '咳'], 呕吐: ['呕吐', '吐'], 鼻塞: ['鼻塞', '鼻子堵'], 流鼻涕: ['流鼻涕'], 发冷: ['发冷'],
  心率: ['心率'], 血氧: ['血氧'], 血压: ['血压'], 体重: ['体重'], 耳痛: ['耳痛', '耳朵疼'],
  冰敷: ['冰敷'], 炉甘石洗剂: ['炉甘石'], 口服补液盐: ['口服补液盐'], 布洛芬: ['布洛芬', '美林'], 美林: ['美林', '布洛芬'],
  对乙酰氨基酚: ['对乙酰氨基酚'], 抗生素用药: ['抗生素'], 骨折确诊: ['骨折'], 荨麻疹确诊: ['荨麻疹'], 肺炎: ['肺炎'],
  不适: ['不适'], 外伤: ['外伤', '摔'], 血压测量: ['血压'], 体温正常: ['体温正常'], 腹部不适: ['腹部不适', '肚子不舒服']
}

const compact = (value) => String(value ?? '').replace(/[\s，。；：:、·]/g, '').toLowerCase()
const tokensFor = (concept) => aliases[concept] ?? [concept.replace(/确诊|用药|测量/g, '')]
const numericTokens = (expected) => [expected.value, expected.dose, expected.count, expected.severityScore, expected.amount]
  .filter((value) => value !== undefined && value !== null)
  .map((value) => compact(value))

function factMatches(expected, contents, negated) {
  const candidates = contents.filter((content) => tokensFor(expected.concept).some((token) => compact(content).includes(compact(token))))
  return candidates.some((content) => {
    const normalized = compact(content)
    const isNegated = /：无|:无|没有|未/.test(content)
    if (negated !== isNegated && !(negated && expected.status === 'resolved' && /缓解|恢复|退烧|不再/.test(content))) return false
    if (!numericTokens(expected).every((token) => normalized.includes(token))) return false
    if (expected.bodyPart && !normalized.includes(compact(expected.bodyPart).replace('和', ''))) {
      const parts = compact(expected.bodyPart).split(/[和与]/).filter(Boolean)
      if (!parts.some((part) => normalized.includes(part))) return false
    }
    return true
  })
}

function forbiddenMatches(label, contents, item) {
  const cleaned = label.replace(/事件人物|本人|妈妈|奶奶|孩子|明确|最终值|存在|确诊|精确|已用|已服|疼痛/g, '')
  const chunks = cleaned.split(/[:：]/).filter((item) => item.length >= 2)
  const expectedConcepts = [...item.expectedFacts, ...item.expectedNegatedFacts].map(({ concept }) => concept)
  return chunks.length > 0 && contents.some((content) => {
    if (/：无|:无|没有|未/.test(content) && !/无|没有|未/.test(label)) return false
    if (/本人|妈妈|奶奶|孩子/.test(label) && expectedConcepts.some((concept) => tokensFor(concept).some((token) => compact(content).includes(compact(token))))) return false
    return chunks.every((chunk) => compact(content).includes(compact(chunk)))
  })
}

function evaluateCase(item) {
  const uiResult = ui.formal.find(({ caseId }) => caseId === item.caseId)
  const eventId = session.events[item.caseId].eventId
  const records = recordStore.records.filter((record) => record.eventId === eventId && record.sourceText === item.input)
  const organizations = organizationStore.organizations.filter((organization) => records.some(({ id }) => id === organization.recordId))
  const facts = organizations.flatMap((organization) => organization.healthAIOutput?.facts ?? [])
  const contents = facts.map((fact) => [fact.concept, fact.name, fact.bodyPart, fact.bodyRegion, fact.laterality, fact.value, fact.unit, fact.dose, fact.occurrenceCount, fact.frequency, fact.status, fact.polarity === 'negated' ? '：无' : '', fact.time?.raw].filter((value) => value !== null && value !== undefined).join(' '))
  const expectedChecks = item.expectedFacts.map((fact) => ({ fact, matched: factMatches(fact, contents, false) }))
  const negativeChecks = item.expectedNegatedFacts.map((fact) => ({ fact, matched: factMatches(fact, contents, true) }))
  const forbiddenHits = item.forbiddenFacts.filter((label) => forbiddenMatches(label, contents, item))
  const sourceIntegrity = records.every(({ sourceType, sourceText }) => sourceType === 'text_record' && sourceText === item.input)
  const wrongMember = records.some(({ eventId: recordEventId }) => recordEventId !== eventId)
  const previewOfferedConfirmation = uiResult.preview.includes('确认记录')
  const allExpected = [...expectedChecks, ...negativeChecks]
  const matchedCount = allExpected.filter(({ matched }) => matched).length
  let status = 'PASS'
  const reasons = []
  if (item.shouldPersist === false) {
    if (previewOfferedConfirmation || records.length > 0) {
      status = 'FAIL'
      reasons.push('非事实文本生成了可确认健康事实')
    }
  } else if (records.length === 0) {
    status = 'FAIL'
    reasons.push('未生成或未保存任何事实记录')
  } else {
    if (!sourceIntegrity) { status = 'FAIL'; reasons.push('来源文本或 sourceType 未完整保留') }
    if (wrongMember) { status = 'FAIL'; reasons.push('记录写入错误事件') }
    if (forbiddenHits.length) { status = 'FAIL'; reasons.push(`出现禁止事实：${forbiddenHits.join('、')}`) }
    const missing = allExpected.filter(({ matched }) => !matched).map(({ fact }) => `${fact.polarity}:${fact.concept}`)
    if (missing.length) {
      status = status === 'FAIL' || matchedCount === 0 ? 'FAIL' : 'PARTIAL'
      reasons.push(`缺失或极性/数值不符：${missing.join('、')}`)
    }
  }
  if (item.group === 'F' && status !== 'PASS') reasons.unshift('P0 人物归属门槛未通过')
  return {
    caseId: item.caseId, group: item.group, risk: item.risk, status, input: item.input, shouldPersist: item.shouldPersist,
    previewOfferedConfirmation, confirmed: uiResult.confirmed, refreshed: uiResult.reloaded, recordCount: records.length,
    sourceIntegrity, expectedChecks, negativeChecks, forbiddenHits,
    actualRecords: records.map(({ id, content, occurredAt, sourceType }) => ({ id, content, occurredAt, sourceType })),
    actualFacts: facts.map(({ id, concept, name, polarity, status, subject, subjectMemberId, bodyPart, bodyRegion, laterality, value, unit, dose, occurrenceCount, frequency, time }) => ({ id, concept, name, polarity, status, subject, subjectMemberId, bodyPart, bodyRegion, laterality, value, unit, dose, occurrenceCount, frequency, time })), reasons
  }
}

const results = formalCases.map(evaluateCase)
const variants = variantCases.map((item) => {
  const uiResult = ui.variants.find(({ caseId }) => caseId === item.caseId)
  const records = recordStore.records.filter((record) => record.eventId === session.events[item.caseId].eventId && record.sourceText === item.input)
  const base = formalCases.find(({ caseId }) => caseId === item.baseCaseId)
  const proxy = { ...base, caseId: item.caseId, input: item.input, memberKey: item.memberKey }
  const organizations = organizationStore.organizations.filter((organization) => records.some(({ id }) => id === organization.recordId))
  const facts = organizations.flatMap((organization) => organization.healthAIOutput?.facts ?? [])
  const contents = facts.map((fact) => [fact.concept, fact.name, fact.bodyPart, fact.bodyRegion, fact.laterality, fact.value, fact.unit, fact.dose, fact.occurrenceCount, fact.frequency, fact.status, fact.polarity === 'negated' ? '：无' : '', fact.time?.raw].filter((value) => value !== null && value !== undefined).join(' '))
  const checks = [...proxy.expectedFacts.map((fact) => factMatches(fact, contents, false)), ...proxy.expectedNegatedFacts.map((fact) => factMatches(fact, contents, true))]
  const forbiddenHits = proxy.forbiddenFacts.filter((label) => forbiddenMatches(label, contents, proxy))
  const previewOfferedConfirmation = uiResult.preview.includes('确认记录')
  let status = 'PASS'
  if (proxy.shouldPersist === false) status = previewOfferedConfirmation || records.length ? 'FAIL' : 'PASS'
  else if (!records.length || checks.every((matched) => !matched) || forbiddenHits.length) status = 'FAIL'
  else if (checks.some((matched) => !matched)) status = 'PARTIAL'
  return { caseId: item.caseId, baseCaseId: item.baseCaseId, status, input: item.input, confirmed: uiResult.confirmed, refreshed: uiResult.reloaded, recordCount: records.length, forbiddenHits, actualRecords: records.map(({ content, sourceType }) => ({ content, sourceType })), actualFacts: facts }
})

const count = (items, status) => items.filter((item) => item.status === status).length
const byGroup = Object.fromEntries(Object.keys(groupCounts).map((group) => {
  const items = results.filter((item) => item.group === group)
  return [group, { total: items.length, pass: count(items, 'PASS'), partial: count(items, 'PARTIAL'), fail: count(items, 'FAIL') }]
}))
const summary = {
  total: results.length,
  pass: count(results, 'PASS'),
  partial: count(results, 'PARTIAL'),
  fail: count(results, 'FAIL'),
  passRate: Number((count(results, 'PASS') / results.length * 100).toFixed(2)),
  strictAcceptRate: Number(((count(results, 'PASS') + count(results, 'PARTIAL')) / results.length * 100).toFixed(2)),
  uiExecutionErrors: ui.formal.filter(({ error }) => error).length,
  persistedCases: results.filter(({ recordCount }) => recordCount > 0).length,
  noDraftCases: results.filter(({ shouldPersist, recordCount }) => shouldPersist && recordCount === 0).length,
  memberScopePass: results.filter(({ group }) => group === 'F' && results.find((candidate) => candidate.caseId === candidate.caseId)?.status === 'PASS').length,
  variantTotal: variants.length,
  variantPass: variants.filter(({ status }) => status === 'PASS').length,
  variantPartial: variants.filter(({ status }) => status === 'PARTIAL').length,
  variantFail: variants.filter(({ status }) => status === 'FAIL').length,
  variantPersisted: variants.filter(({ recordCount }) => recordCount > 0).length
}
summary.memberScopePass = results.filter(({ group, status }) => group === 'F' && status === 'PASS').length

await writeFile(path.join(artifacts, 'evaluation.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rubric: 'strict-record-level-v1', summary, byGroup, results, variants }, null, 2))
console.info(JSON.stringify({ summary, byGroup }, null, 2))
