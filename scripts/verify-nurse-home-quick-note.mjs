// Narrow release acceptance: real auth/storage, synthetic member only; existing record APIs remain unchanged.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, devices, expect } from '@playwright/test'

const production = process.env.HOOOHO_HOME_TARGET === 'production'
if (process.env.RUN_HOOOHO_HOME_ACCEPTANCE !== '1') throw new Error('Explicit acceptance opt-in required')
const base = production ? 'https://hoooho.com' : 'https://hooohoapp-staging.up.railway.app'
const output = path.resolve(`outputs/home-gray-two-line-20261004/${production ? 'production' : 'staging'}`)
await mkdir(output, { recursive: true })
// Isolated QA profiles retain only this runner's own session between retries.
// Keep locked browser files outside Vite's watched tree and deployment input.
// Never use the user's browser profile or copy cookies across targets.
const context = await chromium.launchPersistentContext(path.join(tmpdir(), 'hoooho-home-typewriter-qa-20261004', production ? 'production' : 'staging'), { headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', ...devices['iPhone SE'], timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(45000)
const result = { target: base, startedAt: new Date().toISOString(), checks: {}, screenshots: [], runtimeErrors: 0, http5xx: 0, cleanup: {}, ai: 'NOT_RETESTED_UNCHANGED', physicalPhone: 'NOT_VERIFIED' }
let token, memberId, secondMemberId
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
  await expect(page.locator('.nurse-station-hero__main')).toBeVisible()
  await expect(page.locator('.nurse-station-growth-data')).toBeVisible()
  await expect(page.getByRole('button', { name: '记录症状', exact: true })).toBeVisible()
  await expect(page.locator('.nurse-home-entry--medication')).toContainText('0 个提醒任务')
  await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  await expect(page.locator('.continuity-home h2,.continuity-record-entry__header,.continuity-home .continuity-card')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '跟进列表', exact: true })).toBeVisible()
  await expect(page.locator('.nurse-home-entry strong')).toHaveText(['就诊情况单', '忌口出示卡', '健康随记', '健康档案', '用药提醒'])
  const geometry = await page.locator('.nurse-station-overview').evaluate(el => {
    const rect = selector => el.querySelector(selector).getBoundingClientRect()
    const hero = rect('.nurse-station-hero'), mint = rect('.continuity-home'), input = rect('.continuity-record-entry__record'), actions = rect('.continuity-record-entry__actions'), left = rect('.continuity-record-entry__list-action'), right = rect('.continuity-record-entry__action')
    const exampleStyle = getComputedStyle(el.querySelector('.continuity-record-entry__example')), heroStyle = getComputedStyle(el.querySelector('.nurse-station-hero'))
    return { size: exampleStyle.fontSize, weight: exampleStyle.fontWeight, background: getComputedStyle(el).backgroundColor, borderColor: getComputedStyle(el).borderColor, gap: mint.y - hero.bottom, aligned: hero.x === mint.x && hero.width === mint.width, inputHeight: input.height, actionGap: right.x - left.right, ratio: left.width / (left.width + right.width), leftHeight: left.height, rightHeight: right.height, actionY: actions.y - input.bottom, heroBorder: heroStyle.borderTopWidth, heroShadow: heroStyle.boxShadow, outerBorder: getComputedStyle(el).borderTopWidth }
  })
  assert.equal(geometry.size, '13px'); assert.equal(geometry.weight, '400'); assert.equal(geometry.background, 'rgb(245, 245, 245)'); assert.equal(geometry.borderColor, 'rgb(219, 228, 224)')
  await expect(page.locator('.continuity-record-entry__action svg')).toHaveCount(0)
  assert.equal(geometry.gap, 0); assert.ok(geometry.aligned); assert.equal(geometry.heroBorder, '0px'); assert.equal(geometry.heroShadow, 'none'); assert.equal(geometry.outerBorder, '1px')
  assert.ok(geometry.inputHeight >= 56); assert.equal(geometry.leftHeight, 48); assert.equal(geometry.rightHeight, 48)
  assert.equal(geometry.actionGap, 12); assert.equal(geometry.actionY, 12); assert.ok(Math.abs(geometry.ratio - .36) < .001)
  await expect(page.locator('.continuity-home input,.continuity-home textarea,.continuity-home button button,.continuity-home button a')).toHaveCount(0)
  const example = page.locator('.continuity-record-entry__example')
  await expect.poll(() => example.evaluate(element => element.textContent === element.getAttribute('aria-label'))).toBe(true)
  const authored = await example.getAttribute('aria-label')
  assert.equal(authored.split('\n').length, 2)
  assert.equal(await example.locator('span').evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap')
  const lines = await example.locator('span').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el.firstChild); return new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top))).size })
  assert.equal(lines, 2)
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
  const resources = await page.evaluate(async () => {
    const paths = ['/', '/api/health', '/nurse-station', '/smart-record', '/cases', ...Array.from(document.querySelectorAll('script[src],link[rel=stylesheet]')).map(el => el.src || el.href)]
    return Promise.all(paths.map(async url => ({ path: new URL(url, location.origin).pathname, status: (await fetch(url)).status })))
  })
  assert.ok(resources.every(item => item.status === 200)); result.checks.routesAndInitialAssets = resources
  const existingSession = await api('/api/auth/session', undefined, 'GET')
  if (existingSession.token) {
    assert.ok(existingSession.user?.nickname?.startsWith('首页验收') && !existingSession.user?.guest, 'Only this isolated runner’s synthetic account may be reused')
  } else {
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
  }
  token = (await api('/api/auth/session', undefined, 'GET')).token
  memberId = (await api('/api/members', { name: '布局验收（合成）', relationship: 'child', gender: 'female', birthday: '2025-01-01' })).id
  secondMemberId = (await api('/api/members', { name: '切换验收（合成）', relationship: 'child', gender: 'male', birthday: '2025-03-01' })).id
  await api('/api/auth/current-member', { memberId })
  await page.goto(base + '/nurse-station')
  await expect(page.getByRole('link', { name: '跟进列表', exact: true })).toBeVisible()
  for (const width of [375, 320, 390, 393, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : width === 320 ? 568 : 667 })
    await home(`home-${width}`)
  }
  result.checks.homeCopyFiveEqualCardsAndResponsive = 'PASS'
  await page.setViewportSize({ width: 375, height: 667 })
  const geometry = () => page.locator('.nurse-station-overview').evaluate(el => ({ height: el.getBoundingClientRect().height, inputHeight: el.querySelector('.continuity-record-entry__record').getBoundingClientRect().height, buttonY: el.querySelector('.continuity-record-entry__actions').getBoundingClientRect().y }))
  await page.locator('.nurse-station-overview').scrollIntoViewIfNeeded()
  const stable = await geometry()
  for (let sample = 0; sample < 12; sample++) { await page.waitForTimeout(500); assert.deepEqual(await geometry(), stable) }
  result.checks.liveTypingLayoutStable = 'PASS'
  for (const selector of ['.nurse-station-hero__main', '.nurse-station-growth-data > button:nth-child(1)', '.nurse-station-growth-data > button:nth-child(2)']) {
    await page.locator(selector).click(); await expect(page).toHaveURL(base + '/health-profile/basic'); await page.goBack(); await expect(page.locator('.nurse-station-growth-data')).toBeVisible()
  }
  await page.locator('.nurse-station-blood-type').click()
  const editor = page.getByRole('dialog', { name: '编辑血型', exact: true })
  await editor.getByRole('button', { name: 'B型', exact: true }).click(); await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0); await expect(page.locator('.nurse-station-blood-type')).toContainText('B型')
  await page.reload(); await expect(page.locator('.nurse-station-blood-type')).toContainText('B型')
  result.checks.originalGrowthRoutesAndRealBloodEdit = 'PASS'
  for (const name of ['切换验收（合成）', '布局验收（合成）']) {
    await page.getByRole('button', { name: '打开菜单', exact: true }).click()
    await page.getByRole('dialog', { name: '侧边栏菜单', exact: true }).getByRole('button', { name: '打开我的孩子', exact: true }).click()
    await page.getByRole('dialog', { name: '我的孩子', exact: true }).locator('.current-child-sheet__select').filter({ hasText: name }).click()
    await expect(page.locator('.nurse-station-identity')).toContainText(name)
    await expect(page.getByRole('button', { name: '记录症状', exact: true })).toBeVisible()
  }
  await expect(page.locator('.nurse-station-blood-type')).toContainText('B型'); result.checks.originalMemberSwitch = 'PASS'
  for (const [name, route] of [['健康随记', '/health-events'], ['健康档案', '/health-profile'], ['就诊情况单', '/visit-summary'], ['忌口出示卡', '/dietary-card'], ['用药提醒', '/medication-reminders']]) {
    await page.locator('.nurse-home-entry').filter({ hasText: name }).click()
    await expect(page).toHaveURL(base + route)
    await page.goBack()
    await expect(page).toHaveURL(base + '/nurse-station')
  }
  result.checks.remainingEntryNavigation = 'PASS'
  const entry = page.locator('.continuity-record-entry')
  const button = entry.getByRole('button', { name: '记录症状', exact: true })
  assert.ok(await button.evaluate(element => element.closest('a') === null))
  assert.ok((await button.boundingBox()).height >= 44)
  await expect(button.locator('button,a,input,textarea')).toHaveCount(0)
  await expect(entry.locator('.continuity-record-entry__example')).not.toContainText('例如：')
  const fake = page.getByRole('button', { name: '记录症状示例，开始记录', exact: true })
  for (const control of [fake, button]) {
    for (const edge of ['left', 'right']) {
      await control.scrollIntoViewIfNeeded()
      const rect = await control.boundingBox()
      await control.click({ position: { x: edge === 'left' ? 5 : rect.width - 5, y: rect.height / 2 } })
      await expect(page).toHaveURL(base + '/smart-record')
      await expect(page.getByRole('textbox', { name: '哪里不舒服', exact: true })).toHaveValue('')
      await page.goBack()
    }
  }
  await fake.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/smart-record')
  await expect(page.getByRole('textbox', { name: '哪里不舒服', exact: true })).toHaveValue('')
  await page.goBack()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/smart-record')
  await page.getByRole('textbox', { name: '哪里不舒服', exact: true }).fill('合成示例，非真实患者资料：首页速记导航与保存验收，原因未明确。')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  result.checks.quickNoteTextAndKeyboardSave = 'PASS'
  await page.goto(base + '/nurse-station')
  await expect(page.locator('.continuity-card')).toHaveCount(0)
  await home('home-one-case-375')
  await page.getByRole('link', { name: '跟进列表', exact: true }).click()
  await expect(page).toHaveURL(base + '/cases')
  await expect(page.locator('.continuity-card')).toHaveCount(1)
  const listScreenshot = path.join(output, 'follow-up-list-375.png')
  await page.screenshot({ path: listScreenshot, fullPage: true })
  result.screenshots.push(listScreenshot)
  await page.goBack()
  await expect(page).toHaveURL(base + '/nurse-station')
  await page.getByRole('link', { name: '跟进列表', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/cases')
  await expect(page.locator('.continuity-card')).toHaveCount(1)
  result.checks.homePreviewsRemovedAndListRetained = 'PASS'
  assert.equal(result.runtimeErrors, 0)
  assert.equal(result.http5xx, 0)
} catch (error) {
  result.failure = error.safe ?? { name: error.name, message: String(error.message).slice(0, 500) }
} finally {
  if (memberId) await api(`/api/members/${memberId}`, undefined, 'DELETE').then(() => { result.cleanup.syntheticMember = 'REMOVED' }).catch(() => { result.cleanup.syntheticMember = 'FAILED' })
  if (secondMemberId) await api(`/api/members/${secondMemberId}`, undefined, 'DELETE').then(() => { result.cleanup.secondSyntheticMember = 'REMOVED' }).catch(() => { result.cleanup.secondSyntheticMember = 'FAILED' })
  result.cleanup.acceptanceAccount = 'RETAINED_NO_IDENTITY_DELETION_BYPASS'
  result.finishedAt = new Date().toISOString()
  result.status = !result.failure && result.runtimeErrors === 0 && result.http5xx === 0 && result.cleanup.syntheticMember === 'REMOVED' && result.cleanup.secondSyntheticMember === 'REMOVED' ? 'PASS' : 'FAIL'
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  await context.close()
  process.exitCode = result.status === 'PASS' ? 0 : 1
}
