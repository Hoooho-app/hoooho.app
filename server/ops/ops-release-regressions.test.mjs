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

test('Ops access is fail-closed even when NODE_ENV is not configured', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousIds = process.env.OPS_ALLOWED_ACCOUNT_IDS
  const previousPhones = process.env.OPS_ALLOWED_PHONES
  delete process.env.NODE_ENV
  delete process.env.OPS_ALLOWED_ACCOUNT_IDS
  delete process.env.OPS_ALLOWED_PHONES
  assert.throws(() => assertOpsAccess({ sub: 'not-allowed', phone: '13800000000' }), (error) => error.status === 403)
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv
  if (previousIds === undefined) delete process.env.OPS_ALLOWED_ACCOUNT_IDS; else process.env.OPS_ALLOWED_ACCOUNT_IDS = previousIds
  if (previousPhones === undefined) delete process.env.OPS_ALLOWED_PHONES; else process.env.OPS_ALLOWED_PHONES = previousPhones
})
