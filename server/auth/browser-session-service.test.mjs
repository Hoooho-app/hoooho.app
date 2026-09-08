import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AuthService } from './auth-service.mjs'
import { BrowserSessionService } from './browser-session-service.mjs'
import { accountCollections } from '../account/account-data-service.mjs'
import { withAccountLock } from './account-lock.mjs'

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-session-flow-'))
  const auth = new AuthService({ dataDirectory: directory, tokenSecret: 'test-only-secret', logger: () => undefined })
  const browser = new BrowserSessionService(auth)
  const headers = new Map()
  const response = { setHeader: (name, value) => headers.set(name, value) }
  const request = { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' } }
  return { directory, auth, browser, request, response, headers }
}

test('merge waits for an in-flight account write and includes that record', async () => {
  const f = await fixture()
  try {
    const guest = await f.browser.create(f.request, f.response, '', '11111111-1111-4111-8111-111111111111')
    f.request.headers.cookie = f.headers.get('Set-Cookie').split(';')[0]
    const user = await f.auth.users.findOrCreateByEmail('test@example.invalid')
    let release
    let started
    const ready = new Promise((resolve) => { started = resolve })
    const hold = new Promise((resolve) => { release = resolve })
    const write = withAccountLock(guest.user.id, async () => {
      started()
      await hold
      return f.auth.members.create({ accountId: guest.user.id, name: 'concurrent child', relationship: 'child' })
    })
    await ready
    const merge = f.browser.completeLogin(f.request, f.response, { user, token: f.auth.tokens.create(user) })
    release()
    const member = await write
    await merge
    assert.equal((await f.auth.members.findById(member.id)).accountId, user.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('concurrent first guest requests and lost-response retries use one account', async () => {
  const f = await fixture()
  try {
    const responses = Array.from({ length: 8 }, () => {
      const headers = new Map()
      return { headers, response: { setHeader: (name, value) => headers.set(name, value) } }
    })
    const results = await Promise.all(responses.map(({ response }) => f.browser.create(f.request, response, '', '22222222-2222-4222-8222-222222222222')))
    assert.equal(new Set(results.map((item) => item.user.id)).size, 1)
    for (const { headers } of responses) {
      const request = { ...f.request, method: 'GET', headers: { ...f.request.headers, cookie: headers.get('Set-Cookie').split(';')[0] } }
      assert.equal((await f.browser.restore(request, f.response)).user.id, results[0].user.id)
    }
    f.request.headers.cookie = responses.at(-1).headers.get('Set-Cookie').split(';')[0]
    const broken = new BrowserSessionService(f.auth)
    broken.sessions.find = async () => { throw new Error('temporary network/storage failure') }
    await assert.rejects(broken.create(f.request, f.response))
    assert.equal((await f.browser.create(f.request, f.response)).user.id, results[0].user.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

for (const existing of [false, true]) test(`guest merge preserves all collections and attachments; existing account=${existing}`, async () => {
  const f = await fixture()
  try {
    const guest = await f.browser.create(f.request, f.response, '', '33333333-3333-4333-8333-333333333333')
    f.request.headers.cookie = f.headers.get('Set-Cookie').split(';')[0]
    const user = await f.auth.users.findOrCreateByEmail('test@example.invalid')
    for (const [file, collection] of accountCollections) {
      await f.auth.accountData.store(file, collection).update((data) => ({ ...data, [collection]: [
        { id: 'guest-record', accountId: guest.user.id, memberId: 'child', storageKey: 'retained-photo.png', details: { note: 'synthetic test' } },
        ...(existing ? [{ id: 'formal-record', accountId: user.id }] : [])
      ] }))
    }
    const result = await f.browser.completeLogin(f.request, f.response, { user, token: f.auth.tokens.create(user) })
    assert.equal(result.guestMerge.merged, true)
    assert.equal(await f.browser.current(f.request), null)
    for (const [file, collection] of accountCollections) {
      const records = (await f.auth.accountData.store(file, collection).read())[collection]
      assert.equal(records.length, existing ? 2 : 1)
      assert.ok(records.every((record) => record.accountId === user.id))
      assert.equal(records[0].storageKey, 'retained-photo.png')
      assert.equal(records[0].details.note, 'synthetic test')
    }
    assert.deepEqual(await f.auth.accountData.mergeGuest(guest.user.id, user.id), { merged: false, idempotent: true })
    await assert.rejects(f.auth.accountData.mergeGuest(guest.user.id, 'another-account'), (error) => error.code === 'GUEST_ALREADY_MERGED')
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('mid-merge failure rolls back every collection and leaves guest cookie usable', async () => {
  const f = await fixture()
  try {
    const guest = await f.browser.create(f.request, f.response, '', '44444444-4444-4444-8444-444444444444')
    f.request.headers.cookie = f.headers.get('Set-Cookie').split(';')[0]
    const member = await f.auth.members.create({ accountId: guest.user.id, name: 'test child', relationship: 'child' })
    const user = await f.auth.users.findOrCreateByEmail('test@example.invalid')
    const originalStore = f.auth.accountData.store.bind(f.auth.accountData)
    f.auth.accountData.store = (file, collection) => file === 'health-event-records.json' ? { update: async () => { throw new Error('injected failure') } } : originalStore(file, collection)
    f.headers.clear()
    await assert.rejects(f.browser.completeLogin(f.request, f.response, { user, token: f.auth.tokens.create(user) }))
    assert.equal((await f.auth.members.findById(member.id)).accountId, guest.user.id)
    assert.equal((await f.browser.current(f.request)).user.id, guest.user.id)
    assert.equal(f.headers.has('Set-Cookie'), false)
    assert.equal((await f.auth.accountData.journal.read()).merges.length, 0)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('profile ownership, optimistic concurrency and current member selection are validated', async () => {
  const f = await fixture()
  try {
    const guest = await f.browser.create(f.request, f.response, '', '55555555-5555-4555-8555-555555555555')
    f.request.headers.cookie = f.headers.get('Set-Cookie').split(';')[0]
    const member = await f.auth.members.create({ accountId: guest.user.id, name: 'test child', relationship: 'child' })
    const input = { memberId: member.id, sectionId: 'medication', revision: 0, records: [{ imageDataUrl: 'data:image/png;base64,dGVzdA==' }] }
    const saved = await f.browser.profileSections(f.request, input)
    assert.equal(saved.records[0].imageDataUrl, input.records[0].imageDataUrl)
    await assert.rejects(f.browser.profileSections(f.request, input), (error) => error.code === 'PROFILE_CONFLICT')
    assert.equal((await f.browser.profileSections(f.request, { ...input, importOnly: true })).revision, 1)
    await assert.rejects(f.browser.profileSections(f.request, { ...input, memberId: 'other' }), (error) => error.status === 404)
    await f.browser.selectMember(f.request, { memberId: member.id })
    assert.equal((await f.browser.current(f.request)).user.currentMemberId, member.id)
    await assert.rejects(f.browser.selectMember(f.request, { memberId: 'other' }), (error) => error.status === 404)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('diagnostics correlate guest creation and the real follow-up cookie request without storing secrets', async () => {
  const f = await fixture()
  try {
    f.request.headers['x-hoooho-diagnostic-id'] = 'diagnostic_test_1234567890'
    f.request.headers['x-hoooho-request-id'] = 'request-12345678'
    const created = await f.browser.create(f.request, f.response, '', '77777777-7777-4777-8777-777777777777')
    const setCookie = f.headers.get('Set-Cookie')
    const rawToken = setCookie.split(';')[0].split('=')[1]
    const followUp = { ...f.request, method: 'GET', url: '/api/auth/session', headers: { ...f.request.headers, cookie: setCookie.split(';')[0] } }
    const restored = await f.browser.restore(followUp, f.response)
    assert.equal(restored.user.id, created.user.id)
    const events = await f.browser.diagnostics.list('diagnostic_test_1234567890')
    assert.deepEqual(events.map((item) => item.event), ['guest_create_started', 'guest_create_response', 'session_restore_result'])
    assert.equal(events[1].setCookieSent, true)
    assert.equal(events[2].cookiePresent, true)
    assert.equal(events[2].sessionFound, true)
    assert.equal(events[2].accountBound, true)
    assert.equal(events[1].accountHashPrefix, events[2].accountHashPrefix)
    assert.equal(JSON.stringify(events).includes(rawToken), false)
    assert.equal(events[2].cookieHashPrefix.length, 12)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})
