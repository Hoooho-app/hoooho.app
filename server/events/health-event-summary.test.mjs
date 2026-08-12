import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHealthEventSummary, correctHealthEventSummary } from './health-event-summary.mjs'

const event = {
  id: 'event-1', startTime: '2026-08-10T01:00:00.000Z', status: 'observing', eventSummary: null
}
const records = [
  { id: 'record-1', occurredAt: '2026-08-10T01:00:00.000Z' },
  { id: 'record-2', occurredAt: '2026-08-11T02:00:00.000Z' }
]

function organization(id, recordId, facts, updatedAt) {
  return { id, recordId, createdAt: updatedAt, updatedAt, healthAIOutput: { facts } }
}

function fact(type, name, extra = {}) {
  return {
    id: `${type}-${name}`, type, name, sourceText: name, bodyPart: null,
    time: { resolvedStart: null }, confidence: 1, ...extra
  }
}

test('纯症状只生成保守标题，不凭空诊断', () => {
  const summary = buildHealthEventSummary({
    event,
    records,
    organizations: [organization('o1', 'record-1', [
      fact('symptom', '头痛'),
      fact('symptom', '发热'),
      fact('temperature', '38.5℃', { temperature: { min: 38.5, max: 38.5 } })
    ], '2026-08-10T03:00:00.000Z')]
  })
  assert.equal(summary.displayedResult.title, '发热伴头痛')
  assert.match(summary.displayedResult.summary, /最高体温38.5℃/)
  assert.doesNotMatch(summary.displayedResult.summary, /流感|肺炎/)
})

test('明确检查结论优先于症状标题，并纳入依据', () => {
  const summary = buildHealthEventSummary({
    event,
    records,
    organizations: [
      organization('o1', 'record-1', [fact('symptom', '头痛'), fact('symptom', '发热')], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [fact('examination', '医院检查提示甲型流感')], '2026-08-11T04:00:00.000Z')
    ]
  })
  assert.equal(summary.displayedResult.title, '甲型流感')
  assert.match(summary.displayedResult.summary, /检查或就诊信息提示甲型流感/)
  assert.deepEqual(summary.displayedResult.evidence, ['症状记录', '检查结果'])
})

test('状态变化、人工校对和后续新证据分别保留', () => {
  const generated = buildHealthEventSummary({
    event,
    records,
    organizations: [organization('o1', 'record-1', [
      fact('symptom', '发热'),
      fact('temperature', '39℃', { temperature: { min: 39, max: 39 } }),
      fact('status_change', '发热好转', { change: 'improved' })
    ], '2026-08-10T03:00:00.000Z')]
  })
  assert.match(generated.displayedResult.summary, /症状有所好转/)
  const corrected = correctHealthEventSummary(generated, { title: '8月发热', summary: '校对后的摘要。' }, new Date('2026-08-10T05:00:00.000Z'))
  const refreshed = buildHealthEventSummary({
    event: { ...event, eventSummary: corrected },
    records,
    organizations: [
      organization('o1', 'record-1', [fact('symptom', '发热')], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [fact('examination', '医院检查提示甲型流感')], '2026-08-11T04:00:00.000Z')
    ]
  })
  assert.equal(refreshed.displayedResult.title, '8月发热')
  assert.equal(refreshed.displayedResult.summary, '校对后的摘要。')
  assert.equal(refreshed.systemGenerated.title, '甲型流感')
  assert.equal(refreshed.hasNewEvidenceAfterCorrection, true)
})

test('没有 HealthFact 时不生成空摘要', () => {
  assert.equal(buildHealthEventSummary({ event, records, organizations: [] }), null)
})
