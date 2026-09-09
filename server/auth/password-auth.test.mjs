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

test('nickname and password registration creates a formal account with a non-confusing Hoooho ID and bcrypt hash', async () => {
  const f = await fixture()
  try {
    const result = await f.browser.register(f.request, f.response, { nickname: '小雨', password: 'simple7', idempotencyKey: '11111111-1111-4111-8111-111111111111' })
    assert.equal(result.user.guest, undefined)
    assert.match(result.user.hooohoId, /^H[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/)
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
    assert.equal(result.user.guest, false)
    assert.equal((await f.auth.members.findById(member.id)).accountId, guest.id)
    assert.notEqual(result.token, oldSession.token)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('Hoooho ID login uses generic errors, rate limits repeated failures, and clears failures on success', async () => {
  const f = await fixture()
  try {
    const registered = await f.auth.register('用户', 'correct-password', '33333333-3333-4333-8333-333333333333', null, 1_000)
    for (let i = 0; i < 5; i += 1) await assert.rejects(f.auth.loginWithPassword(registered.user.hooohoId, 'wrong-password', 'client', 2_000 + i), { code: 'INVALID_CREDENTIALS' })
    await assert.rejects(f.auth.loginWithPassword(registered.user.hooohoId, 'correct-password', 'client', 2_006), { code: 'PASSWORD_LOGIN_RATE_LIMITED' })
    const session = await f.auth.loginWithPassword(registered.user.hooohoId, 'correct-password', 'other-client', 2_007)
    assert.equal(session.user.id, registered.user.id)
    await assert.rejects(f.auth.loginWithPassword('H2345678', 'correct-password', 'other-client', 2_008), (error) => error.message === 'Hoooho ID 或密码错误')
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('existing email accounts receive one stable Hoooho ID without duplication', async () => {
  const f = await fixture()
  try {
    const first = await f.auth.users.findOrCreateByEmail('same@example.com')
    const second = await f.auth.users.findOrCreateByEmail('same@example.com')
    assert.equal(first.id, second.id)
    assert.equal(first.hooohoId, second.hooohoId)
    assert.equal((await f.auth.users.findByHooohoId(first.hooohoId)).id, first.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('changing a password revokes old browser sessions and replaces the bcrypt hash', async () => {
  const f = await fixture()
  try {
    const registered = await f.auth.register('用户', 'old-password', '44444444-4444-4444-8444-444444444444')
    const browserSession = await f.auth.sessions.create(registered.user.id)
    await f.auth.setPassword(registered.user.id, { currentPassword: 'old-password', password: 'new-password' })
    assert.equal(await f.auth.sessions.find(browserSession.token), null)
    await assert.rejects(f.auth.loginWithPassword(registered.user.hooohoId, 'old-password', 'old-client'), { code: 'INVALID_CREDENTIALS' })
    assert.equal((await f.auth.loginWithPassword(registered.user.hooohoId, 'new-password', 'new-client')).user.id, registered.user.id)
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
