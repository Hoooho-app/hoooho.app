import assert from 'node:assert/strict'
import test from 'node:test'
import { getCanonicalDomainRedirect } from './domain-routing.mjs'
import { legacyDomainServiceWorker, serveLegacyDomainServiceWorker } from './legacy-domain-service-worker.mjs'

function request(host, url = '/sw.js', method = 'GET') {
  const req = { headers: { host }, url, method }
  const headers = new Map()
  const res = { setHeader: (key, value) => headers.set(key, value), end(body) { this.body = body } }
  return { served: serveLegacyDomainServiceWorker(req, res, getCanonicalDomainRedirect(req)), headers, res }
}

test('retired www worker is JavaScript 200 without a redirect, including update queries', () => {
  const { served, headers, res } = request('www.hoooho.com', '/sw.js?update=1')
  assert.equal(served, true)
  assert.equal(res.statusCode, 200)
  assert.match(headers.get('Content-Type'), /application\/javascript/)
  assert.match(headers.get('Cache-Control'), /no-store/)
  assert.equal(headers.get('Service-Worker-Allowed'), '/')
  assert.equal(headers.has('Location'), false)
  assert.equal(res.body, legacyDomainServiceWorker)
})

test('canonical and staging workers, non-worker paths and unsafe methods are untouched', () => {
  for (const host of ['hoooho.com', 'hooohoapp-staging.up.railway.app']) assert.equal(request(host).served, false)
  for (const url of ['/login', '/assets/sw.js', '/api/auth/session']) assert.equal(request('www.hoooho.com', url).served, false)
  assert.equal(request('www.hoooho.com', '/sw.js', 'POST').served, false)
  assert.equal(request('www.hoooho.com', '/sw.js', 'HEAD').res.body, undefined)
})

test('retirement never clears cookies, local storage, caches or business data', () => {
  assert.doesNotMatch(legacyDomainServiceWorker, /Clear-Site-Data|localStorage|indexedDB|caches\.|document\.cookie/)
  assert.match(legacyDomainServiceWorker, /registration\.unregister/)
  assert.doesNotMatch(legacyDomainServiceWorker, /addEventListener\(['"]fetch/)
})
