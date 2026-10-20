// Temporary migration bridge: family files only. Never exports health data or keys.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, lstat } from 'node:fs/promises'
import path from 'node:path'
import { withStorageLock } from '../auth/storage/transaction.mjs'

export const FAMILY_MIGRATION_PATH = '/_internal/family-migration'
export const FAMILY_DATA_FILES = ['family-workspace-access.json', 'family-workspace-finance.json', 'family-workspace-policies.json', 'family-workspace-arrangements.json']
const defaults = [{ codes: [], sessions: [], rates: [] }, { revision: 0, updatedAt: null, updatedBy: null, data: { assets: [], debts: [], flows: [], policies: [], goals: [], settings: { reserveMonths: 6, essentialMonthly: null } }, attachments: [] }, { records: {} }, { revision: 0, updatedAt: null, plans: [] }]
const sha = value => createHash('sha256').update(value).digest('hex')
const fail = (message, status = 409) => Object.assign(new Error(message), { status, code: 'FAMILY_MIGRATION_BLOCKED' })
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
function authorized(request, token) {
  const provided = String(request.headers['x-family-migration-token'] ?? '')
  const actual = Buffer.from(provided), expected = Buffer.from(token ?? '')
  return expected.length >= 32 && actual.length === expected.length && timingSafeEqual(actual, expected)
}
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}

export function createFamilyMigrationBridge({ dataDirectory, tokenSecret, migrationToken, now = Date.now, upstreamActive = () => false }) {
  const marker = path.join(dataDirectory, '.family-migration.json')
  const readState = async () => {
    try { return JSON.parse(await readFile(marker, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  async function assertWritable() {
    if (await readState()) throw fail('家庭空间正在迁移，请稍后刷新。', 503)
  }
  function protect(workspace) {
    // The check runs within the same barrier as snapshot preparation and commits.
    for (const store of [workspace.store, workspace.finance.store, workspace.policies.store, workspace.arrangements?.store].filter(Boolean)) {
      const update = store.update.bind(store)
      store.update = operation => withStorageLock(async () => { await assertWritable(); return update(operation) })
    }
  }
  async function readAllowed(file) {
    const absolute = path.join(dataDirectory, file)
    const metadata = await lstat(absolute)
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 10 * 1024 * 1024) throw fail('Family export file rejected')
    return readFile(absolute)
  }
  async function prepare() {
    return withStorageLock(async () => {
      let state = await readState()
      if (state?.manifest) return state.manifest
      state ??= { id: randomUUID(), preparedAt: now(), legacyUntil: now() + 30 * 24 * 3600_000, status: 'preparing' }
      await atomicJson(marker, state)
      const entries = []
      const metadataDirectory = path.join(dataDirectory, '.family-export', state.id)
      await mkdir(metadataDirectory, { recursive: true, mode: 0o700 })
      let finance
      for (const [index, name] of FAMILY_DATA_FILES.entries()) {
        let buffer
        try { buffer = await readAllowed(name) } catch (error) { if (error.code !== 'ENOENT') throw error; buffer = Buffer.from(JSON.stringify(defaults[index])) }
        const value = JSON.parse(buffer.toString('utf8'))
        if (name === 'family-workspace-finance.json') finance = value
        await writeFile(path.join(metadataDirectory, name), buffer, { mode: 0o600 })
        entries.push({ path: name, size: buffer.length, sha256: sha(buffer) })
      }
      for (const item of finance.attachments ?? []) {
        if (!/^[a-f0-9-]{36}$/i.test(item.id) || !Object.hasOwn(extensions, item.mimeType)) throw fail('Family attachment metadata rejected')
        const name = `family-asset-files/${item.id}.${extensions[item.mimeType]}`
        const buffer = await readAllowed(name)
        if (buffer.length !== item.size) throw fail('Family attachment length mismatch')
        entries.push({ path: name, size: buffer.length, sha256: sha(buffer) })
      }
      if (entries.reduce((n, item) => n + item.size, 0) > 250 * 1024 * 1024) throw fail('Family export size limit')
      const manifest = { version: 1, id: state.id, preparedAt: state.preparedAt, legacyUntil: state.legacyUntil, entries, digest: sha(JSON.stringify(entries)) }
      await atomicJson(marker, { ...state, status: 'prepared', manifest })
      return manifest
    })
  }
  async function handle(request, response, pathname, searchParams, { readJson, sendJson }) {
    if (pathname !== FAMILY_MIGRATION_PATH && !pathname.startsWith(`${FAMILY_MIGRATION_PATH}/`)) return false
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    if (!authorized(request, migrationToken)) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND' })
    const route = pathname.slice(FAMILY_MIGRATION_PATH.length)
    if (request.method === 'POST' && route === '/prepare') {
      await readJson(request, 1024)
      sendJson(response, 200, await prepare())
    } else if (request.method === 'GET' && route === '/status') {
      const state = await readState()
      sendJson(response, 200, { status: state?.status ?? 'unprepared', id: state?.id ?? null, digest: state?.manifest?.digest ?? null })
    } else if (request.method === 'GET' && route === '/file') {
      const state = await readState(), file = searchParams.get('path')
      const item = state?.manifest?.entries.find(entry => entry.path === file)
      if (!item || searchParams.get('id') !== state.id) throw fail('Family export file not found', 404)
      const buffer = FAMILY_DATA_FILES.includes(file) ? await readFile(path.join(dataDirectory, '.family-export', state.id, file)) : await readAllowed(file)
      if (sha(buffer) !== item.sha256) throw fail('Family export changed; migration stopped')
      response.setHeader('Content-Type', 'application/octet-stream')
      response.setHeader('Content-Length', buffer.length)
      response.writeHead(200); response.end(buffer)
    } else if (request.method === 'POST' && route === '/verify-legacy') {
      const { kind, value } = await readJson(request, 1024)
      const state = await readState()
      if (!state?.manifest || state.legacyUntil <= now() || !['code', 'session'].includes(kind) || typeof value !== 'string' || !(kind === 'code' ? /^[A-HJ-NP-Z2-9]{20}$/ : /^[A-Za-z0-9_-]{43}$/).test(value)) throw fail('Legacy credential unavailable', 401)
      const access = JSON.parse(await readFile(path.join(dataDirectory, '.family-export', state.id, FAMILY_DATA_FILES[0]), 'utf8'))
      const hash = createHmac('sha256', tokenSecret).update(`Hoooho family ${kind} v1\0`).update(value).digest('hex')
      const record = kind === 'code' ? access.codes.find(item => item.hash === hash) : access.sessions.find(item => item.id === hash)
      if (!record || record.expiresAt <= now() || record.revokedAt) throw fail('Legacy credential unavailable', 401)
      // Return a record identifier only; the target must enforce its own revocations.
      sendJson(response, 200, { id: record.id })
    } else if (request.method === 'POST' && (route === '/release' || route === '/commit')) {
      const { id, digest } = await readJson(request, 1024)
      await withStorageLock(async () => {
        const state = await readState()
        if (!state || state.id !== id || state.manifest?.digest !== digest) throw fail('Family migration identity mismatch')
        if (route === '/release') {
          if (upstreamActive() || state.status === 'committed') throw fail('Cannot release a committed migration')
          const { unlink } = await import('node:fs/promises'); await unlink(marker)
        } else await atomicJson(marker, { ...state, status: 'committed' })
      })
      sendJson(response, 200, { success: true })
    } else throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND' })
    return true
  }
  return { handle, protect, assertWritable, prepare, readState }
}
