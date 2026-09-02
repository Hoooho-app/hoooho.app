import assert from 'node:assert/strict'
import test from 'node:test'
import { OPS_OWNER_EMAIL, assertOpsAccess } from './ops-service.mjs'

const previous = process.env.OPS_OWNER_EMAIL
test.afterEach(() => { if (previous === undefined) delete process.env.OPS_OWNER_EMAIL; else process.env.OPS_OWNER_EMAIL = previous })

test('only the configured owner email can access operations data', () => {
  delete process.env.OPS_OWNER_EMAIL
  assert.deepEqual(assertOpsAccess({ sub: 'owner', email: OPS_OWNER_EMAIL.toUpperCase() }), { mode: 'owner', email: OPS_OWNER_EMAIL })
  assert.throws(() => assertOpsAccess({ sub: 'owner', phone: '13900000000' }), (error) => error.status === 403 && error.code === 'OPS_FORBIDDEN')
  assert.throws(() => assertOpsAccess({ sub: 'other', email: 'other@example.com' }), (error) => error.status === 403 && error.code === 'OPS_FORBIDDEN')
})

test('owner email can be overridden only through server configuration', () => {
  process.env.OPS_OWNER_EMAIL = 'ops@example.com'
  assert.deepEqual(assertOpsAccess({ email: 'OPS@example.com' }), { mode: 'owner', email: 'ops@example.com' })
  assert.throws(() => assertOpsAccess({ email: OPS_OWNER_EMAIL }), /没有费用总控台权限/)
})
