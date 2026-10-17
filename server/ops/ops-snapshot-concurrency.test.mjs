import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { OpsService } from './ops-service.mjs'

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-ops-snapshot-concurrency-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { directory, service: new OpsService({ dataDirectory: directory }) }
}
async function image(color = '#7da9b2') {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: color } }).png().toBuffer()
  return { name: '合成账单.png', type: 'image/png', dataUrl: 'data:image/png;base64,' + bytes.toString('base64'), privacyConfirmed: true }
}
const files = directory => readdir(path.join(directory, 'ops', 'snapshots'))

test('same-image concurrent saves from separate instances create one snapshot and file', async t => {
  const f = await fixture(t), second = new OpsService({ dataDirectory: f.directory }), input = await image()
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? f.service : second).addManualSnapshot('railway', input)))
  assert.equal(new Set(results.map(result => result.latestSnapshot.id)).size, 1)
  const persisted = JSON.parse(await readFile(path.join(f.directory, 'ops', 'billing-sources.json'), 'utf8'))
  assert.equal(persisted.snapshots.length, 1)
  assert.equal((await files(f.directory)).length, 1)
  assert.equal((await second.history('railway')).snapshots.length, 1)
})

test('different concurrent images remain independent snapshots and responses', async t => {
  const f = await fixture(t), first = await image('#aa0000'), second = await image('#0000aa')
  const results = await Promise.all([f.service.addManualSnapshot('railway', first), f.service.addManualSnapshot('railway', second)])
  assert.equal(new Set(results.map(result => result.latestSnapshot.id)).size, 2)
  assert.equal((await f.service.history('railway')).snapshots.length, 2)
  assert.equal((await files(f.directory)).length, 2)
})

test('the same image uploaded for different sources is never deduplicated across sources', async t => {
  const f = await fixture(t), input = await image()
  const [railway, figma] = await Promise.all([f.service.addManualSnapshot('railway', input), f.service.addManualSnapshot('figma', input)])
  assert.notEqual(railway.latestSnapshot.id, figma.latestSnapshot.id)
  assert.equal(railway.latestSnapshot.sourceId, 'railway')
  assert.equal(figma.latestSnapshot.sourceId, 'figma')
  assert.equal((await files(f.directory)).length, 2)
})
