import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { UsageService, diskState } from './service.mjs'
import { UsageLedger } from './ledger.mjs'
import { meteredFetch, installUsageMeter } from './ai-meter.mjs'
import { withAIAccount } from '../ai/providers/call-control.mjs'
import { OpsOverviewService } from '../ops/overview-service.mjs'

async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-usage-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  return { dataDirectory, tokenSecret: 'synthetic-usage-test', installMeter: false }
}

test('individual usage isolates ownership and deduplicates attachment/draft binary references', async t => {
  const options = await fixture(t)
  await mkdir(path.join(options.dataDirectory, 'quick-record-photo-files'))
  await writeFile(path.join(options.dataDirectory, 'quick-record-photo-files', 'shared'), Buffer.alloc(4096))
  const attachment = { id: 'a', accountId: 'owner-a', storageKey: 'shared', content: 'synthetic private A' }
  const other = { id: 'b', accountId: 'owner-b', content: 'synthetic private B' }
  await writeFile(path.join(options.dataDirectory, 'event-attachments.json'), JSON.stringify({ attachments: [attachment, other] }))
  await writeFile(path.join(options.dataDirectory, 'quick-record-photo-drafts.json'), JSON.stringify({ photos: [attachment] }))
  const service = new UsageService(options); t.after(() => service.ledger.close())
  const a = await service.account('owner-a'), b = await service.account('owner-b'), empty = await service.account('owner-c')
  assert.equal(a.storage.fileBytes, 4096)
  assert.equal(a.storage.recordBytes, 2 * Buffer.byteLength(JSON.stringify(attachment)))
  assert.equal(b.storage.recordBytes, Buffer.byteLength(JSON.stringify(other)))
  assert.equal(b.storage.fileBytes, 0)
  assert.equal(empty.storage.bytes, 0)
  assert.equal(a.subscription.storageLimitBytes, null)
  assert.doesNotMatch(JSON.stringify(a), /owner-[ab]|synthetic private|storageKey|dataDirectory/)
})

test('corrupt/missing referenced data stays partial rather than claiming a complete zero', async t => {
  const options = await fixture(t)
  await writeFile(path.join(options.dataDirectory, 'front-desk-records.json'), '{broken')
  await writeFile(path.join(options.dataDirectory, 'event-attachments.json'), JSON.stringify({ attachments: [{ accountId: 'a', storageKey: 'missing' }] }))
  const service = new UsageService(options); t.after(() => service.ledger.close())
  assert.equal((await service.account('a')).storage.state, 'partial')
})

test('real disk thresholds, bounded transition alerts and correct Overview receipt semantics', async t => {
  const options = await fixture(t); let time = Date.parse('2026-11-04T00:00:00Z'), used = 710
  const service = new UsageService({ ...options, now: () => new Date(time), statfs: async () => ({ blocks: 1000, bfree: 1000 - used, bavail: 1000 - used, bsize: 1024 ** 2 }) })
  t.after(() => service.ledger.close())
  const first = await service.overview()
  assert.equal(first.state, 'notice')
  assert.equal(first.growthBytesPerDay, null)
  const event = (await service.events())[0]
  assert.equal((await service.events())[0].id, event.id)
  const overview = new OpsOverviewService({ billing: { list: async () => ({ sources: [] }) }, feedback: { listForOps: async () => ({ feedback: [] }) }, resources: service, dataDirectory: options.dataDirectory })
  assert.equal((await overview.list()).unreadCount, 1)
  await service.overview() // Reading/preview does not mark viewed.
  assert.equal((await overview.list()).unreadCount, 1)
  await overview.viewed(event.id)
  assert.equal((await overview.list()).unreadCount, 0)
  time += 3600001; used = 900
  const second = await service.overview()
  assert.equal(second.state, 'warning')
  assert.ok(second.growthBytesPerDay > 0)
  assert.ok(second.remainingDays > 0)
  assert.equal((await overview.list()).unreadCount, 1)
  assert.equal((await service.events()).length, 2)
  assert.equal(diskState({ totalBytes: 1000, usedBytes: 960, availableBytes: 40 }), 'critical')
})

test('filesystem read failure returns unknown, and failed history writes keep the live reading', async t => {
  const options = await fixture(t)
  const service = new UsageService({ ...options, statfs: async () => { throw new Error('synthetic I/O') } })
  t.after(() => service.ledger.close())
  assert.equal((await service.overview()).state, 'unknown')
  assert.equal((await service.overview()).disk, null)
  service.cache = null
  service.statfs = async () => ({ blocks: 1000, bfree: 800, bavail: 790, bsize: 1024 ** 2 })
  service.ledger.close()
  const live = await service.overview()
  assert.equal(live.disk.availableBytes, 790 * 1024 ** 2)
  assert.equal(live.historyAvailable, false)
  assert.equal(live.ai.state, 'unavailable')
})

test('actual provider receipts persist, missing usage remains unknown, failed calls count and monitoring never retries', async t => {
  const options = await fixture(t)
  let ledger = new UsageLedger(options); installUsageMeter(ledger)
  t.after(() => { installUsageMeter(null); ledger.close() })
  let calls = 0
  const transport = meteredFetch(async (_url, init) => { calls++; return Response.json(JSON.parse(init.body).fakeResult) }, 'synthetic-provider', 'default-model')
  await withAIAccount('a', async () => {
    const response = await transport('https://example.invalid', { body: JSON.stringify({ model: 'vision-test', fakeResult: { usage: { prompt_tokens: 17, completion_tokens: 9, seconds: 1.5 }, choices: [] } }) })
    await response.json() // Even unusable content still consumed these tokens.
    await (await transport('https://example.invalid', { body: JSON.stringify({ fakeResult: {} }) })).json()
    await assert.rejects(meteredFetch(async () => { calls++; throw new Error('offline') }, 'synthetic-provider', 'default-model')('https://example.invalid'))
  })
  assert.equal(calls, 3)
  let a = ledger.summary('a')
  assert.equal(a.calls, 3); assert.equal(a.unknown, 2); assert.equal(a.failed, 1)
  assert.equal(a.inputTokens, 17); assert.equal(a.outputTokens, 9); assert.equal(a.audioSeconds, 1.5)
  assert.equal(a.rows.find(row => row.model === 'vision-test').calls, 1)
  assert.equal(ledger.summary('b').calls, 0)
  ledger.close(); ledger = new UsageLedger(options); installUsageMeter(ledger)
  assert.equal(ledger.summary('a').inputTokens, 17)
  ledger.merge('a', 'b'); ledger.merge('a', 'b')
  assert.equal(ledger.summary('a').calls, 0)
  assert.equal(ledger.summary('b').calls, 3)
  ledger.remove('b'); assert.equal(ledger.summary('b').calls, 0)
  ledger.close()
  await (await transport('https://example.invalid', { body: JSON.stringify({ fakeResult: { usage: { input_tokens: 1, output_tokens: 2 } } }) })).json() // No monitor storage: original response still works.
})
