import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AuthService } from '../auth/auth-service.mjs'
import { FamilyWorkspaceService } from './service.mjs'
import { createFamilyWorkspaceApi, familyCookie } from './api.mjs'
import { emptyFinanceData } from '../../shared/family-finance.mjs'
import { FAMILY_WORKSPACE_PATH } from '../../shared/family-workspace.mjs'

test('HTTP family login enforces origin, role, cookie settings, revocation and expiry', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'family-http-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let now = Date.now()
  const options = { dataDirectory: directory, tokenSecret: 'http-test-only-secret', opsOwnerEmail: 'ray@example.test', codeGenerator: () => '123456', emailProvider: { sendVerificationCode: async () => {} }, logger: () => {} }
  const auth = new AuthService(options), service = new FamilyWorkspaceService({ ...options, auth, now: () => now })
  const readJson = async request => { let text = ''; for await (const part of request) text += part; return JSON.parse(text) }
  const sendJson = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)) }
  const handle = createFamilyWorkspaceApi(service, { readJson, sendJson })
  const server = createServer(async (request, response) => {
    try { if (!await handle(request, response, new URL(request.url, 'http://localhost').pathname)) sendJson(response, 404, {}) }
    catch (error) { sendJson(response, error.status || 500, { error: { message: error.message, code: error.code } }) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const origin = `http://127.0.0.1:${server.address().port}`
  const request = async (route, input, cookie = '', headers = {}) => fetch(`${origin}${FAMILY_WORKSPACE_PATH}/api${route}`, { method: input === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Hoooho-Family': '1', Origin: origin, Cookie: cookie, ...headers }, body: input === undefined ? undefined : JSON.stringify(input) })
  assert.deepEqual(await (await request('/session')).json(), { authenticated: false })
  assert.equal((await request('/codes')).status, 401)
  assert.equal((await request('/admin/send-code', { email: 'ray@example.test' }, '', { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await request('/admin/send-code', { email: 'ray@example.test' }, '', { 'X-Hoooho-Family': '' })).status, 403)
  assert.equal((await request('/admin/send-code', { email: 'ray@example.test' })).status, 200)
  const adminResponse = await request('/admin/login', { email: 'ray@example.test', code: '123456', remember: true })
  assert.equal(adminResponse.status, 200)
  const setCookie = adminResponse.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly; SameSite=Strict/)
  assert.match(setCookie, /Max-Age=2592000/)
  assert.match(setCookie, /Path=\/family-ray-home-life-workspace/)
  assert.equal((await adminResponse.json()).role, 'admin')
  const ownerCookie = setCookie.split(';')[0]
  const codeResponse = await request('/codes', { label: '妈妈' }, ownerCookie)
  assert.equal(codeResponse.status, 201)
  const code = await codeResponse.json()
  const memberResponse = await request('/member/login', { code: code.loginCode, remember: false, role: 'admin' })
  assert.equal(memberResponse.status, 200)
  assert.equal((await memberResponse.json()).role, 'member')
  assert.doesNotMatch(memberResponse.headers.get('set-cookie'), /Max-Age/)
  const memberCookie = memberResponse.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/finance')).status, 401)
  assert.equal((await request('/finance', undefined, memberCookie)).status, 200)
  const finance = { revision: 0, data: emptyFinanceData() }
  assert.equal((await request('/finance', finance, memberCookie)).status, 403)
  assert.equal((await request('/finance', finance, ownerCookie, { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await request('/finance', finance, ownerCookie)).status, 200)
  assert.equal((await request('/finance', finance, ownerCookie)).status, 409)
  const financeResponse = await request('/finance', undefined, memberCookie)
  assert.match(financeResponse.headers.get('cache-control'), /no-store/)
  assert.equal((await financeResponse.json()).revision, 1)
  assert.equal((await request('/codes', undefined, memberCookie)).status, 403)
  assert.equal((await request('/codes', { label: '越权' }, memberCookie)).status, 403)
  assert.deepEqual(await (await request('/session', undefined, `${ownerCookie}; ${memberCookie}`)).json(), { authenticated: false })
  assert.equal((await request(`/codes/${code.id}/revoke`, {}, ownerCookie)).status, 200)
  assert.deepEqual(await (await request('/session', undefined, memberCookie)).json(), { authenticated: false })
  assert.equal((await request('/finance', undefined, memberCookie)).status, 401)
  const code2 = await (await request('/codes', { label: '爸爸' }, ownerCookie)).json()
  now += 29 * 24 * 60 * 60 * 1000
  const remembered = await request('/member/login', { code: code2.loginCode, remember: true })
  assert.match(remembered.headers.get('set-cookie'), /Max-Age=86400/)
  const rememberedCookie = remembered.headers.get('set-cookie').split(';')[0]
  now += 24 * 60 * 60 * 1000
  assert.deepEqual(await (await request('/session', undefined, rememberedCookie)).json(), { authenticated: false })
  const secure = familyCookie({ headers: { host: 'hoooho.com', 'x-forwarded-proto': 'https' } }, 'opaque', 60)
  assert.match(secure, /; Secure; Max-Age=60$/)
})
