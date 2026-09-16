import assert from 'node:assert/strict'
import test from 'node:test'
import { loginStorageDiagnostics } from './loginStorageDiagnostics'

test('storage evidence reports presence without exposing nickname or unrelated storage', () => {
  const values: Record<string, string> = { lastLoginNickname: 'private-name', rememberLoginPreference: 'true', password: 'must-never-read' }
  const evidence = loginStorageDiagnostics({ getItem(key) { assert.notEqual(key, 'password'); return values[key] ?? null } })
  assert.deepEqual(evidence, { 'X-Hoooho-Nickname-Storage': 'present', 'X-Hoooho-Remember-Preference': 'true' })
  assert.ok(!JSON.stringify(evidence).includes('private-name'))
})

test('absent, unchecked and unavailable storage stay distinguishable', () => {
  assert.equal(loginStorageDiagnostics({ getItem: () => null })['X-Hoooho-Remember-Preference'], 'unset')
  assert.deepEqual(loginStorageDiagnostics({ getItem: (key) => key === 'rememberLoginPreference' ? 'false' : null }), {
    'X-Hoooho-Nickname-Storage': 'absent', 'X-Hoooho-Remember-Preference': 'false'
  })
  assert.equal(loginStorageDiagnostics({ getItem() { throw new Error('blocked') } })['X-Hoooho-Nickname-Storage'], 'unavailable')
})
