import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { OpsService, assertOpsAccess } from './ops-service.mjs'

test('Enable and Disable preserve existing cost and budget fields', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-toggle-'))
  const service = new OpsService({ dataDirectory: directory })
  await service.update('chatgpt', { monthlyBudget: 30 })
  const disabled = await service.update('chatgpt', { enabled: false })
  assert.equal(disabled.monthlyCost, 20)
  assert.equal(disabled.monthlyBudget, 30)
  const enabled = await service.update('chatgpt', { enabled: true })
  assert.equal(enabled.monthlyCost, 20)
  assert.equal(enabled.monthlyBudget, 30)
})

test('Ops access is owner-only and fail-closed', () => {
  const previousOwner = process.env.OPS_OWNER_EMAIL
  process.env.OPS_OWNER_EMAIL = 'owner@example.com'
  assert.deepEqual(assertOpsAccess({ sub: 'owner', email: 'OWNER@example.com' }), { mode: 'owner' })
  assert.throws(() => assertOpsAccess({ sub: 'other', email: 'other@example.com' }), (error) => error.code === 'OPS_FORBIDDEN')
  delete process.env.OPS_OWNER_EMAIL
  assert.throws(() => assertOpsAccess({ sub: 'owner', email: 'owner@example.com' }), (error) => error.code === 'OPS_OWNER_NOT_CONFIGURED')
  if (previousOwner === undefined) delete process.env.OPS_OWNER_EMAIL; else process.env.OPS_OWNER_EMAIL = previousOwner
})
