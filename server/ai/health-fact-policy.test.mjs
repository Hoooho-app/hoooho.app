import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalFactProvider } from './providers/local-fact-provider.mjs'
import { isConfirmedDiagnosis, isConsumedMedication, isCurrentPositiveFact } from './health-fact-policy.mjs'

const provider = new LocalFactProvider()

test('事实显式携带主体、极性、时间性、状态、来源和原文', async () => {
  const output = await provider.organize('我现在咳嗽。')
  const fact = output.facts.find((item) => item.type === 'symptom')
  assert.deepEqual({ polarity: fact.polarity, temporality: fact.temporality, status: fact.status, subject: fact.subject, source: fact.source }, {
    polarity: 'affirmed', temporality: 'current', status: 'active', subject: 'event_subject', source: 'user_report'
  })
  assert.equal(fact.originalText, '我现在咳嗽')
  assert.equal(isCurrentPositiveFact(fact), true)
})

test('否定、他人、条件、引用和纠正内容不能成为当前阳性事实', async () => {
  for (const input of ['我没有发烧。', '同事昨天发烧。', '如果发烧怎么办？', '网上说肺炎会发烧。', '我发烧了，不对，实际体温正常。']) {
    const output = await provider.organize(input)
    assert.equal(output.facts.some((fact) => isCurrentPositiveFact(fact) && /发热|肺炎/.test(fact.name)), false, input)
  }
})

test('药品存在不等于已服用，确诊只来自明确医疗结论', async () => {
  const available = await provider.organize('家里有布洛芬，暂时没有吃。')
  assert.equal(available.facts.some(isConsumedMedication), false)
  const taken = await provider.organize('吃了一次布洛芬。')
  assert.equal(taken.facts.some(isConsumedMedication), true)
  const suspected = await provider.organize('我担心是不是肺炎，但没有检查。')
  assert.equal(suspected.facts.some(isConfirmedDiagnosis), false)
  const confirmed = await provider.organize('医生诊断为肺炎。')
  assert.equal(confirmed.facts.some(isConfirmedDiagnosis), true)
})
