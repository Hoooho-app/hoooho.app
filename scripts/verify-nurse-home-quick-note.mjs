// Narrow release acceptance: real auth/storage, synthetic member only, no AI calls.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices, expect } from '@playwright/test'

const production = process.env.HOOOHO_HOME_TARGET === 'production'
if (process.env.RUN_HOOOHO_HOME_ACCEPTANCE !== '1') throw new Error('Explicit acceptance opt-in required')
const base = production ? 'https://hoooho.com' : 'https://hooohoapp-staging.up.railway.app'
const output = path.resolve(`outputs/home-example-typewriter-20261004/${production ? 'production' : 'staging'}`)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const context = await browser.newContext({ ...devices['iPhone SE'], timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(45000)
const result = { target: base, startedAt: new Date().toISOString(), checks: {}, screenshots: [], runtimeErrors: 0, http5xx: 0, cleanup: {}, ai: 'NOT_RETESTED_UNCHANGED', physicalPhone: 'NOT_VERIFIED' }
let token, memberId
page.on('pageerror', () => result.runtimeErrors++)
page.on('response', response => { if (response.status() >= 500) result.http5xx++ })
async function api(url, data, method = 'POST') {
  const response = await page.evaluate(async ({ url, data, method, token }) => {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(45000) })
    return { status: response.status, ok: response.ok, body: await response.json().catch(() => null) }
  }, { url: base + url, data, method, token })
  if (!response.ok) throw Object.assign(new Error('Acceptance API unavailable'), { safe: { status: response.status, code: response.body?.error?.code ?? null } })
  return response.body
}
async function home(name) {
  await expect(page.getByRole('button', { name: '健康事件随时记，情况速记', exact: true })).toBeVisible()
  await expect(page.locator('.nurse-home-entry--medication')).toContainText('0 个提醒任务')
  await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  await expect(page.locator('.continuity-home h2')).toHaveCount(0)
  await expect(page.getByText('还没有正在跟进的情况', { exact: true })).toHaveCount(0)
  const example = page.locator('.continuity-record-entry__example')
  await expect.poll(() => example.evaluate(element => element.textContent === element.getAttribute('aria-label'))).toBe(true)
  assert.equal((await page.locator('.continuity-record-entry').boundingBox()).height, 108)
  const sizes = await page.locator('.nurse-home-entry').evaluateAll(cards => cards.map(card => ({ width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height })))
  assert.equal(sizes.length, 5)
  assert.equal(new Set(sizes.map(card => card.height)).size, 1)
  assert.ok(Math.max(...sizes.map(card => card.width)) - Math.min(...sizes.map(card => card.width)) < 1)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const screenshot = path.join(output, `${name}.png`)
  await page.screenshot({ path: screenshot, fullPage: true })
  result.screenshots.push(screenshot)
}
try {
  const response = await page.goto(base + '/')
  assert.equal(response.status(), 200)
  assert.equal((await api('/api/health', undefined, 'GET')).status, 'ok')
  result.checks.health = 'PASS'
  await page.goto(base + '/login')
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  await page.getByPlaceholder('给自己起个昵称').fill('首页验收' + randomUUID().slice(0, 8))
  await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  for (let attempt = 0; attempt < 2; attempt++) {
    const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '注册并进入', exact: true }).click()
    const registeredResponse = await registration
    if (registeredResponse.ok()) break
    const reason = await registeredResponse.json().catch(() => null)
    const safe = { status: registeredResponse.status(), code: reason?.error?.code ?? null, retryAfter: reason?.error?.retryAfter ?? null }
    if (attempt === 0 && safe.code === 'REGISTER_RATE_LIMITED' && Number.isInteger(safe.retryAfter) && safe.retryAfter > 0 && safe.retryAfter <= 900) {
      // Honor the server's cooldown, retrying the same normal UI once only.
      console.log(JSON.stringify({ waitingForRegistrationSeconds: safe.retryAfter }))
      await new Promise(resolve => setTimeout(resolve, (safe.retryAfter + 1) * 1000))
      continue
    }
    throw Object.assign(new Error('Normal registration unavailable; do not bypass rate limits'), { safe })
  }
  token = (await api('/api/auth/session', undefined, 'GET')).token
  memberId = (await api('/api/members', { name: '合成首页验收，非真实患者', relationship: 'child', gender: 'female', birthday: '2025-01-01' })).id
  await api('/api/auth/current-member', { memberId })
  await page.goto(base + '/nurse-station')
  await expect(page.getByRole('link', { name: '0件 · 查看列表 ›', exact: true })).toBeVisible()
  for (const width of [375, 320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : width === 320 ? 568 : 667 })
    await home(`home-${width}`)
  }
  result.checks.homeCopyFiveEqualCardsAndResponsive = 'PASS'
  await page.setViewportSize({ width: 375, height: 667 })
  for (const [name, route] of [['健康随记', '/health-events'], ['健康档案', '/health-profile'], ['就诊情况单', '/visit-summary'], ['忌口出示卡', '/dietary-card'], ['用药提醒', '/medication-reminders']]) {
    await page.locator('.nurse-home-entry').filter({ hasText: name }).click()
    await expect(page).toHaveURL(base + route)
    await page.goBack()
    await expect(page).toHaveURL(base + '/nurse-station')
  }
  result.checks.remainingEntryNavigation = 'PASS'
  const entry = page.locator('.continuity-record-entry')
  const button = entry
  assert.ok(await button.evaluate(element => element.closest('a') === null))
  assert.ok((await button.boundingBox()).height >= 44)
  await expect(entry.locator('button,a,input,textarea')).toHaveCount(0)
  await expect(entry.locator('.continuity-record-entry__example')).toContainText('例如：')
  assert.equal((await entry.boundingBox()).height, 108)
  await entry.locator('strong').click()
  await expect(page).toHaveURL(base + '/smart-record')
  await page.goBack()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/smart-record')
  await page.getByRole('textbox', { name: '发生了什么（主诉）？' }).fill('合成示例，非真实患者资料：首页速记导航与保存验收，原因未明确。')
  await page.getByRole('button', { name: '先保存', exact: true }).click()
  await page.getByRole('button', { name: '确认保存', exact: true }).click()
  await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  result.checks.quickNoteTextAndKeyboardSave = 'PASS'
  await page.goto(base + '/nurse-station')
  await expect(page.locator('.continuity-card')).toHaveCount(1)
  await home('home-one-case-375')
  await page.getByRole('link', { name: '1件 · 查看列表 ›', exact: true }).click()
  await expect(page).toHaveURL(base + '/cases')
  await expect(page.locator('.continuity-card')).toHaveCount(1)
  result.checks.followUpCardAndListRetained = 'PASS'
  assert.equal(result.runtimeErrors, 0)
  assert.equal(result.http5xx, 0)
} catch (error) {
  result.failure = error.safe ?? { name: error.name, message: String(error.message).slice(0, 500) }
} finally {
  if (memberId) await api(`/api/members/${memberId}`, undefined, 'DELETE').then(() => { result.cleanup.syntheticMember = 'REMOVED' }).catch(() => { result.cleanup.syntheticMember = 'FAILED' })
  result.cleanup.acceptanceAccount = 'RETAINED_NO_IDENTITY_DELETION_BYPASS'
  result.finishedAt = new Date().toISOString()
  result.status = !result.failure && result.runtimeErrors === 0 && result.http5xx === 0 && result.cleanup.syntheticMember === 'REMOVED' ? 'PASS' : 'FAIL'
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  await context.close()
  await browser.close()
  process.exitCode = result.status === 'PASS' ? 0 : 1
}
