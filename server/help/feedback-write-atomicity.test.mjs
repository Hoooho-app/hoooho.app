import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { FeedbackAttachmentStorage, FeedbackService } from './feedback-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'

const empty = () => ({ feedback: [], attachments: [], messages: [], statusHistory: [] })
const input = (extra = {}) => ({ description: '合成反馈原文', idempotencyKey: 'synthetic-request', attachments: [], ...extra })
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-feedback-atomicity-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { directory, service: new FeedbackService({ dataDirectory: directory }) }
}
async function photo() {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#7da9b2' } }).png().toBuffer()
  return { name: '合成.png', type: 'image/png', dataUrl: 'data:image/png;base64,' + bytes.toString('base64') }
}
const raw = directory => readFile(path.join(directory, 'feedback', 'records.json'), 'utf8').then(JSON.parse)
const files = directory => readdir(path.join(directory, 'feedback', 'attachments')).catch(error => { if (error.code === 'ENOENT') return []; throw error })

test('concurrent supplements from separate instances enforce the latest feedback image total', async t => {
  const f = await fixture(t), second = new FeedbackService({ dataDirectory: f.directory }), image = await photo()
  const created = await f.service.create('owner', input({ attachments: Array.from({ length: 8 }, () => image) }))
  const results = await Promise.allSettled([f.service, second].map((service, index) => service.addUserMessage('owner', created.id, { text: '补充' + index, attachments: [image, image] })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = results.find(result => result.status === 'rejected')
  assert.equal(rejected.reason.status, 400)
  assert.equal(rejected.reason.code, 'TOO_MANY_FEEDBACK_ATTACHMENTS')
  const persisted = await raw(f.directory)
  assert.equal(persisted.attachments.length, 10)
  assert.equal(persisted.messages.length, 1)
  assert.equal((await files(f.directory)).length, 10)
  assert.equal((await second.getForAccount('owner', created.id)).attachmentCount, 10)
})

test('deletion racing an in-flight supplement removes every owned message and private file', async t => {
  const f = await fixture(t), storage = new FeedbackAttachmentStorage(path.join(f.directory, 'feedback', 'attachments'))
  let saved, release
  const written = new Promise(resolve => { saved = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const supplementService = new FeedbackService({ dataDirectory: f.directory, storage: {
    save: async (key, buffer) => { await storage.save(key, buffer); saved(); await gate },
    read: key => storage.read(key), remove: key => storage.remove(key)
  } })
  const created = await f.service.create('owner', input())
  const image = await photo()
  const supplement = supplementService.addUserMessage('owner', created.id, { text: '正在保存补充', attachments: [image] })
  // Attach rejection handling immediately: the old implementation returns 404
  // after deletion yet leaves the just-written metadata and image behind.
  const supplementResult = supplement.then(value => ({ value }), error => ({ error }))
  await written
  const deletion = f.service.deleteForAccount('owner', created.id)
  await Promise.race([deletion, new Promise(resolve => setTimeout(resolve, 40))])
  release()
  await Promise.all([supplementResult, deletion])
  const persisted = await raw(f.directory)
  for (const collection of ['feedback', 'attachments', 'messages', 'statusHistory']) assert.equal(persisted[collection].length, 0, collection)
  assert.equal((await files(f.directory)).length, 0)
  await assert.rejects(f.service.getForAccount('owner', created.id), { status: 404 })
})

test('supplement metadata failure keeps the existing feedback and cleans only newly written files', async t => {
  const f = await fixture(t), image = await photo()
  const created = await f.service.create('owner', input({ attachments: [image] }))
  const store = new JsonStore(path.join(f.directory, 'feedback', 'records.json'), empty())
  const failing = new FeedbackService({ dataDirectory: f.directory, store: {
    read: () => store.read(), update: async () => { throw new Error('SYNTHETIC_METADATA_FAILURE') }
  } })
  await assert.rejects(failing.addUserMessage('owner', created.id, { text: '失败补充', attachments: [image] }), /SYNTHETIC_METADATA_FAILURE/)
  const persisted = await raw(f.directory)
  assert.equal(persisted.feedback.length, 1)
  assert.equal(persisted.attachments.length, 1)
  assert.equal(persisted.messages.length, 0)
  assert.equal((await files(f.directory)).length, 1)
  assert.equal((await f.service.getForAccount('owner', created.id)).description, '合成反馈原文')
})

test('already-deleted and foreign feedback reject supplements before writing files', async t => {
  const f = await fixture(t), image = await photo(), created = await f.service.create('owner', input())
  await assert.rejects(f.service.addUserMessage('other-owner', created.id, { text: '越权', attachments: [image] }), { status: 404 })
  await f.service.deleteForAccount('owner', created.id)
  await assert.rejects(f.service.addUserMessage('owner', created.id, { text: '迟到', attachments: [image] }), { status: 404 })
  assert.equal((await files(f.directory)).length, 0)
  assert.equal((await raw(f.directory)).messages.length, 0)
})

test('distinct overlong request keys fail explicitly instead of replaying a truncated identity', async t => {
  const f = await fixture(t), prefix = 'k'.repeat(80)
  const existing = await f.service.create('owner', input({ idempotencyKey: prefix }))
  for (const key of [prefix + 'a', prefix + 'b']) {
    await assert.rejects(f.service.create('owner', input({ idempotencyKey: key, description: '独立新反馈' })), { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' })
  }
  const list = await f.service.listForAccount('owner')
  assert.equal(list.length, 1)
  assert.equal(list[0].id, existing.id)
  assert.equal(list[0].description, '合成反馈原文')
})

test('80-character keys and canonical same-key retries retain their original contract', async t => {
  const f = await fixture(t), prefix = 'k'.repeat(79)
  const first = await f.service.create('owner', input({ idempotencyKey: prefix + 'a' }))
  const second = await f.service.create('owner', input({ idempotencyKey: prefix + 'b', description: '另一份反馈' }))
  assert.notEqual(first.id, second.id)
  const replay = await f.service.create('owner', input({ idempotencyKey: '  ' + prefix + 'a  ', description: '按既有契约忽略的不同重试正文' }))
  assert.equal(replay.id, first.id)
  assert.equal(replay.duplicate, true)
  assert.equal((await f.service.getForAccount('owner', first.id)).description, '合成反馈原文')
  assert.equal((await f.service.listForAccount('owner')).length, 2)
})
