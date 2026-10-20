import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AuthService } from '../auth/auth-service.mjs'
import { FamilyWorkspaceService } from './service.mjs'
import { FAMILY_ACCESS_TTL_MS } from '../../shared/family-workspace.mjs'

async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-family-test-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const sent = []
  let now = Date.UTC(2026, 9, 20, 12)
  const options = { dataDirectory, tokenSecret: 'test-only-family-secret', opsOwnerEmail: 'ray@example.test', codeGenerator: () => '123456', emailProvider: { sendVerificationCode: async payload => sent.push(payload) }, logger: () => {} }
  const auth = new AuthService(options)
  const service = new FamilyWorkspaceService({ ...options, auth, now: () => now })
  const admin = async (remember = true) => { await service.sendAdminCode('ray@example.test', 'admin'); return service.adminLogin('ray@example.test', '123456', remember, 'admin') }
  return { service, auth, options, sent, admin, advance: delta => { now += delta }, now: () => now }
}

test('only the configured Ray email receives the family-admin OTP and can sign in', async t => {
  const f = await fixture(t)
  assert.equal((await f.service.sendAdminCode('other@example.test', 'stranger')).success, true)
  assert.equal(f.sent.length, 0)
  await assert.rejects(f.service.adminLogin('other@example.test', '123456', true, 'stranger'), { status: 403 })
  await f.service.sendAdminCode(' RAY@example.test ', 'admin')
  assert.equal(f.sent.length, 1)
  const result = await f.service.adminLogin('ray@example.test', '123456', true, 'admin')
  assert.equal(result.session.role, 'admin')
  assert.equal(result.session.expiresAt, f.now() + FAMILY_ACCESS_TTL_MS)
  assert.equal((await f.service.current(result.raw)).name, 'Ray')
})

test('ordinary Hoooho or Operations email codes cannot authenticate family administration', async t => {
  const f = await fixture(t)
  await f.auth.sendEmailCode('ray@example.test', f.now())
  await assert.rejects(f.service.adminLogin('ray@example.test', '123456', false, 'admin'), { code: 'CODE_NOT_FOUND' })
  const owner = await f.admin()
  const attempts = await Promise.allSettled([
    f.service.adminLogin('ray@example.test', '123456', true, 'a'),
    f.service.adminLogin('ray@example.test', '123456', true, 'b')
  ])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 0)
  assert.ok(await f.service.current(owner.raw))
})

test('a family email OTP can be consumed only once under concurrent requests', async t => {
  const f = await fixture(t)
  await f.service.sendAdminCode('ray@example.test', 'admin')
  const attempts = await Promise.allSettled([1, 2].map(i => f.service.adminLogin('ray@example.test', '123456', true, `client-${i}`)))
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
})

test('incorrect admin OTP attempts remain persisted and invalidate the email code', async t => {
  const f = await fixture(t)
  await f.service.sendAdminCode('ray@example.test', 'admin')
  for (let i = 0; i < 4; i++) await assert.rejects(f.service.adminLogin('ray@example.test', '000000', true, `client-${i}`), { code: 'CODE_INCORRECT' })
  await assert.rejects(f.service.adminLogin('ray@example.test', '000000', true, 'client-5'), { code: 'CODE_ATTEMPTS_EXCEEDED' })
  await assert.rejects(f.service.adminLogin('ray@example.test', '123456', true, 'client-6'), { code: 'CODE_NOT_FOUND' })
})

test('generated login code has fixed 30-day expiry and grants only member access', async t => {
  const f = await fixture(t), owner = await f.admin()
  const code = await f.service.createCode(owner.raw, ' 妈妈 ')
  assert.match(code.loginCode, /^RAY-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/)
  assert.equal(code.label, '妈妈')
  assert.equal(code.expiresAt - code.createdAt, FAMILY_ACCESS_TTL_MS)
  const member = await f.service.memberLogin(code.loginCode.toLowerCase(), true, 'phone')
  assert.equal(member.session.role, 'member')
  await assert.rejects(f.service.listCodes(member.raw), { status: 403 })
  await assert.rejects(f.service.createCode(member.raw, '爸爸'), { status: 403 })
  await assert.rejects(f.service.revokeCode(member.raw, code.id), { status: 403 })
  const listing = await f.service.listCodes(owner.raw)
  assert.equal(listing.codes[0].status, 'active')
  assert.equal(listing.codes[0].lastUsedAt, f.now())
  assert.equal(JSON.stringify(listing).includes(code.loginCode), false)
})

