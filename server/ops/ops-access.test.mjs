import assert from 'node:assert/strict'
import test from 'node:test'
import { assertOpsAccess } from './ops-service.mjs'

const original = { nodeEnv: process.env.NODE_ENV, ids: process.env.OPS_ALLOWED_ACCOUNT_IDS, phones: process.env.OPS_ALLOWED_PHONES, emails: process.env.OPS_ALLOWED_EMAILS }
test.afterEach(() => {
  for (const [key, value] of [['NODE_ENV', original.nodeEnv], ['OPS_ALLOWED_ACCOUNT_IDS', original.ids], ['OPS_ALLOWED_PHONES', original.phones], ['OPS_ALLOWED_EMAILS', original.emails]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})

test('production allows authenticated access temporarily when no general Ops allowlist is configured', () => {
  process.env.NODE_ENV = 'production'; delete process.env.OPS_ALLOWED_ACCOUNT_IDS; delete process.env.OPS_ALLOWED_PHONES; delete process.env.OPS_ALLOWED_EMAILS
  assert.deepEqual(assertOpsAccess({ sub: 'account-other', phone: '13800000000' }), { mode: 'temporary-authenticated' })
})

test('production accepts account ID, phone and email allowlists', () => {
  process.env.NODE_ENV = 'production'; process.env.OPS_ALLOWED_ACCOUNT_IDS = 'account-owner'; process.env.OPS_ALLOWED_PHONES = '13900000000'; process.env.OPS_ALLOWED_EMAILS = 'pm@hoooho.com'
  assert.deepEqual(assertOpsAccess({ sub: 'account-owner', phone: '13800000000' }), { mode: 'allowlist' })
  assert.deepEqual(assertOpsAccess({ sub: 'account-other', phone: '13900000000' }), { mode: 'allowlist' })
  assert.deepEqual(assertOpsAccess({ sub: 'account-other', email: 'PM@hoooho.com' }), { mode: 'allowlist' })
  assert.throws(() => assertOpsAccess({ sub: 'account-other', phone: '13800000000' }), (error) => error.status === 403 && error.code === 'OPS_FORBIDDEN')
})

test('feedback management defaults to deny when no Ops allowlist is configured', () => {
  delete process.env.OPS_ALLOWED_ACCOUNT_IDS; delete process.env.OPS_ALLOWED_PHONES; delete process.env.OPS_ALLOWED_EMAILS
  assert.throws(() => assertOpsAccess({ sub: 'account-other' }, { requireAllowlist: true }), (error) => error.status === 403 && error.code === 'OPS_ALLOWLIST_REQUIRED')
})

test('temporary Ops release does not switch the shared data root to an unverified Railway volume', async () => {
  const previousData = process.env.DATA_DIRECTORY, previousMount = process.env.RAILWAY_VOLUME_MOUNT_PATH
  delete process.env.DATA_DIRECTORY; process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data/hoho'
  const { authConfig } = await import(`../auth/config.mjs?temporary-persistence-test=${Date.now()}`)
  assert.doesNotMatch(authConfig.dataDirectory.replaceAll('\\', '/'), /\/data\/hoho$/)
  assert.match(authConfig.dataDirectory.replaceAll('\\', '/'), /\.codex-tmp\/auth$/)
  if (previousData === undefined) delete process.env.DATA_DIRECTORY; else process.env.DATA_DIRECTORY = previousData
  if (previousMount === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH; else process.env.RAILWAY_VOLUME_MOUNT_PATH = previousMount
})
