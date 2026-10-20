import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { FamilyWorkspaceService } from './service.mjs'
import { createFamilyWorkspaceApi, FAMILY_COOKIE } from './api.mjs'
import { emptyFinanceData, assetCategories, assetExpiry } from '../../shared/family-finance.mjs'
import { FAMILY_WORKSPACE_PATH } from '../../shared/family-workspace.mjs'

const pixels = await sharp({ create: { width: 240, height: 160, channels: 3, background: '#e9eded' } }).png().toBuffer()
const picture = (name = '银行卡正面.png') => ({ name, mimeType: 'image/png', dataUrl: `data:image/png;base64,${pixels.toString('base64')}` })
async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'family-asset-test-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const options = { dataDirectory, tokenSecret: 'isolated-asset-tests', auth: { opsOwnerEmail: () => 'ray@example.test' }, now: () => Date.UTC(2026, 9, 20) }
  const workspace = new FamilyWorkspaceService(options)
  const admin = await workspace.createSession({ role: 'admin', name: 'Ray', email: 'ray@example.test' }, true)
  const code = await workspace.createCode(admin.raw, '妈妈'), member = await workspace.memberLogin(code.loginCode, true, 'test')
  const asset = { id: randomUUID(), name: '测试银行卡', category: 'cash', owner: '家庭共同', amount: 200, valuedAt: '2026-10-20', available: true, emergency: false, note: '' }
  const data = emptyFinanceData(); data.assets = [asset]
  await workspace.finance.save(admin.raw, { revision: 0, data })
  return { workspace, files: workspace.finance.attachments, admin, member, code, asset, options }
}
const mockModel = handler => ({ structured: handler ?? (async () => ({ value: { text: '测试银行卡\n有效期 10/28\n[不清楚]', status: 'uncertain' } })) })

test('all asset categories accept multiple original photos without invoking recognition; restart and financial edits retain them', async t => {
  const f = await fixture(t)
  f.files.model = mockModel(() => { throw new Error('upload must never invoke AI') })
  let saved = await f.workspace.finance.read(f.admin.raw)
  for (const category of Object.keys(assetCategories)) {
    const row = { ...f.asset, id: randomUUID(), category, available: false }
    const data = structuredClone(saved.data); data.assets.push(row)
    saved = await f.workspace.finance.save(f.admin.raw, { revision: saved.revision, data })
    saved = await f.files.upload(f.admin.raw, row.id, picture())
  }
  saved = await f.files.upload(f.admin.raw, f.asset.id, picture())
  saved = await f.files.upload(f.admin.raw, f.asset.id, picture('银行卡背面.png'))
  assert.equal(saved.attachments.filter(file => file.assetId === f.asset.id).length, 2)
  assert.ok(saved.attachments.every(file => !file.analysis))
  const original = saved.attachments.at(-1)
  assert.deepEqual((await f.files.read(f.member.raw, f.asset.id, original.id, 'original')).buffer, pixels)
  assert.equal((await f.files.read(f.member.raw, f.asset.id, original.id, 'preview')).mimeType, 'image/webp')
  const restarted = new FamilyWorkspaceService(f.options)
  assert.deepEqual((await restarted.finance.read(f.member.raw)).attachments, saved.attachments)
  const data = structuredClone(saved.data); data.assets[0].amount = 300
  const edited = await restarted.finance.save(f.admin.raw, { revision: saved.revision, data, attachments: [] })
  assert.deepEqual(edited.attachments, saved.attachments)
  await assert.rejects(f.workspace.finance.save(f.admin.raw, { revision: saved.revision, data }), { status: 409 })
  await assert.rejects(f.files.upload(f.member.raw, f.asset.id, picture()), { status: 403 })
  await assert.rejects(f.files.remove(f.member.raw, f.asset.id, original.id), { status: 403 })
  await assert.rejects(f.files.read('', f.asset.id, original.id, 'original'), { status: 401 })
})

