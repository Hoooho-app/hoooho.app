import assert from 'node:assert/strict'
import test from 'node:test'
import { getCanonicalDomainRedirect } from './domain-routing.mjs'

test('www 域名永久跳转到主域名并保留路径与查询参数', () => {
  assert.equal(
    getCanonicalDomainRedirect({
      headers: { host: 'www.hoooho.com' },
      url: '/health-events?member=self'
    }),
    'https://hoooho.com/health-events?member=self'
  )
})

test('Railway 原始域名与主域名不跳转', () => {
  assert.equal(getCanonicalDomainRedirect({ headers: { host: 'hoooho.com' }, url: '/' }), null)
  assert.equal(
    getCanonicalDomainRedirect({ headers: { host: 'hooohoapp-production.up.railway.app' }, url: '/' }),
    null
  )
})

test('优先读取 Railway 转发的原始 Host', () => {
  assert.equal(
    getCanonicalDomainRedirect({
      headers: {
        host: 'hooohoapp-production.up.railway.app',
        'x-forwarded-host': 'www.hoooho.com'
      },
      url: '/api/health'
    }),
    'https://hoooho.com/api/health'
  )
})
