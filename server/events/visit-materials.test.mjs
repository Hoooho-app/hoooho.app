import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { EventAttachmentService } from './event-attachment-service.mjs'
import { CaseContinuityService } from './case-continuity-service.mjs'
import { fingerprint } from '../ai/business/contract.mjs'
import { validateVisitMaterials } from './visit-materials-metadata.mjs'

const accountId = 'visit-materials-synthetic-owner'
async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-visit-materials-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId, name: '就诊验收（虚构）', relationship: 'child' })
  const service = new CaseContinuityService({ dataDirectory, now: () => new Date('2026-10-17T14:00:00Z') })
  const buffer = await sharp({ create: { width: 80, height: 120, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const file = { name: '虚构病历.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,' + buffer.toString('base64') }
  const document = { id: 'original-1', name: file.name, kind: 'file', mimeType: file.mimeType, contentHash: fingerprint(file.dataUrl), status: 'failed', error: '合成识别中断' }
  const materials = { source: 'hospital', status: 'originals_only', title: '合成就诊资料', documents: [document], blocks: [] }
  const capture = (extra = {}, value = materials) => service.capture(accountId, member.id, { requestId: crypto.randomUUID(), title: value.title, text: '合成测试原件，未提供就诊时间', occurredAt: '2026-10-17T14:00:00Z', timeUnknown: true, identity: value.source === 'external_ai' ? 'external_ai' : 'medical_consultation', journal: { categories: ['visit'], visit: { visitType: value.source === 'hospital' ? 'outpatient' : 'online_consultation', materials: value } }, files: [file], ...extra })
  return { service, members, member, file, document, materials, capture }
}
test('识别故障仍保存可读取的原件；未知日期不补猜，重试保存幂等，不进入症状跟进', async t => {
  const f = await fixture(t), input = { requestId: 'originals-save-1' }
  const first = await f.capture(input), repeated = await f.capture(input)
  assert.equal(first.recordId, repeated.recordId)
  const record = await f.service.records.getOwnedRecord(accountId, first.recordId)
  assert.equal(record.journal.timePrecision, 'unknown')
  assert.equal(record.caseContext.timeUnknown, true)
  assert.equal(record.caseContext.confirmed, false)
  assert.equal(record.journal.visit.materials.documents[0].attachmentId, first.attachmentIds[0])
  const original = await new EventAttachmentService({ dataDirectory: f.service.directory }).read(accountId, first.eventId, first.attachmentIds[0])
  assert.equal(original.buffer.toString('base64'), f.file.dataUrl.split(',')[1])
  assert.equal((await f.service.records.list(accountId, first.eventId)).length, 1)
  assert.equal((await f.service.attachments.findByEventId(first.eventId)).length, 1)
  assert.equal((await f.service.list(accountId, f.member.id)).active.length, 0)
})
test('同一原记录核对后保留原件引用；更新不能借用其他附件或伪造AI医生来源', async t => {
  const f = await fixture(t), saved = await f.capture({}, { ...f.materials, source: 'external_ai' })
  const record = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  const next = { ...record.journal.visit.materials, status: 'reviewed', blocks: [{ id: 'block-1', title: 'AI 对话原文', text: '合成参考资料', quote: '合成参考资料', page: 1, documentId: f.document.id }] }
  const updated = await f.service.records.update(accountId, record.id, { content: '已核对的AI参考', journal: { ...record.journal, visit: { ...record.journal.visit, materials: next } } }, f.service.now())
  assert.equal(updated.caseContext.identity, 'external_ai')
  assert.equal(updated.caseContext.confirmed, true)
  assert.equal(updated.journal.visit.materials.documents[0].attachmentId, saved.attachmentIds[0])
  await assert.rejects(() => f.service.records.update(accountId, record.id, { journal: { ...record.journal, visit: { ...record.journal.visit, materials: { ...next, source: 'hospital' } } } }, f.service.now()), /保留AI来源/)
  await assert.rejects(() => f.service.confirmMaterial(accountId, f.member.id, saved.eventId, saved.recordId, { identity: 'medical_consultation', confirmed: true, content: '不能升级成医生医嘱' }), /保留AI来源/)
  await assert.rejects(() => f.service.records.update(accountId, record.id, { journal: { ...record.journal, visit: { ...record.journal.visit, materials: { ...next, documents: [{ ...f.document, contentHash: '0'.repeat(64) }] } } } }, f.service.now()), /(原件不属于|原件与原话需保留)/)
})
test('补入原就诊保留旧病历和PDF报告；跨人物、跨就诊关联被拒绝', async t => {
  const f = await fixture(t), first = await f.capture()
  const pdf = await PDFDocument.create(); for (let page = 0; page < 13; page++) pdf.addPage([300, 400])
  const file = { name: '虚构检查报告.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.from(await pdf.save()).toString('base64') }
  const materials = { ...f.materials, title: '后续报告', documents: [{ ...f.document, id: 'report-1', name: file.name, mimeType: file.mimeType, contentHash: fingerprint(file.dataUrl) }] }
  const appended = await f.capture({ eventId: first.eventId, files: [file], journal: { categories: ['visit'], visit: { visitType: 'outpatient', linkedVisitRecordId: first.recordId, materials } } }, materials)
  assert.equal(appended.eventId, first.eventId)
  const fullReport = await new EventAttachmentService({ dataDirectory: f.service.directory }).read(accountId, first.eventId, appended.attachmentIds[0])
  assert.equal((await PDFDocument.load(fullReport.buffer)).getPageCount(), 13)
  assert.equal((await f.service.records.list(accountId, first.eventId)).length, 2)
  assert.equal((await f.service.attachments.findByEventId(first.eventId)).length, 2)
  assert.equal((await f.service.records.getOwnedRecord(accountId, first.recordId)).journal.visit.materials.documents[0].attachmentId, first.attachmentIds[0])
  const other = await f.members.create({ accountId, name: '其他虚构孩子', relationship: 'child' })
  await assert.rejects(() => f.service.capture(accountId, other.id, { eventId: first.eventId, requestId: 'cross-child', text: '合成', files: [], journal: { categories: ['visit'], visit: { visitType: 'outpatient', materials: { ...f.materials, documents: [{ id: 'text-1', name: '原文', kind: 'text', originalText: '合成原文', status: 'ready' }] } } } }), /不属于当前人物/)
  const unrelated = await f.capture()
  await assert.rejects(() => f.capture({ eventId: unrelated.eventId, journal: { categories: ['visit'], visit: { visitType: 'outpatient', linkedVisitRecordId: first.recordId, materials: f.materials } } }), /同一次就诊/)
})
test('错误原件、未来时间和无来源段落在写入前失败', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.capture({}, { ...f.materials, documents: [{ ...f.document, contentHash: '0'.repeat(64) }] }), /原件与核对内容不一致/)
  assert.throws(() => validateVisitMaterials({ ...f.materials, occurredAt: new Date(Date.now() + 86400000).toISOString() }), /不能晚于现在/)
  assert.throws(() => validateVisitMaterials({ ...f.materials, status: 'reviewed', blocks: [{ id: 'b', title: '坏来源', text: '合成', quote: '合成', page: 1, documentId: 'other-member-original' }] }), /出处无效/)
  assert.equal((await f.service.events.repository.findByAccountId(accountId)).length, 0)
})
test('多段粘贴和来源链接完整保留，不读取私有分享正文，不生成用药或提醒', async t => {
  const f = await fixture(t)
  const documents = [
    { id: 'text-1', name: '问诊对话1', kind: 'text', originalText: '家长：这是合成验收资料。\nAI：请保留原始报告供医生查看。', status: 'ready' },
    { id: 'link-1', name: '来源链接', kind: 'link', originalText: 'https://example.test/private-consultation', status: 'ready' }
  ]
  const value = { ...f.materials, source: 'external_ai', status: 'reviewed', documents }
  const saved = await f.capture({ files: [], identity: 'medical_consultation' }, value)
  const record = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  assert.deepEqual(record.journal.visit.materials.documents, documents)
  assert.equal(record.caseContext.identity, 'external_ai')
  assert.deepEqual(record.journal.categories, ['visit'])
  assert.equal(record.journal.medication, undefined)
  assert.deepEqual((await f.service.events.get(accountId, saved.eventId)).observationTasks ?? [], [])
})
