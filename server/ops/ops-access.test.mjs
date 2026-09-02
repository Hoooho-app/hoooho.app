import assert from 'node:assert/strict'
import test from 'node:test'
import { assertOpsAccess } from './ops-service.mjs'

const original = { owner: process.env.OPS_OWNER_EMAIL, ids: process.env.OPS_ALLOWED_ACCOUNT_IDS, phones: process.env.OPS_ALLOWED_PHONES, emails: process.env.OPS_ALLOWED_EMAILS }
test.afterEach(() => {
  for (const [key, value] of [['OPS_OWNER_EMAIL', original.owner], ['OPS_ALLOWED_ACCOUNT_IDS', original.ids], ['OPS_ALLOWED_PHONES', original.phones], ['OPS_ALLOWED_EMAILS', original.emails]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})

test('Operations fails closed when OPS_OWNER_EMAIL is missing', () => {
  delete process.env.OPS_OWNER_EMAIL
  assert.throws(() => assertOpsAccess({ sub: 'account-owner', email: 'owner@example.com' }), (error) => error.status === 503 && error.code === 'OPS_OWNER_NOT_CONFIGURED')
})

test('Operations fails closed when OPS_OWNER_EMAIL is malformed', () => {
  process.env.OPS_OWNER_EMAIL = 'not-an-email'
  assert.throws(() => assertOpsAccess({ sub: 'account-owner', email: 'not-an-email' }), (error) => error.status === 503 && error.code === 'OPS_OWNER_NOT_CONFIGURED')
})

test('Operations only accepts the normalized exact owner email', () => {
  process.env.OPS_OWNER_EMAIL = ' Owner@Example.com '
  assert.deepEqual(assertOpsAccess({ sub: 'account-owner', email: ' OWNER@example.COM ' }), { mode: 'owner' })
  for (const email of ['owner+ops@example.com', 'owner@example.co', 'owners@example.com', '', undefined]) {
    assert.throws(() => assertOpsAccess({ sub: 'account-other', email }), (error) => error.status === 403 && error.code === 'OPS_FORBIDDEN')
  }
})

test('legacy allowlists cannot broaden Operations access', () => {
  process.env.OPS_OWNER_EMAIL = 'owner@example.com'
  process.env.OPS_ALLOWED_ACCOUNT_IDS = 'account-other'
  process.env.OPS_ALLOWED_PHONES = '13900000000'
  process.env.OPS_ALLOWED_EMAILS = 'other@example.com'
  assert.throws(() => assertOpsAccess({ sub: 'account-other', phone: '13900000000', email: 'other@example.com' }), (error) => error.status === 403 && error.code === 'OPS_FORBIDDEN')
})

test('missing or invalid token payload is unauthorized', () => {
  process.env.OPS_OWNER_EMAIL = 'owner@example.com'
  assert.throws(() => assertOpsAccess(null), (error) => error.status === 401 && error.code === 'UNAUTHORIZED')
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
