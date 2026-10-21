import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const origin = process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin))
const target = origin.includes('staging') ? 'staging' : 'production'
const out = `outputs/allergy-knowledge/${target}`
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(20000)
let token = '', memberId = '', accountId = ''
const report = { target, syntheticOnly: true, checks: [], realIPhoneSafari: 'NOT_VERIFIED' }
async function api(path, method = 'GET', data) {
  const response = await context.request.fetch(path, { method, data, headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 30000 })
  assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()}`)
  return response.json()
}
try {
  assert.equal((await api('/api/health')).status, 'ok')
  const session = await api('/api/auth/register', 'POST', { nickname: `knowledgeqa${randomUUID().replaceAll('-', '').slice(0, 8)}`, password: randomUUID(), idempotencyKey: randomUUID() })
  token = session.token
  accountId = session.user.id
  memberId = (await api('/api/members', 'POST', { name: '科普验收（虚构资料）', relationship: 'child' })).id
  await api('/api/auth/current-member', 'POST', { memberId })
  await page.addInitScript(({ token, accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, accountId, memberId })
  await page.clock.install({ time: new Date('2026-10-18T04:00:00Z') })
  // The release operator deploys only after the isolated mobile suite passes.
  // Poll for the new entrance without any AI calls or access to real members.
  const deadline = Date.now() + 18 * 60000
  while (true) {
    await page.goto('/nurse-station', { waitUntil: 'domcontentloaded', timeout: 60000 })
    try { await page.locator('.home-knowledge-entry').waitFor({ state: 'visible', timeout: 12000 }); break }
    catch (error) { if (Date.now() > deadline) throw error; await new Promise(resolve => setTimeout(resolve, 10000)) }
  }
  await expect(page.getByRole('button', { name: /今日过敏小知/ })).toContainText('过敏检测阳性')
  await page.goto('/allergy-knowledge/eczema-observation-beyond-redness')
  await expect(page.getByText('这篇内容暂不可用')).toBeVisible()
  // Simulate the next local edition on the actual deployed bundle. This is
  // scheduled-content acceptance, not a claim that it is already visible today.
  await page.clock.setSystemTime(new Date('2026-10-19T04:00:00Z'))
  await page.goto('/nurse-station')
  await expect(page.getByRole('button', { name: /今日过敏小知/ })).toContainText('湿疹反复')
  report.checks.push('2026-10-18 retains seed; future article hidden; simulated 2026-10-19 edition selects new article')
  for (const [width, height] of [[320, 568], [375, 667], [393, 852]]) {
    await page.setViewportSize({ width, height })
    const entry = page.getByRole('button', { name: /今日过敏小知/ })
    await expect(entry).toBeVisible()
    assert.ok((await entry.boundingBox()).height >= 44)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${out}/home-${width}.png` })
    await entry.click()
    await expect(page.getByRole('heading', { name: '湿疹反复，除了红不红，还该记录什么？', exact: true })).toBeVisible()
    assert.ok((await page.locator('.allergy-knowledge-body').innerText()).length >= 600)
    await expect(page.getByText(/明天聊|明日预告/)).toHaveCount(0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${out}/article-${width}.png` })
    const bookmark = page.getByRole('button', { name: '收藏', exact: true })
    if (await bookmark.isVisible()) await bookmark.click()
    await expect(page.getByRole('button', { name: '已收藏', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const savedBookmark = page.getByRole('button', { name: '已收藏', exact: true })
    assert.equal(await savedBookmark.locator('[aria-live]').evaluate(label => {
      const range = document.createRange()
      range.selectNodeContents(label)
      return range.getClientRects().length
    }), 1)
    const bookmarkBox = await savedBookmark.boundingBox()
    const headerTitleBox = await page.getByRole('heading', { name: '过敏小知', exact: true }).boundingBox()
    assert.ok(bookmarkBox.height >= 44 && bookmarkBox.x >= headerTitleBox.x + headerTitleBox.width && bookmarkBox.x + bookmarkBox.width <= width)
    await page.screenshot({ path: `${out}/article-saved-${width}.png` })
    await page.getByText('参考依据', { exact: true }).click()
    await expect(page.getByRole('link', { name: /美国儿科学会/ })).toHaveCount(2)
    await expect(page.getByRole('link', { name: /NHS/ })).toBeVisible()
    await expect(page.getByText('资料核对：2026-10-18', { exact: true })).toHaveCount(3)
    await page.getByRole('button', { name: '往期内容', exact: true }).click()
    await expect(page.getByRole('region', { name: '往期内容' })).toContainText('已收藏')
    await page.getByRole('button', { name: /湿疹反复，除了红不红，还该记录什么/ }).click()
    await expect(page.getByRole('button', { name: '已收藏', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await expect(page).toHaveURL(/\/nurse-station$/)
    report.checks.push(`${width}x${height}: entrance, article, sources, bookmark, history, back`)
  }
  await page.goto('/allergy-knowledge/positive-test-and-food-avoidance')
  await expect(page.getByRole('heading', { name: '过敏检测阳性，就一定要忌口吗？', exact: true })).toBeVisible()
  report.checks.push('historical stable article URL retained')
  await page.goto('/allergy-knowledge/missing-article')
  await expect(page.getByText('这篇内容暂不可用')).toBeVisible()
  assert.deepEqual(errors, [])
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAILED'
  report.error = error.message
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally {
  if (token && memberId) {
    const member = (await api('/api/members').catch(() => [])).find(item => item.id === memberId)
    if (member?.accountId === accountId && member.name === '科普验收（虚构资料）') {
      try {
        await api(`/api/members/${memberId}`, 'DELETE')
        report.cleanup = 'only the synthetic member removed'
      } catch (error) {
        report.cleanup = `synthetic cleanup failed: ${error.message}`
        report.status = 'FAILED'
        process.exitCode = 1
      }
    }
  }
  await writeFile(`${out}/acceptance.json`, JSON.stringify({ ...report, errors }, null, 2))
  console.log(JSON.stringify({ ...report, errors }))
  await browser.close()
}
