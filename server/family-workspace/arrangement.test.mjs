import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyWorkspaceService } from './service.mjs'

const plan = overrides => ({ id: randomUUID(), module: 'schedule', page: 'travel', title: '家庭出游', month: '2026-10', startDate: '', endDate: '', status: 'pending', owner: 'Ray', note: '', ...overrides })
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'family-month-calendar-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const options = { dataDirectory: directory, tokenSecret: 'isolated-arrangement-test', auth: { opsOwnerEmail: () => 'ray@example.test' } }
  const workspace = new FamilyWorkspaceService(options)
  const admin = await workspace.createSession({ role: 'admin', name: 'Ray', email: 'ray@example.test' }, true)
  const code = await workspace.createCode(admin.raw, '家人')
  const member = await workspace.memberLogin(code.loginCode, true, 'member')
  return { workspace, admin, member, options, code }
}
test('arrangements persist without a date; members read but cannot write; revoked sessions cannot read', async t => {
  const f = await fixture(t)
  await assert.rejects(f.workspace.arrangements.read(''), { status: 401 })
  assert.deepEqual((await f.workspace.arrangements.read(f.admin.raw)).plans, [])
  const row = plan()
  await assert.rejects(f.workspace.arrangements.save(f.member.raw, { action: 'save', revision: 0, plan: row }), { status: 403 })
  const result = await f.workspace.arrangements.save(f.admin.raw, { action: 'save', revision: 0, plan: row })
  assert.equal(result.revision, 1)
  const restarted = new FamilyWorkspaceService(f.options)
  assert.deepEqual((await restarted.arrangements.read(f.member.raw)).plans, [row])
  await f.workspace.revokeCode(f.admin.raw, f.code.id)
  await assert.rejects(restarted.arrangements.read(f.member.raw), { status: 401 })
})
test('arrangement edits and deletion preserve other records; concurrent stale changes cannot overwrite', async t => {
  const f = await fixture(t), row = plan(), other = plan({ title: '月底检查' })
  await f.workspace.arrangements.save(f.admin.raw, { action: 'save', revision: 0, plan: row })
  await f.workspace.arrangements.save(f.admin.raw, { action: 'save', revision: 1, plan: other })
  const attempts = await Promise.allSettled(['done', 'pending'].map(status => f.workspace.arrangements.save(f.admin.raw, { action: 'save', revision: 2, plan: { ...row, status } })))
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(attempts.find(item => item.status === 'rejected').reason.status, 409)
  assert.deepEqual((await f.workspace.arrangements.read(f.admin.raw)).plans.find(item => item.id === other.id), other)
  await assert.rejects(f.workspace.arrangements.save(f.admin.raw, { action: 'delete', revision: 2, id: row.id }), { status: 409 })
  const removed = await f.workspace.arrangements.save(f.admin.raw, { action: 'delete', revision: 3, id: row.id })
  assert.deepEqual(removed.plans, [other])
})
test('invalid dates, date order, missing titles and unauthorized locations do not change stored data', async t => {
  const f = await fixture(t)
  const invalid = [{ startDate: '2026-02-30', month: '2026-02' }, { startDate: '2026-10-22', endDate: '2026-10-21' }, { startDate: '2026-11-01' }, { endDate: '2026-10-22' }, { title: ' ' }, { month: '2026-13' }, { module: 'access' }, { page: '../../access' }, { status: 'unknown' }, { note: 'a'.repeat(2001) }]
  for (const changes of invalid) await assert.rejects(f.workspace.arrangements.save(f.admin.raw, { action: 'save', revision: 0, plan: plan(changes) }), { status: 400 })
  assert.equal((await f.workspace.arrangements.read(f.admin.raw)).revision, 0)
  const row = plan({ startDate: '2026-10-30', endDate: '2026-11-02' })
  assert.equal((await f.workspace.arrangements.save(f.admin.raw, { action: 'save', revision: 0, plan: row })).plans[0].endDate, '2026-11-02')
})
