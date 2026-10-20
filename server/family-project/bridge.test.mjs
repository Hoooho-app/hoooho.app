import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { randomUUID, createHmac } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { createFamilyMigrationBridge, FAMILY_DATA_FILES } from './bridge.mjs'

async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'family-bridge-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  let now = Date.UTC(2026, 9, 20), upstream = false
  const migrationToken = 'isolated-family-migration-bridge-token-32plus'
  const options = { dataDirectory, tokenSecret: 'existing-health-secret-never-exported', auth: { opsOwnerEmail: () => 'ray@example.test' }, now: () => now }
  const store = (name, value) => new JsonStore(path.join(dataDirectory, name), value)
  const workspace = {
    store: store(FAMILY_DATA_FILES[0], { codes: [], sessions: [], rates: [] }),
    finance: { store: store(FAMILY_DATA_FILES[1], { revision: 0, data: { assets: [] }, attachments: [] }) },
    policies: { store: store(FAMILY_DATA_FILES[2], { records: {} }) },
    arrangements: { store: store(FAMILY_DATA_FILES[3], { revision: 0, plans: [] }) },
    normalizeCode: value => value
  }
  const bridge = createFamilyMigrationBridge({ ...options, migrationToken, upstreamActive: () => upstream })
  bridge.protect(workspace)
  const hash = (kind, value) => createHmac('sha256', options.tokenSecret).update(`Hoooho family ${kind} v1\0`).update(value).digest('hex')
  const admin = { raw: 'A'.repeat(43) }, code = { id: randomUUID(), loginCode: 'A'.repeat(20) }
  await workspace.store.update(state => ({ ...state, codes: [{ id: code.id, hash: hash('code', code.loginCode), expiresAt: now + 86400_000 }], sessions: [{ id: hash('session', admin.raw), expiresAt: now + 86400_000 }] }))
  await writeFile(path.join(dataDirectory, 'users.json'), JSON.stringify({ medical: 'must never migrate' }))
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    try {
      const readJson = async request => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || '{}') }
      const sendJson = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
      if (!await bridge.handle(request, response, url.pathname, url.searchParams, { readJson, sendJson })) response.writeHead(404).end()
    } catch (error) { response.writeHead(error.status ?? 500).end(JSON.stringify({ code: error.code })) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const call = (route, { body, query, token = migrationToken } = {}) => fetch(`http://127.0.0.1:${server.address().port}/_internal/family-migration/${route}${query ? `?${new URLSearchParams(query)}` : ''}`, { method: body ? 'POST' : 'GET', headers: { 'x-family-migration-token': token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return { dataDirectory, workspace, bridge, admin, code, call, advance: delta => { now += delta }, upstream: () => { upstream = true } }
}

test('family export freezes all family stores, persists across restart and excludes all health files and secrets', async t => {
  const f = await fixture(t)
  assert.equal((await f.call('prepare', { body: {}, token: '' })).status, 404)
  assert.equal((await f.call('prepare', { body: {}, token: 'é'.repeat(43) })).status, 404)
  const id = randomUUID(), buffer = Buffer.from('isolated attachment fixture')
  await mkdir(path.join(f.dataDirectory, 'family-asset-files'))
  await writeFile(path.join(f.dataDirectory, 'family-asset-files', `${id}.png`), buffer)
  await f.workspace.finance.store.update(state => ({ ...state, attachments: [{ id, size: buffer.length, mimeType: 'image/png' }] }))
  const manifest = await (await f.call('prepare', { body: {} })).json()
  assert.deepEqual(manifest.entries.map(row => row.path), [...FAMILY_DATA_FILES, `family-asset-files/${id}.png`])
  assert.equal(JSON.stringify(manifest).includes('secret'), false)
  assert.equal((await f.call('file', { query: { id: manifest.id, path: 'users.json' } })).status, 404)
  assert.equal((await f.call('file', { query: { id: manifest.id, path: '../users.json' } })).status, 404)
  assert.deepEqual(Buffer.from(await (await f.call('file', { query: { id: manifest.id, path: `family-asset-files/${id}.png` } })).arrayBuffer()), buffer)
  for (const store of [f.workspace.store, f.workspace.finance.store, f.workspace.policies.store, f.workspace.arrangements.store]) await assert.rejects(store.update(state => state), { status: 503 })
  const restarted = createFamilyMigrationBridge({ dataDirectory: f.dataDirectory })
  await assert.rejects(restarted.assertWritable(), { status: 503 })
  assert.deepEqual((await (await f.call('prepare', { body: {} })).json()).digest, manifest.digest)
  await f.call('release', { body: { id: manifest.id, digest: manifest.digest } })
  await f.workspace.store.update(state => state)
  assert.equal(JSON.parse(await readFile(path.join(f.dataDirectory, 'users.json'), 'utf8')).medical, 'must never migrate')
})

test('legacy oracle reveals only an identifier, expires after 30 days, and committed snapshots cannot resume old writes', async t => {
  const f = await fixture(t)
  const manifest = await (await f.call('prepare', { body: {} })).json()
  const result = await (await f.call('verify-legacy', { body: { kind: 'code', value: f.workspace.normalizeCode(f.code.loginCode) } })).json()
  assert.deepEqual(result, { id: f.code.id })
  assert.equal((await f.call('verify-legacy', { body: { kind: 'session', value: f.admin.raw } })).status, 200)
  assert.equal((await f.call('verify-legacy', { body: { kind: 'code', value: 'BBBBBBBBBBBBBBBBBBBB' } })).status, 401)
  assert.equal((await f.call('commit', { body: { id: manifest.id, digest: manifest.digest } })).status, 200)
  assert.equal((await f.call('release', { body: { id: manifest.id, digest: manifest.digest } })).status, 409)
  f.advance(30 * 24 * 3600_000)
  assert.equal((await f.call('verify-legacy', { body: { kind: 'session', value: f.admin.raw } })).status, 401)
})

test('failed preparation can unfreeze unchanged source without a manifest; commit remains forbidden', async t => {
  const f = await fixture(t)
  const id = randomUUID()
  await f.workspace.finance.store.update(state => ({ ...state, attachments: [{ id, size: 50, mimeType: 'image/png' }] }))
  assert.equal((await f.call('prepare', { body: {} })).status, 500)
  const state = await (await f.call('status')).json()
  assert.equal(state.status, 'preparing'); assert.equal(state.digest, null)
  await assert.rejects(f.workspace.store.update(state => state), { status: 503 })
  assert.equal((await f.call('commit', { body: { id: state.id, digest: null } })).status, 409)
  assert.equal((await f.call('release', { body: { id: state.id, digest: null } })).status, 200)
  await f.workspace.store.update(state => state)
  assert.equal((await (await f.call('status')).json()).status, 'unprepared')
})
