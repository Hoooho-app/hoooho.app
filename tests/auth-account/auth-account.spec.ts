import { expect, test, type Browser, type Page } from '@playwright/test'

async function register(page: Page, nickname = `测试家长${Date.now().toString().slice(-8)}`) {
  await page.goto('/login')
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(nickname)
  await page.getByPlaceholder('设置一个密码').fill('simple-password')
  await page.getByRole('button', { name: '注册并进入' }).click()
  await expect(page).toHaveURL(/nurse-station/)
  return nickname
}

async function reopenWithSavedCookies(browser: Browser, page: Page) {
  const storageState = await page.context().storageState()
  expect(storageState.cookies.some((cookie) => cookie.name === 'hoooho_session')).toBe(true)
  await page.context().close()
  const context = await browser.newContext({ storageState, viewport: { width: 375, height: 667 } })
  const restored = await context.request.get('http://127.0.0.1:4196/api/auth/session')
  expect(await restored.json()).not.toEqual({ unauthenticated: true })
  return { context, page: await context.newPage() }
}

test('registration creates a durable formal account and default nickname login restores it', async ({ browser }) => {
  const initialContext = await browser.newContext({ viewport: { width: 375, height: 667 } })
  let page = await initialContext.newPage()
  const nickname = await register(page)
  const accountId = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id)
  await page.reload()
  expect((await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id))).toBe(accountId)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })

  await page.goto('/login')
  await expect(page.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByPlaceholder('输入你的昵称')).toHaveValue(nickname)
  await expect(page.getByRole('checkbox', { name: '记住登录信息' })).toBeChecked()
  await expect(page.getByPlaceholder('输入你的昵称')).toHaveAttribute('name', 'username')
  await expect(page.getByPlaceholder('输入你的昵称')).toHaveAttribute('autocomplete', 'username')
  await expect(page.getByPlaceholder('输入密码')).toHaveAttribute('name', 'password')
  await expect(page.getByPlaceholder('输入密码')).toHaveAttribute('autocomplete', 'current-password')
  await page.getByPlaceholder('输入密码').fill('simple-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/nurse-station/)
  const persistentCookie = (await page.context().cookies()).find((item) => item.name === 'hoooho_session')
  expect(persistentCookie?.expires).toBeGreaterThan(Date.now() / 1000)
  const localState = await page.evaluate(() => ({ nickname: localStorage.getItem('lastLoginNickname'), all: JSON.stringify(localStorage) }))
  expect(localState.nickname).toBe(nickname)
  expect(localState.all).not.toContain('simple-password')

  const reopened = await reopenWithSavedCookies(browser, page)
  page = reopened.page
  await page.goto('/login')
  await expect(page).toHaveURL(/nurse-station/)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await page.goto('/login')
  await expect(page).toHaveURL(/login/)
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'hoooho_session')).toBe(false)
  await reopened.context.close()
})

test('session-only login clears the remembered nickname and issues a browser-session cookie', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const page = await context.newPage()
  const nickname = await register(page)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await page.goto('/login')
  await page.getByPlaceholder('输入密码').fill('simple-password')
  await page.getByRole('checkbox', { name: '记住登录信息' }).uncheck()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/nurse-station/)
  expect(await page.evaluate(() => localStorage.getItem('lastLoginNickname'))).toBeNull()
  const cookie = (await context.cookies()).find((item) => item.name === 'hoooho_session')
  expect(cookie?.expires).toBe(-1)
  await page.reload()
  await expect(page).toHaveURL(/nurse-station/)
  await context.close()

  const reopened = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const reopenedPage = await reopened.newPage()
  await reopenedPage.goto('/login')
  await expect(reopenedPage).toHaveURL(/login/)
  await expect(reopenedPage.getByPlaceholder('输入你的昵称')).toHaveValue('')
  await reopened.close()
})

test('registration layout fits iPhone SE and email verification remains secondary', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    await expect(page.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('checkbox', { name: '记住登录信息' })).toBeChecked()
    await expect(page.getByText('敏宝情况记录与就医准备', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab')).toHaveText(['登录', '注册'])
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.width)
    expect(sizes.height).toBeLessThanOrEqual(viewport.height)
  }
  for (const label of ['手机号登录，暂未开放', '微信登录，暂未开放', 'Apple 登录，暂未开放', 'Google 登录，暂未开放']) await expect(page.getByRole('button', { name: label })).toBeDisabled()
  const wechatColor = await page.getByRole('button', { name: '微信登录，暂未开放' }).evaluate((button) => ({
    button: getComputedStyle(button).color,
    icon: getComputedStyle(button.querySelector('svg')!).fill
  }))
  expect(wechatColor.icon).toBe(wechatColor.button)
  await expect(page.getByText('忘记密码')).toHaveCount(0)
  await expect(page.getByText('暂不登录')).toHaveCount(0)
  await page.getByRole('button', { name: '邮箱验证码登录' }).click()
  await expect(page.getByText('返回账号登录')).toBeVisible()
  await expect(page.getByPlaceholder('请输入邮箱地址')).toBeVisible()
  await expect(page.getByText('Hoooho ID')).toHaveCount(0)
})
