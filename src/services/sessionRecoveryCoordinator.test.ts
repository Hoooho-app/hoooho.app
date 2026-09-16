import assert from 'node:assert/strict'
import test from 'node:test'
import { invalidateSessionRecoveryRequests, recoverSessionToken, registerSessionRecoveryHandler } from './sessionRecoveryCoordinator'

test('a recovery result that finishes after logout invalidation is ignored', async () => {
  let resolveRecovery: ((token: string) => void) | undefined
  registerSessionRecoveryHandler(() => new Promise((resolve) => { resolveRecovery = resolve }))
  const staleRecovery = recoverSessionToken()

  invalidateSessionRecoveryRequests()
  resolveRecovery?.('stale-account-token')
  assert.equal(await staleRecovery, null)

  registerSessionRecoveryHandler(async () => 'fresh-account-token')
  assert.equal(await recoverSessionToken(), 'fresh-account-token')
})
