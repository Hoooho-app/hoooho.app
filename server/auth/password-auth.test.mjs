import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AuthService } from './auth-service.mjs'
import { BrowserSessionService } from './browser-session-service.mjs'

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-password-auth-'))
  const auth = new AuthService({ dataDirectory: directory, tokenSecret: 'test-only-secret', logger: () => undefined })
  const browser = new BrowserSessionService(auth)
  const headers = new Map()
  const response = { setHeader: (name, value) => headers.set(name, value) }
  const request = { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, socket: { encrypted: true, remoteAddress: '127.0.0.1' } }
  return { directory, auth, browser, headers, response, request }
}

test('nickname and password registration creates a formal account without exposing the internal ID', async () => {
  const f = await fixture()
  try {
    const result = await f.browser.register(f.request, f.response, { nickname: '小雨', password: 'simple7', idempotencyKey: '11111111-1111-4111-8111-111111111111' })
    assert.equal(result.user.guest, undefined)
    assert.equal(result.user.hooohoId, undefined)
    assert.match(f.headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax;.*Secure/)
    const stored = await readFile(path.join(f.directory, 'users.json'), 'utf8')
    assert.doesNotMatch(stored, /simple7/)
    assert.match(JSON.parse(stored).users[0].passwordHash, /^\$2[aby]\$12\$/)
    const replay = await f.browser.register({ ...f.request, headers: { ...f.request.headers, cookie: f.headers.get('Set-Cookie').split(';')[0] } }, f.response, { nickname: 'ignored', password: 'ignored7', idempotencyKey: '11111111-1111-4111-8111-111111111111' })
    assert.equal(replay.user.id, result.user.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('a valid historical guest session upgrades in place and keeps account-linked data', async () => {
  const f = await fixture()
  try {
    const guest = await f.auth.users.createGuest()
    const oldSession = await f.browser.issue(f.request, f.response, guest)
    f.request.headers.cookie = f.headers.get('Set-Cookie').split(';')[0]
    const member = await f.auth.members.create({ accountId: guest.id, name: '宝宝', relationship: 'child' })
    const result = await f.browser.register(f.request, f.response, { nickname: '妈妈', password: '123456', idempotencyKey: '22222222-2222-4222-8222-222222222222' })
    assert.equal(result.upgradedGuest, true)
    assert.equal(result.user.id, guest.id)
    assert.equal(result.user.guest, undefined)
    assert.equal((await f.auth.members.findById(member.id)).accountId, guest.id)
    assert.notEqual(result.token, oldSession.token)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('normalized nicknames are unique and idempotent registration does not duplicate accounts', async () => {
  const f = await fixture()
  try {
    const first = await f.auth.register('Ａlice', '123456', '66666666-6666-4666-8666-666666666666')
    assert.equal(first.user.nickname, 'Alice')
    const replay = await f.auth.register('ignored', 'abcdef', '66666666-6666-4666-8666-666666666666')
    assert.equal(replay.user.id, first.user.id)
    await assert.rejects(f.auth.register(' alice ', 'abcdef', '77777777-7777-4777-8777-777777777777'), { code: 'NICKNAME_IN_USE' })
    assert.equal((await f.auth.users.findByNickname('ALICE')).id, first.user.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('nickname rejects whitespace, invisible characters and punctuation', async () => {
  const f = await fixture()
  try {
    for (const nickname of [' ', '两 个', `隐\u200b形`, 'name!']) {
      await assert.rejects(f.auth.register(nickname, '123456', crypto.randomUUID()), { code: 'INVALID_NICKNAME' })
    }
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('nickname login normalizes Unicode and whitespace, uses generic errors, and rate limits failures', async () => {
  const f = await fixture()
  try {
    const registered = await f.auth.register('用户', 'correct-password', '33333333-3333-4333-8333-333333333333', null, 1_000)
    for (let i = 0; i < 5; i += 1) await assert.rejects(f.auth.loginWithPassword(' 用户 ', 'wrong-password', 'client', 2_000 + i), { code: 'INVALID_CREDENTIALS' })
    await assert.rejects(f.auth.loginWithPassword('用户', 'correct-password', 'client', 2_006), { code: 'PASSWORD_LOGIN_RATE_LIMITED' })
    const session = await f.auth.loginWithPassword('用户', 'correct-password', 'other-client', 2_007)
    assert.equal(session.user.id, registered.user.id)
    await assert.rejects(f.auth.loginWithPassword('不存在', 'correct-password', 'other-client', 2_008), (error) => error.message === '昵称或密码不正确')
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('remembered login uses a persistent cookie while session-only login stays non-persistent after restore', async () => {
  const f = await fixture()
  try {
    const registered = await f.auth.register('记住测试', 'correct-password', '88888888-8888-4888-8888-888888888888')
    await f.browser.completePasswordLogin(f.request, f.response, registered, true)
    assert.match(f.headers.get('Set-Cookie'), /Max-Age=/)
    assert.match(f.headers.get('Set-Cookie'), /Expires=/)

    await f.browser.completePasswordLogin(f.request, f.response, registered, false)
    const sessionCookie = f.headers.get('Set-Cookie')
    assert.doesNotMatch(sessionCookie, /Max-Age=|Expires=/)
    f.request.headers.cookie = sessionCookie.split(';')[0]
    await f.browser.restore({ ...f.request, method: 'GET' }, f.response)
    assert.doesNotMatch(f.headers.get('Set-Cookie'), /Max-Age=|Expires=/)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('registration is rate limited per client without exposing submitted credentials', async () => {
  const f = await fixture()
  try {
    for (let i = 0; i < 5; i += 1) await f.auth.assertRegistrationAllowed('same-client', 3_000 + i)
    await assert.rejects(f.auth.assertRegistrationAllowed('same-client', 3_006), { code: 'REGISTER_RATE_LIMITED' })
    await f.auth.assertRegistrationAllowed('other-client', 3_007)
    const stored = await readFile(path.join(f.directory, 'registration-attempts.json'), 'utf8')
    assert.doesNotMatch(stored, /same-client|other-client/)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('existing email accounts remain one account and require a nickname setup', async () => {
  const f = await fixture()
  try {
    const first = await f.auth.users.findOrCreateByEmail('same@example.com')
    const second = await f.auth.users.findOrCreateByEmail('same@example.com')
    assert.equal(first.id, second.id)
    assert.equal(first.id, second.id)
    const session = await f.browser.issue(f.request, f.response, first)
    assert.equal(session.user.requiresNicknameSetup, true)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('changing a password revokes old browser sessions and replaces the bcrypt hash', async () => {
  const f = await fixture()
  try {
    const registered = await f.auth.register('用户', 'old-password', '44444444-4444-4444-8444-444444444444')
    const browserSession = await f.auth.sessions.create(registered.user.id)
    await f.auth.setPassword(registered.user.id, { currentPassword: 'old-password', password: 'new-password' })
    assert.equal(await f.auth.sessions.find(browserSession.token), null)
    await assert.rejects(f.auth.loginWithPassword('用户', 'old-password', 'old-client'), { code: 'INVALID_CREDENTIALS' })
    assert.equal((await f.auth.loginWithPassword('用户', 'new-password', 'new-client')).user.id, registered.user.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('a failed guest upgrade rolls back the account mutation and keeps the original session valid', async () => {
  const f = await fixture()
  try {
    const guest = await f.auth.users.createGuest()
    await f.browser.issue(f.request, f.response, guest)
    f.request.headers.cookie = f.headers.get('Set-Cookie').split(';')[0]
    const originalIssue = f.browser.issue
    f.browser.issue = async () => { throw new Error('injected issue failure') }
    await assert.rejects(f.browser.register(f.request, f.response, { nickname: '妈妈', password: '123456', idempotencyKey: '55555555-5555-4555-8555-555555555555' }), /injected issue failure/)
    f.browser.issue = originalIssue
    assert.equal((await f.auth.users.findById(guest.id)).guest, true)
    assert.equal((await f.browser.current(f.request)).user.id, guest.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})
