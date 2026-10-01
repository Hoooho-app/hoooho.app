import { expect, test } from '@playwright/test'
// Use the actual deterministic backend calculation with isolated synthetic
// fixtures. Never write these records to a real account.
import { calculateFoodAllergyIndex } from '../../server/food-allergy-index/food-allergy-index-service.mjs'
const accountId = 'index-test-account', memberId = 'index-test-child'
const makeItem = (id: string, full: boolean) => ({ id, memberId, category: 'food', name: id === 'egg' ? '鸡蛋' : '牛奶', reactions: [{ id: 'r-' + id, symptoms: '红疹', handling: '未用药', ...(full ? { severity: 'moderate', exposureAmount: '5克' } : {}) }] })
test('真实公式联动、来源、新增编辑删除、失败保留、切换孩子和空状态', async ({ page }, info) => {
  let archive: unknown[] = [makeItem('egg', true), makeItem('milk', false)]
  let fail = false, current = memberId
  const members = [memberId, 'other-child'].map((id, index) => ({ id, accountId, name: index ? '测试孩子二' : '测试孩子一', relationship: 'child', gender: 'female', birthday: '2024-12-20', avatar: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }))
  await page.addInitScript(({ accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', 'test-token')
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { accountId, memberId })
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), pathname = url.pathname
    let body: unknown = {}
    if (pathname === '/api/auth/session') body = { token: 'test-token', user: { id: accountId, currentMemberId: current, nickname: '测试家长' } }
    if (pathname === '/api/members') body = members
    if (pathname === '/api/account/entry-state') body = { familyMemberCount: 2, hasValidHealthRecord: true }
    if (pathname === '/api/auth/current-member') current = req.postDataJSON().memberId
    if (pathname === '/api/auth/profile-sections') {
      if (req.method() === 'POST') archive = req.postDataJSON().records
      body = req.method() === 'POST' ? {} : []
    }
    if (['/api/events','/api/medication-reminders','/api/growth-measurements','/api/desensitization-tests'].includes(pathname)) body = []
    if (pathname === '/api/desensitization-tests') body = { tasks: [], suggestions: [] }
    if (pathname === '/api/food-allergy-index') {
      if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'test outage' } }) })
      body = calculateFoodAllergyIndex({ archive: url.searchParams.get('memberId') === memberId ? archive : [], accountId, memberId: url.searchParams.get('memberId') })
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/nurse-station')
  const home = page.locator('.nurse-station-allergy-index')
  await expect(home).toContainText('75%')
  await expect(home).toBeEnabled()
  // A successful mutation through the production API client invalidates the
  // active statistic immediately, without navigation or a manual retry.
  const save = async (records: unknown[]) => page.evaluate(async records => {
    const { apiRequest } = await import('/src/services/apiClient.ts')
    await apiRequest('/api/auth/profile-sections', { token: 'test-token', method: 'POST', body: { records } })
  }, records)
  await save([makeItem('egg', false)])
  await expect(home).toContainText('50%')
  await save([makeItem('egg', true)])
  await expect(home).toContainText('100%')
  await save([])
  await expect(home).toContainText('0%')
  await save([makeItem('egg', true), makeItem('milk', false)])
  await expect(home).toContainText('75%')
  if (info.project.name === 'iphone-se') await page.screenshot({ path: 'artifacts/food-allergy-index/iphone-se-home.png' })
  await home.click()
  const card = page.locator('.food-allergy-index-current')
  await expect(card).toContainText('75%')
  await expect(card).toContainText('不代表过敏越轻')
  await expect(card).toBeInViewport()
  await expect(page.getByText('已记录信息：6 / 8 项')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('暂未开放')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (info.project.name === 'iphone-se') await page.screenshot({ path: 'artifacts/food-allergy-index/iphone-se-detail.png' })
  await page.getByText('鸡蛋', { exact: true }).click()
  await expect(page.getByText('A · 反应严重程度：已记录')).toBeVisible()
  await expect(page.getByRole('link', { name: '过敏史反应 · 查看来源' }).first()).toHaveAttribute('href', '/health-profile/allergy/egg')
  fail = true
  await page.getByRole('button', { name: '返回前台' }).click()
  await expect(page.getByText('指数更新失败，保留上次结果。')).toBeVisible()
  await expect(home).toContainText('75%')
  fail = false
  archive = [makeItem('egg', false)]
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(home).toContainText('50%')
  archive = [makeItem('egg', true)]
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('button', { name: '打开我的孩子' }).click()
  await page.getByRole('button', { name: '切换到测试孩子二' }).click()
  await expect(home).toContainText('0%')
  await home.click()
  await expect(card).toContainText('0%')
  await expect(page.getByText('还没有可整理的食物相关记录')).toBeVisible()
  await page.getByRole('button', { name: '返回前台' }).click()
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('button', { name: '打开我的孩子' }).click()
  await page.getByRole('button', { name: '切换到测试孩子一' }).click()
  await expect(home).toContainText('100%')
  await home.click()
  await expect(card).toContainText('100%')
  await expect(page.locator('body')).not.toContainText('已康复')
  await page.getByRole('button', { name: '返回前台' }).click()
  archive = []
  await home.click()
  await expect(card).toContainText('0%')
})
test('首次失败不显示伪造零分，可重试', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('hoooho-auth-token', 'test-token')
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'failure-account' }, currentMemberId: 'failure-child', members: [], profile: null }, version: 5 }))
  })
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    const body = pathname === '/api/auth/session' ? { token: 'test-token', user: { id: 'failure-account', currentMemberId: 'failure-child' } } : pathname === '/api/members' ? [{ id: 'failure-child', accountId: 'failure-account', name: '测试', relationship: 'child' }] : pathname === '/api/auth/profile-sections' ? [] : {}
    await route.fulfill({ status: pathname === '/api/food-allergy-index' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/food-allergy-status-index')
  await expect(page.locator('.food-allergy-index-current')).toContainText('加载失败')
  await expect(page.locator('.food-allergy-index-current strong')).not.toHaveText('0%')
  await expect(page.getByRole('button', { name: '重试' })).toBeEnabled()
})
