import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventPromptContext } from '../../features/ask-ai'
import { buildConsultationSummary, getConsultationSummarySources, getDefaultConsultationSummarySelection } from './consultationSummary'

const context = (overrides: Partial<HealthEventPromptContext> = {}): HealthEventPromptContext => ({
  attachments: [],
  currentMemberId: 'member-current',
  event: {
    id: 'event-current', memberId: 'member-current', title: '咳嗽', status: 'observing', startDate: '2026-09-01T08:00:00.000Z',
    symptoms: ['咳嗽'], summary: '夜间咳嗽加重，没有发热。', medications: [], visits: [], examinations: [], timeline: [], temperatureRecords: [], attachments: [], concerns: [], personalizedModules: [], medicalInfo: { allergies: [], medications: [], medicalHistory: [], chronicDiseases: [], familyHistory: [] },
  },
  healthProfile: [{ id: 'history', title: '既往情况', entries: [{ id: '1', lines: ['慢性鼻炎：2018 年起'] }] }],
  member: { id: 'member-current', name: '小磊', age: '3岁5个月', relation: '子女', gender: 'male' },
  organizations: [],
  records: [{ id: 'record-1', accountId: 'account-secret', eventId: 'event-current', type: 'note', content: '咳嗽', sourceText: '晚上咳得更明显', occurredAt: '2026-09-01T20:00:00.000Z', createdAt: '2026-09-01T20:00:00.000Z', updatedAt: '2026-09-01T20:00:00.000Z' }],
  relatedEvents: [{ id: 'event-history', accountId: 'account-secret', memberId: 'member-current', title: '慢性鼻炎', category: 'other', status: 'recovered', startTime: '2018-01-01T08:00:00.000Z', createdAt: '2018-01-01T08:00:00.000Z', updatedAt: '2018-01-01T08:00:00.000Z' }],
  ...overrides,
})

test('问诊摘要默认选择两项必选资料和有内容的健康档案', () => {
  assert.deepEqual(getConsultationSummarySources(context()).map(({ id, label }) => [id, label]), [
    ['basic', '基本信息'], ['current', '当前健康随记'], ['profile', '健康档案'], ['raw', '原始记录'], ['history', '相关历史随记'],
  ])
  assert.deepEqual(getDefaultConsultationSummarySelection(context()), ['basic', 'current', 'profile'])
  assert.deepEqual(getDefaultConsultationSummarySelection(context({ healthProfile: [] })), ['basic', 'current'])
})

test('同一份问诊摘要只包含本次选择的资料并生成开放式提示词', () => {
  const summary = buildConsultationSummary(context(), ['basic', 'current', 'raw'], new Date('2026-09-02T09:00:00.000Z'))
  assert.deepEqual(summary.selectedSourceIds, ['basic', 'current', 'raw'])
  assert.match(summary.text, /孩子基础信息/)
  assert.match(summary.text, /夜间咳嗽加重/)
  assert.doesNotMatch(summary.text, /慢性鼻炎/)
  assert.match(summary.prompt, /^以下是孩子的健康记录，请帮助照护者准备与医生沟通/)
  for (const heading of ['1. 孩子基础信息', '2. 家长主要担心的问题', '3. 首次出现和持续时间', '4. 发生次数及变化', '5. 可能相关的饮食或接触', '6. 已采取的处理', '7. 用药及效果', '8. 生长趋势', '9. 就诊和检查结果', '10. 希望医生重点判断的问题']) assert.match(summary.text, new RegExp(heading.replace('.', '\\.')))
  assert.doesNotMatch(summary.prompt, /是否需要就医|应该挂什么科/)
  assert.doesNotMatch(summary.text, /account-secret|member-current|event-current/)
})

test('空资料不可选且跨人物资料会停止生成', () => {
  const empty = getConsultationSummarySources(context({ records: [], relatedEvents: [], healthProfile: [] }))
  assert.equal(empty.find(({ id }) => id === 'raw')?.available, false)
  assert.equal(empty.find(({ id }) => id === 'history')?.available, false)
  assert.throws(() => buildConsultationSummary(context({ currentMemberId: 'other-member' }), ['basic', 'current']), /不一致/)
  assert.throws(() => buildConsultationSummary(context({ relatedEvents: [{ ...context().relatedEvents[0], memberId: 'other-member' }] }), ['basic', 'current']), /不属于当前孩子/)
})
