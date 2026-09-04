import { expect, test } from '@playwright/test'

const account = {
  id: 'account-1',
  nickname: '刘磊',
  avatar: null,
  phone: null,
  email: 'liulei@example.com',
  membership: 'free',
  providers: [
    { provider: 'wechat', label: '微信', bound: true, displayName: 'Ray' },
    { provider: 'qq', label: 'QQ', bound: false, displayName: null },
    { provider: 'apple', label: 'Apple', bound: false, displayName: null }
  ]
}

async function noHorizontalOverflow(page: import('@playwright/test').Page) {
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width)
}

test('guest enters the app and can reach login guidance from the visible drawer footer', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: '暂不登录，先体验' }).click()
  await expect(page).toHaveURL(/\/health-events/)
  const guestId = await page.evaluate(() => localStorage.getItem('hoooho-guest-id'))
  expect(guestId).toMatch(/^[0-9a-f-]{36}$/)
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('hoooho-guest-id'))).toBe(guestId)
  await page.getByRole('button', { name: '打开菜单' }).click()
  const accountButton = page.getByRole('button', { name: /未登录/ })
  await expect(accountButton).toContainText('当前为体验模式')
  const box = await accountButton.boundingBox()
  expect(box && box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await accountButton.click()
  await expect(page.getByRole('dialog', { name: '登录或注册' })).toContainText('继续体验')
  await noHorizontalOverflow(page)
})

test('registered account pages match the scoped account structure', async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem('hoooho-app', JSON.stringify({ version: 4, state: {
      authToken: 'test-token',
      authUser: { id: profile.id, email: profile.email, createdAt: new Date().toISOString() },
      accountProfile: profile,
      currentMemberId: 'self',
      members: [],
      profile: null,
      opsAuthToken: null,
      opsAuthUser: null
    } }))
  }, account)
  await page.route('**/api/account/profile', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account) }))
  for (const path of ['/account/security', '/account/nickname', '/account/phone', '/account/email', '/account/providers', '/account/membership', '/account/delete']) {
    await page.goto(path)
    await noHorizontalOverflow(page)
  }
  await page.goto('/account/providers')
  await expect(page.getByText('微信', { exact: true })).toBeVisible()
  await expect(page.getByText('Ray', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '已绑定' })).toBeVisible()
  await expect(page.getByRole('button', { name: '绑定', exact: true })).toHaveCount(2)
  await page.goto('/account/security')
  await expect(page.getByText('会员状态')).toHaveCount(0)
  await expect(page.getByText('数据同步')).toHaveCount(0)
})
