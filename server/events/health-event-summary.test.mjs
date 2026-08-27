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
    polarity: 'affirmed', temporality: 'current', status: 'active', subject: 'event_subject', source: 'user_report',
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
      fact('temperature', '38.5℃', { measurementType: 'body_temperature', source: 'measurement', temperature: { min: 38.5, max: 38.5 } })
    ], '2026-08-10T03:00:00.000Z')]
  })
  assert.equal(summary.displayedResult.title, '发热伴头痛')
  assert.match(summary.displayedResult.summary, /最高体温38.5℃/)
  assert.deepEqual(summary.displayedResult.tags.map(({ label }) => label), ['头痛', '发热', '最高38.5℃'])
  assert.doesNotMatch(summary.displayedResult.summary, /流感|肺炎/)
})

test('明确检查结论优先于症状标题，并纳入依据', () => {
  const summary = buildHealthEventSummary({
    event,
    records,
    organizations: [
      organization('o1', 'record-1', [fact('symptom', '头痛'), fact('symptom', '发热')], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [fact('diagnosis', '甲型流感', { diagnosisCertainty: 'confirmed', source: 'doctor_statement' })], '2026-08-11T04:00:00.000Z')
    ]
  })
  assert.equal(summary.displayedResult.title, '甲型流感')
  assert.match(summary.displayedResult.summary, /医生诊断为甲型流感/)
  assert.deepEqual(summary.displayedResult.evidence, ['症状记录', '诊断记录'])
})

test('状态变化纳入摘要，后续新证据触发动态摘要而不删除历史校对', () => {
  const generated = buildHealthEventSummary({
    event,
    records,
    organizations: [organization('o1', 'record-1', [
      fact('symptom', '发热'),
      fact('temperature', '39℃', { measurementType: 'body_temperature', source: 'measurement', temperature: { min: 39, max: 39 } }),
      fact('status_change', '发热好转', { change: 'improved' })
    ], '2026-08-10T03:00:00.000Z')]
  })
  assert.match(generated.displayedResult.summary, /发热有所好转/)
  assert.equal(generated.displayedResult.tags[0].label, '发热好转')
  assert.equal(generated.displayedResult.tags[0].kind, 'change')
  const corrected = correctHealthEventSummary(generated, { title: '8月发热', summary: '校对后的摘要。' }, new Date('2026-08-10T05:00:00.000Z'))
  const refreshed = buildHealthEventSummary({
    event: { ...event, eventSummary: corrected },
    records,
    organizations: [
      organization('o1', 'record-1', [fact('symptom', '发热')], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [fact('diagnosis', '甲型流感', { diagnosisCertainty: 'confirmed', source: 'doctor_statement' })], '2026-08-11T04:00:00.000Z')
    ]
  })
  assert.equal(refreshed.displayedResult.title, '甲型流感')
  assert.notEqual(refreshed.displayedResult.summary, '校对后的摘要。')
  assert.equal(refreshed.systemGenerated.title, '甲型流感')
  assert.equal(refreshed.userCorrection.title, '8月发热')
  assert.equal(refreshed.hasNewEvidenceAfterCorrection, true)
})

test('新增症状会语义归一、去重并重新生成动态标签和摘要', () => {
  const summary = buildHealthEventSummary({
    event,
    records,
    organizations: [
      organization('o1', 'record-1', [fact('symptom', '头疼')], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [
        fact('symptom', '疼痛', { bodyPart: '左脚' }),
        fact('symptom', '脚上有点红', { bodyPart: '左脚' }),
        fact('symptom', '有点痒', { bodyPart: '左脚' })
      ], '2026-08-11T04:00:00.000Z')
    ],
    now: new Date('2026-08-11T05:00:00.000Z')
  })
  assert.deepEqual(summary.displayedResult.tags.map(({ label }) => label), ['头痛', '脚痛', '脚部发红', '瘙痒'])
  assert.match(summary.displayedResult.summary, /头痛、脚痛、脚部发红和瘙痒/)
})

test('AI 初步判断低于医生诊断并明确来源和确定程度', () => {
  const aiSummary = buildHealthEventSummary({
    event, records,
    organizations: [organization('o1', 'record-1', [
      fact('symptom', '脚疼', { bodyPart: '脚' }),
      fact('diagnosis', '皮炎', { diagnosisCertainty: 'suspected', source: 'ai_consultation' })
    ], '2026-08-10T03:00:00.000Z')],
    now: new Date('2026-08-10T04:00:00.000Z')
  })
  assert.deepEqual(aiSummary.displayedResult.tags.map(({ label }) => label), ['疑似皮炎', '脚痛'])
  assert.match(aiSummary.displayedResult.summary, /通过AI问诊，初步判断可能为皮炎/)

  const doctorSummary = buildHealthEventSummary({
    event, records,
    organizations: [
      organization('o1', 'record-1', [fact('diagnosis', '皮炎', { diagnosisCertainty: 'suspected', source: 'ai_consultation' })], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [fact('diagnosis', '皮炎', { diagnosisCertainty: 'confirmed', source: 'doctor_statement' })], '2026-08-11T03:00:00.000Z')
    ],
    now: new Date('2026-08-11T04:00:00.000Z')
  })
  assert.equal(doctorSummary.displayedResult.tags[0].label, '皮炎')
  assert.equal(doctorSummary.displayedResult.tags[0].source, 'doctor_statement')
  assert.match(doctorSummary.displayedResult.summary, /医生诊断为皮炎/)
})

test('后续明确否定会撤销诊断，症状消失会撤销当前症状标签', () => {
  const summary = buildHealthEventSummary({
    event, records,
    organizations: [
      organization('o1', 'record-1', [
        fact('symptom', '头痛'),
        fact('symptom', '脚疼', { bodyPart: '脚' }),
        fact('diagnosis', '皮炎', { diagnosisCertainty: 'suspected', source: 'ai_consultation' })
      ], '2026-08-10T03:00:00.000Z'),
      organization('o2', 'record-2', [
        fact('status_change', '头痛消失', { target: '头痛', change: 'resolved' }),
        fact('diagnosis', '皮炎', { polarity: 'negated', status: 'not_applicable', diagnosisCertainty: 'ruled_out', source: 'doctor_statement' })
      ], '2026-08-11T03:00:00.000Z')
    ],
    now: new Date('2026-08-11T04:00:00.000Z')
  })
  assert.deepEqual(summary.displayedResult.tags.map(({ label }) => label), ['头痛消失', '脚痛'])
  assert.doesNotMatch(summary.displayedResult.summary, /皮炎/)
  assert.match(summary.displayedResult.summary, /头痛已消失/)
})

test('没有 HealthFact 时不生成空摘要', () => {
  assert.equal(buildHealthEventSummary({ event, records, organizations: [] }), null)
})
