import assert from 'node:assert/strict'
import test from 'node:test'
import { assertOpsAccess } from './ops-service.mjs'

const original = {
  nodeEnv: process.env.NODE_ENV,
  ids: process.env.OPS_ALLOWED_ACCOUNT_IDS,
  phones: process.env.OPS_ALLOWED_PHONES
}

test.afterEach(() => {
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv
  if (original.ids === undefined) delete process.env.OPS_ALLOWED_ACCOUNT_IDS; else process.env.OPS_ALLOWED_ACCOUNT_IDS = original.ids
  if (original.phones === undefined) delete process.env.OPS_ALLOWED_PHONES; else process.env.OPS_ALLOWED_PHONES = original.phones
})

test('production denies an account outside the Ops allowlist', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.OPS_ALLOWED_ACCOUNT_IDS
  delete process.env.OPS_ALLOWED_PHONES
  assert.throws(() => assertOpsAccess({ sub: 'account-other', phone: '13800000000' }), (error) => error.status === 403 && error.code === 'OPS_FORBIDDEN')
})

test('production accepts account ID first and phone as fallback', () => {
  process.env.NODE_ENV = 'production'
  process.env.OPS_ALLOWED_ACCOUNT_IDS = 'account-owner'
  process.env.OPS_ALLOWED_PHONES = '13900000000'
  assert.doesNotThrow(() => assertOpsAccess({ sub: 'account-owner', phone: '13800000000' }))
  assert.doesNotThrow(() => assertOpsAccess({ sub: 'account-other', phone: '13900000000' }))
})

test('Railway volume mount path is the persistence fallback when DATA_DIRECTORY is absent', async () => {
  const previousData = process.env.DATA_DIRECTORY
  const previousMount = process.env.RAILWAY_VOLUME_MOUNT_PATH
  delete process.env.DATA_DIRECTORY
  process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data/hoho'
  const { authConfig } = await import(`../auth/config.mjs?volume-test=${Date.now()}`)
  assert.match(authConfig.dataDirectory.replaceAll('\\', '/'), /\/data\/hoho$/)
  if (previousData === undefined) delete process.env.DATA_DIRECTORY; else process.env.DATA_DIRECTORY = previousData
  if (previousMount === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH; else process.env.RAILWAY_VOLUME_MOUNT_PATH = previousMount
})
