import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProductAnalyticsService } from './service.mjs'
import { analyticsPage, analyticsPages } from '../../shared/product-analytics.mjs'
import { instrumentAnalytics, analyticsControlCatalog } from '../../scripts/analytics-instrumentation.mjs'

const clock = Date.parse('2026-11-02T08:00:00+08:00'), DAY = 86400000
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-analytics-'))
  const service = new ProductAnalyticsService({ dataDirectory: directory, secret: 'synthetic-test-only', production: true, now: () => clock, controls: [{ id: 'c_000000000000000000', name: '查看记录' }], ...options })
  t.after(async () => { service.close(); await rm(directory, { recursive: true, force: true }) })
  return { service, directory }
}
const event = (fields = {}) => ({ id: randomUUID(), at: clock - 10000, visitor: 'visitor_00000000', session: 'session_00000000', view: 'view_0000000000', page: '/login', kind: 'page_view', accountScope: '', platform: 'web', version: 'a'.repeat(40), ...fields })
const params = value => new URLSearchParams(value)

test('all real product pages are catalogued, identifiers and queries are normalized, backend is excluded', async () => {
  const source = await readFile(new URL('../../src/app/router.tsx', import.meta.url), 'utf8')
  for (const line of source.split('\n')) {
    const route = /path: '([^']+)'/.exec(line)?.[1]
    if (!route || !line.includes('lazy: lazyPage') || route.startsWith('/ops') || /Redirect|RetiredIndexPage|CreateHealthEventPage|UsageGuidePage|'HealthCalendarPage'/.test(line)) continue
    assert.ok(analyticsPages().some(page => page.id === route), route)
  }
  assert.equal(analyticsPage('/medical-preparation/SECRET?name=PRIVATE').id, '/medical-preparation/:shareToken')
  assert.equal(analyticsPage('/health-profile/facts/secret').id, '/health-profile/facts/:factId')
  assert.equal(analyticsPage('/ops/marketing'), null)
  assert.equal(analyticsPage('/care-tools/handoff').available, false)
})

test('retrying a batch remains idempotent, exposed zero-click controls and zero-visit pages remain visible', async t => {
  const { service } = await fixture(t)
  const events = [event(), event({ kind: 'exposure', feature: 'c_000000000000000000' })]
  assert.equal(service.ingest({ events }).accepted.length, 2)
  service.ingest({ events })
  const report = service.report()
  assert.equal(report.overview.views, 1)
  assert.equal(report.features.find(item => item.id.startsWith('c_')).clicks, 0)
  assert.equal(report.features.find(item => item.id.startsWith('c_')).exposures, 1)
  assert.equal(report.pages.find(item => item.id === '/about').views, 0)
  assert.equal(report.pages.find(item => item.id === '/care-tools/handoff').status, 'hidden')
})

test('anonymous login is one visitor; a replay from another account cannot reassign that session', async t => {
  const { service, directory } = await fixture(t)
  service.ingest({ events: [event()] })
  service.ingest({ events: [event({ page: '/nurse-station', accountScope: 'account-A' })] }, { id: 'account-A' })
  service.ingest({ events: [event({ page: '/about', accountScope: 'account-A' })] }, { id: 'account-B' })
  assert.equal(service.report().overview.visitors, 1)
  const stored = service.db.prepare('SELECT * FROM identities').all()
  assert.equal(stored.length, 1); assert.notEqual(stored[0].actor, 'account-A')
  service.ingest({ events: [event({ session: 'session_22222222', accountScope: 'account-B' })] }, { id: 'account-B' })
  assert.equal(service.report().overview.visitors, 2)
  const db = await readFile(path.join(directory, 'analytics/behavior.sqlite-wal'))
  assert.equal(db.includes(Buffer.from('account-A')), false)
})

test('only explicit metadata is stored, raw paths, input, health content and invalid operation identifiers are rejected or omitted', async t => {
  const { service } = await fixture(t)
  service.ingest({ events: [event({ rawText: 'PRIVATE_HEALTH_TEXT', email: 'PRIVATE_EMAIL', name: 'PRIVATE_NAME', duration: 999999 })] })
  assert.doesNotMatch(JSON.stringify(service.db.prepare('SELECT * FROM events').all()), /PRIVATE_|rawText|email|name/)
  assert.throws(() => service.ingest({ events: [event({ page: '/health-events/private-id' })] }), /格式/)
  assert.throws(() => service.ingest({ events: [event({ kind: 'operation_success', feature: 'made_up', operation: randomUUID() })] }), /操作/)
  assert.throws(() => service.ingest({ events: [event({ at: clock + DAY })] }), /时间/)
  assert.equal(service.db.prepare('SELECT duration FROM events').get().duration, 60000)
})

test('internal validation is excluded by default; project/platform/version filters use actual records', async t => {
  const { service } = await fixture(t, { ownerEmail: 'owner@example.test' })
  service.ingest({ events: [event({ accountScope: 'owner', platform: 'ios' })] }, { id: 'owner', email: 'owner@example.test' })
  assert.equal(service.report().overview.views, 0)
  assert.equal(service.report(params({ environment: 'internal', platform: 'ios' })).overview.views, 1)
  assert.equal(service.report(params({ environment: 'internal', platform: 'web' })).overview.views, 0)
  assert.equal(service.report(params({ environment: 'internal', project: 'family' })).overview.views, 0)
  assert.equal(service.report(params({ environment: 'all', version: 'b'.repeat(40) })).overview.views, 0)
})

