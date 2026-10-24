import { expect, test, type Browser, type Page } from '@playwright/test'

let registrationSequence = 0
const origin = `http://127.0.0.1:${process.env.AUTH_TEST_PORT || '4196'}`

async function openLogin(page: Page) {
  await page.goto('/login')
  await page.locator('.hoooho-onboarding, [role="tablist"][aria-label="登录或注册"]').first().waitFor()
  const start = page.getByRole('button', { name: '开始', exact: true })
  if (await start.isVisible()) await start.click()
}

async function register(page: Page, nickname = `测试家长${Date.now().toString().slice(-8)}`) {
  registrationSequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${registrationSequence}` })
  await openLogin(page)
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(nickname)
  await page.getByPlaceholder('设置一个密码').fill('simple-password')
  await page.getByRole('button', { name: '注册并进入' }).click()
  await expect(page).toHaveURL(/nurse-station/)
  return nickname
}

async function reopenWithSavedState(browser: Browser, page: Page) {
  const storageState = await page.context().storageState()
  expect(storageState.cookies.some((cookie) => cookie.name === 'hoooho_session')).toBe(true)
  await page.context().close()
  const context = await browser.newContext({ storageState, viewport: { width: 375, height: 667 } })
  const restored = await context.request.get(`${origin}/api/auth/session`)
  expect(restored.headers()['x-hoooho-session-outcome']).toBe('valid')
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
  const loginRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/nickname/login'))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const sent = await loginRequest
  expect(sent.headers()['x-hoooho-nickname-storage']).toBe('present')
  expect(sent.headers()['x-hoooho-remember-preference']).toBe('true')
  await expect(page).toHaveURL(/nurse-station/)
  const persistentCookie = (await page.context().cookies()).find((item) => item.name === 'hoooho_session')
  expect(persistentCookie?.expires).toBeGreaterThan(Date.now() / 1000)
  const localState = await page.evaluate(() => ({ nickname: localStorage.getItem('lastLoginNickname'), all: JSON.stringify(localStorage) }))
  expect(localState.nickname).toBe(nickname)
  expect(localState.all).not.toContain('simple-password')

  const reopened = await reopenWithSavedState(browser, page)
  page = reopened.page
  await page.goto('/')
  await expect(page).toHaveURL(/nurse-station/)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await page.goto('/login')
  await expect(page).toHaveURL(/login/)
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'hoooho_session')).toBe(false)
  await reopened.context.close()
})

test('revoked persistent session falls back to the remembered nickname without storing the password', async ({ browser }) => {
  const initialContext = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const page = await initialContext.newPage()
  const nickname = await register(page)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await page.goto('/login')
  await page.getByPlaceholder('输入密码').fill('simple-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/nurse-station/)

  const storageState = await initialContext.storageState()
  const storedOrigin = storageState.origins.find((item) => item.origin === origin)
  expect(storedOrigin?.localStorage.some((item) => item.name === 'lastLoginNickname' && item.value === nickname)).toBe(true)
  expect(JSON.stringify(storageState.origins)).not.toContain('simple-password')

  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await initialContext.close()

  const reopened = await browser.newContext({ storageState, viewport: { width: 375, height: 667 } })
  const reopenedPage = await reopened.newPage()
  await reopenedPage.goto('/')
  await expect(reopenedPage).toHaveURL(/login/)
  await expect(reopenedPage.getByPlaceholder('输入你的昵称')).toHaveValue(nickname)
  await expect(reopenedPage.getByPlaceholder('输入密码')).toHaveValue('')
  expect(await reopenedPage.evaluate(() => JSON.stringify(localStorage))).not.toContain('simple-password')
  await reopened.close()
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
  await openLogin(reopenedPage)
  await expect(reopenedPage).toHaveURL(/login/)
  await expect(reopenedPage.getByPlaceholder('输入你的昵称')).toHaveValue('')
  await reopened.close()
})

test('registration layout fits iPhone SE and email verification remains secondary', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    await openLogin(page)
    await expect(page.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('checkbox', { name: '记住登录信息' })).toBeChecked()
    await expect(page.getByText('敏宝情况记录与就医准备', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab')).toHaveText(['登录', '注册'])
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.width)
    expect(sizes.height).toBeLessThanOrEqual(viewport.height)
  }
  const methods = page.locator('[aria-label="其他登录方式"]')
  await expect(methods.getByRole('button')).toHaveCount(4)
  for (const label of ['Apple 登录', '手机号验证码登录', '手机号密码登录', '邮箱验证码登录']) await expect(methods.getByRole('button', { name: label, exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: /微信|Google|谷歌/ })).toHaveCount(0)
  await expect(page.getByText('忘记密码')).toHaveCount(0)
  await expect(page.getByText('暂不登录')).toHaveCount(0)
  await page.getByRole('button', { name: '邮箱验证码登录' }).click()
  await expect(page.getByText('返回账号登录')).toBeVisible()
  await expect(page.getByPlaceholder('请输入邮箱地址')).toBeVisible()
  await expect(page.getByText('Hoooho ID')).toHaveCount(0)
})


test('Apple and phone password entries explain pending integration and return to working login methods', async ({ page }) => {
  await openLogin(page)
  const authRequests: string[] = []
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().includes('/api/auth/')) authRequests.push(request.url()) })
  await page.getByPlaceholder('输入密码').fill('temporary-secret')
  await page.getByRole('button', { name: 'Apple 登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '使用 Apple 登录' })).toBeFocused()
  await expect(page.getByRole('status')).toContainText('Apple 登录正在接入')
  await page.getByRole('button', { name: '使用邮箱登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '使用邮箱验证码' })).toBeVisible()
  await page.getByRole('button', { name: '返回账号登录' }).click()
  await expect(page.getByPlaceholder('输入密码')).toHaveValue('')
  await page.getByRole('button', { name: '手机号密码登录', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('手机号密码登录正在接入')
  await expect(page.getByPlaceholder('输入你的昵称')).toHaveCount(0)
  await page.getByRole('button', { name: '使用手机验证码', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '手机号', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回账号登录' }).click()
  await expect(page.getByRole('tab', { name: '登录', exact: true })).toHaveAttribute('aria-selected', 'true')
  expect(authRequests).toEqual([])
})

test('phone OTP uses its own endpoints and failed delivery never claims success or starts cooldown', async ({ page }) => {
  await openLogin(page)
  await page.getByRole('button', { name: '手机号验证码登录', exact: true }).click()
  const phone = page.getByRole('textbox', { name: '手机号', exact: true })
  const send = page.getByRole('button', { name: '获取验证码', exact: true })
  await phone.fill('123')
  await expect(send).toBeDisabled()
  await phone.fill('13812345678')
  const unavailable = page.waitForResponse((response) => response.url().endsWith('/api/auth/send-code'))
  await send.click()
  expect((await unavailable).status()).toBe(503)
  await expect(page.getByRole('alert')).toHaveText('短信登录正在接入，请先使用邮箱或账号密码登录')
  await expect(send).toBeEnabled()
  await expect(page.getByText('验证码已发送，请查看短信')).toHaveCount(0)

  // Test only the UI's success/cooldown and error states without sending a real SMS.
  await page.route('**/api/auth/send-code', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ phone: '13812345678' })
    await route.fulfill({ json: { success: true, expiresIn: 300, retryAfter: 60 } })
  })
  await send.click()
  await expect(page.getByText('验证码已发送，请查看短信')).toBeVisible()
  await expect(page.getByRole('button', { name: /^\d+s$/ })).toBeDisabled()
  const code = page.getByRole('textbox', { name: '短信验证码', exact: true })
  await expect(code).toBeFocused()
  await code.fill('123456')
  const invalidCode = page.waitForRequest((request) => request.url().endsWith('/api/auth/login'))
  await page.getByRole('button', { name: '继续', exact: true }).click()
  expect((await invalidCode).postDataJSON()).toMatchObject({ phone: '13812345678', code: '123456' })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).unauthenticated)).toBe(true)
  await phone.fill('13912345678')
  await expect(code).toHaveValue('')
  await page.getByRole('button', { name: '返回账号登录' }).click()
  await page.getByRole('button', { name: '邮箱验证码登录', exact: true }).click()
  await page.getByRole('textbox', { name: '邮箱地址', exact: true }).fill('parent@example.com')
  await expect(page.getByRole('button', { name: '获取验证码', exact: true })).toBeEnabled()
})
