import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { OpsService } from './ops-service.mjs'
const source = extra => ({ name: '合成费用来源', platformUrl: 'https://example.test/billing', method: 'manual-screenshot', frequency: 'manual', ...extra })
async function fixture(t, options = {}) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-ops-input-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  return { dataDirectory, service: new OpsService({ dataDirectory, ...options }) }
}
const image = async () => ({ name: '合成.png', type: 'image/png', dataUrl: 'data:image/png;base64,' + (await sharp({ create: { width: 12, height: 8, channels: 3, background: '#aaccdd' } }).png().toBuffer()).toString('base64') })
const clientError = error => error.status >= 400 && error.status < 500
test('source validation rejects wrong shapes names and URLs without changing an existing source', async t => {
  const { service } = await fixture(t), before = await service.get('railway')
  for (const input of [null, [], false, source({ name: {} }), source({ platformUrl: 'https://' }), source({ platformUrl: 'https:// this is not a URL' }), source({ platformUrl: {} })]) {
    await assert.rejects(service.create(input), clientError)
    await assert.rejects(service.update('railway', input), clientError)
  }
  assert.deepEqual(await service.get('railway'), before)
  assert.equal((await service.list()).sources.length, 9)
  assert.equal((await service.create(source())).platformUrl, 'https://example.test/billing')
})
test('manual snapshot cannot bypass privacy by claiming api or automatic-screenshot', async t => {
  const { service } = await fixture(t), file = await image()
  for (const method of ['api', 'automatic-screenshot', 'manual-screenshot', undefined]) await assert.rejects(service.addManualSnapshot('railway', { ...file, method, privacyConfirmed: false }), error => error.code === 'OPS_SNAPSHOT_PRIVACY_CONFIRMATION_REQUIRED')
  assert.equal((await service.history('railway')).snapshots.length, 0)
  assert.equal((await service.addManualSnapshot('railway', { ...file, method: 'api', privacyConfirmed: true })).latestSnapshot.method, 'manual-screenshot')
})
test('trusted automatic collectors keep their method without a user privacy checkbox', async t => {
  const file = await image(), { service } = await fixture(t, { collectors: { openai: async () => file } })
  const result = await service.refresh('openai')
  assert.equal(result.status, 'success')
  assert.equal(result.latestSnapshot.method, 'api')
})
test('corrupt PNG snapshot fails before storage and preserves last successful image', async t => {
  const { service, dataDirectory } = await fixture(t), file = await image(), before = await service.addManualSnapshot('railway', { ...file, privacyConfirmed: true })
  await assert.rejects(service.addManualSnapshot('railway', { ...file, dataUrl: 'data:image/png;base64,iVBORw0KGgo=', privacyConfirmed: true }), clientError)
  assert.equal((await service.get('railway')).latestSnapshot.id, before.latestSnapshot.id)
  assert.equal((await readdir(path.join(dataDirectory, 'ops', 'snapshots'))).length, 1)
})
