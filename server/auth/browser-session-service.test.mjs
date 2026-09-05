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
  await browser.restore({ ...request, method: 'GET' }, response)
  request.headers.cookie = headers.get('Set-Cookie').split(';')[0]
  return { directory, auth, browser, request, response, headers }
}

test('merge waits for an in-flight account write and includes that record', async () => {
  const f = await fixture()
  try {
    const guest = await f.browser.create(f.request, f.response)
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
    const results = await Promise.all(Array.from({ length: 8 }, () => f.browser.create(f.request, f.response)))
    assert.equal(new Set(results.map((item) => item.user.id)).size, 1)
    assert.equal((await f.browser.restore({ ...f.request, method: 'GET' }, f.response)).user.id, results[0].user.id)
    const broken = new BrowserSessionService(f.auth)
    broken.sessions.find = async () => { throw new Error('temporary network/storage failure') }
    await assert.rejects(broken.create(f.request, f.response))
    assert.equal((await f.browser.create(f.request, f.response)).user.id, results[0].user.id)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

for (const existing of [false, true]) test(`guest merge preserves all collections and attachments; existing account=${existing}`, async () => {
  const f = await fixture()
  try {
    const guest = await f.browser.create(f.request, f.response)
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
    const guest = await f.browser.create(f.request, f.response)
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
    const guest = await f.browser.create(f.request, f.response)
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
