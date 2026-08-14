import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allergyReactionSummary,
  emptyAllergyRecord,
  nextAllergySequence,
  normalizeAllergyRecords,
  normalizeAllergyReports
} from './allergyProfile.ts'

test('旧过敏记录兼容映射为多记录结构', () => {
  const records = normalizeAllergyRecords([{ name: '猫毛', type: '环境', reaction: '打喷嚏' }])
  assert.equal(records[0].sequence, 1)
  assert.equal(records[0].subject, '猫毛')
  assert.equal(records[0].certainty, '已明确')
  assert.equal(records[0].otherReaction, '打喷嚏')
})

test('旧的具体反应归入精简分类且保留细节', () => {
  const [record] = normalizeAllergyRecords([{ reactions: ['皮疹', '腹痛', '喘息'] }])
  assert.deepEqual(record.reactions, ['皮肤', '消化道', '呼吸道'])
  assert.equal(record.reactionDetail, '皮疹、腹痛、喘息')
  assert.equal(allergyReactionSummary(record), '皮肤 / 消化道 / 呼吸道')
})

test('序号稳定递增', () => {
  const first = { ...emptyAllergyRecord(1), reactions: ['皮肤', '呼吸道'] }
  const third = emptyAllergyRecord(3)
  assert.equal(nextAllergySequence([first, third]), 4)
  assert.equal(allergyReactionSummary(first), '皮肤 / 呼吸道')
  assert.equal(normalizeAllergyRecords([third])[0].sequence, 3)
})

test('无效报告被忽略且有效报告保留人工整理状态', () => {
  const reports = normalizeAllergyReports([{ id: 'r1', name: '报告.pdf', dataUrl: 'data:application/pdf;base64,AA', parsingStatus: '已识别' }, {}])
  assert.equal(reports.length, 1)
  assert.equal(reports[0].parsingStatus, '待人工整理')
})
