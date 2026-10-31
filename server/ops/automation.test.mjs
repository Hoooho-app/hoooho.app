import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { chromium } from 'playwright-core'
import { billingHealth, cleanBillingFacts, DEFAULT_REMINDERS } from './billing-health.mjs'
import { createBillingCollectors, parseBillingFields } from './capture-collectors.mjs'
import { OpsService } from './ops-service.mjs'
import { OpsWorkspaceService } from './workspace-service.mjs'
import { OpsOverviewService } from './overview-service.mjs'
const now = new Date('2026-11-01T04:00:00Z')
const item = (facts, extras = {}) => ({ enabled: true, frequency: 'daily', status: 'success', observation: { observedAt: now.toISOString(), facts }, ...extras })
const fixture = async t => { const dir = await mkdtemp(path.join(tmpdir(), 'ops-automation-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir }

test('unknown data, stale data and failed collection never claim normal billing', () => {
  assert.equal(billingHealth(item({}), now).level, 'unknown')
  assert.equal(billingHealth(item({ dueAt: '2026-12-20', dueKind: 'renewal' }), now).level, 'normal')
  assert.equal(billingHealth(item({ dueAt: '2026-12-20', dueKind: 'renewal' }, { status: 'failed' }), now).level, 'unknown')
  const stale = billingHealth(item({}, { observation: { observedAt: '2026-10-20T04:00:00Z', facts: { dueAt: '2026-12-20', dueKind: 'renewal' } } }), now)
  assert.equal(stale.level, 'unknown'); assert.equal(stale.fresh, false)
  assert.equal(cleanBillingFacts({ balance: 10 }).balance, null)
  assert.equal(cleanBillingFacts({ dueAt: 'next Friday' }).dueAt, null)
})
test('reminders cross Shanghai date thresholds without changing evidence or pretending quota reset is a payment', () => {
  const source = item({ dueAt: '2026-11-10', dueKind: 'payment' })
  const notice = billingHealth(source, now), warning = billingHealth(source, new Date('2026-11-03T16:00:00Z')), critical = billingHealth(source, new Date('2026-11-07T16:00:00Z'))
  assert.equal(notice.level, 'notice'); assert.equal(warning.level, 'warning'); assert.equal(critical.level, 'critical')
  assert.notEqual(notice.fingerprint, warning.fingerprint); assert.notEqual(warning.fingerprint, critical.fingerprint)
  assert.equal(billingHealth(item({ dueAt: '2026-10-31', dueKind: 'payment' }), now).reasons[0].code, 'expired')
  assert.equal(billingHealth(item({ dueAt: '2026-10-31', dueKind: 'quota-reset' }), now).reasons.length, 0)
  assert.equal(billingHealth(item({ quotaRemaining: 0, quotaLimit: 100, quotaKind: 'hard-cap' }), now).level, 'critical')
  assert.equal(billingHealth(item({ balance: 4, currency: 'USD', lowBalanceThreshold: 5 }), now).level, 'warning')
  assert.equal(billingHealth(item({ balance: 0, currency: 'USD' }, { enabled: false }), now).level, 'paused')
})
test('server thresholds persist and invalid rules cannot corrupt saved settings', async t => {
  const dataDirectory = await fixture(t), service = new OpsWorkspaceService({ dataDirectory, env: {} })
  const rules = { ...DEFAULT_REMINDERS, noticeDays: 60, warningDays: 10 }
  await service.saveSettings({ reminders: rules })
  assert.deepEqual((await new OpsWorkspaceService({ dataDirectory, env: {} }).settings()).reminders, rules)
  await assert.rejects(service.saveSettings({ reminders: { ...rules, criticalDays: 80 } }), e => e.status === 400)
  assert.deepEqual((await service.settings()).reminders, rules)
})
test('health probes are real cached checks; missing configuration and 200 HTML do not claim online', async t => {
  const dataDirectory = await fixture(t); let calls = 0
  const service = new OpsWorkspaceService({ dataDirectory, env: { FAMILY_UPSTREAM_URL: 'https://family.example.test', RESEND_API_KEY: 'synthetic-secret' }, fetchImpl: async url => { calls++; return new Response(String(url).includes('family') ? '<html>login</html>' : '{"ok":true}', { status: 200 }) } })
  const first = await service.services(); await service.services()
  assert.equal(calls, 2); assert.equal(first.services[0].state, 'online'); assert.equal(first.services[1].state, 'degraded'); assert.equal(first.services[2].state, 'unconfigured')
  assert.equal(JSON.stringify(first).includes('synthetic-secret'), false)
})
test('version history records actual runtime revision and leaves other channels unconnected', async t => {
  const dataDirectory = await fixture(t), revision = 'a'.repeat(40)
  const service = new OpsWorkspaceService({ dataDirectory, env: { RAILWAY_GIT_COMMIT_SHA: revision, RAILWAY_DEPLOYMENT_ID: 'synthetic' } })
  await Promise.all([service.versions(), service.versions()])
  assert.equal((await service.versions()).releases.length, 1)
  assert.equal((await service.versions()).releases.length, 1)
  const unknown = await new OpsWorkspaceService({ dataDirectory, env: {} }).versions()
  assert.equal(unknown.current.revision, null); assert.equal(unknown.releases[0].revision, revision); assert.equal(unknown.native.state, 'unconnected')
})
test('automatic API evidence creates reminders that persist until viewed; new financial state invalidates old reminder', async t => {
  const dataDirectory = await fixture(t); let dueAt = '2026-11-04'
  const billing = new OpsService({ dataDirectory, collectors: { 'godaddy-domain': async () => ({ origin: 'api', facts: { dueAt, dueKind: 'domain-expiry' } }) } })
  // Use dates relative to wall time for the inbox service, which evaluates current risks.
  const current = new Date(); dueAt = new Date(current.getTime() + 86400000).toISOString()
  await billing.refresh('godaddy-domain', current)
  const inbox = new OpsOverviewService({ dataDirectory, billing, feedback: { listForOps: async () => ({ feedback: [] }) } })
  const event = (await inbox.list()).events.find(e => e.kind === 'billing-reminder')
  assert.ok(event); await inbox.viewed(event.id); assert.equal((await inbox.list()).unreadCount, 0)
  dueAt = new Date(current.getTime() + 3 * 86400000).toISOString(); await billing.refresh('godaddy-domain')
  assert.equal((await inbox.list()).unreadCount, 1)
  await assert.rejects(inbox.viewed(event.id), e => e.code === 'OPS_EVENT_NOT_FOUND')
  dueAt = new Date(current.getTime() + 90 * 86400000).toISOString(); await billing.refresh('godaddy-domain')
  assert.equal((await inbox.list()).events.length, 0)
})
test('same image updates field verification while storing one private image; failed recheck retains evidence', async t => {
  const dataDirectory = await fixture(t), image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer()
  let balance = 20, fail = false
  const service = new OpsService({ dataDirectory, collectors: { railway: async () => { if (fail) throw Object.assign(new Error('secret provider payload'), { code: 'AUTH_REQUIRED' }); return { dataUrl: `data:image/png;base64,${image.toString('base64')}`, facts: { balance, currency: 'USD' }, origin: 'page' } } } })
  const first = await service.refresh('railway'), firstImage = first.latestSnapshot.id
  balance = 0; const second = await service.refresh('railway')
  assert.equal(second.latestSnapshot.id, firstImage); assert.equal(second.observation.facts.balance, 0); assert.equal((await service.history('railway')).snapshots.length, 1)
  fail = true; const failed = await service.refresh('railway')
  assert.equal(failed.latestSnapshot.id, firstImage); assert.equal(failed.observation.facts.balance, 0); assert.equal(failed.status, 'relogin'); assert.doesNotMatch(JSON.stringify(failed), /secret provider payload/)
})
test('unconfigured sources do not become scheduled success or produce failure history on every wakeup', async t => {
  const dataDirectory = await fixture(t), adapter = createBillingCollectors({ env: {} })
  let calls = 0
  const service = new OpsService({ dataDirectory, collectors: { 'automatic-screenshot': async () => { calls++; throw Error() } }, collectorStatus: adapter.status })
  await service.refreshScheduled(); await service.refreshScheduled()
  assert.equal(calls, 0); assert.equal((await service.history('railway')).snapshots.length, 0)
  const response = await service.refresh('railway'); assert.notEqual(response.status, 'success')
})
test('official domain adapter extracts only expiration evidence without credentials', async () => {
  let requested
  const adapter = createBillingCollectors({ env: {}, fetchImpl: async url => { requested = url; return new Response(JSON.stringify({ events: [{ eventAction: 'expiration', eventDate: '2028-07-31T09:55:50Z' }], privateUnrelatedData: 'never persist' })) } })
  const result = await adapter.collectors['godaddy-domain']()
  assert.equal(requested, 'https://rdap.verisign.com/com/v1/domain/hoooho.com'); assert.equal(result.facts.dueKind, 'domain-expiry'); assert.doesNotMatch(JSON.stringify(result), /never persist/)
})
test('real Chromium captures a synthetic billing region, masks private area and extracts explicit fields', async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } })
  const html = '<div id="ready">authorized synthetic account</div><section id="bill" style="width:500px;height:200px"><span class="due">2026-12-10</span><span class="balance">42.50</span><span class="private">SYNTHETIC PRIVATE FIELD</span></section>'
  const fetchNavigation = async url => ({ status: url.includes('redirect-test') ? 302 : 200, headers: { 'Content-Type': 'text/html', ...(url.includes('redirect-test') ? { Location: 'https://foreign.example.test/private' } : {}) }, body: html })
  const env = { OPS_BROWSER_CDP_URL: 'synthetic-only', OPS_CAPTURE_PROFILES: JSON.stringify({ railway: { url: 'https://railway.com/synthetic-billing', selector: '#bill', readySelector: '#ready', privacyReviewed: true, maskSelectors: ['.private'], currency: 'USD', dueKind: 'payment', fields: { dueAt: '.due', balance: '.balance' } } }) }
  const adapter = createBillingCollectors({ env, connect: async () => browser, fetchNavigation })
  const result = await adapter.collectors['automatic-screenshot']({ id: 'railway' })
  const image = await sharp(Buffer.from(result.dataUrl.split(',')[1], 'base64')).metadata()
  const pixels = await sharp(Buffer.from(result.dataUrl.split(',')[1], 'base64')).removeAlpha().raw().toBuffer()
  let maskedPixels = 0
  for (let index = 0; index < pixels.length; index += 3) if (pixels[index] === 255 && pixels[index + 1] === 0 && pixels[index + 2] === 255) maskedPixels++
  assert.ok(maskedPixels > 100, 'private field must be covered by the screenshot mask')
  assert.equal(image.width, 500); assert.equal(image.height, 200); assert.equal(result.facts.balance, 42.5); assert.equal(result.facts.dueAt, '2026-12-10'); assert.equal((await context.pages()).length, 0)
  assert.equal(parseBillingFields({ dueAt: 'next week', balance: '$42.50' }, { currency: 'USD' }).dueAt, null)
  assert.equal(parseBillingFields({ balance: '$42.50' }, { currency: 'USD' }).balance, 42.5)
  assert.equal(parseBillingFields({ dueAt: '11/15/2026' }, { dateFormat: 'MM/DD/YYYY', dueKind: 'renewal' }).dueAt, '2026-11-15')
  assert.equal(cleanBillingFacts({ dueAt: '2026-02-31' }).dueAt, null)
  const unsafe = createBillingCollectors({ env: { ...env, OPS_CAPTURE_PROFILES: env.OPS_CAPTURE_PROFILES.replace('railway.com/synthetic-billing', 'internal.example.test/billing') }, connect: async () => { throw Error('must not connect') } })
  assert.equal(unsafe.status({ id: 'railway' }).state, 'unconfigured')
  await assert.rejects(unsafe.collectors['automatic-screenshot']({ id: 'railway' }), e => e.code === 'COLLECTOR_UNCONFIGURED')
  let foreignHits = 0
  await context.route('https://railway.com/redirect-test', route => route.fulfill({ status: 302, headers: { Location: 'https://foreign.example.test/private' } }))
  await context.route('https://foreign.example.test/**', route => { foreignHits++; return route.abort() })
  const redirectAdapter = createBillingCollectors({ env: { ...env, OPS_CAPTURE_PROFILES: env.OPS_CAPTURE_PROFILES.replace('synthetic-billing', 'redirect-test') }, connect: async () => browser, fetchNavigation })
  await assert.rejects(redirectAdapter.collectors['automatic-screenshot']({ id: 'railway' }), e => e.code === 'AUTH_REQUIRED')
  assert.equal(foreignHits, 0)
})

