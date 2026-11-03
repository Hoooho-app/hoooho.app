import { test, expect, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
const tokens = new TokenService('synthetic-local-resource-usage-secret', 3600000)
const user = { id: 'usage-owner', email: 'usage-ops@example.test' }
const token = tokens.create(user), other = tokens.create({ id: 'usage-other', email: 'other@example.test' })
async function prepare(page: Page) {
  await page.addInitScript(({ token, user }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    sessionStorage.setItem('hoooho-ops-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ version: 5, state: { authUser: user, currentMemberId: 'usage-child', members: [], profile: null } }))
  }, { token, user })
}
test('Production entry API protects global data and scopes account usage regardless of query parameters', async ({ request }) => {
  expect((await request.get('/api/ops/resources')).status()).toBe(401)
  expect((await request.get('/api/account/usage')).status()).toBe(401)
  expect((await request.get('/api/ops/resources', { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(403)
  const a = await (await request.get('/api/account/usage', { headers: { Authorization: `Bearer ${token}` } })).json()
  const b = await (await request.get('/api/account/usage?accountId=usage-owner', { headers: { Authorization: `Bearer ${other}` } })).json()
  expect(a.storage.fileBytes).toBe(2048)
  expect(a.ai.inputTokens).toBe(1200)
  expect(a.ai.unknown).toBe(1)
  expect(b.storage.bytes).toBe(0)
  expect(b.ai.calls).toBe(0)
})
test('sidebar utilities precede history, account is below and real scoped usage is last and opens details', async ({ page }, info) => {
  await prepare(page)
  for (const [width, height] of [[390, 844], [320, 568], [1366, 768]]) {
    await page.setViewportSize({ width, height }); await page.goto('/nurse-station')
    await page.getByRole('button', { name: '打开菜单', exact: true }).click()
    await expect(page.getByRole('button', { name: '查看个人用量详情' })).toContainText('1,500 Tokens')
    const order = await page.locator('.hoho-drawer--history').evaluate(node => [...node.children].map(child => child.className))
    expect(order).toEqual(['drawer-utilities', 'drawer-conversations', 'drawer-identities', 'drawer-usage'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await expect(page.getByRole('button', { name: '我的账户', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: '查看个人用量详情' })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`) })
    await page.getByRole('button', { name: '查看个人用量详情' }).click()
    const detail = page.getByRole('dialog', { name: '个人用量详情' })
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('1 次调用未返回完整 Token 回执')
    await expect(detail).toContainText('1.5 分钟')
    await detail.getByRole('button', { name: '重新读取', exact: true }).click()
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('1,500 Tokens')
    await detail.getByRole('button', { name: '关闭个人用量详情', exact: true }).click()
    await expect(detail).toBeHidden()
  }
})
test('failed usage is not shown as zero and retry recovers in the same details sheet', async ({ page }) => {
  await prepare(page); let fail = true
  await page.route('**/api/account/usage', async route => fail ? route.fulfill({ status: 503, json: { error: { message: '合成：用量读取失败' } } }) : route.continue())
  await page.goto('/nurse-station'); await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await page.getByRole('button', { name: '查看个人用量详情' }).click()
  const detail = page.getByRole('dialog', { name: '个人用量详情' })
  await expect(detail).toContainText('合成：用量读取失败')
  await expect(detail).not.toContainText('0 Tokens')
  fail = false; await detail.getByRole('button', { name: '重新读取', exact: true }).click()
  await expect(detail).toContainText('1,500 Tokens')
})
test('ops resource page uses actual filesystem metrics, reflows, and keeps unsupported projects empty', async ({ page }, info) => {
  await prepare(page)
  for (const [width, height] of [[2560, 1080], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height }); await page.goto('/ops/resources')
    await expect(page.getByRole('heading', { name: '持久化数据盘', exact: false })).toBeVisible()
    await expect(page.getByText('本次定价建议', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: '可用空间', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: info.outputPath(`resources-${width}.png`) })
  }
  await page.goto('/ops/resources?project=qinggan')
  await expect(page.getByRole('heading', { name: '该项目尚未接入资源监控' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '可用空间', exact: true })).toHaveCount(0)
})
