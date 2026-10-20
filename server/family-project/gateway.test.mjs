import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createFamilyGateway, FAMILY_PATH } from './gateway.mjs'

async function listen(t, handler) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  return `http://127.0.0.1:${server.address().port}`
}
test('gateway forwards only family path, credential and allowed headers; health tokens never reach the independent app', async t => {
  let received
  const target = await listen(t, async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    received = { url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() }
    response.setHeader('Set-Cookie', ['hoooho_family_session=family2; Path=/family-ray-home-life-workspace; HttpOnly; SameSite=Strict', 'health=forbidden; Path=/', 'hoooho_family_session=forbidden; Path=/family-ray-home-life-workspace; Domain=hoooho.com'])
    response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
  })
  const gateway = createFamilyGateway({ upstream: target, token: 'isolated-family-gateway-secret-32plus', allowHttp: true })
  const source = await listen(t, async (request, response) => { if (!await gateway(request, response)) response.writeHead(404).end() })
  const response = await fetch(`${source}${FAMILY_PATH}/api/finance?q=1`, { method: 'POST', headers: { Cookie: 'health_session=health-secret; hoooho_family_session=family1; __Host-auth=health2', Authorization: 'Bearer health-token', 'x-family-gateway-token': 'client-forged', 'Content-Type': 'application/json', 'x-hoooho-family': '1', Origin: source }, body: '{"revision":0}' })
  assert.equal(response.status, 200)
  assert.equal(received.url, `${FAMILY_PATH}/api/finance?q=1`)
  assert.equal(received.headers.cookie, 'hoooho_family_session=family1')
  assert.equal(received.headers.authorization, undefined)
  assert.equal(received.headers['x-family-gateway-token'], 'isolated-family-gateway-secret-32plus')
  assert.equal(received.headers.origin, source)
  assert.equal(received.body, '{"revision":0}')
  assert.equal(response.headers.getSetCookie().length, 1)
  assert.equal((await fetch(`${source}/api/health`)).status, 404)
  assert.equal((await fetch(`${source}${FAMILY_PATH}-other/api`)).status, 404)
})
test('gateway refuses unsafe configuration and returns unavailable without falling back to mixed data', async t => {
  for (const upstream of ['http://external.example', 'https://user:secret@example.test', 'https://example.test/prefix']) assert.throws(() => createFamilyGateway({ upstream, token: 'test'.repeat(10) }))
  const gateway = createFamilyGateway({ upstream: 'http://127.0.0.1:1', token: 'test'.repeat(10), allowHttp: true })
  const source = await listen(t, (request, response) => gateway(request, response))
  const result = await fetch(`${source}${FAMILY_PATH}/api/finance`)
  assert.equal(result.status, 502)
  assert.equal((await result.json()).error.code, 'FAMILY_UPSTREAM_UNAVAILABLE')
})
