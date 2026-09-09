import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AuthService } from './auth-service.mjs'
import { BrowserSessionService } from './browser-session-service.mjs'

test('an existing guest cookie still restores, but no public guest creation API is required', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-guest-compatibility-'))
  try {
    const auth = new AuthService({ dataDirectory: directory, tokenSecret: 'guest-test-only', logger: () => undefined })
    const browser = new BrowserSessionService(auth)
    const user = await auth.users.createGuest()
    const headers = new Map()
    const request = { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, socket: { encrypted: true } }
    const response = { setHeader: (name, value) => headers.set(name, value) }
    await browser.issue(request, response, user)
    request.headers.cookie = headers.get('Set-Cookie').split(';')[0]
    assert.equal((await browser.restore({ ...request, method: 'GET' }, response)).user.id, user.id)
    assert.equal(typeof browser.create, 'undefined')
    assert.equal(typeof browser.recovery, 'undefined')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
