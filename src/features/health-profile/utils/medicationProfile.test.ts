import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyMedicationRecord,
  medicationDateSummary,
  medicationDetailSummary,
  nextMedicationSequence,
  normalizeMedicationRecords
} from './medicationProfile.ts'

test('旧长期用药记录映射为稳定编号和新字段', () => {
  const records = normalizeMedicationRecords([{ name: '阿托伐他汀', dosage: '1片', frequency: '每晚1次', startedAt: '2025-03-01' }])
  assert.equal(records[0].sequence, 1)
  assert.equal(records[0].dose, '1片')
  assert.equal(medicationDetailSummary(records[0]), '1片 · 每晚1次')
  assert.equal(medicationDateSummary(records[0]), '2025/03 — 至今')
})

test('新增编号只递增且删除其他记录后不重排', () => {
  const first = emptyMedicationRecord(1)
  const second = emptyMedicationRecord(2)
  const thirdSequence = nextMedicationSequence([first, second])
  assert.equal(thirdSequence, 3)
  assert.equal(normalizeMedicationRecords([second]).map(({ sequence }) => sequence)[0], 2)
})

test('摘要自动省略空字段并正确显示结束时间', () => {
  const record = { ...emptyMedicationRecord(1), frequency: '每日1次', route: '口服', startedAt: '2024-01-01', endedAt: '2025-06-30' }
  assert.equal(medicationDetailSummary(record), '每日1次 · 口服')
  assert.equal(medicationDateSummary(record), '2024/01 — 2025/06')
})
