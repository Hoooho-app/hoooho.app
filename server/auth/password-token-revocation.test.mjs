import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthService } from './auth-service.mjs'
import { BrowserSessionService } from './browser-session-service.mjs'
import { TokenService } from './token-service.mjs'
import { authApiPlugin } from './vite-auth-plugin.mjs'
import { accountApiPlugin } from '../account/vite-account-plugin.mjs'
import { careHandoffApiPlugin } from '../care-handoff/api.mjs'
import { opsApiPlugin } from '../ops/vite-ops-plugin.mjs'
import { careJourneyApiPlugin } from '../care-journey/api.mjs'
import { careToolsApiPlugin } from '../care-tools/api.mjs'
import { familySharingApiPlugin } from '../family-sharing/api.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const secret = 'synthetic-revocation-secret'

// Tokens without a revision model deployed credentials issued before this fix.
const legacyPayload = (tokens, user) => tokens.verify(tokens.create({ id: user.id, ...(user.guest ? { guest: true } : {}) }))

test('credential revisions invalidate changed hashes without breaking unchanged legacy and passwordless users', () => {
  const tokens = new TokenService(secret, 60000)
  const user = { id: 'account', passwordHash: 'hoooho-sha256-bcrypt-v1:synthetic-hash-a' }
  const payload = tokens.verify(tokens.create(user))
  assert.match(payload.credentialRevision, /^[a-f0-9]{64}$/)
  assert.equal(tokens.isCurrentForUser(payload, user), true)
  assert.equal(tokens.isCurrentForUser(payload, { ...user, passwordHash: 'hoooho-sha256-bcrypt-v1:synthetic-hash-b' }), false)
  assert.equal(tokens.isCurrentForUser(payload, { ...user, id: 'other' }), false)
  assert.equal(JSON.stringify(payload).includes(user.passwordHash), false)
  for (const revision of [null, {}, [], 'bad', 'a'.repeat(64)]) assert.equal(tokens.isCurrentForUser({ ...payload, credentialRevision: revision }, user), false)
  assert.equal(tokens.isCurrentForUser(legacyPayload(tokens, user), user), false)
  const oldUser = { id: 'legacy', passwordHash: '$2b$12$legacy-format' }
  const old = legacyPayload(tokens, oldUser)
  assert.equal(tokens.isCurrentForUser(old, oldUser), true)
  assert.equal(tokens.isCurrentForUser(old, { ...oldUser, passwordChangedAt: new Date().toISOString() }), false)
  const emailOnly = { id: 'email-only', email: 'synthetic@example.test' }
  assert.equal(tokens.isCurrentForUser(legacyPayload(tokens, emailOnly), emailOnly), true)
  const guest = { id: 'guest:synthetic', guest: true }
  assert.equal(tokens.isCurrentForUser(legacyPayload(tokens, guest), guest), true)
  assert.equal(tokens.isCurrentForUser(legacyPayload(tokens, guest), { ...guest, guest: false, passwordHash: user.passwordHash }), false)
  const proof = tokens.create({ id: user.id, purpose: 'delete-account' })
  assert.equal(tokens.verify(proof).purpose, 'delete-account')
  assert.equal(tokens.isCurrentForUser(tokens.verify(proof), { id: user.id }), false)
})

test('legacy restore refuses pre-reset credentials and keeps passwordless and guest migration available', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-token-restore-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const auth = new AuthService({ dataDirectory: directory, tokenSecret: secret, logger() {} })
  const browser = new BrowserSessionService(auth)
  const request = { method: 'GET', headers: {}, socket: {} }, response = { setHeader() {} }
  const account = await auth.register('撤销恢复', 'old-password', randomUUID())
  await auth.setPassword(account.user.id, { currentPassword: 'old-password', password: 'new-password' })
  assert.equal((await browser.restore(request, response, account.token)).unauthenticated, true)
  const current = await auth.loginWithPassword(account.user.nickname, 'new-password')
  assert.equal((await browser.restore(request, response, current.token)).user.id, account.user.id)
  const emailOnly = await auth.users.findOrCreateByEmail('passwordless@example.test')
  assert.equal((await browser.restore(request, response, auth.tokens.create(emailOnly))).user.id, emailOnly.id)
  const guestId = 'guest:' + randomUUID(), guestToken = auth.tokens.create({ id: guestId, guest: true })
  assert.equal((await browser.restore(request, response, guestToken)).user.id, guestId)
  await auth.register('访客升级', 'guest-password', randomUUID(), guestId)
  assert.equal((await browser.restore(request, response, guestToken)).unauthenticated, true)
})

