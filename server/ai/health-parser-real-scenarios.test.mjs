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
  assert.equal(factsOf(output, 'symptom').some((fact) => fact.name === '发热' && fact.polarity === 'affirmed'), false)
  assert.ok(factsOf(output, 'symptom').some((fact) => fact.name === '发热' && fact.polarity === 'negated'))
})

test('手机无标点转写按局部语义识别皮疹、瘙痒、确诊和已用药物', async () => {
  const output = await parse('刚刚那个出现的那个皮疹那个确诊是荨麻疹然后挺痒的然后那个用那些芦柑石洗剂然后洗了一下然后那个现在还在等医生然后发烧倒是没发烧')
  const symptoms = factsOf(output, 'symptom')
  const diagnoses = factsOf(output, 'diagnosis')
  const medications = factsOf(output, 'medication')

  assert.equal(hasHealthFacts(output.healthAIOutput), true)
  assert.ok(symptoms.some((fact) => fact.name === '皮疹' && fact.polarity === 'affirmed'))
  assert.ok(symptoms.some((fact) => fact.name === '瘙痒' && fact.polarity === 'affirmed'))
  assert.ok(diagnoses.some((fact) => fact.name === '荨麻疹' && fact.diagnosisCertainty === 'confirmed'))
  assert.ok(medications.some((fact) => fact.name === '炉甘石洗剂' && fact.medicationAction === 'taken'))
  assert.equal(symptoms.some((fact) => fact.name === '发热' && fact.polarity === 'affirmed'), false)
  assert.ok(symptoms.some((fact) => fact.name === '发热' && fact.polarity === 'negated'))
})

test('无标点连接词不会把后一个症状的否定扩散到前一个事实', async () => {
  for (const input of ['有皮疹但是没有发烧', '有皮疹，但是没有发烧', '挺痒的但是没发烧']) {
    const output = await parse(input)
    assert.equal(hasHealthFacts(output.healthAIOutput), true, input)
    assert.equal(factsOf(output, 'symptom').some((fact) => fact.name === '发热' && fact.polarity === 'affirmed'), false, input)
  }

  const negatedRash = await parse('没有皮疹')
  assert.equal(factsOf(negatedRash, 'symptom').some((fact) => fact.name === '皮疹' && fact.polarity === 'affirmed'), false)
  assert.ok(factsOf(negatedRash, 'symptom').some((fact) => fact.name === '皮疹' && fact.polarity === 'negated'))

  const switched = await parse('没有皮疹但是发烧了')
  assert.equal(factsOf(switched, 'symptom').some((fact) => fact.name === '皮疹' && fact.polarity === 'affirmed'), false)
  assert.ok(factsOf(switched, 'symptom').some((fact) => fact.name === '发热'))
})

test('荨麻疹确定性和炉甘石使用动作保持安全边界', async () => {
  for (const input of ['已经确诊荨麻疹', '今天确诊了荨麻疹', '确诊了那个荨麻疹']) {
    const confirmed = await parse(input)
    assert.ok(factsOf(confirmed, 'diagnosis').some((fact) => (
      fact.name === '荨麻疹' && fact.diagnosisCertainty === 'confirmed' && fact.source === 'user_report'
    )), input)
  }

  const doctorConfirmed = await parse('医生确诊是荨麻疹')
  assert.ok(factsOf(doctorConfirmed, 'diagnosis').some((fact) => fact.name === '荨麻疹' && fact.diagnosisCertainty === 'confirmed' && fact.source === 'doctor_statement'))

  const suspected = await parse('疑似荨麻疹')
  assert.equal(factsOf(suspected, 'diagnosis').some((fact) => fact.diagnosisCertainty === 'confirmed'), false)

  const mentionOnly = await parse('荨麻疹')
  assert.equal(factsOf(mentionOnly, 'diagnosis').some((fact) => fact.diagnosisCertainty === 'confirmed'), false)

  const taken = await parse('用了炉甘石洗剂')
  assert.ok(factsOf(taken, 'medication').some((fact) => fact.name === '炉甘石洗剂' && fact.medicationAction === 'taken'))

  const planned = await parse('准备买炉甘石洗剂')
  assert.equal(factsOf(planned, 'medication').some((fact) => fact.medicationAction === 'taken'), false)
})

test('真实场景：无效输入不产生健康事实', async () => {
  const output = await parse('北京旅游')

  assert.equal(hasHealthFacts(output.healthAIOutput), false)
  assert.deepEqual(output.healthAIOutput.facts, [])
})

test('动态摘要输入：脚痛、脚部发红和瘙痒拆成独立事实', async () => {
  const output = await parse('我的脚也疼，而且脚上有点红，还有些痒。')
  const symptoms = factsOf(output, 'symptom')
  assert.ok(symptoms.some((fact) => fact.name === '疼痛' && fact.bodyPart === '脚'))
  assert.ok(symptoms.some((fact) => fact.name === '脚部发红' && fact.bodyPart === '脚'))
  assert.ok(symptoms.some((fact) => fact.name === '瘙痒'))
})

test('动态摘要输入：AI 初步判断与医生诊断保留不同来源和确定程度', async () => {
  const aiOutput = await parse('昨晚做了一次AI问诊，AI认为大概率是皮炎。')
  const aiDiagnosis = factsOf(aiOutput, 'diagnosis').find((fact) => fact.name === '皮炎')
  assert.equal(aiDiagnosis?.source, 'ai_consultation')
  assert.equal(aiDiagnosis?.diagnosisCertainty, 'suspected')

  const doctorOutput = await parse('今天去医院看了，医生诊断为皮炎。')
  const doctorDiagnosis = factsOf(doctorOutput, 'diagnosis').find((fact) => fact.name === '皮炎')
  assert.equal(doctorDiagnosis?.source, 'doctor_statement')
  assert.equal(doctorDiagnosis?.diagnosisCertainty, 'confirmed')
})

test('动态摘要输入：医生否定结论和症状消失保留撤销事实', async () => {
  const ruledOut = await parse('医生说不是皮炎。')
  const diagnosis = factsOf(ruledOut, 'diagnosis').find((fact) => fact.diagnosisCertainty === 'ruled_out')
  assert.equal(diagnosis?.polarity, 'negated')
  assert.equal(diagnosis?.diagnosisCertainty, 'ruled_out')
  assert.match(diagnosis?.originalText ?? '', /皮炎/)

  const resolved = await parse('头已经不疼了，但脚还是疼。')
  assert.ok(factsOf(resolved, 'status_change').some((fact) => fact.target === '头痛' && fact.change === 'resolved'))
  assert.ok(factsOf(resolved, 'symptom').some((fact) => fact.bodyPart === '脚'))
})
