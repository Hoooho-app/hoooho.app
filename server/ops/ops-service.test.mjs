import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { OpsService, initialOpsResources } from './ops-service.mjs'

test('initializes the independent ops resource catalog', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-'))
  const service = new OpsService({ dataDirectory: directory })
  const data = await service.list()
  assert.equal(data.resources.length, 23)
  assert.equal(data.resources.some((item) => item.id === 'domain'), true)
  for (const item of data.resources) {
    assert.equal(Object.keys(item).some((key) => /apiKey|secret|token|databaseUrl|connectionString|privateKey/i.test(key)), false)
  }
})

test('manual edits persist outside health data and survive a new service instance', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-'))
  const service = new OpsService({ dataDirectory: directory })
  await service.update('domain', { expirationDate: '2027-08-22', monthlyCost: 1.25, autoRenew: true })
  const reloaded = new OpsService({ dataDirectory: directory })
  const domain = (await reloaded.list()).resources.find((item) => item.id === 'domain')
  assert.equal(domain.expirationDate, '2027-08-22')
  assert.equal(domain.monthlyCost, 1.25)
  assert.equal(domain.autoRenew, true)
  const persisted = JSON.parse(await readFile(path.join(directory, 'ops', 'resources.json'), 'utf8'))
  assert.equal(persisted.resources.length, initialOpsResources.length)
})

test('repairs an empty or partial persisted catalog without overwriting manual data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-'))
  const opsDirectory = path.join(directory, 'ops')
  await mkdir(opsDirectory, { recursive: true })
  await writeFile(path.join(opsDirectory, 'resources.json'), JSON.stringify({ resources: [{ ...initialOpsResources[0], plan: 'Manual override' }] }), 'utf8')
  const result = await new OpsService({ dataDirectory: directory }).list()
  assert.equal(result.resources.length, 23)
  assert.equal(result.resources.find((item) => item.id === 'railway').plan, 'Manual override')
  assert.equal(result.resources.some((item) => item.id === 'google-play'), true)
  const persisted = JSON.parse(await readFile(path.join(opsDirectory, 'resources.json'), 'utf8'))
  assert.equal(persisted.resources.length, 23)
})

test('sync preserves manual data and records connector failures as fallback state', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-'))
  const service = new OpsService({ dataDirectory: directory })
  await service.update('resend', { plan: 'Free（免费）', notes: '人工说明' })
  const result = await service.sync()
  const resend = result.resources.find((item) => item.id === 'resend')
  assert.equal(resend.plan, 'Free（免费）')
  assert.equal(resend.notes, '人工说明')
  assert.equal(resend.syncStatus, 'failed')
  assert.equal(result.resources.find((item) => item.id === 'uptime').syncStatus, 'normal')
})