test('weekly capture uses seven Shanghai calendar days rather than drifting to eight days with queue jitter', async t => {
  const dataDirectory = await fixture(t); let calls = 0
  const service = new OpsService({ dataDirectory, collectors: { github: async () => { calls++; return { origin: 'api', facts: { dueAt: '2026-12-01', dueKind: 'payment' } } } } })
  const first = new Date('2026-11-01T08:00:30+08:00')
  await service.refreshScheduled(first)
  const source = (await service.list(first)).sources.find(s => s.id === 'github')
  assert.equal(source.nextRunAt, '2026-11-08T00:00:00.000Z')
  await service.refreshScheduled(new Date('2026-11-08T08:00:00+08:00'))
  assert.equal(calls, 2)
})

test('service links use the existing gateways and a static frontend is checked as a page, not an invented API', async t => {
  const dataDirectory = await fixture(t)
  const service = new OpsWorkspaceService({ dataDirectory, env: { FAMILY_UPSTREAM_URL: 'https://family.example.test', QINGGAN_UPSTREAM_URL: 'https://qinggan.example.test' }, fetchImpl: async url => String(url).includes('qinggan') ? new Response('<!doctype html><html><body>synthetic frontend</body></html>', { headers: { 'Content-Type': 'text/html' } }) : new Response('{"ok":true}') })
  const { services } = await service.services()
  assert.equal(services[1].url, 'https://hooohoapp-production.up.railway.app/family-ray-home-life-workspace')
  assert.equal(services[2].url, 'https://hooohoapp-production.up.railway.app/api/apps/qinggan-jichoushi-notebook/')
  assert.equal(services[2].state, 'online'); assert.equal(services[2].probeKind, 'page'); assert.equal(services[2].healthPath, '/')
})
