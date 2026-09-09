import { expect, test, type Page } from '@playwright/test'

async function register(page: Page, nickname = '测试家长') {
  await page.goto('/login')
  await page.getByPlaceholder('给自己起个昵称').fill(nickname)
  await page.getByPlaceholder('设置一个密码').fill('simple-password')
  await page.getByRole('button', { name: '注册并进入' }).click()
  const id = (await page.getByText(/^H[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/).textContent())!
  await page.getByRole('button', { name: '进入 Hoooho' }).click()
  await expect(page).toHaveURL(/nurse-station/)
  return id
}

test('default registration creates a durable formal account and ID login restores it', async ({ page }) => {
  const hooohoId = await register(page)
  const accountId = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id)
  await page.reload()
  expect((await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id))).toBe(accountId)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })

  await page.goto('/login')
  await page.getByRole('tab', { name: '登录' }).click()
  await expect(page.getByPlaceholder('请输入 Hoooho ID')).toHaveValue(hooohoId)
  await page.getByPlaceholder('请输入密码').fill('simple-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/nurse-station/)
})

test('registration layout fits iPhone SE and email verification remains secondary', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    await expect(page.getByRole('tab', { name: '注册' })).toHaveAttribute('aria-selected', 'true')
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.width)
    expect(sizes.height).toBeLessThanOrEqual(viewport.height)
  }
  await page.getByRole('button', { name: '使用邮箱验证码' }).click()
  await expect(page.getByPlaceholder('请输入邮箱地址')).toBeVisible()
})
