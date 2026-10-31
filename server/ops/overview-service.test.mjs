import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OpsOverviewService } from './overview-service.mjs'
import { OpsService } from './ops-service.mjs'

async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ops-overview-'))
  const state = { sources: [{ id: 'railway', name: 'Railway', status: 'unconfigured' }], feedback: [
    { id: 'first', summary: '真实反馈样例', description: '合成内容', createdAt: '2026-10-20T08:00:00.000Z', supplementCount: 0 }
  ] }
  const create = () => new OpsOverviewService({ dataDirectory: directory, billing: { list: async () => ({ sources: state.sources }) }, feedback: { listForOps: async () => ({ feedback: state.feedback }) } })
  try { await run({ state, create, directory }) } finally { await rm(directory, { recursive: true, force: true }) }
}
test('only actual updates enter the inbox; old unread entries do not expire at midnight', async () => fixture(async ({ state, create }) => {
  state.sources.push({ id: 'family-bill', projectId: 'family', name: '家庭费用', status: 'success', lastSuccessAt: '2026-10-29T08:00:00.000Z', latestSnapshot: { id: 's1' } })
  const data = await create().list()
  assert.equal(data.unreadCount, 2)
  assert.equal(data.events.find(event => event.projectId === 'family').target.includes('project=family'), true)
  assert.equal(data.events.some(event => event.id.includes('railway')), false)
  assert.equal(data.events.every(event => event.viewedAt === null), true)
  assert.match(data.events.find(event => event.kind === 'feedback').target, /feedback=first/)
}))
test('preview/list never confirms viewing; explicit receipt persists and is idempotent', async () => fixture(async ({ create }) => {
  const service = create()
  const event = (await service.list()).events[0]
  assert.equal((await create().list()).unreadCount, 1)
  const first = await service.viewed(event.id, new Date('2026-11-01T03:00:00Z'))
  const repeated = await create().viewed(event.id, new Date('2026-11-02T03:00:00Z'))
  assert.deepEqual(repeated, first)
  assert.equal((await create().list()).unreadCount, 0)
  await assert.rejects(service.viewed('../../not-an-event'), { code: 'OPS_EVENT_NOT_FOUND' })
  assert.equal((await service.list()).unreadCount, 0)
}))
test('a delayed acknowledgement cannot clear a newer user supplement', async () => fixture(async ({ state, create }) => {
  const service = create()
  const initial = (await service.list()).events[0]
  await service.viewed(initial.id)
  state.feedback[0].supplementCount = 1
  state.feedback[0].lastUserSupplementAt = '2026-11-01T05:00:00Z'
  const next = (await service.list()).events[0]
  assert.notEqual(next.id, initial.id)
  assert.equal(next.kind, 'feedback-reply')
  await assert.rejects(service.viewed(initial.id), { code: 'OPS_EVENT_NOT_FOUND' })
  assert.equal((await service.list()).unreadCount, 1)
}))
test('a new failed collection remains unread and retains the old successful snapshot', async () => fixture(async ({ state, create }) => {
  state.feedback = []
  state.sources[0] = { id: 'railway', name: 'Railway', status: 'success', lastSuccessAt: '2026-10-30T08:00:00Z', latestSnapshot: { id: 'kept' } }
  const service = create()
  await service.viewed((await service.list()).events[0].id)
  Object.assign(state.sources[0], { status: 'failed', lastAttemptAt: '2026-11-01T08:00:00Z', lastFailureReason: '采集失败' })
  const data = await service.list()
  assert.equal(data.unreadCount, 1)
  assert.equal(data.events[0].kind, 'billing-alert')
  assert.equal(state.sources[0].latestSnapshot.id, 'kept')
}))
test('legacy source ownership is retained; assignment and refresh are project scoped', async () => fixture(async ({ directory }) => {
  const calls = []
  const billing = new OpsService({ dataDirectory: directory, collectors: { api: async source => { calls.push(source.id); throw Object.assign(new Error('synthetic'), { code: 'AUTH_REQUIRED' }) } } })
  assert.equal((await billing.get('railway')).projectId, 'hoooho')
  const family = await billing.create({ name: '家庭费用', projectId: 'family', platformUrl: 'https://example.test/billing', method: 'api', frequency: 'daily' })
  await billing.refreshAll(new Date(), 'family')
  assert.deepEqual(calls, [family.id])
  assert.equal((await billing.get('railway')).lastAttemptAt, null)
  assert.equal((await billing.get(family.id)).status, 'relogin')
  await assert.rejects(billing.update(family.id, { projectId: 'unknown' }), { code: 'INVALID_OPS_PROJECT' })
  await billing.update(family.id, { projectId: 'qinggan' })
  assert.equal((await billing.get(family.id)).projectId, 'qinggan')
}))
