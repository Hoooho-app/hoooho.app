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

test('new account enters the app and exposes its account identity in the drawer footer', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('给自己起个昵称').fill('刘磊')
  await page.getByPlaceholder('设置一个密码').fill('12345678')
  await page.getByRole('button', { name: '注册并进入' }).click()
  const hooohoId = await page.getByText(/^H[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/).textContent()
  await page.getByRole('button', { name: '进入 Hoooho' }).click()
  await expect(page).toHaveURL(/\/nurse-station/)
  const accountId = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id)
  await page.reload()
  expect(await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id)).toBe(accountId)
  await page.getByRole('button', { name: '打开菜单' }).click()
  const accountButton = page.getByRole('button', { name: /刘磊/ })
  await expect(accountButton).toContainText(hooohoId!)
  const box = await accountButton.boundingBox()
  expect(box && box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await accountButton.click()
  await expect(page.getByRole('dialog', { name: '账户' })).toContainText('账户与安全')
  await noHorizontalOverflow(page)
})

test('registered account pages match the scoped account structure', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { token: 'test-token', user: { id: account.id, email: account.email, createdAt: new Date().toISOString() } } }))
  await page.route('**/api/members', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/auth/profile-sections', (route) => route.fulfill({ json: [] }))
  await page.addInitScript((profile) => {
    sessionStorage.setItem('hoooho-auth-token', 'test-token')
    localStorage.setItem('hoooho-app', JSON.stringify({ version: 5, state: {
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
