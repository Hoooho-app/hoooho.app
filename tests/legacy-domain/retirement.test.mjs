import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { chromium, webkit, expect } from '@playwright/test'
import { serveLegacyDomainServiceWorker } from '../../server/legacy-domain-service-worker.mjs'

for (const [name, browserType] of [['Chromium', chromium], ['WebKit', webkit]]) {
  test(`${name}: old cached www page survives redirects, then retires without clearing data`, { timeout: 60_000 }, async () => {
    let phase = 'legacy'
    const canonical = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<h1>canonical-current-ui</h1>')
    })
    await new Promise(resolve => canonical.listen(0, '127.0.0.1', resolve))
    const canonicalOrigin = `http://127.0.0.1:${canonical.address().port}`
    const legacyHtml = '<h1>legacy-phone-login</h1>'
    const oldWorker = `self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => {
        if (e.request.mode === 'navigate') e.respondWith(Promise.resolve(new Response(${JSON.stringify(legacyHtml)}, {headers:{'Content-Type':'text/html'}})));
      });`
    const legacy = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (phase !== 'legacy') {
        if (phase === 'fixed' && serveLegacyDomainServiceWorker(req, res, canonicalOrigin + req.url)) return
        res.writeHead(301, { Location: canonicalOrigin + req.url }); res.end(); return
      }
      if (req.url === '/sw.js') {
        res.setHeader('Content-Type', 'application/javascript'); res.end(oldWorker); return
      }
      res.setHeader('Content-Type', 'text/html')
      res.setHeader('Set-Cookie', 'migration-sentinel=preserve; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax')
      res.end(legacyHtml)
    })
    await new Promise(resolve => legacy.listen(0, '127.0.0.1', resolve))
    const legacyOrigin = `http://localhost:${legacy.address().port}`
    let browser
    try {
      browser = await browserType.launch({ headless: true })
      const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
      const probe = await context.newPage()
      await probe.goto(`${legacyOrigin}/unfinished-form`)
      await probe.evaluate(async () => {
        localStorage.setItem('lastLoginNickname', 'migration-local-test')
        localStorage.setItem('guest-record-sentinel', 'preserve')
        await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
      })
      await expect.poll(() => probe.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
      phase = 'redirect'
      const login = await context.newPage()
      await login.goto(`${legacyOrigin}/login?from=bookmark`)
      assert.equal(await login.locator('h1').innerText(), 'legacy-phone-login')
      const rejected = await probe.evaluate(async () => {
        try { await (await navigator.serviceWorker.getRegistration()).update(); return false } catch { return true }
      })
      assert.equal(rejected, true, '301 script update must reproduce the trapped old worker')
      assert.equal(new URL(login.url()).origin, legacyOrigin)
      phase = 'fixed'
      await probe.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
      await login.waitForURL(`${canonicalOrigin}/login?from=bookmark`)
      assert.equal(await login.locator('h1').innerText(), 'canonical-current-ui')
      assert.equal(new URL(probe.url()).origin, legacyOrigin, 'do not interrupt other unfinished forms')
      assert.deepEqual(await probe.evaluate(() => [localStorage.getItem('lastLoginNickname'), localStorage.getItem('guest-record-sentinel')]), ['migration-local-test', 'preserve'])
      assert.ok((await context.cookies(legacyOrigin)).some(cookie => cookie.name === 'migration-sentinel' && cookie.httpOnly))
      await expect.poll(() => probe.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
      const reopened = await context.newPage()
      await reopened.goto(`${legacyOrigin}/login`)
      await reopened.waitForURL(`${canonicalOrigin}/login`)
      assert.equal(await reopened.locator('h1').innerText(), 'canonical-current-ui')
      console.log(`${name}: redirect-update failure reproduced; migration, query preservation, untouched local data/cookie and new tab PASS`)
    } finally {
      await browser?.close()
      await Promise.all([new Promise(resolve => legacy.close(resolve)), new Promise(resolve => canonical.close(resolve))])
    }
  })
}
