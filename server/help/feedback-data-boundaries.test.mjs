import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { FeedbackService } from './feedback-service.mjs'
const image = async (format = 'png') => {
  const buffer = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#ca8a66' } })[format]().toBuffer()
  const type = `image/${format}`
  return { name: `合成.${format}`, type, dataUrl: `data:${type};base64,${buffer.toString('base64')}` }
}
const input = (extra = {}) => ({ description: '反馈保留原话', idempotencyKey: 'submission-one', attachments: [], ...extra })
async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-feedback-boundaries-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  return { dataDirectory, service: new FeedbackService({ dataDirectory, tokenSecret: 'synthetic-secret' }) }
}
const clientError = error => error.status >= 400 && error.status < 500
const files = directory => readdir(path.join(directory, 'feedback', 'attachments')).catch(error => { if (error.code === 'ENOENT') return []; throw error })
test('concurrent image submissions from two service instances return one durable ID and one file', async t => {
  const f = await fixture(t), second = new FeedbackService({ dataDirectory: f.dataDirectory }), attachment = await image()
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? second : f.service).create('owner', input({ attachments: [attachment] }))))
  assert.equal(new Set(results.map(result => result.id)).size, 1)
  assert.equal(results.filter(result => result.duplicate).length, 7)
  const saved = await f.service.getForAccount('owner', results[0].id)
  assert.equal(saved.description, '反馈保留原话')
  assert.equal(saved.attachments.length, 1)
  const persisted = JSON.parse(await readFile(path.join(f.dataDirectory, 'feedback', 'records.json'), 'utf8'))
  assert.equal(persisted.feedback.length, 1)
  assert.equal(persisted.attachments.length, 1)
  assert.equal(persisted.statusHistory.length, 1)
  assert.equal((await files(f.dataDirectory)).length, 1)
  assert.equal((await new FeedbackService({ dataDirectory: f.dataDirectory }).getForAccount('owner', results[0].id)).id, results[0].id)
  const other = await f.service.create('different-owner', input({ attachments: [attachment] }))
  assert.notEqual(other.id, results[0].id)
})
test('failed metadata persistence removes image files and retry is still possible', async t => {
  const f = await fixture(t), attachment = await image(), blobs = new Map()
  let shouldFail = true, data = { feedback: [], attachments: [], messages: [], statusHistory: [] }
  const service = new FeedbackService({ dataDirectory: f.dataDirectory,
    store: { read: async () => data, update: async update => { if (shouldFail) throw new Error('synthetic persistence failure'); data = await update(data); return data } },
    storage: { save: async (key, buffer) => { blobs.set(key, buffer) }, remove: async key => { blobs.delete(key) }, read: async key => blobs.get(key) }
  })
  await assert.rejects(service.create('owner', input({ attachments: [attachment] })), /synthetic persistence failure/)
  assert.equal(blobs.size, 0)
  assert.equal(data.feedback.length, 0)
  shouldFail = false
  const saved = await service.create('owner', input({ attachments: [attachment] }))
  assert.ok(saved.id)
  assert.equal(blobs.size, 1)
  assert.equal(data.feedback.length, 1)
})
test('malformed text attachments and request objects are rejected without dirty records', async t => {
  const f = await fixture(t)
  for (const body of [null, [], true, input({ description: {} }), input({ description: false }), input({ attachments: {} }), input({ attachments: null })]) await assert.rejects(f.service.create('owner', body), clientError)
  assert.deepEqual(await f.service.listForAccount('owner'), [])
  const created = await f.service.create('owner', input())
  await assert.rejects(f.service.addUserMessage('owner', created.id, { text: {} }), clientError)
  await assert.rejects(f.service.addUserMessage('owner', created.id, null), clientError)
  assert.equal((await f.service.getForAccount('owner', created.id)).messages.length, 0)
})
test('corrupt images fail before persistence while JPEG PNG and WebP survive unchanged', async t => {
  const f = await fixture(t)
  for (const format of ['jpeg', 'png', 'webp']) {
    const attachment = await image(format)
    const saved = await f.service.create('owner', input({ idempotencyKey: format, attachments: [attachment] }))
    assert.equal((await f.service.getForAccount('owner', saved.id)).attachmentCount, 1)
  }
  const before = await files(f.dataDirectory), valid = await image(), broken = Buffer.from(valid.dataUrl.split(',')[1], 'base64')
  broken[broken.indexOf(Buffer.from('IDAT')) + 4] ^= 0xff
  for (const bytes of [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), broken]) await assert.rejects(f.service.create('owner', input({ idempotencyKey: 'broken', attachments: [{ ...valid, dataUrl: 'data:image/png;base64,' + bytes.toString('base64') }] })), clientError)
  assert.equal((await files(f.dataDirectory)).length, before.length)
  assert.equal((await f.service.listForAccount('owner')).length, 3)
})
test('unknown feedback state cannot overwrite in-progress or add misleading history', async t => {
  const f = await fixture(t), created = await f.service.create('owner', input())
  await f.service.updateFromOps('operator', created.id, { status: 'in_progress' })
  const before = await f.service.getForOps(created.id)
  for (const status of ['typo', null, {}, 0]) await assert.rejects(f.service.updateFromOps('operator', created.id, { status }), error => error.code === 'INVALID_FEEDBACK_STATUS')
  const after = await f.service.getForOps(created.id)
  assert.equal(after.status, 'in_progress')
  assert.equal(after.statusHistory.length, before.statusHistory.length)
  assert.equal((await f.service.updateFromOps('operator', created.id, { status: 'resolved' })).status, 'improved')
})
