import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { OpsService, getNextOpsRunAt, initialBillingSources } from './ops-service.mjs'

const pixel = { name: 'billing.png', type: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', privacyConfirmed: true }

test('initializes the focused billing source catalog without credentials', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const result = await new OpsService({ dataDirectory: directory }).list(new Date('2026-09-02T08:00:00+08:00'))
  assert.equal(result.sources.length, 9)
  assert.deepEqual(result.sources.map((item) => item.id), initialBillingSources.map((item) => item.id))
  assert.equal(result.summary.total, 9)
  assert.equal(result.inactiveSources.includes('Vector DB'), true)
  assert.equal(JSON.stringify(result).match(/password|cookie|apiKey|token|secret/gi), null)
})

test('stores a manual image privately and does not expose its storage key', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const service = new OpsService({ dataDirectory: directory })
  const updated = await service.addManualSnapshot('railway', pixel, new Date('2026-09-02T08:05:00+08:00'))
  assert.equal(updated.status, 'success')
  assert.equal(updated.latestSnapshot.method, 'manual-screenshot')
  assert.equal('storageKey' in updated.latestSnapshot, false)
  const image = await service.readSnapshot('railway', updated.latestSnapshot.id)
  assert.equal(image.type, 'image/png')
  assert.equal(image.buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const persisted = JSON.parse(await readFile(path.join(directory, 'ops', 'billing-sources.json'), 'utf8'))
  assert.equal(persisted.snapshots.length, 1)
  assert.equal(typeof persisted.snapshots[0].storageKey, 'string')
})

test('rejects a manual image before private storage when privacy is not confirmed', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const service = new OpsService({ dataDirectory: directory })
  await assert.rejects(() => service.addManualSnapshot('railway', { ...pixel, privacyConfirmed: false }), (error) => error.code === 'OPS_SNAPSHOT_PRIVACY_CONFIRMATION_REQUIRED')
  await assert.rejects(() => readdir(path.join(directory, 'ops', 'snapshots')), (error) => error.code === 'ENOENT')
  assert.equal((await service.history('railway')).snapshots.length, 0)
})

test('does not store duplicate successful images', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const service = new OpsService({ dataDirectory: directory })
  const first = await service.addManualSnapshot('railway', pixel, new Date('2026-09-02T08:00:00+08:00'))
  const second = await service.addManualSnapshot('railway', pixel, new Date('2026-09-02T09:00:00+08:00'))
  assert.equal(second.latestSnapshot.id, first.latestSnapshot.id)
  assert.equal((await service.history('railway')).snapshots.length, 1)
  assert.equal((await readdir(path.join(directory, 'ops', 'snapshots'))).length, 1)
})

test('failed collection preserves the last successful snapshot and records a safe failure', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const service = new OpsService({ dataDirectory: directory, collectors: { railway: async () => { throw Object.assign(new Error('sensitive provider error'), { code: 'AUTH_REQUIRED' }) } } })
  const success = await service.addManualSnapshot('railway', pixel, new Date('2026-09-01T08:05:00+08:00'))
  const failed = await service.refresh('railway', new Date('2026-09-02T08:05:00+08:00'))
  assert.equal(failed.status, 'relogin')
  assert.equal(failed.latestSnapshot.id, success.latestSnapshot.id)
  assert.equal(failed.lastFailureReason, '登录会话已失效，需要重新授权。')
  const history = await service.history('railway')
  assert.equal(history.snapshots[0].result, 'failed')
  assert.doesNotMatch(JSON.stringify(history), /sensitive provider error/)
})

test('refresh all runs configured collectors sequentially and skips manual sources', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const order = []
  const collector = async (item) => { order.push(item.id); return { ...pixel, method: item.method } }
  const service = new OpsService({ dataDirectory: directory, collectors: { 'automatic-screenshot': collector, api: collector } })
  await service.refreshAll(new Date('2026-09-02T08:00:00+08:00'))
  assert.deepEqual(order, ['railway', 'railway-volume', 'openai', 'resend', 'cloudflare', 'github'])
  const result = await service.list(new Date('2026-09-02T09:00:00+08:00'))
  assert.equal(result.summary.updatedToday, 6)
  assert.equal(result.sources.find((item) => item.id === 'openai').latestSnapshot.method, 'api')
})

test('scheduled refresh respects weekly cadence and pauses sources that need login', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const order = []
  const service = new OpsService({ dataDirectory: directory, collectors: {
    railway: async () => { throw Object.assign(new Error('expired'), { code: 'AUTH_REQUIRED' }) },
    'automatic-screenshot': async (item) => { order.push(item.id); return pixel }, api: async (item) => { order.push(item.id); return pixel }
  } })
  await service.refreshScheduled(new Date('2026-09-01T08:00:00+08:00'))
  await service.refreshScheduled(new Date('2026-09-02T08:00:00+08:00'))
  assert.equal(order.filter((id) => id === 'github').length, 1)
  assert.equal((await service.history('railway')).snapshots.length, 1)
})

test('coalesces concurrent refreshes for the same source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  let calls = 0
  const service = new OpsService({ dataDirectory: directory, collectors: { railway: async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return pixel } } })
  await Promise.all([service.refresh('railway'), service.refresh('railway')])
  assert.equal(calls, 1)
  assert.equal((await service.history('railway')).snapshots.length, 1)
})

test('keeps important snapshots beyond the 30 day retention window', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const service = new OpsService({ dataDirectory: directory })
  const saved = await service.addManualSnapshot('figma', pixel, new Date('2026-07-01T08:00:00Z'))
  await service.updateSnapshot('figma', saved.latestSnapshot.id, { important: true })
  const result = await service.list(new Date('2026-09-02T08:00:00Z'))
  assert.equal(result.sources.find((item) => item.id === 'figma').latestSnapshot.important, true)
})

test('keeps the latest successful snapshot beyond the 30 day retention window', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-'))
  const service = new OpsService({ dataDirectory: directory })
  const saved = await service.addManualSnapshot('railway', pixel, new Date('2026-07-01T08:00:00Z'))
  const result = await service.list(new Date('2026-09-02T08:00:00Z'))
  assert.equal(result.sources.find((item) => item.id === 'railway').latestSnapshot.id, saved.latestSnapshot.id)
  assert.equal((await readdir(path.join(directory, 'ops', 'snapshots'))).length, 1)
})

test('computes the next daily run in the configured timezone', () => {
  assert.equal(getNextOpsRunAt(new Date('2026-09-02T00:01:00Z'), { hour: 8, minute: 0, timeZone: 'Asia/Shanghai' }).toISOString(), '2026-09-03T00:00:00.000Z')
  assert.equal(getNextOpsRunAt(new Date('2026-09-01T23:59:00Z'), { hour: 8, minute: 0, timeZone: 'Asia/Shanghai' }).toISOString(), '2026-09-02T00:00:00.000Z')
})
