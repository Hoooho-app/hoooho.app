import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { observeSessionRequest } from './session-diagnostics.mjs'

test('session diagnostics distinguish missing credentials and never log secret or personal input', () => {
  const response = new EventEmitter()
  const headers = new Map([['X-Hoooho-Session-Outcome', 'missing-cookie']])
  response.setHeader = (key, value) => headers.set(key, value)
  response.getHeader = (key) => headers.get(key)
  response.statusCode = 200
  const logs = []
  observeSessionRequest({ headers: {
    cookie: 'unrelated=secret-cookie', authorization: 'Bearer private-token',
    'user-agent': 'iPhone sensitive-agent', 'x-hoooho-nickname-storage': 'private-name',
    'x-hoooho-remember-preference': 'true', 'x-hoooho-client-build': 'a'.repeat(40)
  }, body: { password: 'private-password' } }, response, '/api/auth/session', (entry) => logs.push(entry))
  response.emit('finish')
  const entry = JSON.parse(logs[0].slice('[Hoooho session] '.length))
  assert.equal(entry.secureCookiePresent, false)
  assert.equal(entry.outcome, 'missing-cookie')
  assert.equal(entry.nicknameStorage, 'unknown')
  assert.equal(entry.rememberPreference, 'true')
  assert.equal(entry.clientBuild, 'a'.repeat(40))
  for (const value of ['secret-cookie', 'private-token', 'private-name', 'private-password', 'sensitive-agent']) assert.ok(!logs[0].includes(value))
})

test('diagnostics ignore unrelated requests', () => {
  observeSessionRequest({}, {}, '/api/events', () => assert.fail('must not log'))
})