test('owner login reclassifies that same session’s earlier anonymous visits as internal', async t => {
  const { service } = await fixture(t, { ownerEmail: 'owner@example.test' })
  service.ingest({ events: [event()] })
  assert.equal(service.report().overview.views, 1)
  service.ingest({ events: [event({ accountScope: 'owner', page: '/help' })] }, { id: 'owner', email: 'owner@example.test' })
  assert.equal(service.report().overview.views, 0)
  assert.equal(service.report(params({ environment: 'internal' })).overview.views, 2)
})

test('queued work is not a completed smart record, and the save stage requires its own matching receipt', async t => {
  const { service } = await fixture(t), operation = randomUUID()
  service.ingest({ events: [event({ page: '/nurse-station', kind: 'operation_start', feature: 'smart_process', operation })] })
  assert.equal(service.report().overview.completed, 0)
  service.ingest({ events: [event({ page: '/nurse-station', kind: 'operation_success', feature: 'smart_process', operation, at: clock - 9000 })] })
  assert.deepEqual(service.report().funnels.find(item => item.name === '智能记录').steps.map(step => step.users), [1, 1, 0])
  service.ingest({ events: [event({ page: '/nurse-station', kind: 'operation_success', feature: 'auto_save', operation, at: clock - 8000 })] })
  assert.deepEqual(service.report().funnels.find(item => item.name === '智能记录').steps.map(step => step.users), [1, 1, 1])
})

test('a failed attempt can be retried; completion must be ordered and from the same attempt/session', async t => {
  const { service } = await fixture(t), a = randomUUID(), b = randomUUID()
  const events = [event(), event({ kind: 'operation_start', feature: 'login', operation: a, at: clock - 9000 }), event({ kind: 'operation_failure', feature: 'login', operation: a, at: clock - 8000 }),
    event({ kind: 'operation_start', feature: 'login', operation: b, at: clock - 7000 }), event({ kind: 'operation_success', feature: 'login', operation: b, at: clock - 6000 })]
  service.ingest({ events })
  assert.deepEqual(service.report().funnels[0].steps.map(item => item.users), [1, 1])
  service.ingest({ events: [event({ visitor: 'visitor_33333333', session: 'session_33333333', kind: 'operation_success', feature: 'login', operation: b, at: clock - 5000 })] })
  assert.deepEqual(service.report().funnels[0].steps.map(item => item.users), [1, 1])
})

test('page paths, active time and final exits use stored events instead of click guesses', async t => {
  const { service } = await fixture(t)
  service.ingest({ events: [event(), event({ page: '/help', at: clock - 9000 }), event({ page: '/help', kind: 'page_time', duration: 15000, at: clock - 8000 }), event({ page: '/help', kind: 'page_exit', at: clock - 7000 })] })
  const report = service.report(), help = report.pages.find(item => item.id === '/help')
  assert.equal(help.seconds, 15); assert.equal(help.exits, 1)
  assert.equal(report.paths[0].from, '/login'); assert.equal(report.paths[0].to, '/help')
})

test('retention waits for complete Shanghai days and returns null before cohorts mature', async t => {
  let now = clock - 3 * DAY
  const { service } = await fixture(t, { now: () => now })
  service.ingest({ events: [event({ at: now })] })
  assert.equal(service.report().retention[0].rate, null)
  now += DAY; service.ingest({ events: [event({ at: now, session: 'session_44444444' })] })
  now = clock
  const result = service.report()
  assert.equal(result.retention[0].rate, 100)
  assert.equal(result.retention[1].rate, null)
})

test('invalid dates are errors rather than empty success reports', async t => {
  const { service } = await fixture(t)
  for (const value of [{ start: '2026-02-31' }, { start: '2026-11-03' }, { start: '2026-01-01', end: '2026-11-02' }]) assert.throws(() => service.report(params(value)), /日期/)
})

test('saves and clicks in different forms remain distinct without recording form contents', async t => {
  const { service } = await fixture(t, { controls: [{ id: 'c_111111111111111111', name: '记录睡眠', surface: true }, { id: 'c_222222222222222222', name: '喂养/饮食', surface: true }] })
  service.ingest({ events: ['c_111111111111111111', 'c_222222222222222222'].map(surface => event({ kind: 'operation_success', feature: 'record_save', operation: randomUUID(), surface })) })
  const names = service.report().features.filter(item => item.id === 'record_save').map(item => item.name)
  assert.deepEqual(names.sort(), ['手动记录保存 · 喂养/饮食', '手动记录保存 · 记录睡眠'].sort())
})

test('static instrumentation uses code literals, groups repeated list items, and never serializes user expressions', async () => {
  const source = '<button onClick={save}><span>保存</span>{privateHealthText}</button><a href={secretLink}>{child.name}</a>'
  const result = instrumentAnalytics(source, '/repo/src/pages/Test.tsx')
  assert.equal(result.controls.length, 2)
  assert.doesNotMatch(JSON.stringify(result.controls), /privateHealthText|secretLink|child.name/)
  assert.equal(instrumentAnalytics(source, '/repo/src/pages/Ops/Marketing.tsx').controls.length, 0)
  const catalog = await analyticsControlCatalog()
  assert.ok(catalog.length > 1000)
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length)
})
