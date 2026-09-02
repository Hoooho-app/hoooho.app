import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { authApiPlugin } from '../auth/vite-auth-plugin.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { feedbackApiPlugin } from '../help/vite-feedback-plugin.mjs'
import { opsApiPlugin } from './vite-ops-plugin.mjs'

const ownerEmail = 'wenxiaodaoray@gmail.com'
const tokenSecret = 'ops-api-test-secret'
const json = (url, method = 'GET', token, body) => fetch(url, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
})

test('all Operations APIs share the same owner-only authorization', async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-ops-auth-api-'))
  const deliveries = []
  const previousOwner = process.env.OPS_OWNER_EMAIL
  process.env.OPS_OWNER_EMAIL = ownerEmail
  const shared = { dataDirectory, tokenSecret, opsOwnerEmail: ownerEmail }
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      authApiPlugin({ ...shared, codeGenerator: () => '123456', logger: () => undefined, emailProvider: { sendVerificationCode: async (input) => deliveries.push(input) } }),
      feedbackApiPlugin(shared),
      opsApiPlugin(shared)
    ]
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`

    const decoySend = await json(`${base}/api/ops/auth/email/send`, 'POST', null, { email: 'ordinary@example.com' })
    assert.equal(decoySend.status, 200)
    assert.equal(deliveries.length, 0)

    assert.equal((await json(`${base}/api/ops/auth/email/send`, 'POST', null, { email: ` ${ownerEmail.toUpperCase()} ` })).status, 200)
    assert.equal(deliveries.length, 1)
    const verify = await json(`${base}/api/ops/auth/email/verify`, 'POST', null, { email: ownerEmail, code: '123456' })
    assert.equal(verify.status, 200)
    const ownerSession = await verify.json()

    await json(`${base}/api/auth/email/send-code`, 'POST', null, { email: 'ordinary@example.com' })
    const ordinaryLogin = await json(`${base}/api/auth/email/login`, 'POST', null, { email: 'ordinary@example.com', code: '123456' })
    const ordinarySession = await ordinaryLogin.json()
    const createdFeedbackResponse = await json(`${base}/api/feedback`, 'POST', ordinarySession.token, {
      category: '出现错误', problemPage: '登录与账户', problemType: 'login_issue', description: '测试运营权限边界', sourcePath: '/login', sourceName: '登录', appVersion: 'test', device: { type: 'desktop', os: 'test', browser: 'test', screen: '1280x720' }, idempotencyKey: 'ops-auth-api-feedback', attachments: []
    })
    assert.equal(createdFeedbackResponse.status, 201)
    const createdFeedback = await createdFeedbackResponse.json()

    const protectedRequests = [
      ['/api/ops/session', 'GET'], ['/api/ops/resources', 'GET'], ['/api/ops/resources', 'POST', { name: 'Test', category: 'other', criticality: 'P2' }],
      ['/api/ops/resources/railway', 'PATCH', { notes: 'test' }], ['/api/ops/sync', 'POST'], ['/api/ops/feedback', 'GET'],
      [`/api/ops/feedback/${createdFeedback.id}`, 'GET'], [`/api/ops/feedback/${createdFeedback.id}`, 'PATCH', { status: 'reviewing' }],
      [`/api/ops/feedback/${createdFeedback.id}/messages`, 'POST', { kind: 'internal-note', text: '权限边界测试' }]
    ]
    for (const [route, method, body] of protectedRequests) {
      const forbidden = await json(`${base}${route}`, method, ordinarySession.token, body)
      assert.equal(forbidden.status, 403, `${method} ${route} must reject ordinary users`)
      assert.equal(forbidden.headers.get('cache-control'), 'no-store')
      const allowed = await json(`${base}${route}`, method, ownerSession.token, body)
      assert.ok([200, 201].includes(allowed.status), `${method} ${route} must allow the owner`)
      assert.equal(allowed.headers.get('cache-control'), 'no-store')
    }

    const tokens = new TokenService(tokenSecret, 1)
    const expired = tokens.create({ id: 'expired-owner', email: ownerEmail }, 1)
    assert.equal((await json(`${base}/api/ops/resources`, 'GET', expired)).status, 401)
    assert.equal((await json(`${base}/api/ops/resources`, 'GET', `${ownerSession.token}tampered`)).status, 401)

  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
    if (previousOwner === undefined) delete process.env.OPS_OWNER_EMAIL; else process.env.OPS_OWNER_EMAIL = previousOwner
  }
})

test('Operations API fails closed when the owner setting is absent', async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-ops-unconfigured-'))
  const tokens = new TokenService(tokenSecret, 60_000)
  const token = tokens.create({ id: 'owner', email: ownerEmail })
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [opsApiPlugin({ dataDirectory, tokens, opsOwnerEmail: '' })]
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object')
    const response = await json(`http://127.0.0.1:${address.port}/api/ops/resources`, 'GET', token)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await response.json()).error.code, 'OPS_OWNER_NOT_CONFIGURED')
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
