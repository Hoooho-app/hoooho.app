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

// R2-006: validate the original nested date before it can become a different day.
test('就诊材料非法自然日和非字符串时间在创建任何健康事实前拒绝', async t => {
  const f = await fixture(t)
  for (const occurredAt of ['2026-02-30T12:00:00Z', '2025-02-29T12:00:00Z', '2026-04-31T12:00:00Z', null, 0, false, [], {}, '']) {
    await assert.rejects(() => f.capture({}, { ...f.materials, occurredAt }), { status: 400, code: 'INVALID_VISIT_MATERIALS' })
  }
  assert.deepEqual(await f.service.events.repository.findByAccountId(accountId), [])
  assert.deepEqual(await f.service.records.repository.findByAccountId(accountId), [])
})
test('合法闰日与时区保存为同一真实时刻，省略材料日期仍保留未知语义', async t => {
  const f = await fixture(t)
  const saved = await f.capture({}, { ...f.materials, occurredAt: '2024-02-29T12:00:00+08:00' })
  const record = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  assert.equal(record.occurredAt, '2024-02-29T04:00:00.000Z')
  assert.equal(record.journal.visit.materials.occurredAt, record.occurredAt)
  assert.equal((await f.service.events.get(accountId, saved.eventId)).startTime, record.occurredAt)
  assert.equal(record.caseContext.timeUnknown, false)
  const unknown = await f.capture()
  const unprovided = await f.service.records.getOwnedRecord(accountId, unknown.recordId)
  assert.equal(unprovided.caseContext.timeUnknown, true)
  assert.equal(unprovided.journal.timePrecision, 'unknown')
  assert.equal(unprovided.journal.visit.materials.occurredAt, undefined)
})
test('编辑材料非法日期时正文和已有原件也不发生部分更新', async t => {
  const f = await fixture(t), saved = await f.capture()
  const before = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  const journal = structuredClone(before.journal)
  journal.visit.materials.occurredAt = '2026-02-30T12:00:00Z'
  await assert.rejects(() => f.service.records.update(accountId, saved.recordId, { content: '不得部分保存的新正文', journal }, f.service.now()), { status: 400, code: 'INVALID_VISIT_MATERIALS' })
  assert.deepEqual(await f.service.records.getOwnedRecord(accountId, saved.recordId), before)
  assert.equal((await f.service.attachments.findByEventId(saved.eventId)).length, 1)
})

// R2-007: replacing an entire metadata parent cannot remove protected originals.
test('null、空分类和省略materials都不能删除当前就诊原话或变成普通记录', async t => {
  const f = await fixture(t)
  const originalText = '医生原话：目前未确诊过敏，原始意见必须完整保留。'
  const materials = { ...f.materials, status: 'reviewed', documents: [{ id: 'text-1', name: '问诊原话', kind: 'text', status: 'ready', originalText }] }
  const saved = await f.capture({ files: [] }, materials)
  const before = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  for (const journal of [null, { categories: [] }, { categories: ['other'] }, { categories: ['visit'], visit: { visitType: 'outpatient' } }]) {
    await assert.rejects(() => f.service.records.update(accountId, saved.recordId, { content: '不得部分更新', journal }, f.service.now()), { status: 400, code: 'VISIT_ORIGINAL_IMMUTABLE' })
    assert.deepEqual(await f.service.records.getOwnedRecord(accountId, saved.recordId), before)
  }
  assert.equal((await f.service.records.list(accountId, saved.eventId))[0].journal.visit.materials.documents[0].originalText, originalText)
})
test('整块省略材料不能移除已经绑定的图片原件，原件仍按字节可读', async t => {
  const f = await fixture(t), saved = await f.capture()
  const before = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  await assert.rejects(() => f.service.records.update(accountId, saved.recordId, { journal: { categories: ['visit'], visit: { visitType: 'outpatient' } } }, f.service.now()), { status: 400, code: 'VISIT_ORIGINAL_IMMUTABLE' })
  assert.deepEqual(await f.service.records.getOwnedRecord(accountId, saved.recordId), before)
  const original = await new EventAttachmentService({ dataDirectory: f.service.directory }).read(accountId, saved.eventId, saved.attachmentIds[0])
  assert.equal(original.buffer.toString('base64'), f.file.dataUrl.split(',')[1])
})
test('正文更新与正常核对、补充原话仍可保存且保留已有原件及身份', async t => {
  const f = await fixture(t), saved = await f.capture()
  const before = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  const contentOnly = await f.service.records.update(accountId, saved.recordId, { content: '补充资料摘要' }, f.service.now())
  assert.deepEqual(contentOnly.journal, before.journal)
  assert.deepEqual(contentOnly.caseContext, before.caseContext)
  const journal = structuredClone(contentOnly.journal)
  journal.visit.materials.status = 'reviewed'
  journal.visit.materials.supplement = '家长补充：当天未发热'
  journal.visit.materials.documents.push({ id: 'text-2', name: '补充原话', kind: 'text', status: 'ready', originalText: '医生补充：按实际情况复诊。' })
  journal.visit.materials.blocks = [{ id: 'review-1', title: '核对摘要', text: '保留旧原件并补充原话', documentId: 'text-2', page: 1, quote: '按实际情况复诊' }]
  const updated = await f.service.records.update(accountId, saved.recordId, { content: '已核对就诊资料', journal }, f.service.now())
  const reread = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  assert.deepEqual(reread, updated)
  assert.deepEqual(reread.journal.visit.materials.documents[0], before.journal.visit.materials.documents[0])
  assert.equal(reread.journal.visit.materials.documents[1].originalText, '医生补充：按实际情况复诊。')
  assert.equal(reread.journal.visit.materials.supplement, '家长补充：当天未发热')
  assert.equal(reread.caseContext.confirmed, true)
  assert.deepEqual(reread.caseContext.attachmentIds, saved.attachmentIds)
})
test('更新保留材料时仍拒绝直接改写已有医生原话', async t => {
  const f = await fixture(t)
  const materials = { ...f.materials, documents: [{ id: 'text-1', name: '问诊原话', kind: 'text', status: 'ready', originalText: '没有确诊过敏' }] }
  const saved = await f.capture({ files: [] }, materials), before = await f.service.records.getOwnedRecord(accountId, saved.recordId)
  const journal = structuredClone(before.journal)
  journal.visit.materials.documents[0].originalText = '已确诊过敏'
  await assert.rejects(() => f.service.records.update(accountId, saved.recordId, { journal }, f.service.now()), { status: 400, code: 'VISIT_ORIGINAL_IMMUTABLE' })
  assert.deepEqual(await f.service.records.getOwnedRecord(accountId, saved.recordId), before)
})
test('没有就诊原件的普通记录仍可清除journal并更新正文', async t => {
  const f = await fixture(t), saved = await f.capture()
  const normal = await f.service.records.create(accountId, saved.eventId, { type: 'note', content: '普通观察', occurredAt: '2026-09-10T02:00:00Z', journal: { categories: ['other'] } }, f.service.now())
  await f.service.records.update(accountId, normal.id, { journal: null, content: '普通观察更正' }, f.service.now())
  const reread = await f.service.records.getOwnedRecord(accountId, normal.id)
  assert.equal(reread.journal, undefined)
  assert.equal(reread.content, '普通观察更正')
})
