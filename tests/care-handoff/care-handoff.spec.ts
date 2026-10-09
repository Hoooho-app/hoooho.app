import { test, expect } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
const token = new TokenService('handoff-e2e-local-only-secret', 60 * 60_000).create({ id: 'handoff-test' })

async function parent(page: import('@playwright/test').Page, mode: 'native' | 'clipboard' | 'blocked' | 'cancel' | 'realClipboard' = 'native') {
  await page.addInitScript(({ token, mode }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'handoff-test' }, members: [], currentMemberId: 'handoff-child' }, version: 5 }))
    const state = window as unknown as { sharedUrl: string; copiedUrl: string; clickActive: boolean }
    document.addEventListener('click', () => { state.clickActive = true; setTimeout(() => { state.clickActive = false }, 0) }, true)
    Object.defineProperty(navigator, 'share', { configurable: true, value: (mode === 'clipboard' || mode === 'realClipboard') ? undefined : (data: { url: string }) => {
      if (!state.clickActive) return Promise.reject(new DOMException('User gesture expired', 'NotAllowedError'))
      state.sharedUrl = data.url
      if (mode === 'blocked') return Promise.reject(new DOMException('Sharing blocked', 'NotAllowedError'))
      if (mode === 'cancel') return Promise.reject(new DOMException('Cancelled', 'AbortError'))
      return Promise.resolve()
    } })
    if (mode === 'realClipboard') return
    Object.defineProperty(navigator, 'clipboard', { value: {
      write: (items: ClipboardItem[]) => {
        if (!state.clickActive) return Promise.reject(new DOMException('User gesture expired', 'NotAllowedError'))
        return items[0].getType('text/plain').then(blob => blob.text()).then(url => { state.copiedUrl = url })
      },
      writeText: (url: string) => { if (!state.clickActive) return Promise.reject(new DOMException('User gesture expired', 'NotAllowedError')); state.copiedUrl = url; return Promise.resolve() }
    } })
  }, { token, mode })
  await page.goto('/care-handoff')
  await expect(page.getByRole('heading', { name: '交接测试宝宝' })).toBeVisible()
}

test('first click retains the gesture across a slow publish and opens a working public link', async ({ page, browser }) => {
  await page.route('**/care-handoff/share', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue() })
  await parent(page)
  let shares = 0
  page.on('request', request => { if (request.url().endsWith('/care-handoff/share')) shares += 1 })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  expect(shares).toBe(0)
  const parentContent = await page.locator('.handoff-content').textContent()
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  // The share API must be invoked immediately, not after the slow response.
  const link = await page.evaluate(() => (window as unknown as { sharedUrl: string }).sharedUrl)
  expect(link).toMatch(/\/care-handoff\/shared\/[A-Za-z0-9_-]{32}$/)
  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const sharedPage = await recipient.newPage()
  const response = await sharedPage.goto(link)
  expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  await expect(page.getByRole('status')).toHaveText('已分享链接')
  expect(shares).toBe(1)
  await expect(sharedPage.getByRole('heading', { name: '交接测试宝宝' })).toBeVisible()
  expect(await sharedPage.locator('.handoff-content').textContent()).toBe(parentContent)
  await expect(sharedPage.getByRole('button', { name: '分享链接' })).toHaveCount(0)
  expect(await sharedPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  expect(shares).toBe(1)
  expect(errors).toEqual([])
  await recipient.close()
})

test('all modules are grouped cards with compact routines, one basic identity and one action', async ({ page }) => {
  await parent(page)
  expect(await page.locator('.handoff-section h2').allTextContents()).toEqual(['用药与医嘱', '忌口与过敏注意', '照护注意', '正在观察', '日常安排', '慢性病史', '疫苗安排'])
  await expect(page.locator('.handoff-section.hoho-health-card')).toHaveCount(7)
  await expect(page.locator('.handoff-basic')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '花生' })).toBeAttached()
  await expect(page.getByRole('heading', { name: '药甲' })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /停止分享|查看对方页面/ })).toHaveCount(0)
  await expect(page.locator('.handoff-row-inline')).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/care-handoff/parent-cards.png' })
})

