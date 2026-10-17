import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { AuthService } from './auth-service.mjs'

async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-password-integrity-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const auth = new AuthService({ dataDirectory, tokenSecret: 'synthetic-integrity-secret', logger() {}, codeGenerator: () => '123456', emailProvider: { async sendVerificationCode() {} } })
  return { auth, dataDirectory }
}
const original = '界'.repeat(24) + '甲123456'
const differentTail = '界'.repeat(24) + '乙654321'

test('new Unicode passwords compare every byte beyond the bcrypt boundary', async t => {
  const { auth, dataDirectory } = await fixture(t)
  const { user } = await auth.register('完整密码', original, randomUUID())
  assert.equal((await auth.loginWithPassword(user.nickname, original)).user.id, user.id)
  await assert.rejects(auth.loginWithPassword(user.nickname, differentTail), { code: 'INVALID_CREDENTIALS' })
  await assert.rejects(auth.loginWithPassword(user.nickname, '界'.repeat(24)), { code: 'INVALID_CREDENTIALS' })
  const stored = await readFile(path.join(dataDirectory, 'users.json'), 'utf8')
  assert.doesNotMatch(stored, new RegExp(original))
  assert.match(JSON.parse(stored).users[0].passwordHash, /^hoooho-sha256-bcrypt-v1:/)
})

test('legacy short bcrypt passwords remain usable without rewriting the old hash', async t => {
  const { auth } = await fixture(t)
  const { user } = await auth.register('历史短密码', 'new-password', randomUUID())
  const legacy = await bcrypt.hash('旧密码123456', 12)
  await auth.users.update(user.id, { passwordHash: legacy })
  assert.equal((await auth.loginWithPassword(user.nickname, '旧密码123456')).user.id, user.id)
  await assert.rejects(auth.loginWithPassword(user.nickname, '旧密码654321'), { code: 'INVALID_CREDENTIALS' })
  assert.equal((await auth.users.findById(user.id)).passwordHash, legacy)
})

test('legacy bcrypt cannot authenticate an ambiguous >=72-byte password or its exact prefix', async t => {
  const { auth } = await fixture(t)
  const { user } = await auth.register('历史长密码', 'new-password', randomUUID())
  await auth.users.update(user.id, { passwordHash: await bcrypt.hash(original, 12) })
  for (const password of [original, differentTail, '界'.repeat(24)]) {
    await assert.rejects(auth.loginWithPassword(user.nickname, password), { code: 'INVALID_CREDENTIALS' })
  }
  await assert.rejects(auth.setPassword(user.id, { currentPassword: differentTail, password: 'replacement' }), { code: 'INVALID_CURRENT_PASSWORD' })
})

test('registration and login reject raw non-string fields and malformed Unicode before coercion', async t => {
  const { auth } = await fixture(t)
  for (const value of [true, 123456, ['123456'], { a: 1 }, null, undefined]) {
    await assert.rejects(auth.register('字段校验', value, randomUUID()), { code: 'INVALID_PASSWORD' })
    await assert.rejects(auth.register(value, '123456', randomUUID()), { code: 'INVALID_NICKNAME' })
    await assert.rejects(auth.loginWithPassword('字段校验', value), { code: 'INVALID_CREDENTIALS' })
  }
  await assert.rejects(auth.register('字段校验', '12345\ud800', randomUUID()), { code: 'INVALID_PASSWORD' })
  assert.equal(await auth.users.findByNickname('字段校验'), null)
})

test('bound-email verification resets legacy passwords, preserves identity and revokes sessions', async t => {
  const { auth } = await fixture(t)
  const { user } = await auth.register('邮箱恢复', 'initial-password', randomUUID())
  await auth.users.update(user.id, { passwordHash: await bcrypt.hash(original, 12), email: 'recovery@example.test' })
  const session = await auth.sessions.create(user.id)
  await auth.sendEmailCode('recovery@example.test', 1000)
  await assert.rejects(auth.setPassword(user.id, { password: original, code: '000000', currentPassword: original }, 2000), { code: 'CODE_INCORRECT' })
  assert.equal((await auth.codes.find('email', 'recovery@example.test')).failedAttempts, 1)
  assert.deepEqual(await auth.setPassword(user.id, { password: original, code: '123456' }, 3000), { success: true })
  assert.equal(await auth.sessions.find(session.token), null)
  assert.equal(await auth.codes.find('email', 'recovery@example.test'), null)
  assert.equal((await auth.loginWithPassword(user.nickname, original)).user.id, user.id)
  await assert.rejects(auth.loginWithPassword(user.nickname, differentTail), { code: 'INVALID_CREDENTIALS' })
})

test('reset storage failures roll back the password, email code and session together', async t => {
  const { auth } = await fixture(t)
  const { user } = await auth.register('恢复回滚', 'initial-password', randomUUID())
  await auth.users.update(user.id, { email: 'rollback@example.test' })
  const before = (await auth.users.findById(user.id)).passwordHash
  const session = await auth.sessions.create(user.id)
  await auth.sendEmailCode('rollback@example.test', 1000)
  const revoke = auth.sessions.revokeAccount.bind(auth.sessions)
  auth.sessions.revokeAccount = async () => { throw new Error('injected storage failure') }
  await assert.rejects(auth.setPassword(user.id, { password: original, code: '123456' }, 2000), /injected storage failure/)
  assert.equal((await auth.users.findById(user.id)).passwordHash, before)
  assert.ok(await auth.codes.find('email', 'rollback@example.test'))
  assert.ok(await auth.sessions.find(session.token))
  auth.sessions.revokeAccount = revoke
  assert.deepEqual(await auth.setPassword(user.id, { password: original, code: '123456' }, 3000), { success: true })
})