test('manual recognition deduplicates concurrent clicks, persists text separately, and permits family downloads without changing asset fields', async t => {
  const f = await fixture(t)
  let calls = 0
  f.files.model = mockModel(async request => { calls++; assert.equal(request.vision, true); return { value: { text: '测试卡\n有效期 10/28', status: 'readable' } } })
  const uploaded = await f.files.upload(f.admin.raw, f.asset.id, picture()), file = uploaded.attachments[0]
  assert.equal(calls, 0)
  const parsed = await Promise.all([f.files.parse(f.member.raw, f.asset.id, file.id), f.files.parse(f.admin.raw, f.asset.id, file.id)])
  assert.equal(calls, 1)
  assert.deepEqual(parsed[0].data, uploaded.data)
  assert.equal(parsed[0].attachments[0].analysis.text, '测试卡\n有效期 10/28')
  await f.files.parse(f.admin.raw, f.asset.id, file.id)
  assert.equal(calls, 1)
  const restarted = new FamilyWorkspaceService(f.options)
  const text = await restarted.finance.attachments.read(f.member.raw, f.asset.id, file.id, 'text')
  assert.match(text.name, /解析\.txt$/); assert.equal(text.buffer.toString('utf8'), '\uFEFF测试卡\n有效期 10/28')
  await assert.rejects(f.files.read(f.member.raw, randomUUID(), file.id, 'original'), { status: 404 })
  await f.workspace.revokeCode(f.admin.raw, f.code.id)
  await assert.rejects(f.files.read(f.member.raw, f.asset.id, file.id, 'original'), { status: 401 })
  await assert.rejects(f.files.parse(f.member.raw, f.asset.id, file.id), { status: 401 })
})

test('recognition failure can retry; deletion or access revocation during recognition cannot resurrect or disclose a file', async t => {
  const f = await fixture(t)
  const uploaded = await f.files.upload(f.admin.raw, f.asset.id, picture()), file = uploaded.attachments[0]
  f.files.model = mockModel(async () => { throw new Error('private upstream payload') })
  await assert.rejects(f.files.parse(f.member.raw, f.asset.id, file.id), error => error.status === 503 && !error.message.includes('private'))
  assert.deepEqual((await f.files.read(f.admin.raw, f.asset.id, file.id, 'original')).buffer, pixels)
  assert.equal((await f.workspace.finance.read(f.admin.raw)).attachments[0].analysis, undefined)
  f.files.model = mockModel()
  assert.equal((await f.files.parse(f.member.raw, f.asset.id, file.id)).attachments[0].analysis.status, 'uncertain')
  let release, started
  const start = new Promise(resolve => { started = resolve }), wait = new Promise(resolve => { release = resolve })
  const next = await f.files.upload(f.admin.raw, f.asset.id, picture('待解析.png')), nextFile = next.attachments.at(-1)
  f.files.model = mockModel(async () => { started(); await wait; return { value: { text: '不应保存', status: 'readable' } } })
  const parsing = f.files.parse(f.member.raw, f.asset.id, nextFile.id)
  await start
  await f.files.remove(f.admin.raw, f.asset.id, nextFile.id)
  release()
  await assert.rejects(parsing, { status: 404 })
  await assert.rejects(readFile(f.files.filePath(nextFile)), { code: 'ENOENT' })
  const last = await f.files.upload(f.admin.raw, f.asset.id, picture('撤销时解析.png')), lastFile = last.attachments.at(-1)
  let releaseRevoked, startedRevoked
  const revStart = new Promise(resolve => { startedRevoked = resolve }), revWait = new Promise(resolve => { releaseRevoked = resolve })
  f.files.model = mockModel(async () => { startedRevoked(); await revWait; return { value: { text: '不应保存', status: 'readable' } } })
  const revokedParse = f.files.parse(f.member.raw, f.asset.id, lastFile.id)
  await revStart; await f.workspace.revokeCode(f.admin.raw, f.code.id); releaseRevoked()
  await assert.rejects(revokedParse, { status: 401 })
  assert.equal((await f.workspace.finance.read(f.admin.raw)).attachments.at(-1).analysis, undefined)
})

test('invalid uploads are rejected; file count is bounded; removing an asset removes its originals and metadata', async t => {
  const f = await fixture(t)
  for (const bad of [{ ...picture(), name: '../escape.png' }, { ...picture(), mimeType: 'image/svg+xml' }, { ...picture(), mimeType: 'image/jpeg', dataUrl: picture().dataUrl.replace('image/png', 'image/jpeg') }, { ...picture(), dataUrl: 'data:image/png;base64,not-a-real-image' }, { ...picture(), dataUrl: `data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')}` }]) await assert.rejects(f.files.upload(f.admin.raw, f.asset.id, bad), error => error.status >= 400 && error.status < 500)
  let saved
  for (let index = 0; index < 20; index++) saved = await f.files.upload(f.admin.raw, f.asset.id, picture(`${index}.png`))
  await assert.rejects(f.files.upload(f.admin.raw, f.asset.id, picture()), /最多保存 20/)
  const data = structuredClone(saved.data); data.assets = []
  const removed = await f.workspace.finance.save(f.admin.raw, { revision: saved.revision, data })
  assert.deepEqual(removed.attachments, [])
  for (const file of saved.attachments) await assert.rejects(readFile(f.files.filePath(file)), { code: 'ENOENT' })
})

