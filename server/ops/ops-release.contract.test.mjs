import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { OpsService } from './ops-service.mjs'

test('Add Resource persists and can be reloaded', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-release-'))
  const service = new OpsService({ dataDirectory: directory })
  const created = await service.create({ name: 'Test Vendor（测试服务）', category: 'other', criticality: 'P1', impact: '测试期间不可用' })
  const reloaded = new OpsService({ dataDirectory: directory })
  const saved = (await reloaded.list()).resources.find((item) => item.id === created.id)
  assert.equal(saved.name, 'Test Vendor（测试服务）')
  assert.equal(saved.source, 'manual')
  assert.equal(saved.category, 'other')
})

test('Disable excludes a resource from enabled cost inputs and Enable restores an explicit state', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-release-'))
  const service = new OpsService({ dataDirectory: directory })
  const disabled = await service.update('chatgpt', { enabled: false })
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.status, 'disabled')
  const enabledCost = (await service.list()).resources.filter((item) => item.enabled && item.category !== 'future').reduce((sum, item) => sum + (item.monthlyCost || 0), 0)
  assert.equal(enabledCost, 0)
  const enabled = await service.update('chatgpt', { enabled: true })
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.status, 'unknown')
})

test('known expiry automatically recalculates a release-blocking status', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoho-ops-release-'))
  const service = new OpsService({ dataDirectory: directory })
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const domain = await service.update('domain', { expirationDate: tomorrow })
  assert.equal(domain.status, 'critical')
})

test('Ops page exposes release-required controls and views', async () => {
  const source = await readFile(new URL('../../src/pages/Ops/index.tsx', import.meta.url), 'utf8')
  for (const required of [
    'Add Resource（新增服务）', 'Enable（启用）', 'Disable（停用）',
    'Upcoming Costs & Renewals（近期费用与续费）', 'Cost Breakdown（费用构成）',
    'Sync Now（立即同步）', 'sortKey="name"', 'sortKey="criticality"',
    'sortKey="monthlyCost"', 'sortKey="date"', 'sortKey="status"', 'sortKey="source"'
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(source, /localStorage|sessionStorage/)
})
