import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AuthService } from './auth-service.mjs'
import { BrowserSessionService } from './browser-session-service.mjs'

test('guest creation persists an account rather than only issuing a token', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-guest-regression-'))
  try {
    const auth = new AuthService({ dataDirectory, tokenSecret: 'guest-test-only' })
    const browser = new BrowserSessionService(auth)
    const headers = new Map()
    const request = { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' } }
    const response = { setHeader: (name, value) => headers.set(name, value) }
    await browser.restore({ ...request, method: 'GET' }, response)
    request.headers.cookie = headers.get('Set-Cookie').split(';')[0]
    const session = await browser.create(request, response)
    assert.ok(await auth.users.findById(session.user.id), 'guest account must exist in server storage')
    request.headers.cookie = headers.get('Set-Cookie').split(';')[0]
    assert.match(headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax; Max-Age=15552000/)
    const restored = await browser.restore({ ...request, method: 'GET' }, response)
    assert.equal(restored.user.id, session.user.id)
    assert.equal((await browser.create(request, response)).user.id, session.user.id)
    const repeats = await Promise.all(Array.from({ length: 5 }, () => browser.create(request, response)))
    assert.ok(repeats.every((item) => item.user.id === session.user.id))
    await assert.rejects(browser.create({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }, response), (error) => error.code === 'CSRF_REJECTED')
    await browser.logout(request, response)
    assert.equal((await browser.restore({ ...request, method: 'GET' }, response)).unauthenticated, true)
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