test('asset dates validate server-side, preserve month precision and older-client saves, and calculate end-of-month and due states in China dates', async t => {
  const f = await fixture(t)
  let snapshot = await f.workspace.finance.read(f.admin.raw)
  const data = structuredClone(snapshot.data)
  Object.assign(data.assets[0], { startDate: '2026-01-20', endDate: '2028-02', endDatePrecision: 'month', remindDays: 30 })
  snapshot = await f.workspace.finance.save(f.admin.raw, { revision: snapshot.revision, data })
  assert.equal(assetExpiry(snapshot.data.assets[0], '2028-02-28').date, '2028-02-29')
  assert.equal(assetExpiry(snapshot.data.assets[0], '2028-02-28').days, 1)
  assert.equal(assetExpiry(snapshot.data.assets[0], '2028-02-29').label, '今天到期')
  assert.equal(assetExpiry(snapshot.data.assets[0], '2028-03-01').state, 'expired')
  assert.equal(assetExpiry(snapshot.data.assets[0], '2027-01-01').state, 'valid')
  const old = structuredClone(snapshot.data); for (const key of ['startDate', 'endDate', 'endDatePrecision', 'remindDays']) delete old.assets[0][key]
  const kept = await f.workspace.finance.save(f.admin.raw, { revision: snapshot.revision, data: old })
  assert.equal(kept.data.assets[0].endDate, '2028-02')
  for (const change of [{ endDate: '2026-13' }, { endDate: '2025-01' }, { endDatePrecision: 'day', endDate: '2026-02-30' }, { remindDays: -1 }, { remindDays: 366 }, { remindDays: 1.5 }]) {
    const bad = structuredClone(kept.data); Object.assign(bad.assets[0], change)
    await assert.rejects(f.workspace.finance.save(f.admin.raw, { revision: kept.revision, data: bad }), { status: 400 })
  }
})

test('HTTP attachment routes protect originals and text, enforce mutation origin, and return private downloads', async t => {
  const f = await fixture(t); f.files.model = mockModel()
  const sendJson = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
  const handle = createFamilyWorkspaceApi(f.workspace, { sendJson, readJson: async (req, max) => { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > max) throw Object.assign(new Error('too large'), { status: 413 }) }; return JSON.parse(body) } })
  const server = createServer(async (req, res) => { try { if (!await handle(req, res, new URL(req.url, 'http://localhost').pathname)) sendJson(res, 404, {}) } catch (error) { sendJson(res, error.status ?? 500, { error: { message: error.message } }) } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const origin = `http://127.0.0.1:${server.address().port}`, route = `${FAMILY_WORKSPACE_PATH}/api/finance/assets/${f.asset.id}/attachments`
  const request = (suffix, raw = f.admin.raw, input, headers = {}) => fetch(`${origin}${route}${suffix}`, { method: input === undefined ? 'GET' : 'POST', headers: { Cookie: `${FAMILY_COOKIE}=${raw}`, Origin: origin, 'Content-Type': 'application/json', 'X-Hoooho-Family': '1', ...headers }, body: input === undefined ? undefined : JSON.stringify(input) })
  assert.equal((await request('', '', picture())).status, 401)
  assert.equal((await request('', f.member.raw, picture())).status, 403)
  assert.equal((await request('', f.admin.raw, picture(), { Origin: 'https://untrusted.example' })).status, 403)
  const uploaded = await request('', f.admin.raw, picture()); assert.equal(uploaded.status, 201)
  const file = (await uploaded.json()).attachments[0]
  assert.equal((await request(`/${file.id}/original`, '')).status, 401)
  const download = await request(`/${file.id}/download`, f.member.raw)
  assert.equal(download.status, 200); assert.match(download.headers.get('cache-control'), /private, no-store/)
  assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.equal(download.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pixels)
  assert.equal((await request(`/${file.id}/parse`, f.member.raw, {})).status, 200)
  assert.match(await (await request(`/${file.id}/text`, f.member.raw)).text(), /有效期 10\/28/)
  assert.equal((await request(`/${file.id}/remove`, f.member.raw, {})).status, 403)
  assert.equal((await request(`/${file.id}/remove`, f.admin.raw, {})).status, 200)
  assert.equal((await request(`/${file.id}/download`)).status, 404)
})
