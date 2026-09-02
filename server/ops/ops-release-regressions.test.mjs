import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { OpsService } from './ops-service.mjs'

test('manual refresh never attempts a connector', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-regression-'))
  let calls = 0
  const service = new OpsService({ dataDirectory: directory, collectors: { 'manual-screenshot': async () => { calls += 1 } } })
  const result = await service.refresh('figma')
  assert.equal(calls, 0)
  assert.equal(result.status, 'manual')
})

test('an unconfigured connector is explicit and does not claim a successful update', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-billing-regression-'))
  const service = new OpsService({ dataDirectory: directory })
  const result = await service.refresh('openai')
  assert.equal(result.status, 'unconfigured')
  assert.equal(result.lastSuccessAt, null)
  assert.match(result.lastFailureReason, /尚未配置/)
})
