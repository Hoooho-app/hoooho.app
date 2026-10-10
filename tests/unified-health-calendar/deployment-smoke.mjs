import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'

const [origin, commit] = process.argv.slice(2)
assert(['https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin))
const environment = origin.includes('staging') ? 'staging' : 'production'
const output = `outputs/unified-health-calendar/${environment}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', proxy: { server: 'http://127.0.0.1:7890' } })
const context = await browser.newContext({ ...devices['iPhone SE'], timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
let token = '', memberId = '', accountId = ''
const errors = [], healthWrites = [], unexpectedWrites = [], clientBuilds = new Set()
async function api(path, method = 'GET', data) {
  const r = await context.request.fetch(origin + path, { method, data, headers: { 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  assert(r.ok(), `${method} ${path}: ${r.status()}`)
  assert.equal(new URL(r.url()).origin, origin)
  return r
}
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
page.on('response', r => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`) })
try {
  // Fixture preparation is separate from the read-only UI acceptance phase.
  // Each origin gets a new synthetic account; credentials never cross environments.
  for (const path of ['/', '/api/health', '/health-events', '/health-calendar', '/health-events/search']) assert.equal((await api(path)).status(), 200)
  const html = await (await api('/health-events')).text()
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1])
  assert(assets.length > 0)
  let deployedCode = ''
  for (const asset of assets) {
    const response = await context.request.get(new URL(asset, origin).href)
    assert.equal(response.status(), 200)
    if (asset.endsWith('.js')) deployedCode += await response.text()
  }
  assert(deployedCode.includes(commit), 'Live JavaScript does not contain the expected build commit')
  const session = await (await api('/api/auth/register', 'POST', { nickname: '日历隔离验收', password: randomUUID(), idempotencyKey: randomUUID() })).json()
  token = session.token; accountId = session.user.id; assert(token && accountId)
  memberId = (await (await api('/api/members', 'POST', { name: '日历只读测试对象', birthday: '2025-01-01', gender: 'female', relationship: 'child' })).json()).id
  assert(memberId)
  await api('/api/auth/current-member', 'POST', { memberId })
  await page.addInitScript(({ token, accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, accountId, memberId })
  page.on('request', r => {
    const build = r.headers()['x-hoooho-client-build']
    if (build) clientBuilds.add(build)
    if (['GET', 'HEAD', 'OPTIONS'].includes(r.method())) return
    const path = new URL(r.url()).pathname
    unexpectedWrites.push(`${r.method()} ${path}`)
    if (/records|events|daily-record|routine/.test(path)) healthWrites.push(`${r.method()} ${path}`)
  })
  await page.goto(`${origin}/health-events?verify=${commit}`)
  await expect(page.getByRole('heading', { name: '健康日历', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '记录日常', exact: true })).toBeEnabled()
  await expect(page.getByText('正在加载时间轴…', { exact: true })).toHaveCount(0)
  const switchView = async mode => { await page.getByRole('button', { name: '切换日历视图' }).click(); await page.getByRole('menuitemradio', { name: mode, exact: true }).click() }
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: `${output}/day-${width}x${height}.png` })
    await expect(page.locator('.record-entry-grid button')).toHaveText(['喂养/饮食', '补剂', '记录日常', '记录用药'])
    await page.getByRole('button', { name: '切换日历视图' }).click()
    await page.screenshot({ path: `${output}/view-menu-${width}x${height}.png` })
    await page.getByRole('menuitemradio', { name: '月历', exact: true }).click()
    await expect(page.getByRole('button', { name: /^记录顺序：/ })).toHaveCount(0)
    for (const month of ['2021-02', '2026-10', '2026-03']) {
      await page.getByLabel('选择月份').fill(month)
      await page.getByRole('heading', { name: '健康日历', exact: true }).click()
      const box = await page.locator('.health-calendar__grid').boundingBox(), footer = await page.locator('.journal-record-actions').boundingBox()
      assert(box && footer && box.y + box.height <= footer.y + 1 && footer.y + footer.height <= height + 1)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await expect(page.locator('.health-calendar__day').last()).toBeInViewport()
      await page.screenshot({ path: `${output}/month-${month}-${width}x${height}.png` })
    }
    await page.getByLabel('筛选记录类型').selectOption('sleep')
    await page.getByRole('button', { name: '搜索健康日历' }).click()
    await page.getByRole('button', { name: '返回健康日历' }).click()
    await expect(page.getByLabel('选择月份')).toHaveValue('2026-03')
    await expect(page.getByLabel('筛选记录类型')).toHaveValue('sleep')
    assert.equal(new URL(page.url()).searchParams.get('verify'), commit)
    await page.getByRole('button', { name: /^2026-03-08，/ }).click()
    await expect(page.getByLabel('选择日期')).toHaveValue('2026-03-08')
    await page.getByLabel('筛选记录类型').selectOption('')
    await page.getByRole('button', { name: '记录日常', exact: true }).click()
    await expect(page.getByRole('group', { name: '记录日常选项' }).getByRole('button')).toHaveText(['睡眠', '排便', '身体涂抹'])
    await expect(page.getByRole('button', { name: '记录症状', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: '记录日常', exact: true }).click()
    await page.getByRole('button', { name: '打开菜单' }).click()
    await expect(page.getByRole('button', { name: '健康日历', exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /^(健康月历|健康随记)$/ })).toHaveCount(0)
    await page.screenshot({ path: `${output}/sidebar-${width}x${height}.png` })
    await page.getByRole('button', { name: '关闭菜单', exact: true }).click()
  }
  await page.goto(`${origin}/health-calendar?day=2026-09-25&source=legacy`)
  await expect(page.getByLabel('选择月份')).toHaveValue('2026-09')
  assert.equal(new URL(page.url()).pathname, '/health-events')
  assert.equal(new URL(page.url()).searchParams.get('source'), 'legacy')
  assert.equal((await (await api('/api/events?view=time')).json()).length, 0)
  assert.deepEqual(errors, []); assert.deepEqual(healthWrites, []); assert.deepEqual(unexpectedWrites, [])
  assert(clientBuilds.has(commit), 'Browser did not load the expected client build')
  const report = { environment, commit, status: 'PASS', fixturePreparation: 'new synthetic account/member; no health facts', acceptance: 'real authenticated APIs; read-only UI; no mocked responses', widths: [320, 375, 390, 430], routes: 'PASS', assets: 'PASS', buildCommit: 'PASS', navigation: 'PASS', errors, healthWrites }
  await writeFile(`${output}/smoke.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) { await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); throw error }
finally {
  // Only the exact member created by this script, on this new synthetic account.
  if (memberId && accountId) {
    const own = (await (await api('/api/members')).json()).find(m => m.id === memberId)
    if (own?.accountId === accountId && own.name === '日历只读测试对象') await api(`/api/members/${encodeURIComponent(memberId)}`, 'DELETE')
  }
  await context.close(); await browser.close()
}
