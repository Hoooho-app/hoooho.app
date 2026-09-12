import assert from 'node:assert/strict'
import test from 'node:test'
import { createVisitSummaryPresentation } from './visitSummaryPresentation'

const preparation = { version: 2, createdAt: '', updatedAt: '', shareToken: 'token', sourceFingerprint: 'fp', summary: { generatedAt: '', memberName: '安安', prompt: '', text: '', selectedSourceIds: [], sections: [
  { id: 'current', title: '当前健康随记', lines: ['标题：发热与咳嗽', '当前状态：观察中'] },
  { id: 'raw', title: '原始记录', lines: ['9月9日：体温38.2℃，腋温', '9月10日：实际服用退热药'] },
  { id: 'profile', title: '健康档案', lines: ['过敏史：牛奶'] },
] } }

test('数据库来源被投影为医生阅读栏目且空栏目省略', () => {
  const view = createVisitSummaryPresentation(preparation)
  assert.deepEqual(view.sections.map((section) => section.id), ['overview', 'course', 'trends', 'medication', 'background'])
  assert.equal(view.sections.some((section) => section.label === '原始记录'), false)
  assert.equal(view.sections.some((section) => section.id === 'examinations'), false)
})

test('每个问题保留独立依据映射', () => {
  const view = createVisitSummaryPresentation(preparation)
  assert.equal(view.problems[0].title, '发热与咳嗽')
  assert.equal(view.problems[0].evidence.id, 'evidence-1')
  assert.ok(view.problems[0].evidence.lines.length)
})
