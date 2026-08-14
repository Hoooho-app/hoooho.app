import assert from 'node:assert/strict'
import test from 'node:test'
import { emptySurgeryRecord, nextSurgerySequence, normalizeSurgeryRecords, surgerySummary } from './surgeryProfile.ts'

test('旧 recovery 与 impact 合并为去重的术后标签并保留隐藏字段', () => {
  const attachment = { id: 'legacy-file' }
  const [record] = normalizeSurgeryRecords([{
    name: '胆囊手术',
    date: '2022-06-18',
    hospital: 'XX医院',
    reason: '胆囊结石',
    recovery: '仍有一些影响',
    remainingImpact: '偶尔疼痛',
    impact: '偶尔疼痛',
    note: '旧备注',
    attachment
  }])

  assert.deepEqual(record.postoperativeStatusTags, ['仍有影响', '偶尔疼痛'])
  assert.equal(record.reason, '胆囊结石')
  assert.equal(record.legacyNote, '旧备注')
  assert.equal(record.legacyAttachment, attachment)
})

test('旧植入物字段映射为互斥标签且无法确认的真值被保留', () => {
  const [none, named, unnamed] = normalizeSurgeryRecords([
    { hasImplant: false },
    { implant: true, implantDetail: '人工关节' },
    { hasImplant: '有' }
  ])

  assert.deepEqual(none.implantTags, ['无'])
  assert.deepEqual(named.implantTags, ['人工关节'])
  assert.deepEqual(unnamed.implantTags, [])
  assert.equal(unnamed.legacyImplantNote, '有植入物，名称未记录')
})

test('已有具体植入物优先于矛盾的无标签', () => {
  const [record] = normalizeSurgeryRecords([{ implantTags: ['无', '钢板', '钢板'] }])
  assert.deepEqual(record.implantTags, ['钢板'])
})

test('编号、标准身体部位和折叠摘要保持稳定', () => {
  const [record] = normalizeSurgeryRecords([{
    ...emptySurgeryRecord(3),
    date: '2024-06-18',
    hospital: '北京医院',
    locations: ['右膝'],
    postoperativeStatusTags: ['恢复良好'],
    implantTags: ['无']
  }])

  assert.equal(nextSurgerySequence([record]), 4)
  assert.equal(record.locations[0].label, '右膝')
  assert.deepEqual(surgerySummary(record), {
    context: '2024-06-18 · 北京医院',
    locations: '右膝',
    postoperative: '恢复良好',
    implant: '无植入物'
  })
})
