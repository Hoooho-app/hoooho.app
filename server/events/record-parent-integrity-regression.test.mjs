import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from './health-event-service.mjs'
import { HealthEventRecordService } from './health-event-record-service.mjs'
import { withStorageLock } from '../auth/storage/transaction.mjs'

const now = new Date('2026-10-17T14:00:00Z')
const note = { type: 'note', content: '独立追加的普通观察，不属于被撤回的服药记录', occurredAt: '2026-09-10T02:00:00Z' }
const gate = () => {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}
async function fixture(t, organizations = { invalidateAndRecompute: async () => undefined }) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-record-parent-integrity-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const member = await new FamilyMemberRepository(dataDirectory).create({ accountId: 'owner', name: '合成并发测试儿童', relationship: 'child' }, now)
  const events = new HealthEventService({ dataDirectory })
  const records = new HealthEventRecordService({ dataDirectory, organizations, changeAnnotations: { recompute: async () => undefined } })
  const event = await events.create('owner', { memberId: member.id, title: '服药确认所属事件', category: 'other', startTime: note.occurredAt }, now)
  return { events, records, event }
}

// The competing cleanup uses real persistent repositories and the shared storage
// barrier, matching the contract required by reminder undo/delete. The gate is
// after the actual parent read, so this deterministically covers the TOCTOU gap.
test('普通记录已读到父事件时，并发清理不能在其写入前删除父事件', { timeout: 5000 }, async t => {
  const f = await fixture(t), ownershipRead = gate(), allowCreate = gate()
  const findById = f.records.events.findById.bind(f.records.events)
  let first = true
  f.records.events.findById = async id => {
    const event = await findById(id)
    if (first && id === f.event.id) {
      first = false; ownershipRead.release()
      await allowCreate.promise
    }
    return event
  }
  const creating = f.records.create('owner', f.event.id, note, now)
  await ownershipRead.promise
  const cleanup = withStorageLock(async () => {
    const surviving = await f.records.repository.findByEventId(f.event.id)
    if (surviving.length) return { deleted: false }
    await f.events.repository.delete(f.event.id)
    return { deleted: true }
  })
  allowCreate.release()
  const [created, cleaned] = await Promise.all([creating, cleanup])
  assert.equal(cleaned.deleted, false)
  assert.equal((await f.events.repository.findById(f.event.id)).id, f.event.id)
  assert.equal((await f.records.getOwnedRecord('owner', created.id)).content, note.content)
  assert.equal((await f.records.list('owner', f.event.id)).length, 1)
})

test('父事件先在共享边界内被清理时，普通记录创建404且不留下孤儿记录', { timeout: 5000 }, async t => {
  const f = await fixture(t), cleanupReady = gate(), allowDelete = gate()
  const cleanup = withStorageLock(async () => {
    assert.deepEqual(await f.records.repository.findByEventId(f.event.id), [])
    cleanupReady.release()
    await allowDelete.promise
    await f.events.repository.delete(f.event.id)
  })
  await cleanupReady.promise
  const creating = assert.rejects(() => f.records.create('owner', f.event.id, note, now), { status: 404, code: 'HEALTH_EVENT_NOT_FOUND' })
  allowDelete.release()
  await Promise.all([cleanup, creating])
  assert.equal(await f.events.repository.findById(f.event.id), null)
  assert.deepEqual(await f.records.repository.findByAccountId('owner'), [])
})

test('普通记录组织尚未完成时仍释放新增存储锁，其他读取可继续', { timeout: 5000 }, async t => {
  const organizationReady = gate(), finishOrganization = gate()
  const f = await fixture(t, { invalidateAndRecompute: async () => { organizationReady.release(); await finishOrganization.promise } })
  const creating = f.records.create('owner', f.event.id, note, now)
  await organizationReady.promise
  let timeout
  try {
    const concurrentRead = withStorageLock(() => f.records.repository.findByEventId(f.event.id))
    const rows = await Promise.race([concurrentRead, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('organization kept the global storage lock')), 1000) })])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].content, note.content)
  } finally {
    clearTimeout(timeout)
    finishOrganization.release()
    await creating
  }
})
