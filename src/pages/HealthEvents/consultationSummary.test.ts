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
  member: { id: 'member-current', name: '刘磊', age: '35岁', relation: '本人', gender: 'male' },
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
  assert.match(summary.text, /当前人物/)
  assert.match(summary.text, /夜间咳嗽加重/)
  assert.doesNotMatch(summary.text, /慢性鼻炎/)
  assert.match(summary.prompt, /^以下是我的健康相关信息，请先帮我理解和整理这些信息。如果还缺少影响判断的重要内容，请继续向我提问。/)
  assert.doesNotMatch(summary.prompt, /是否需要就医|应该挂什么科/)
  assert.doesNotMatch(summary.text, /account-secret|member-current|event-current/)
})

test('空资料不可选且跨人物资料会停止生成', () => {
  const empty = getConsultationSummarySources(context({ records: [], relatedEvents: [], healthProfile: [] }))
  assert.equal(empty.find(({ id }) => id === 'raw')?.available, false)
  assert.equal(empty.find(({ id }) => id === 'history')?.available, false)
  assert.throws(() => buildConsultationSummary(context({ currentMemberId: 'other-member' }), ['basic', 'current']), /不一致/)
  assert.throws(() => buildConsultationSummary(context({ relatedEvents: [{ ...context().relatedEvents[0], memberId: 'other-member' }] }), ['basic', 'current']), /不属于当前人物/)
})

test('default clinical preparation includes qualified nurse notes and excludes assistant conversation', () => {
 const c=context();const record=c.records[0]
 record.journal={categories:['symptom'],aiNurse:{version:'nurse-v1',draftId:'draft',snapshots:[],turns:[{id:'u',role:'user',text:'担心鸡蛋',at:record.occurredAt,order:0,final:true,status:'completed'},{id:'a',role:'assistant',text:'助手问题不能作为事实',at:record.occurredAt,order:1,final:true,status:'completed'}],professionalNotes:[{id:'n',category:'parent_concern',heading:'家长担心',text:'担心鸡蛋相关',sourceTurnIds:['u'],certainty:'uncertain',attribution:'parent',editedByUser:false,createdAt:record.occurredAt,updatedAt:record.occurredAt}]}}
 const summary=buildConsultationSummary(c,['basic','current'])
 assert.match(summary.text,/不确定\/担心/);assert.match(summary.text,/担心鸡蛋相关/);assert.ok(!summary.text.includes('助手问题不能作为事实'))
})
