import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createQingganGateway, QINGGAN_PATH, QINGGAN_ENTRY_PATH } from './gateway.mjs'

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)))
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })

test('dedicated prefix, redirect, unavailable state and unrelated route isolation', async () => {
  const gateway = createQingganGateway()
  const server = http.createServer(async (req, res) => { if (!await gateway(req, res)) { res.writeHead(418); res.end('health unchanged') } })
  const origin = await listen(server)
  try {
    for (const path of [QINGGAN_PATH, QINGGAN_PATH + '/', QINGGAN_ENTRY_PATH]) {
      const redirect = await fetch(origin + path + '?share=test', { redirect: 'manual' })
      assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), `${QINGGAN_ENTRY_PATH}/?share=test`)
    }
    assert.equal((await fetch(origin + QINGGAN_ENTRY_PATH + '/')).status, 503)
    for (const path of ['/', '/api/auth/session', '/family-ray-home-life-workspace', QINGGAN_PATH + '-other', QINGGAN_ENTRY_PATH + '-other']) assert.equal((await fetch(origin + path)).status, 418)
  } finally { await close(server) }
})
test('proxy strips prefix, never forwards health cookies or identity, and drops upstream cookies', async () => {
  const upstream = http.createServer((req, res) => {
    assert.equal(req.url, '/api/records?view=one'); assert.equal(req.headers.authorization, 'Bearer separate-owner')
    assert.equal(req.headers.cookie, undefined); assert.equal(req.headers['x-hoooho-user-id'], undefined)
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Set-Cookie', 'unsafe=true'); res.end('{"records":[]}')
  })
  const upstreamOrigin = await listen(upstream)
  const gateway = createQingganGateway({ upstream: upstreamOrigin, allowHttp: true })
  const server = http.createServer((req, res) => gateway(req, res))
  const origin = await listen(server)
  try {
    for (const prefix of [QINGGAN_PATH, QINGGAN_ENTRY_PATH]) {
      const res = await fetch(origin + prefix + '/api/records?view=one', { headers: { Authorization: 'Bearer separate-owner', Cookie: 'health=private; family=private', 'x-hoooho-user-id': 'health-owner' } })
      assert.equal(res.status, 200); assert.deepEqual(await res.json(), { records: [] }); assert.equal(res.headers.get('set-cookie'), null)
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    }
  } finally { await close(server); await close(upstream) }
})
test('upstream rejects credentials, nested paths and insecure remote origins', () => {
  for (const upstream of ['https://user:pass@example.com', 'https://example.com/nested', 'http://example.com']) assert.throws(() => createQingganGateway({upstream}))
})
test('document and relative assets reach the independent app through the legacy-worker-safe entry', async () => {
  // This rule already ships in old health workers; adding a new exclusion only
  // to the latest worker cannot fix an existing installation immediately.
  const legacyNavigationDenylist = [/^\/api\//, /^\/family-ray-home-life-workspace(?:\/|$)/, /^\/_internal\//]
  assert.ok(legacyNavigationDenylist.some(rule => rule.test(QINGGAN_ENTRY_PATH + '/')))
  const seen = []
  const upstream = http.createServer((req, res) => { seen.push(req.url); res.setHeader('Content-Type', req.url === '/' ? 'text/html' : 'text/javascript'); res.end(req.url === '/' ? '<title>情感记愁诗</title><script src="./app.js"></script>' : '/* own app */') })
  const upstreamOrigin = await listen(upstream)
  const gateway = createQingganGateway({upstream:upstreamOrigin,allowHttp:true})
  const server = http.createServer(async (req, res) => {if (!await gateway(req,res)) {res.writeHead(404);res.end()}})
  const origin = await listen(server)
  try {
    const document = await fetch(origin + QINGGAN_ENTRY_PATH + '/')
    assert.match(await document.text(), /情感记愁诗/)
    assert.equal((await fetch(new URL('./app.js', origin + QINGGAN_ENTRY_PATH + '/'))).status,200)
    assert.deepEqual(seen,['/','/app.js'])
  } finally {await close(server);await close(upstream)}
})