async function check(base) {
  async function request(route, method, body, token, cookie) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const registered = await request('/api/auth/register', 'POST', { nickname: '令牌撤销', password: 'old-password', idempotencyKey: randomUUID() })
  assert.equal(registered.status, 200)
  const old = registered.body.token, cookie = registered.cookie
  const careRoutes = ['/api/care-journey/entitlements', '/api/care-tools/medication-templates', '/api/family-sharing']
  for (const route of careRoutes) assert.equal((await request(route, 'GET', null, old, cookie)).status, 200, `valid actor ${route}`)
  const other = await request('/api/auth/register', 'POST', { nickname: '其他令牌账号', password: 'other-password', idempotencyKey: randomUUID() })
  assert.equal(other.status, 200)
  for (const route of careRoutes) assert.equal((await request(route, 'GET', null, old, other.cookie)).status, 401, `mismatched cookie ${route}`)
  assert.equal((await request('/api/family-sharing/spaces', 'POST', { confirmShare: true }, old, other.cookie)).status, 401)
  assert.equal((await request('/api/family-sharing', 'GET', null, other.body.token, other.cookie)).body.spaces.length, 0)
  assert.equal((await request('/api/account/profile', 'GET', null, old)).status, 200)
  const handoffBefore = await request('/api/members/missing/care-handoff', 'GET', null, old)
  assert.equal(handoffBefore.status, 404)
  assert.equal((await request('/api/ops/session', 'GET', null, old)).status, 403)
  assert.equal((await request('/api/account/password', 'POST', { currentPassword: 'old-password', password: 'new-password' }, old, cookie)).status, 200)
  assert.equal((await request('/api/account/profile', 'GET', null, old)).status, 401)
  assert.equal((await request('/api/account/profile', 'PATCH', { nickname: '不能写入' }, old)).status, 401)
  assert.equal((await request('/api/members/missing/care-handoff', 'GET', null, old)).status, 401)
  assert.equal((await request('/api/ops/session', 'GET', null, old)).status, 401)
  const restored = await request('/api/auth/session', 'GET', null, old, cookie)
  assert.equal(restored.body.unauthenticated, true)
  // Public sharing and authentication must remain reachable with a stale header.
  assert.equal((await request('/api/care-handoffs/shared/missing', 'GET', null, old)).status, 404)
  const opsSend = await request('/api/ops/auth/email/send', 'POST', { email: 'not-owner@example.test' }, old)
  assert.equal(opsSend.status, 200)
  assert.equal((await request('/api/auth/nickname/login', 'POST', { nickname: '令牌撤销', password: 'old-password' }, old)).status, 401)
  const loggedIn = await request('/api/auth/nickname/login', 'POST', { nickname: '令牌撤销', password: 'new-password' }, old)
  assert.equal(loggedIn.status, 200)
  const current = await request('/api/account/profile', 'GET', null, loggedIn.body.token)
  assert.equal(current.status, 200)
  assert.equal(current.body.nickname, '令牌撤销')
  for (const route of careRoutes) {
    assert.equal((await request(route, 'GET', null, old, loggedIn.cookie)).status, 401, `stale bearer with fresh same-account cookie ${route}`)
    assert.equal((await request(route, 'GET', null, loggedIn.body.token, loggedIn.cookie)).status, 200, `fresh bearer ${route}`)
  }
}

async function nativeVite(t, directory) {
  const handlers = [], options = { dataDirectory: directory, tokenSecret: secret, logger() {}, opsOwnerEmail: 'owner@example.test', emailProvider: { async sendVerificationCode() { throw new Error('No email delivery in this test') } } }
  const serverApi = { middlewares: { use: handler => handlers.push(handler) }, config: { logger: { error() {} } } }
  for (const plugin of [authApiPlugin(options), careJourneyApiPlugin(options), familySharingApiPlugin(options), careToolsApiPlugin(options), careHandoffApiPlugin(options), accountApiPlugin(options), opsApiPlugin(options)]) plugin.configureServer(serverApi)
  const server = createServer((request, response) => {
    let index = 0
    const next = () => {
      const handler = handlers[index++]
      if (!handler) { response.statusCode = 404; response.end('{}'); return }
      Promise.resolve(handler(request, response, next)).catch(error => { response.statusCode = 500; response.end(JSON.stringify({ error: { code: error.code ?? 'INTERNAL_ERROR' } })) })
    }
    next()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

async function production(t, directory) {
  const bootstrap = `import {Server} from 'node:net';const listen=Server.prototype.listen;Server.prototype.listen=function(...args){this.once('listening',()=>process.stdout.write('REVOCATION_PORT='+this.address().port+'\\n'));return listen.apply(this,args)};globalThis.fetch=async()=>{throw new Error('No external fetch in this test')};await import('./server/app.mjs');`
  const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], { cwd: root, env: { PATH: process.env.PATH, TZ: 'Asia/Shanghai', NODE_ENV: 'production', AUTH_TOKEN_SECRET: secret, OPS_OWNER_EMAIL: 'owner@example.test', DATA_DIRECTORY: directory, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let messages = ''
  child.stdout.on('data', data => { messages += data })
  child.stderr.on('data', data => { messages += data })
  t.after(async () => {
    if (child.exitCode !== null) return
    await new Promise(resolve => { const timer = setTimeout(() => child.kill('SIGKILL'), 3000); child.once('exit', () => { clearTimeout(timer); resolve() }); child.kill('SIGTERM') })
  })
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Production dispatcher did not start')), 10000)
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Production dispatcher exited before listening')) })
    child.stdout.on('data', () => { const found = /REVOCATION_PORT=(\d+)/.exec(messages); if (found) { clearTimeout(timer); resolve(found[1]) } })
  })
  return `http://127.0.0.1:${port}`
}

for (const [name, start] of [['Vite full auth gate', nativeVite], ['production dispatcher', production]]) {
  test(`${name} rejects a pre-reset bearer for reads/writes while fresh login and public routes work`, { timeout: 30000 }, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-revocation-http-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    await check(await start(t, directory))
  })
}
