import assert from 'node:assert/strict'
import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseURL = process.argv[2]
if (!['https://hoooho.com', 'https://staging.hoooho.com', 'https://hooohoapp-staging.up.railway.app', 'http://127.0.0.1:4194'].includes(baseURL)) throw new Error('Explicit verified test target required')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ ...devices['iPhone SE'], timezoneId: 'Asia/Shanghai' })
const page = await context.newPage()
const failures = []
page.on('pageerror', () => failures.push('pageerror'))
page.on('response', (response) => { if (response.status() >= 500) failures.push(`HTTP ${response.status()}`) })
let memberId
async function call(url, body, method = 'POST') {
  return page.evaluate(async ({ url, body, method }) => {
    const session = await (await fetch('/api/auth/session')).json()
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}`, 'X-Hoooho-Timezone': 'Asia/Shanghai' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    if (!response.ok) throw new Error(`smoke API ${url}: ${response.status}`)
    return response.json()
  }, { url, body, method })
}
try {
  const health = await context.request.get(`${baseURL}/api/health`)
  assert.equal(health.status(), 200)
  await page.goto(`${baseURL}/login`)
  await page.getByRole('button', { name: '暂不登录，先体验', exact: true }).click()
  await page.waitForURL(/health-events/)
  memberId = (await call('/api/members', { name: '时间视图验收', relationship: 'child', birthday: '2023-01-01', gender: 'female', avatar: 'girl-age3-east-asian' })).id
  await call('/api/auth/current-member', { memberId })
  await page.reload()
  await page.getByRole('button', { name: '快速记录', exact: true }).waitFor()
  const video = page.locator('video').first()
  await video.waitFor({ state: 'attached' })
  await page.getByRole('button', { name: '时间视图', exact: true }).click()
  await page.getByRole('heading', { name: '健康随身记', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '后一天', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '手动记录', exact: true }).click()
  await page.getByRole('button', { name: '活动', exact: true }).click()
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
  await page.getByRole('textbox', { name: '快捷记录文字', exact: true }).fill('发布验收：今天散步，合成测试记录')
  await page.getByRole('button', { name: '继续核对', exact: true }).click()
  await page.getByRole('button', { name: '确认保存', exact: true }).click()
  const row = page.locator('.journal-record').filter({ hasText: '发布验收：今天散步，合成测试记录' })
  await row.waitFor()
  assert.equal(await row.getByText('活动', { exact: true }).count(), 1)
  await page.reload()
  await page.getByRole('button', { name: '时间视图', exact: true }).click()
  await row.waitFor()
  await page.getByRole('button', { name: '摘要生成', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await page.setViewportSize(devices['iPhone SE'].viewport)
  await mkdir('outputs/time-view', { recursive: true })
  await page.screenshot({ path: `outputs/time-view/${new URL(baseURL).hostname}.png` })
  await page.getByRole('button', { name: '前台视图', exact: true }).click()
  await page.getByRole('button', { name: '快速记录', exact: true }).waitFor()
  assert.equal(await video.evaluate((element) => element.readyState >= 2 && !element.error), true)
  assert.deepEqual(failures, [])
  console.log(JSON.stringify({ target: baseURL, health: 'PASS', manualSaveAndReload: 'PASS', summary: 'PASS', frontVideo: 'PASS', widths: [375, 390, 430], runtimeErrors: failures.length }))
} finally {
  if (memberId) {
    // Only the exact synthetic member created in this fresh guest session.
    await call(`/api/members/${encodeURIComponent(memberId)}`, undefined, 'DELETE')
    console.log('Synthetic acceptance member and its scoped records removed.')
  }
  await context.close()
  await browser.close()
}
