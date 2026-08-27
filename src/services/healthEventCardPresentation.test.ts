import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventSummaryResult, HealthEventSummaryTag } from '../types/index.ts'
import {
  buildHealthEventQuickFacts,
  getHealthEventDayLabel,
  getHealthEventDefinitionTitle,
  getHealthEventStatusPresentation
} from './healthEventCardPresentation.ts'

const updatedAt = '2026-08-10T08:00:00.000Z'
const tag = (overrides: Partial<HealthEventSummaryTag> & Pick<HealthEventSummaryTag, 'label' | 'kind'>): HealthEventSummaryTag => ({
  source: 'user_report', certainty: null, priority: 50, ...overrides
})
const summary = (tags: HealthEventSummaryTag[]): HealthEventSummaryResult => ({
  title: '系统标题', summary: '旧自然语言摘要', tags, evidence: [], updatedAt, source: 'system'
})

test('没有可追溯确认诊断时统一显示未明确，症状和 AI 判断都不会被当成诊断', () => {
  assert.equal(getHealthEventDefinitionTitle(null), '未明确')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '发热', kind: 'symptom' }),
    tag({ label: '疑似皮炎', kind: 'assessment', source: 'ai_consultation', certainty: 'suspected' })
  ])), '未明确')
})

test('只有医生结论或正式检查来源的 confirmed diagnosis 才成为定性标题', () => {
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '带状疱疹', kind: 'diagnosis', source: 'doctor_statement', certainty: 'confirmed', priority: 100 })
  ])), '带状疱疹')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '荨麻疹', kind: 'diagnosis', source: 'test_result', certainty: 'confirmed', priority: 90 })
  ])), '荨麻疹')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '皮炎', kind: 'diagnosis', source: 'doctor_statement', certainty: 'suspected', priority: 100 })
  ])), '未明确')
})

test('第几天按指定时区的本地自然日计算并覆盖当天、跨日、跨月和跨年', () => {
  assert.equal(getHealthEventDayLabel('2026-08-10T01:00:00+08:00', new Date('2026-08-10T22:00:00+08:00'), 'Asia/Shanghai'), '第1天')
  assert.equal(getHealthEventDayLabel('2026-08-10T23:59:00+08:00', new Date('2026-08-11T00:01:00+08:00'), 'Asia/Shanghai'), '第2天')
  assert.equal(getHealthEventDayLabel('2026-08-31T23:00:00+08:00', new Date('2026-09-01T01:00:00+08:00'), 'Asia/Shanghai'), '第2天')
  assert.equal(getHealthEventDayLabel('2025-12-31T23:00:00+08:00', new Date('2026-01-01T01:00:00+08:00'), 'Asia/Shanghai'), '第2天')
})

test('UTC 日期与本地日期不一致时仍按用户本地日期计算', () => {
  assert.equal(getHealthEventDayLabel('2026-08-10T16:30:00.000Z', new Date('2026-08-11T15:30:00.000Z'), 'Asia/Shanghai'), '第1天')
})

test('缺少或无效开始时间时不显示第几天', () => {
  assert.equal(getHealthEventDayLabel(null), null)
  assert.equal(getHealthEventDayLabel('not-a-date'), null)
})

test('速览最多三个标签，优先第几天并按标签优先级选择真实信息', () => {
  const facts = buildHealthEventQuickFacts({
    startTime: '2026-08-10T09:00:00+08:00',
    now: new Date('2026-08-10T18:00:00+08:00'),
    timeZone: 'Asia/Shanghai',
    summary: summary([
      tag({ label: '发热', kind: 'symptom', priority: 70 }),
      tag({ label: '最高38℃', kind: 'measurement', source: 'measurement', priority: 50 }),
      tag({ label: '发热再次出现', kind: 'change', priority: 45 })
    ])
  })
  assert.deepEqual(facts, ['第1天', '发热', '最高38℃'])
})

test('两个症状可平行显示，同义症状去重且空数据不补占位', () => {
  const now = new Date('2026-08-10T18:00:00+08:00')
  assert.deepEqual(buildHealthEventQuickFacts({
    startTime: '2026-08-10T09:00:00+08:00', now, timeZone: 'Asia/Shanghai',
    summary: summary([
      tag({ label: '头痛', kind: 'symptom', priority: 70 }),
      tag({ label: '脚痛', kind: 'symptom', priority: 60 })
    ])
  }), ['第1天', '头痛', '脚痛'])
  assert.deepEqual(buildHealthEventQuickFacts({
    startTime: '2026-08-10T09:00:00+08:00', now, timeZone: 'Asia/Shanghai',
    summary: summary([
      tag({ label: '发热', kind: 'symptom', priority: 70 }),
      tag({ label: '体温升高', kind: 'symptom', priority: 60 })
    ])
  }), ['第1天', '发热'])
  assert.deepEqual(buildHealthEventQuickFacts({ summary: summary([]) }), [])
})

test('生命周期状态完整保留现有状态机含义', () => {
  assert.equal(getHealthEventStatusPresentation('observing').label, '观察中')
  assert.equal(getHealthEventStatusPresentation('handling').label, '处理中')
  assert.equal(getHealthEventStatusPresentation('recovered').label, '已康复')
})
