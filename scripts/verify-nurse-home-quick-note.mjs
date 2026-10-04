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
const output = path.resolve(`outputs/home-compact-colors-20261005/${production ? 'production' : 'staging'}`)
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
  await expect(page.getByRole('button', { name: '症状描述示例，情况速记', exact: true })).toBeVisible()
  await expect(page.locator('.nurse-home-entry--medication')).toContainText('0 个提醒任务')
  await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  await expect(page.locator('.continuity-home h2,.continuity-home .continuity-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '跟进列表', exact: true })).toBeVisible()
  await expect(page.locator('.nurse-home-entry strong')).toHaveText(['就诊情况单', '忌口出示卡', '配料表扫描', '用药提醒', '健康日记', '孩子档案'])
  await expect(page.locator('.nurse-home-entry').nth(2)).toHaveCSS('background-color', 'rgb(255, 244, 234)')
  const palette = await page.locator('.nurse-home-entry').evaluateAll(cards => cards.map(card => getComputedStyle(card).backgroundColor))
  assert.deepEqual(palette, ['rgb(238, 245, 252)', 'rgb(255, 250, 232)', 'rgb(255, 244, 234)', 'rgb(245, 241, 252)', 'rgb(238, 249, 242)', 'rgb(255, 241, 246)'])
  assert.equal(new Set(palette).size, 6)
  await expect(page.locator('.nurse-home-entry').nth(2)).toHaveAttribute('href', '/food-label')
  await expect(page.locator('.nurse-home-entry').nth(3)).toHaveAttribute('href', '/medication-reminders')
  await expect(page.locator('.nurse-station-overview')).toHaveCount(0)
  await expect(page.locator('.continuity-record-entry strong,.continuity-record-entry__header,.continuity-record-entry a')).toHaveCount(0)
  const layout=await page.locator('.continuity-record-entry').evaluate(el=>{const action=el.querySelector('.continuity-record-entry__action').getBoundingClientRect(),follow=el.querySelector('.continuity-record-entry__followup').getBoundingClientRect(),hero=document.querySelector('.nurse-station-hero'),rect=el.getBoundingClientRect();return {height:rect.height,width:rect.width,actionX:action.x,followX:follow.x,actionWidth:action.width,followWidth:follow.width,actionHeight:action.height,followHeight:follow.height,gap:follow.y-action.bottom,background:getComputedStyle(el).backgroundColor,heroGap:el.parentElement.getBoundingClientRect().y-hero.getBoundingClientRect().bottom}})
  assert.equal(layout.height, await page.evaluate(()=>innerWidth<=360?136:114));assert.equal(layout.actionX,layout.followX);assert.equal(layout.actionWidth,layout.followWidth);assert.equal(layout.actionHeight,44);assert.equal(layout.followHeight,44);assert.equal(layout.gap,0);assert.equal(layout.background,'rgb(233, 246, 242)');assert.equal(layout.heroGap,12)
  const paintedHeights = await page.locator('.continuity-record-entry__buttons .hoho-button').evaluateAll(buttons => buttons.map(button => {
    const surface = getComputedStyle(button, '::before')
    return button.getBoundingClientRect().height - parseFloat(surface.top) - parseFloat(surface.bottom)
  }))
  assert.deepEqual(paintedHeights, [36, 36])
  await expect(page.locator('.continuity-record-entry__action')).toHaveText('情况速记')
  await expect(page.locator('.continuity-record-entry__followup')).toHaveText('跟进列表')
  await expect(page.locator('.continuity-home input,.continuity-home textarea,.continuity-home button button,.continuity-home button a')).toHaveCount(0)
  const example = page.locator('.continuity-record-entry__example')
  await expect.poll(() => example.evaluate(element => element.textContent === element.getAttribute('aria-label'))).toBe(true)
  assert.ok(!(await example.getAttribute('aria-label')).includes('\n'))
  await expect(example).toHaveCSS('font-size','13px')
  await expect(example.locator('span')).toHaveCSS('white-space','normal')
  const sizes = await page.locator('.nurse-home-entry').evaluateAll(cards => cards.map(card => ({ width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height })))
  assert.equal(sizes.length, 6)
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
  await expect(page.getByRole('button', { name: '跟进列表', exact: true })).toBeVisible()
  // A retained QA browser may restore its previous member preference during bootstrap.
  // Select the newly owned fixture through the real UI before editing any data.
  async function selectOwnedMember(name, expectedId) {
    await page.getByRole('button', { name: '打开菜单', exact: true }).click()
    await page.getByRole('dialog', { name: '侧边栏菜单', exact: true }).getByRole('button', { name: '打开我的孩子', exact: true }).click()
    await page.getByRole('dialog', { name: '我的孩子', exact: true }).locator('.current-child-sheet__select').filter({ hasText: name }).click()
    await expect(page.locator('.nurse-station-identity')).toContainText(name)
    assert.equal((await api('/api/auth/session', undefined, 'GET')).user.currentMemberId, expectedId)
  }
  await selectOwnedMember('布局验收（合成）', memberId)
  for (const width of [375, 320, 390, 393, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : width === 320 ? 568 : 667 })
    await home(`home-${width}`)
  }
  result.checks.homeCopySixEqualCardsAndResponsive = 'PASS'
  await page.setViewportSize({ width: 375, height: 667 })
  const geometry = () => page.locator('.continuity-record-entry').evaluate(el => ({ height: el.getBoundingClientRect().height, inputHeight: el.querySelector('.continuity-record-entry__record').getBoundingClientRect().height, buttonY: el.querySelector('.continuity-record-entry__action').getBoundingClientRect().y }))
  await page.locator('.continuity-record-entry').scrollIntoViewIfNeeded()
  const stable = await geometry()
  for (let sample = 0; sample < 12; sample++) { await page.waitForTimeout(500); assert.deepEqual(await geometry(), stable) }
  const example=page.locator('.continuity-record-entry__example')
  const samples=[]
  for(let index=0;index<10;index++) {
    await expect.poll(()=>example.evaluate(el=>el.textContent===el.getAttribute('aria-label')), {timeout:15000}).toBe(true)
    const measured=await example.evaluate(el=>{const span=el.querySelector('span'),range=document.createRange();range.selectNodeContents(span.firstChild);const rects=[...range.getClientRects()],box=el.getBoundingClientRect();return {index:Number(el.dataset.typewriterIndex),lines:rects.length,maxRight:Math.max(...rects.map(r=>r.right)),right:box.right,bottom:range.getBoundingClientRect().bottom,boxBottom:box.bottom,text:el.textContent}})
    samples.push(measured);assert.equal(measured.lines,3);assert.ok(measured.maxRight<=measured.right);assert.ok(measured.bottom<=measured.boxBottom);assert.deepEqual(await geometry(),stable)
    await expect.poll(()=>example.textContent(), {timeout:6000,intervals:[50]}).toBe('')
    assert.deepEqual(await geometry(),stable)
  }
  assert.equal(new Set(samples.map(sample=>sample.index)).size,10)
  result.checks.liveTenExamplesThreeLinesAndInstantClear=samples
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
  assert.equal((await api(`/api/members/${memberId}`, undefined, 'GET')).bloodType, 'B')
  for (const [name, expectedId] of [['切换验收（合成）', secondMemberId], ['布局验收（合成）', memberId]]) {
    await selectOwnedMember(name, expectedId)
    await expect(page.getByRole('button', { name: '症状描述示例，情况速记', exact: true })).toBeVisible()
  }
  await expect(page.locator('.nurse-station-blood-type')).toContainText('B型'); result.checks.originalMemberSwitch = 'PASS'
  for (const [name, route] of [['健康日记', '/health-events'], ['孩子档案', '/health-profile'], ['就诊情况单', '/visit-summary'], ['忌口出示卡', '/dietary-card'], ['用药提醒', '/medication-reminders'], ['配料表扫描', '/food-label']]) {
    await page.locator('.nurse-home-entry').filter({ hasText: name }).click()
    await expect(page).toHaveURL(base + route)
    await page.goBack()
    await expect(page).toHaveURL(base + '/nurse-station')
  }
  result.checks.remainingEntryNavigation = 'PASS'
  await page.locator('.nurse-home-entry--food-label').focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/food-label')
  await page.goBack(); await expect(page).toHaveURL(base + '/nurse-station')
  result.checks.ingredientScanKeyboardNavigation = 'PASS'
  const entry = page.locator('.continuity-record-entry')
  const button = entry.getByRole('button', { name: '症状描述示例，情况速记', exact: true })
  assert.ok(await button.evaluate(element => element.closest('a') === null))
  assert.ok((await button.boundingBox()).height >= 44)
  await expect(button.locator('button,a,input,textarea')).toHaveCount(0)
  await expect(entry.locator('.continuity-record-entry__example')).not.toContainText('例如：')
  const fake = page.getByRole('button', { name: '症状描述示例，情况速记', exact: true })
  for (const control of [button, entry.getByRole('button', { name: '情况速记', exact: true })]) {
    for (const edge of ['left', 'right']) {
      await control.scrollIntoViewIfNeeded()
      const rect = await control.boundingBox()
      await control.click({ position: { x: edge === 'left' ? 5 : rect.width - 5, y: rect.height / 2 } })
      await expect(page).toHaveURL(base + '/smart-record')
      await expect(page.getByRole('textbox', { name: '哪里不舒服', exact: true })).toHaveValue('')
      await page.goBack()
    }
  }
  await entry.locator('.continuity-record-entry__example').click()
  await expect(page).toHaveURL(base + '/smart-record')
  await expect(page.getByRole('textbox', { name: '哪里不舒服', exact: true })).toHaveValue('')
  await page.goBack()
  await fake.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/smart-record')
  await expect(page.getByRole('textbox', { name: '哪里不舒服', exact: true })).toHaveValue('')
  await page.goBack()
  await entry.getByRole('button', { name: '情况速记', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/smart-record')
  await page.getByRole('textbox', { name: '哪里不舒服', exact: true }).fill('合成示例，非真实患者资料：首页速记导航与保存验收，原因未明确。')
  const saveStartedAt = Date.now()
  const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/members/${memberId}/case-records` && response.request().method() === 'POST', { timeout: 45000 })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const saveResponse = await savedResponse
  result.checks.quickNoteSaveResponse = { status: saveResponse.status(), elapsedMs: Date.now() - saveStartedAt }
  assert.ok(saveResponse.ok(), 'Real quick-record save must succeed')
  const savedCase = await saveResponse.json()
  assert.ok(savedCase.eventId, 'Saved case must return its real event identifier')
  await expect(page).toHaveURL(base + `/health-events/${savedCase.eventId}`, { timeout: 45000 })
  result.checks.quickNoteTextAndKeyboardSave = 'PASS'
  await page.goto(base + '/nurse-station')
  await expect(page.locator('.continuity-card')).toHaveCount(0)
  await home('home-one-case-375')
  await page.getByRole('button', { name: '跟进列表', exact: true }).click()
  await expect(page).toHaveURL(base + '/cases')
  await expect(page.getByRole('tab', { name: /跟进中/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.continuity-card')).toHaveCount(1)
  const listScreenshot = path.join(output, 'follow-up-list-375.png')
  await page.screenshot({ path: listScreenshot, fullPage: true })
  result.screenshots.push(listScreenshot)
  await page.goBack()
  await expect(page).toHaveURL(base + '/nurse-station')
  await page.getByRole('button', { name: '跟进列表', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(base + '/cases')
  await expect(page.locator('.continuity-card')).toHaveCount(1)
  result.checks.homePreviewsRemovedAndListRetained = 'PASS'
  assert.equal(result.runtimeErrors, 0)
  assert.equal(result.http5xx, 0)
} catch (error) {
  result.failure = error.safe ?? { name: error.name, message: String(error.message).slice(0, 500) }
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
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
