import test from 'node:test'
import assert from 'node:assert/strict'
import { materialRecordText, materialReview, mergeMaterialBlocks } from './materialReview'
import type { RecognitionJob } from '../ai-business/recognitionJobs'
import type { LocalVisitDocument, VisitMaterialBlock } from './types'
const document: LocalVisitDocument = { id: 'd1', name: '虚构病历', kind: 'file', status: 'ready' }
test('无出处的模型字段不采用，AI角色标签与原文保持独立，重试保留编辑', () => {
  const job = { review: { items: [{ id: 'i1', category: 'visit', fields: [{ name: 'doctorStatement', value: '有出处的内容', sources: [{ quote: '原文：有出处的内容', page: 2 }] }, { name: 'institution', value: '无出处的医院', sources: [] }] }], sources: [{ id: 'file', page: 2, text: '原文：有出处的内容', status: 'readable' }] } } as unknown as RecognitionJob
  const result = materialReview(document, job, 'external_ai')
  assert.equal(result.blocks[0].title, 'AI 对话资料')
  assert.equal(result.blocks[0].text, '有出处的内容')
  assert.equal(result.blocks[0].page, 2)
  assert.equal(result.institution, '')
  const edited: VisitMaterialBlock = { ...result.blocks[0], text: '用户核对后的内容', edited: true }
  assert.equal(mergeMaterialBlocks([edited], document.id, result.blocks)[0].text, edited.text)
})
test('长报告的记录摘要不截断用户全文；日期与机构未提供则不补猜', () => {
  const result = materialReview(document, { review: { items: [], sources: [{ id: 'file', page: 1, text: '没有日期与机构的原文', status: 'readable' }] } } as unknown as RecognitionJob, 'hospital')
  assert.equal(result.institution, '')
  assert.equal(result.occurredAt, undefined)
  const long = { ...result.blocks[0], text: '原文'.repeat(4000) }
  assert.match(materialRecordText('就诊资料', [long], '', false), /查看全文/)
  assert.equal(long.text.length, 8000)
})
