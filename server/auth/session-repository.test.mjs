import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SessionRepository, sessionTtlMs } from './session-repository.mjs'

test('opaque browser sessions survive a new repository instance without storing the raw secret', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-browser-session-'))
  try {
    const repository = new SessionRepository(directory)
    const { token, session } = await repository.create('test-account', 1000)
    assert.notEqual(token, session.accountId)
    assert.equal(session.expiresAt - session.createdAt, sessionTtlMs)
    assert.ok(sessionTtlMs >= 180 * 86400000)
    assert.ok(!(await readFile(path.join(directory, 'browser-sessions.json'), 'utf8')).includes(token))
    const restored = new SessionRepository(directory)
    assert.equal((await restored.find(token, 2000)).accountId, 'test-account')
    assert.equal(await restored.find('test-account', 2000), null)
    assert.equal(await restored.find(token, session.expiresAt), null)
    assert.equal((await restored.renew(token, 3000)).expiresAt, 3000 + sessionTtlMs)
    await restored.revokeAccount('test-account', 4000)
    assert.equal(await repository.find(token, 5000), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