test('one click copies the published URL with a deferred clipboard payload', async ({ page }) => {
  await page.route('**/care-handoff/share', async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.continue() })
  await parent(page, 'clipboard')
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('链接已复制，发给照看人即可')
  const link = await page.evaluate(() => (window as unknown as { copiedUrl: string }).copiedUrl)
  const result = await page.request.get(new URL(link).pathname.replace('/care-handoff/shared/', '/api/care-handoffs/shared/'))
  expect(result.ok()).toBe(true)
})

test('a blocked native share provides a valid selectable URL; cancellation is not success', async ({ page }) => {
  await parent(page, 'blocked')
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('链接已生成，请长按复制后发送')
  await expect(page.getByRole('textbox', { name: '分享链接' })).toHaveValue(/\/care-handoff\/shared\/[A-Za-z0-9_-]{32}$/)
  await page.close()
})

test('cancel does not claim success or copy a link', async ({ page }) => {
  await parent(page, 'cancel')
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('button', { name: '分享链接', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: '分享链接' })).toHaveCount(0)
  await expect(page.getByText('已分享链接')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { copiedUrl?: string }).copiedUrl)).toBeUndefined()
})

test('failed publication never copies a broken URL or claims sharing succeeded', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/care-handoff/share', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '网络繁忙，请重试' } }) }))
  await parent(page, 'clipboard')
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('网络繁忙，请重试')
  expect(await page.evaluate(() => (window as unknown as { copiedUrl?: string }).copiedUrl)).toBeUndefined()
  await expect(page.getByRole('textbox', { name: '分享链接' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('an early recipient waits for publication rather than seeing a broken link', async ({ page }) => {
  let reads = 0
  const data = await (await page.request.get('/api/members/handoff-child/care-handoff', { headers: { Authorization: `Bearer ${token}` } })).json()
  await page.route('**/api/care-handoffs/shared/*', route => {
    reads += 1
    return route.fulfill({ status: reads < 3 ? 404 : 200, contentType: 'application/json', body: JSON.stringify(reads < 3 ? { error: { message: 'not yet published' } } : data) })
  })
  await page.goto('/care-handoff/shared/abcdefghijklmnopqrstuvwx01234567')
  await expect(page.getByRole('status')).toHaveText('正在打开照看资料…')
  await expect(page.getByRole('heading', { name: '交接测试宝宝' })).toBeVisible()
  expect(reads).toBe(3)
})

test('invalid public link stays public and shows a recoverable error', async ({ page }) => {
  await page.goto('/care-handoff/shared/invalid')
  await expect(page.getByText('暂时无法打开这份照看资料，请稍后重试或联系分享者。')).toBeVisible()
  await expect(page).toHaveURL(/\/care-handoff\/shared\/invalid$/)
})


test('real browser clipboard contains a public working link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await parent(page, 'realClipboard')
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('链接已复制，发给照看人即可')
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/care-handoff\/shared\/[A-Za-z0-9_-]{32}$/)
  const response = await page.request.get(new URL(link).pathname.replace('/care-handoff/shared/', '/api/care-handoffs/shared/'))
  expect(response.ok()).toBe(true)
})

test('changed data requires a fresh displayed version and allows retry on the same button', async ({ page }) => {
  let attempts = 0
  await page.route('**/care-handoff/share', route => {
    attempts += 1
    return attempts === 1 ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CARE_HANDOFF_CHANGED', message: '照看资料已有更新，请重新查看后分享' } }) }) : route.continue()
  })
  await parent(page, 'clipboard')
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByText('照看资料已有更新，请重新查看后分享')).toBeVisible()
  await expect(page.getByRole('heading', { name: '交接测试宝宝' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { copiedUrl?: string }).copiedUrl)).toBeUndefined()
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('链接已复制，发给照看人即可')
  expect(attempts).toBe(2)
})

test('renewing the same account session during publication does not silently drop sharing', async ({ page }) => {
  await parent(page)
  const renewed = new TokenService('handoff-e2e-local-only-secret', 60 * 60_000).create({ id: 'handoff-test' }, Date.now() + 1)
  await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: renewed, user: { id: 'handoff-test', nickname: '交接测试家长', currentMemberId: 'handoff-child' } }) }))
  let attempts = 0
  await page.route('**/care-handoff/share', route => {
    attempts += 1
    return attempts === 1 ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: '请恢复使用状态' } }) }) : route.continue()
  })
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('已分享链接')
  expect(attempts).toBe(2)
})
