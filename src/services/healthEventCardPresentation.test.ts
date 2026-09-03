import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventSummaryResult, HealthEventSummaryTag } from '../types/index.ts'
import {
  buildHealthEventQuickFacts,
  formatHealthEventDate,
  formatHealthEventDuration,
  getHealthEventDisplayTitle,
  getHealthEventDuration,
  getHealthEventDayLabel,
  getHealthEventDefinitionTitle,
  getHealthEventStartDate,
  getHealthEventSummaryFragments,
  getHealthEventStatusPresentation
} from './healthEventCardPresentation.ts'

const updatedAt = '2026-08-10T08:00:00.000Z'
const tag = (overrides: Partial<HealthEventSummaryTag> & Pick<HealthEventSummaryTag, 'label' | 'kind'>): HealthEventSummaryTag => ({
  source: 'user_report', certainty: null, priority: 50, ...overrides
})
const summary = (tags: HealthEventSummaryTag[]): HealthEventSummaryResult => ({
  title: '系统标题', summary: '旧自然语言摘要', tags, evidence: [], updatedAt, source: 'system'
})

test('没有可追溯确认诊断时统一显示未定性，症状和 AI 判断都不会被当成诊断', () => {
  assert.equal(getHealthEventDefinitionTitle(null), '未定性')
  assert.equal(getHealthEventDefinitionTitle({ title: '旧摘要', summary: '旧数据', evidence: [], updatedAt } as HealthEventSummaryResult), '未定性')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '发热', kind: 'symptom' }),
    tag({ label: '疑似皮炎', kind: 'assessment', source: 'ai_consultation', certainty: 'suspected' })
  ])), '未定性')
})

test('后端确认并带有溯源的 diagnosis 成为定性标题，疑似结论不会', () => {
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '带状疱疹', kind: 'diagnosis', source: 'doctor_statement', certainty: 'confirmed', priority: 100 })
  ])), '带状疱疹')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '荨麻疹', kind: 'diagnosis', source: 'test_result', certainty: 'confirmed', priority: 90 })
  ])), '荨麻疹')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '荨麻疹', kind: 'diagnosis', source: 'user_report', certainty: 'confirmed', priority: 80, sourceRecordId: 'record-1' })
  ])), '荨麻疹')
  assert.equal(getHealthEventDefinitionTitle(summary([
    tag({ label: '皮炎', kind: 'diagnosis', source: 'doctor_statement', certainty: 'suspected', priority: 100 })
  ])), '未定性')
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
  assert.equal(getHealthEventStatusPresentation('observing').tone, 'info')
  assert.equal(getHealthEventStatusPresentation('handling').label, '处理中')
  assert.equal(getHealthEventStatusPresentation('handling').tone, 'warning')
  assert.equal(getHealthEventStatusPresentation('stable').label, '暂时稳定')
  assert.equal(getHealthEventStatusPresentation('ended').label, '已结束')
  assert.equal(getHealthEventStatusPresentation('recovered').label, '已结束')
  assert.equal(getHealthEventStatusPresentation('recovered').tone, 'success')
})

test('开始时间优先使用事件语义字段，无效时才回退最早记录且不使用审计时间', () => {
  assert.equal(getHealthEventStartDate('2026-08-29T01:00:00.000Z', ['2026-08-28T02:00:00.000Z']), '2026-08-29T01:00:00.000Z')
  assert.equal(getHealthEventStartDate(null, ['2026-08-29T02:00:00.000Z', '2026-08-28T02:00:00.000Z']), '2026-08-28T02:00:00.000Z')
  assert.equal(getHealthEventStartDate('invalid', []), null)
})

