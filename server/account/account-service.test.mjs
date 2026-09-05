import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AuthError, AuthService } from '../auth/auth-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { AccountService } from './account-service.mjs'

async function setup() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-account-'))
  const auth = new AuthService({ dataDirectory, tokenSecret: 'account-test-secret', codeGenerator: () => '123456', logger: () => undefined, emailProvider: { sendVerificationCode: async () => undefined }, smsProvider: { sendVerificationCode: async () => undefined } })
  const account = new AccountService({ dataDirectory, tokenSecret: 'account-test-secret', auth, users: auth.users, data: auth.accountData })
  return { account, auth, dataDirectory, cleanup: () => rm(dataDirectory, { recursive: true, force: true }) }
}

test('stable guest identity merges server records once', async () => {
  const context = await setup()
  try {
    const guestId = '12345678-1234-4234-8234-123456789012'
    const user = await context.auth.users.createGuest(`guest:${guestId}`, new Date(1_000))
    const first = { user, token: context.auth.tokens.create(user, 1_000) }
    const refreshed = { user, token: context.auth.tokens.create(user, 2_000) }
    assert.equal(first.user.id, refreshed.user.id)
    assert.equal(context.auth.tokens.verify(refreshed.token, 2_001).guest, true)
    const members = new FamilyMemberRepository(context.dataDirectory)
    await members.create({ accountId: first.user.id, name: '孩子', relationship: 'child' })
    await context.auth.sendEmailCode('parent@example.com', 3_000)
    const login = await context.auth.loginWithEmail('parent@example.com', '123456', 4_000)
    assert.equal((await context.auth.mergeGuestSession(login, refreshed.token, 4_000)).guestMerge.merged, true)
    assert.equal((await members.findByAccountId(login.user.id)).length, 1)
    assert.deepEqual((await context.auth.mergeGuestSession(login, refreshed.token, 5_000)).guestMerge, { merged: false, idempotent: true })
    assert.equal((await members.findByAccountId(login.user.id)).length, 1)
  } finally { await context.cleanup() }
})

test('profile validates nickname and retains login identity', async () => {
  const context = await setup()
  try {
    const user = await context.auth.users.findOrCreateByEmail('profile@example.com')
    await assert.rejects(context.account.updateProfile(user.id, { nickname: 'has space' }), (error) => error instanceof AuthError && error.code === 'INVALID_NICKNAME')
    const updated = await context.account.updateProfile(user.id, { nickname: '刘磊', avatar: null })
    assert.equal(updated.nickname, '刘磊')
    assert.equal(updated.email, 'profile@example.com')
    assert.equal(updated.membership, 'free')
  } finally { await context.cleanup() }
})

test('phone replacement requires old proof and verifies the new phone', async () => {
  const context = await setup()
  try {
    const user = await context.auth.users.findOrCreateByPhone('13812345678')
    await context.auth.sendCode('13912345678', 1_000)
    await assert.rejects(context.account.bind(user.id, 'phone', '13912345678', '123456', '', 2_000), (error) => error instanceof AuthError && error.code === 'CURRENT_PHONE_REQUIRED')
    await context.auth.sendCode('13812345678', 3_000)
    const proof = await context.account.verifyCurrent(user.id, 'phone', '123456', 4_000)
    assert.equal((await context.account.bind(user.id, 'phone', '13912345678', '123456', proof.changeToken, 5_000)).phone, '13912345678')
  } finally { await context.cleanup() }
})

test('unconfigured providers never fake binding success', async () => {
  const context = await setup()
  try {
    const user = await context.auth.users.findOrCreateByEmail('provider@example.com')
    assert.deepEqual((await context.account.get(user.id)).providers.map((item) => [item.provider, item.bound]), [['wechat', false], ['qq', false], ['apple', false]])
    await assert.rejects(context.account.providerAction(user.id, 'wechat', 'bind'), (error) => error instanceof AuthError && error.code === 'OAUTH_NOT_CONFIGURED')
  } finally { await context.cleanup() }
})

test('verified deletion preserves unrelated guest data and is repeat-safe', async () => {
  const context = await setup()
  try {
    const user = await context.auth.users.findOrCreateByEmail('delete@example.com')
    const guest = { user: await context.auth.users.createGuest() }
    const members = new FamilyMemberRepository(context.dataDirectory)
    await members.create({ accountId: user.id, name: '账户孩子', relationship: 'child' })
    await members.create({ accountId: guest.user.id, name: '本机访客', relationship: 'child' })
    const storageKey = 'delete-account-photo.jpg'
    const filesDirectory = path.join(context.dataDirectory, 'quick-record-photo-files')
    await mkdir(filesDirectory, { recursive: true })
    await writeFile(path.join(filesDirectory, storageKey), 'private-photo')
    await new JsonStore(path.join(context.dataDirectory, 'quick-record-photo-drafts.json'), { photos: [] }).update((data) => ({
      ...data, photos: [...data.photos, { id: 'photo-1', accountId: user.id, storageKey }]
    }))
    await new JsonStore(path.join(context.dataDirectory, 'event-attachments.json'), { attachments: [] }).update((data) => ({
      ...data, attachments: [...data.attachments, { id: 'attachment-1', accountId: user.id, storageKey }]
    }))
    await context.auth.sendEmailCode('delete@example.com', 1_000)
    await assert.rejects(context.account.delete(user.id, { deleteToken: '' }, 2_000), (error) => error instanceof AuthError && error.code === 'DELETE_VERIFICATION_REQUIRED')
    const proof = await context.account.verifyDeletion(user.id, 'email', '123456', 2_000)
    assert.deepEqual(await context.account.delete(user.id, proof, 2_001), { deleted: true, idempotent: false })
    assert.equal((await members.findByAccountId(user.id)).length, 0)
    assert.equal((await members.findByAccountId(guest.user.id)).length, 1)
    await assert.rejects(access(path.join(filesDirectory, storageKey)))
    assert.deepEqual(await context.account.delete(user.id, { deleteToken: '' }, 3_000), { deleted: true, idempotent: true })
  } finally { await context.cleanup() }
})