test('30 days means expiry from generation; relogin cannot extend access', async t => {
  const f = await fixture(t), owner = await f.admin()
  const code = await f.service.createCode(owner.raw, '爸爸')
  f.advance(29 * 24 * 60 * 60 * 1000)
  const member = await f.service.memberLogin(code.loginCode, true, 'phone')
  assert.equal(member.session.expiresAt, code.expiresAt)
  f.advance(24 * 60 * 60 * 1000)
  assert.equal(await f.service.current(member.raw), null)
  await assert.rejects(f.service.memberLogin(code.loginCode, true, 'phone'), { code: 'FAMILY_CODE_INVALID' })
})

test('revocation invalidates every existing device session and survives restart', async t => {
  const f = await fixture(t), owner = await f.admin()
  const code = await f.service.createCode(owner.raw, '家人')
  const a = await f.service.memberLogin(code.loginCode, true, 'a')
  const b = await f.service.memberLogin(code.loginCode, true, 'b')
  await f.service.revokeCode(owner.raw, code.id)
  const restarted = new FamilyWorkspaceService({ ...f.options, auth: f.auth, now: f.now })
  assert.equal(await restarted.current(a.raw), null)
  assert.equal(await restarted.current(b.raw), null)
  await assert.rejects(restarted.memberLogin(code.loginCode, true, 'c'), { status: 401 })
  assert.equal((await restarted.listCodes(owner.raw)).codes[0].status, 'revoked')
})

test('nonremembered sessions are capped at 8 hours; logout revokes remembered session', async t => {
  const f = await fixture(t), owner = await f.admin(false)
  assert.equal(owner.session.expiresAt - f.now(), 8 * 60 * 60 * 1000)
  const code = await f.service.createCode(owner.raw, '家人')
  const member = await f.service.memberLogin(code.loginCode, true, 'phone')
  await f.service.logout(member.raw)
  assert.equal(await f.service.current(member.raw), null)
  assert.ok(await f.service.current(owner.raw))
  f.advance(8 * 60 * 60 * 1000)
  assert.equal(await f.service.current(owner.raw), null)
})

test('credentials never appear in persistent storage, and anonymous callers cannot manage codes', async t => {
  const f = await fixture(t), owner = await f.admin()
  const code = await f.service.createCode(owner.raw, '家人')
  const stored = JSON.stringify(await f.service.store.read())
  assert.equal(stored.includes(code.loginCode), false)
  assert.equal(stored.includes(code.loginCode.replace(/^RAY-/, '').replaceAll('-', '')), false)
  assert.equal(stored.includes(owner.raw), false)
  await assert.rejects(f.service.listCodes(''), { status: 401 })
  await assert.rejects(f.service.createCode('', '家人'), { status: 401 })
  assert.equal(await f.service.current('forged-token'), null)
  await assert.rejects(f.service.createCode(owner.raw, ' '), { status: 400 })
  await assert.rejects(f.service.createCode(owner.raw, 'a'.repeat(31)), { status: 400 })
})

test('failed code attempts are throttled durably and recover after the window', async t => {
  const f = await fixture(t)
  for (let i = 0; i < 15; i++) await assert.rejects(f.service.memberLogin('wrong-code', false, 'abuser'), { status: 401 })
  const restarted = new FamilyWorkspaceService({ ...f.options, auth: f.auth, now: f.now })
  await assert.rejects(restarted.memberLogin('wrong-code', false, 'abuser'), { status: 429 })
  f.advance(15 * 60 * 1000)
  await assert.rejects(restarted.memberLogin('wrong-code', false, 'abuser'), { status: 401 })
})

test('missing administrator configuration fails closed', async t => {
  const f = await fixture(t)
  f.auth.config.opsOwnerEmail = ''
  await assert.rejects(f.service.sendAdminCode('ray@example.test', 'admin'), { status: 503 })
  await assert.rejects(f.service.adminLogin('ray@example.test', '123456', true, 'admin'), { status: 503 })
})
