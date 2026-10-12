import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'

// All authenticated requests are synthetic. This script never changes remote data.
const origin = process.argv[2] ?? 'http://127.0.0.1:4298'
const commit = process.argv[3]
assert(['http://127.0.0.1:4298', 'https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin))
const environment = origin.includes('staging') ? 'staging' : origin.includes('127.0.0.1') ? 'local' : 'production'
const output = `outputs/nurse-guarded-days/${environment}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ...(process.env.PLAYWRIGHT_PROXY_SERVER ? { proxy: { server: process.env.PLAYWRIGHT_PROXY_SERVER } } : {}) })
const reports = []
const localDay = value => { const date = new Date(value); return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) }
const members = [
  { id: 'guard-child-a', accountId: 'guard-test', name: '测试孩子甲', relationship: 'child', gender: 'female', birthday: '2025-01-01', avatar: null, isSelf: false, createdAt: '2026-09-01T02:00:00Z', updatedAt: '2026-09-01T02:00:00Z' },
  { id: 'guard-child-b', accountId: 'guard-test', name: '测试孩子乙', relationship: 'child', gender: 'male', birthday: '2025-02-01', avatar: null, isSelf: false, createdAt: '2026-10-01T02:00:00Z', updatedAt: '2026-10-01T02:00:00Z' },
]
try {
  const publicContext = await browser.newContext({ serviceWorkers: 'block' })
  for (const path of ['/', '/api/health', '/nurse-station']) {
    const response = await publicContext.request.get(origin + path)
    assert.equal(response.status(), 200, path)
  }
  const html = await (await publicContext.request.get(origin + '/nurse-station')).text()
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1])
  assert(assets.length)
  let code = ''
  for (const path of assets) {
    const response = await publicContext.request.get(new URL(path, origin).href)
    assert.equal(response.status(), 200)
    if (path.endsWith('.js')) code += await response.text()
  }
  if (commit) assert(code.includes(commit), 'Expected deployed build commit')
  await publicContext.close()

  for (const width of [375, 390, 430]) {
    for (const scenario of ['record-error', 'events-pending', 'growth-error', 'member-error', 'member-date-missing']) {
      const context = await browser.newContext({ ...devices['iPhone SE'], viewport: { width, height: 667 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
      const page = await context.newPage(), errors = [], unmatched = []
      let currentMemberId = members[0].id
      let releaseEvents
      const eventsReady = new Promise(resolve => { releaseEvents = resolve })
      const fixtures = members.map(member => scenario === 'member-date-missing' ? { ...member, createdAt: null } : member)
      page.on('pageerror', error => errors.push(error.message))
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname
        const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
        if (path === '/api/auth/session') return json({ token: 'synthetic-guard-token', user: { id: 'guard-test', currentMemberId, nickname: '守护测试', hasPassword: true, createdAt: members[0].createdAt } })
        if (path === '/api/auth/current-member') { currentMemberId = request.postDataJSON().memberId; return json({ success: true }) }
        if (request.method() !== 'GET') { unmatched.push(`${request.method()} ${path}`); return json({ error: { message: 'Unexpected mutation' } }, 405) }
        if (path === '/api/auth/profile-sections') return json([])
        if (path === '/api/members') return json(fixtures)
        if (/^\/api\/members\/guard-child-[ab]$/.test(path)) return scenario === 'member-error'
          ? json({ error: { message: 'Synthetic member failure' } }, 503)
          : json(fixtures.find(member => member.id === path.split('/').at(-1)))
        if (path === '/api/account/entry-state') return json({ familyMemberCount: 2, hasValidHealthRecord: true })
        if (/\/cases$/.test(path)) return json({ active: [], archived: [], timezone: 'Asia/Shanghai' })
        if (path === '/api/events') {
          if (scenario === 'events-pending') await eventsReady
          return json([{ id: 'guard-event', accountId: 'guard-test', memberId: members[0].id, title: '测试记录', category: 'other', status: 'ongoing', startTime: members[0].createdAt, createdAt: members[0].createdAt, updatedAt: members[0].createdAt }])
        }
        if (/\/records$/.test(path)) return scenario === 'record-error' ? json({ error: { message: 'Synthetic record failure' } }, 503) : json([])
        if (/\/attachments$/.test(path) || path === '/api/medication-reminders') return json([])
        if (path === '/api/growth-measurements') return scenario === 'growth-error' ? json({ error: { message: 'Synthetic growth failure' } }, 503) : json([])
        unmatched.push(`${request.method()} ${path}`)
        return json({ error: { message: 'Unmatched synthetic API' } }, 404)
      })
      await page.goto(origin + '/nurse-station')
      const guarded = page.locator('.nurse-station-guarded strong')
      const expected = member => scenario === 'member-date-missing' ? '—' : String(Math.max(1, Math.round((localDay(Date.now()) - localDay(member.createdAt)) / 86400000) + 1))
      await expect(guarded).toHaveText(expected(members[0]))
      // Assert the header before allowing pending health-event requests to finish.
      releaseEvents()
      await expect(page.getByText('吃了什么、睡得怎样、哪里不舒服，都帮你记清楚。', { exact: true })).toBeVisible()
      await expect(page.getByText('现在或过去的情况，都可以记。', { exact: true })).toBeVisible()
      await expect(page.locator('.nurse-station-sync-notice')).toHaveCount(0)
      await page.getByRole('button', { name: '选择孩子，当前测试孩子甲' }).click()
      await page.getByRole('button', { name: '切换到测试孩子乙', exact: true }).click()
      await expect(page.getByRole('button', { name: '选择孩子，当前测试孩子乙' })).toBeVisible()
      await expect(guarded).toHaveText(expected(members[1]))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `${output}/${scenario}-${width}.png` })
      assert.deepEqual(errors, [])
      assert.deepEqual(unmatched, [])
      reports.push({ width, scenario, status: 'PASS', memberSwitch: 'PASS' })
      await context.close()
    }
  }
  const report = { environment, commit: commit ?? 'local', publicRoutesAndAssets: 'PASS', authenticatedUi: 'synthetic API fixtures; no remote mutations', reports }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { await browser.close() }
