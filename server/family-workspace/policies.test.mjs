import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyWorkspaceService } from './service.mjs'
import { defaultPolicies, policyModuleIds } from '../../shared/family-policies.mjs'

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'family-policies-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const options = { dataDirectory: directory, tokenSecret: 'isolated-policy-test', auth: { opsOwnerEmail: () => 'ray@example.test' }, now: () => Date.UTC(2026, 9, 20) }
  const workspace = new FamilyWorkspaceService(options)
  const admin = await workspace.createSession({ role: 'admin', name: 'Ray', email: 'ray@example.test' }, true)
  const code = await workspace.createCode(admin.raw, '家人')
  const member = await workspace.memberLogin(code.loginCode, true, 'policy-member')
  return { workspace, admin, member, code, options }
}

test('all nine policy drafts are protected, independent and persist across service restart', async t => {
  const f = await fixture(t)
  await assert.rejects(f.workspace.policies.read('', 'finances'), { status: 401 })
  assert.equal(policyModuleIds.length, 9)
  for (const moduleId of policyModuleIds) {
    const record = await f.workspace.policies.read(f.member.raw, moduleId)
    assert.equal(record.revision, 0)
    assert.equal(record.document.status, 'draft')
    assert.ok(record.document.sections.length >= 4)
    assert.ok(record.document.responsibilities.length >= 4)
  }
  const initial = await f.workspace.policies.read(f.admin.raw, 'education')
  initial.document.sections[0].items[0] = '每晚一起阅读，结合孩子的实际状态调整。'
  initial.document.responsibilities[0].owner = '爸爸'
  await assert.rejects(f.workspace.policies.save(f.member.raw, 'education', initial), { status: 403 })
  const saved = await f.workspace.policies.save(f.admin.raw, 'education', initial)
  assert.equal(saved.revision, 1)
  assert.equal(saved.document.status, 'draft')
  assert.equal((await f.workspace.policies.read(f.admin.raw, 'finances')).revision, 0)
  assert.notEqual(defaultPolicies.education.sections[0].items[0], initial.document.sections[0].items[0])
  const restarted = new FamilyWorkspaceService(f.options)
  assert.deepEqual(await restarted.policies.read(f.member.raw, 'education'), saved)
  await f.workspace.revokeCode(f.admin.raw, f.code.id)
  await assert.rejects(restarted.policies.read(f.member.raw, 'education'), { status: 401 })
})

test('concurrent policy edits reject stale writers without losing saved data or changing another category', async t => {
  const f = await fixture(t)
  const first = await f.workspace.policies.read(f.admin.raw, 'finances')
  first.document.flow.execute = '付款后记录凭证，并由经办人核对。'
  const [a, b] = await Promise.allSettled([f.workspace.policies.save(f.admin.raw, 'finances', first), f.workspace.policies.save(f.admin.raw, 'finances', first)])
  assert.equal([a, b].filter(result => result.status === 'fulfilled').length, 1)
  assert.equal([a, b].find(result => result.status === 'rejected').reason.status, 409)
  assert.equal((await f.workspace.policies.read(f.member.raw, 'finances')).document.flow.execute, first.document.flow.execute)
  const other = await f.workspace.policies.read(f.admin.raw, 'assets')
  assert.equal((await f.workspace.policies.save(f.admin.raw, 'assets', other)).revision, 1)
})

test('invalid category, state, frequency, missing fields and oversized content do not overwrite policies', async t => {
  const f = await fixture(t)
  for (const id of ['__proto__', 'constructor', 'unknown']) await assert.rejects(f.workspace.policies.read(f.admin.raw, id), { status: 400 })
  const record = await f.workspace.policies.read(f.admin.raw, 'home')
  for (const mutate of [r => { r.revision = -1 }, r => { r.document.status = '__proto__' }, r => { r.document.title = '' }, r => { r.document.sections = [] }, r => { r.document.flow.check = 'x'.repeat(161) }, r => { r.document.responsibilities[0].frequency = 'invalid' }, r => { r.document.sections[0].items = [''] }]) {
    const invalid = structuredClone(record); mutate(invalid)
    await assert.rejects(f.workspace.policies.save(f.admin.raw, 'home', invalid), { status: 400 })
  }
  assert.equal((await f.workspace.policies.read(f.admin.raw, 'home')).revision, 0)
})
