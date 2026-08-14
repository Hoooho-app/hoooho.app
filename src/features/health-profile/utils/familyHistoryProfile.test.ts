import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyFamilyHistoryRecord,
  familyHistorySummary,
  findExistingUniqueRelationship,
  normalizeFamilyHistoryRecords,
  setFamilyHealthIssueNames
} from './familyHistoryProfile.ts'

test('旧单疾病记录映射为独立健康问题详情', () => {
  const [record] = normalizeFamilyHistoryRecords([{
    relationship: '父亲',
    disease: '高血压',
    age: '45岁',
    diagnosed: '是',
    similar: '外公也有类似情况',
    note: '长期服药'
  }])

  assert.equal(record.relationship, '父亲')
  assert.deepEqual(record.healthIssues.map(({ name, onset, certainty }) => ({ name, onset, certainty })), [
    { name: '高血压', onset: '45岁', certainty: '明确诊断' }
  ])
  assert.equal(record.note, '长期服药')
  assert.equal(record.legacy?.similar, '外公也有类似情况')
})

test('旧多疾病共享详情只映射首项并保留歧义信息', () => {
  const [record] = normalizeFamilyHistoryRecords([{
    relationship: '父亲',
    conditions: ['高血压', '糖尿病'],
    age: '40多岁',
    diagnosed: '不确定'
  }])

  assert.equal(record.healthIssues[0].onset, '40多岁')
  assert.equal(record.healthIssues[1].onset, '')
  assert.equal(record.legacy?.sharedOnset, '40多岁')
  assert.equal(record.legacy?.sharedCertainty, '不确定')
})

test('更新健康问题名称保留各自详情并支持多个问题', () => {
  const record = {
    ...emptyFamilyHistoryRecord(1),
    healthIssues: [{ id: 'one', name: '高血压', onset: '45岁', certainty: '明确诊断' }]
  }
  const next = setFamilyHealthIssueNames(record, ['高血压', '糖尿病', '高血压'])
  assert.equal(next.healthIssues.length, 2)
  assert.equal(next.healthIssues[0].onset, '45岁')
  assert.equal(next.healthIssues[1].name, '糖尿病')
})

test('摘要按问题分别显示年龄且唯一亲属可被定位', () => {
  const [record] = normalizeFamilyHistoryRecords([{
    relationship: '父亲',
    healthIssues: [
      { id: 'one', name: '高血压', onset: '45岁', certainty: '明确诊断' },
      { id: 'two', name: '糖尿病', onset: '52岁', certainty: '明确诊断' }
    ]
  }])
  assert.deepEqual(familyHistorySummary(record), {
    relationship: '父亲',
    issues: ['高血压 · 约45岁', '糖尿病 · 约52岁']
  })
  assert.equal(findExistingUniqueRelationship([record], '父亲'), 0)
  assert.equal(findExistingUniqueRelationship([record], '兄弟姐妹'), -1)
})
