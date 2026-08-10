import assert from 'node:assert/strict'
import test from 'node:test'
import { AIService } from './ai-service.mjs'
import { hasHealthFacts } from './ai-types.mjs'

const referenceNow = new Date('2026-08-11T04:00:00.000Z')
const baseContext = { referenceNow, timezone: 'Asia/Shanghai' }
const ai = new AIService({ primaryProvider: false })

async function parse(rawInput, context = {}) {
  return ai.organizeHealthRecord(rawInput, { ...baseContext, ...context })
}

function factsOf(output, type) {
  return output.healthAIOutput.facts.filter((fact) => fact.type === type)
}

test('真实场景：儿童发烧识别症状、体温和用药事实', async () => {
  const output = await parse('孩子昨天下午开始发烧，晚上量体温38.8度，吃了一次布洛芬，今天早上退了一点。')
  const symptoms = factsOf(output, 'symptom')
  const temperatures = factsOf(output, 'temperature')
  const medications = factsOf(output, 'medication')

  assert.ok(symptoms.some((fact) => fact.name === '发热' && fact.time.raw === '昨天下午'))
  assert.ok(temperatures.some((fact) => fact.temperature?.min === 38.8 && fact.time.raw === '晚上'))
  assert.ok(medications.some((fact) => fact.name.includes('布洛芬') && fact.time.raw === '晚上'))
})

test('真实场景：儿童发烧跨分句时间保持在正确日期', async () => {
  const output = await parse('孩子昨天下午开始发烧，晚上量体温38.8度，吃了一次布洛芬，今天早上退了一点。')
  const temperatures = factsOf(output, 'temperature')
  const medications = factsOf(output, 'medication')

  assert.ok(temperatures.some((fact) => fact.time.resolvedStart === '2026-08-10T18:00:00+08:00'))
  assert.ok(medications.some((fact) => fact.time.resolvedStart === '2026-08-10T18:00:00+08:00'))
})

test('真实场景：“退了一点”生成有时间的状态好转事实', async () => {
  const output = await parse('孩子昨天下午开始发烧，晚上量体温38.8度，吃了一次布洛芬，今天早上退了一点。')
  const changes = factsOf(output, 'status_change')

  assert.ok(changes.some((fact) => fact.target === '发热' && fact.change === 'improved' && fact.time.raw === '今天早上'))
})

test('真实场景：加重与持续分别生成状态变化事实', async () => {
  const worsened = await parse('咳嗽三天越来越严重。')
  assert.ok(factsOf(worsened, 'status_change').some((fact) => fact.target === '咳嗽' && fact.change === 'worsened'))

  const persistent = await parse('一直腹痛。')
  assert.ok(factsOf(persistent, 'status_change').some((fact) => fact.target === '腹痛' && fact.change === 'persistent'))
})

test('真实场景：腹痛、就诊和检查事实被拆分', async () => {
  const output = await parse('上周三晚上肚子疼，疼了一晚上，第二天去医院做了检查。')
  const symptoms = factsOf(output, 'symptom')
  const visits = factsOf(output, 'visit')
  const examinations = factsOf(output, 'examination')

  assert.ok(symptoms.some((fact) => fact.name === '腹痛'))
  assert.ok(visits.length > 0)
  assert.ok(examinations.length > 0)
})

test('真实场景：“上周三晚上”和“第二天”的连续时间解析', async () => {
  const output = await parse('上周三晚上肚子疼，疼了一晚上，第二天去医院做了检查。')
  const abdominalPain = factsOf(output, 'symptom').find((fact) => fact.name === '腹痛')
  const visit = factsOf(output, 'visit')[0]
  const examination = factsOf(output, 'examination')[0]

  assert.equal(abdominalPain.time.resolvedStart, '2026-08-05T18:00:00+08:00')
  assert.equal(visit.time.resolvedStart, '2026-08-06T00:00:00+08:00')
  assert.equal(examination.time.resolvedStart, '2026-08-06T00:00:00+08:00')
})

test('真实场景：历史补录产生选择时间冲突', async () => {
  const output = await parse('2024年做过胃镜检查。', { selectedOccurredAt: '2025年' })

  assert.ok(factsOf(output, 'examination').length > 0)
  assert.equal(output.healthAIOutput.timeConflict.hasConflict, true)
  assert.deepEqual(output.healthAIOutput.timeConflict.conflict, {
    type: 'time_conflict',
    selected: '2025年',
    mentioned: '2024年'
  })
})

test('真实场景：否定发烧不产生体温事实', async () => {
  const output = await parse('咳嗽三天，没有发烧。')

  assert.ok(factsOf(output, 'symptom').some((fact) => fact.name === '咳嗽'))
  assert.equal(factsOf(output, 'temperature').length, 0)
  assert.equal(factsOf(output, 'symptom').some((fact) => fact.name === '发热'), false)
})

test('真实场景：无效输入不产生健康事实', async () => {
  const output = await parse('北京旅游')

  assert.equal(hasHealthFacts(output.healthAIOutput), false)
  assert.deepEqual(output.healthAIOutput.facts, [])
})
