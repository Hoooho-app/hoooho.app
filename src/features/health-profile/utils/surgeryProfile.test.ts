import assert from 'node:assert/strict'
import test from 'node:test'
import { emptySurgeryRecord, nextSurgerySequence, normalizeSurgeryRecords, normalizeSurgeryReports, surgerySummary } from './surgeryProfile.ts'

test('旧手术记录映射到新结构且旧备注保留', () => {
  const [record] = normalizeSurgeryRecords([{ name: '胆囊手术', date: '2022-06-18', hospital: 'XX医院', reason: '胆囊结石', recovery: '恢复良好', note: '旧附件说明' }])
  assert.equal(record.sequence, 1)
  assert.equal(record.name, '胆囊手术')
  assert.equal(record.legacyNote, '旧附件说明')
  assert.deepEqual(surgerySummary(record), { context: '2022/06 · XX医院', reason: '胆囊结石', status: '恢复良好', implant: '' })
})

test('编号稳定且植入物摘要只在选择有时显示', () => {
  const record = { ...emptySurgeryRecord(3), locations: ['右膝'], hasImplant: '有', implantName: '人工关节' }
  assert.equal(nextSurgerySequence([record]), 4)
  assert.equal(surgerySummary(record).implant, '右膝 · 人工关节')
  assert.equal(normalizeSurgeryRecords([record])[0].sequence, 3)
})

test('无效资料被忽略且解析状态保持人工确认', () => {
  const reports = normalizeSurgeryReports([{ id: 'r1', name: '出院记录.pdf', dataUrl: 'data:application/pdf;base64,AA', parsingStatus: '已自动确认' }, {}])
  assert.equal(reports.length, 1)
  assert.equal(reports[0].parsingStatus, '待人工整理')
})
