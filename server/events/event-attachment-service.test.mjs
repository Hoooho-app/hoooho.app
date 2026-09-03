import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { HealthEventService } from './health-event-service.mjs'
import { HealthEventRecordService } from './health-event-record-service.mjs'
import { EventAttachmentService } from './event-attachment-service.mjs'

async function pngInput(name = '健康图片.png', color = '#2f8f83') {
  const buffer = await sharp({ create: { width: 16, height: 12, channels: 3, background: color } }).png().toBuffer()
  return { name, mimeType: 'image/png', dataUrl: `data:image/png;base64,${buffer.toString('base64')}` }
}

async function setup(dataDirectory, imageAnalysis) {
  const accountId = 'attachment-account'
  const members = new FamilyMemberService({ dataDirectory })
  const events = new HealthEventService({ dataDirectory })
  const records = new HealthEventRecordService({ dataDirectory })
  const attachments = new EventAttachmentService({ dataDirectory, imageAnalysis })
  const member = await members.create(accountId, { name: '小明', relationship: 'child', gender: 'male', birthday: '2021-08-09' })
  const event = await events.create(accountId, { memberId: member.id, title: '', category: 'other', startTime: '2026-08-09T09:00:00+08:00' })
  const record = await records.create(accountId, event.id, { type: 'examination', content: '完成检查', occurredAt: '2026-08-09T10:00:00+08:00' })
  return { accountId, attachments, event, events, member, record }
}

const completedAnalysis = { analyze: async (attachment) => ({
  status: 'completed', relevance: 'health', category: 'report', summary: '血常规报告', extractedFacts: [],
  provider: 'fixture-vision', confidence: 0.95, sourceAttachmentId: attachment.id, analyzedAt: attachment.createdAt
}) }

test('图片先预览后确认，预览阶段零正式附件', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-event-attachment-preview-'))
  try {
    const state = await setup(dataDirectory, completedAnalysis)
    const input = await pngInput()
    const draft = await state.attachments.preview(state.accountId, state.event.id, input)
    assert.equal(draft.canConfirm, true)
    assert.equal((await state.attachments.list(state.accountId, state.event.id)).length, 0)
    const created = await state.attachments.create(state.accountId, state.event.id, { ...input, recordId: state.record.id, confirmed: true })
    assert.equal(created.analysis.summary, '血常规报告')
    assert.equal((await state.attachments.list(state.accountId, state.event.id)).length, 1)
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('视觉未配置、无关图片和不安全图片保持零正式入库', async () => {
  for (const status of ['unavailable', 'irrelevant', 'unsafe']) {
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), `hoooho-event-attachment-${status}-`))
    try {
      const state = await setup(dataDirectory, { analyze: async () => ({ status, category: 'other', summary: '无结果', extractedFacts: [], provider: null, analyzedAt: new Date().toISOString() }) })
      const input = await pngInput()
      const draft = await state.attachments.preview(state.accountId, state.event.id, input)
      assert.equal(draft.canConfirm, false)
      await assert.rejects(() => state.attachments.create(state.accountId, state.event.id, { ...input, recordId: state.record.id, confirmed: true }))
      assert.equal((await state.attachments.list(state.accountId, state.event.id)).length, 0)
    } finally { await rm(dataDirectory, { recursive: true, force: true }) }
  }
})

test('同一事件按内容哈希原子去重，改名也不重复，不同事件仍可保留', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-event-attachment-dedupe-'))
  try {
    const state = await setup(dataDirectory, completedAnalysis)
    const input = await pngInput('原名.png')
    const [first, second] = await Promise.all([
      state.attachments.create(state.accountId, state.event.id, { ...input, recordId: state.record.id, confirmed: true }),
      state.attachments.create(state.accountId, state.event.id, { ...input, name: '改名.png', recordId: state.record.id, confirmed: true })
    ])
    assert.equal(first.id, second.id)
    assert.equal((await state.attachments.list(state.accountId, state.event.id)).length, 1)
    const otherEvent = await state.events.create(state.accountId, { memberId: state.member.id, title: '', category: 'other', startTime: '2026-08-10T09:00:00+08:00' })
    await state.attachments.create(state.accountId, otherEvent.id, { ...input, confirmed: true })
    assert.equal((await state.attachments.list(state.accountId, otherEvent.id)).length, 1)
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('服务端拒绝伪造 MIME、损坏图片、超限图片和跨账号访问', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-event-attachment-validation-'))
  try {
    const state = await setup(dataDirectory, completedAnalysis)
    const input = await pngInput()
    await assert.rejects(() => state.attachments.preview(state.accountId, state.event.id, { ...input, mimeType: 'image/jpeg', dataUrl: input.dataUrl.replace('image/png', 'image/jpeg') }), (error) => error.code === 'ATTACHMENT_MIME_MISMATCH')
    await assert.rejects(() => state.attachments.preview(state.accountId, state.event.id, { name: '坏.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=' }), (error) => error.code === 'ATTACHMENT_MIME_MISMATCH')
    const huge = Buffer.concat([Buffer.from(input.dataUrl.split(',')[1], 'base64'), Buffer.alloc(5 * 1024 * 1024)])
    await assert.rejects(() => state.attachments.preview(state.accountId, state.event.id, { name: '大图.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${huge.toString('base64')}` }), (error) => error.code === 'ATTACHMENT_TOO_LARGE')
    await assert.rejects(() => state.attachments.list('other-account', state.event.id), (error) => error.code === 'HEALTH_EVENT_NOT_FOUND')
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})
