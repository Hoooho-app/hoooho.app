import assert from 'node:assert/strict'
import test from 'node:test'
import { useAppStore } from '../store/useAppStore.ts'
import { opsApiRequest } from './opsAuth.ts'

const originalFetch = globalThis.fetch

test('401 clears Operations data access and records an expired session', async (context) => {
  context.after(() => { globalThis.fetch = originalFetch; useAppStore.getState().clearOpsAuthSession() })
  useAppStore.setState({ opsAuthToken: 'expired-token', opsAuthUser: { email: 'owner@example.com' }, opsAuthFailure: null })
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'expired' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(opsApiRequest('/api/ops/resources', { token: 'expired-token' }))
  assert.equal(useAppStore.getState().opsAuthToken, null)
  assert.equal(useAppStore.getState().opsAuthUser, null)
  assert.equal(useAppStore.getState().opsAuthFailure, 'expired')
})

test('403 clears Operations data access and records forbidden state', async (context) => {
  context.after(() => { globalThis.fetch = originalFetch; useAppStore.getState().clearOpsAuthSession() })
  useAppStore.setState({ opsAuthToken: 'ordinary-token', opsAuthUser: { email: 'ordinary@example.com' }, opsAuthFailure: null })
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'OPS_FORBIDDEN', message: 'forbidden' } }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(opsApiRequest('/api/ops/feedback', { token: 'ordinary-token' }))
  assert.equal(useAppStore.getState().opsAuthToken, null)
  assert.equal(useAppStore.getState().opsAuthFailure, 'forbidden')
})

test('ordinary network failures preserve a verified Operations session for retry', async (context) => {
  context.after(() => { globalThis.fetch = originalFetch; useAppStore.getState().clearOpsAuthSession() })
  useAppStore.setState({ opsAuthToken: 'owner-token', opsAuthUser: { email: 'owner@example.com' }, opsAuthFailure: null })
  globalThis.fetch = async () => { throw new TypeError('network') }
  await assert.rejects(opsApiRequest('/api/ops/resources', { token: 'owner-token' }))
  assert.equal(useAppStore.getState().opsAuthToken, 'owner-token')
  assert.equal(useAppStore.getState().opsAuthFailure, null)
})