test('持续天数按本地自然日包含开始当天并覆盖同日、跨月、跨年和时区边界', () => {
  const base = { status: 'recovered' as const, timeZone: 'Asia/Shanghai' }
  assert.equal(getHealthEventDuration({ ...base, startTime: '2026-08-29T01:00:00+08:00', recoveredAt: '2026-08-29T23:00:00+08:00' }), 1)
  assert.equal(getHealthEventDuration({ ...base, startTime: '2026-08-29T23:59:00+08:00', recoveredAt: '2026-08-30T00:01:00+08:00' }), 2)
  assert.equal(getHealthEventDuration({ ...base, startTime: '2026-08-31T23:59:00+08:00', recoveredAt: '2026-09-01T00:01:00+08:00' }), 2)
  assert.equal(getHealthEventDuration({ ...base, startTime: '2025-12-31T23:59:00+08:00', recoveredAt: '2026-01-01T00:01:00+08:00' }), 2)
  assert.equal(getHealthEventDuration({ ...base, startTime: '2026-08-27T15:59:59Z', recoveredAt: '2026-08-27T16:00:00Z' }), 2)
})

test('观察中使用今天显示已持续，历史康复缺少结束时间时不伪造持续天数', () => {
  assert.equal(formatHealthEventDuration({
    status: 'observing', startTime: '2026-08-28T23:59:00+08:00', now: new Date('2026-08-30T00:01:00+08:00'), timeZone: 'Asia/Shanghai'
  }), '已持续3天')
  assert.equal(formatHealthEventDuration({
    status: 'recovered', startTime: '2026-08-28T23:59:00+08:00', recoveredAt: null, now: new Date('2030-01-01T00:00:00Z')
  }), null)
})

test('开始日期使用本地日期和周几，跨年份时补充年份', () => {
  assert.equal(formatHealthEventDate('2026-08-27T16:00:00Z', new Date('2026-08-31T00:00:00Z'), 'Asia/Shanghai'), '开始于 8月28日 周五')
  assert.equal(formatHealthEventDate('2025-12-30T16:00:00Z', new Date('2026-08-31T00:00:00Z'), 'Asia/Shanghai'), '开始于 2025年12月31日 周三')
})

test('展示标题保留明确标题，占位标题只用已确认症状生成紧凑识别名称', () => {
  const symptomSummary = summary([
    tag({ label: '发热', kind: 'symptom', priority: 70, sourceRecordId: 'record-1' }),
    tag({ label: '头痛', kind: 'symptom', priority: 60, sourceRecordId: 'record-2' })
  ])
  assert.equal(getHealthEventDisplayTitle('家长确认的夜间发热', symptomSummary), '家长确认的夜间发热')
  assert.equal(getHealthEventDisplayTitle('未定性', symptomSummary), '发热伴头痛')
  assert.equal(getHealthEventDisplayTitle('未明确', summary([])), '未定性')
})

test('病程摘要按状态选择可追溯事实、最多三项且不从缺失数据生成否定结论', () => {
  const richSummary = summary([
    tag({ label: '当前37.8℃', kind: 'measurement', source: 'measurement', priority: 75, sourceRecordId: 'temperature-latest' }),
    tag({ label: '最高38.3℃', kind: 'measurement', source: 'measurement', priority: 50, sourceRecordId: 'temperature-max' }),
    tag({ label: '发热', kind: 'symptom', priority: 70, sourceRecordId: 'symptom-fever' }),
    tag({ label: '头痛减轻', kind: 'change', priority: 80, sourceRecordId: 'change-headache' }),
    tag({ label: '使用退热药', kind: 'medication', priority: 45, sourceRecordId: 'medication-1' })
  ])
  assert.deepEqual(getHealthEventSummaryFragments({ status: 'observing', summary: richSummary }), [
    { label: '当前37.8℃', sourceRecordId: 'temperature-latest', kind: 'measurement' },
    { label: '发热', sourceRecordId: 'symptom-fever', kind: 'symptom' },
    { label: '头痛减轻', sourceRecordId: 'change-headache', kind: 'change' }
  ])
  assert.deepEqual(getHealthEventSummaryFragments({ status: 'recovered', summary: richSummary }), [
    { label: '最高38.3℃', sourceRecordId: 'temperature-max', kind: 'measurement' },
    { label: '使用退热药', sourceRecordId: 'medication-1', kind: 'medication' },
    { label: '头痛减轻', sourceRecordId: 'change-headache', kind: 'change' }
  ])
  const labels = getHealthEventSummaryFragments({ status: 'recovered', summary: summary([]) }).map(({ label }) => label)
  assert.equal(labels.some((label) => /未就医|未用药|消失|已退热/.test(label)), false)
})
