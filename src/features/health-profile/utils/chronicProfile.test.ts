import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chronicSummary,
  emptyChronicRecord,
  nextChronicSequence,
  normalizeChronicRecords,
  normalizeChronicReports
} from './chronicProfile.ts'

test('旧慢性问题字段完整映射并保留兼容信息', () => {
  const [record] = normalizeChronicRecords([{ name: '腰背筋膜炎', firstFoundAt: '2020-01-01', status: '持续中', impact: '久坐后腰疼', management: '热敷', note: '旧备注' }])
  assert.equal(record.sequence, 1)
  assert.equal(record.knowledge, '已有明确名称')
  assert.equal(record.description, '久坐后腰疼')
  assert.equal(record.handling, '热敷')
  assert.deepEqual(record.legacy, { firstFoundAt: '2020-01-01', status: '持续中', note: '旧备注' })
})

test('编号稳定递增且摘要组合位置表现规律和影响', () => {
  const record = { ...emptyChronicRecord(3), knowledge: '还不知道是什么', name: '冬天反复头疼', locations: ['左太阳穴', '后脑'], symptoms: ['疼痛'], patterns: ['反复出现', '天冷时'], lifeImpact: '有一些影响' }
  assert.equal(nextChronicSequence([record]), 4)
  assert.deepEqual(chronicSummary(record), { detail: '还不知道是什么 · 左太阳穴、后脑 · 疼痛', pattern: '反复出现、天冷时', impact: '有一些影响' })
  assert.equal(normalizeChronicRecords([record])[0].sequence, 3)
})

test('资料只保留有效文件且不伪造解析结果', () => {
  const reports = normalizeChronicReports([{ id: 'r1', name: '腰椎检查.pdf', dataUrl: 'data:application/pdf;base64,AA', parsingStatus: '已确诊' }, null])
  assert.equal(reports.length, 1)
  assert.equal(reports[0].parsingStatus, '待人工整理')
})
