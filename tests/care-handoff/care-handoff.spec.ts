import { test, expect } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
const token = new TokenService('handoff-e2e-local-only-secret', 60 * 60_000).create({ id: 'handoff-test' })

test('one button shares all modules and the recipient sees identical content without login', async ({ page, browser }) => {
  await page.addInitScript(token => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'handoff-test' }, members: [], currentMemberId: 'handoff-child' }, version: 5 }))
    Object.defineProperty(navigator, 'share', { value: async (data: { url: string }) => { (window as unknown as { sharedUrl: string }).sharedUrl = data.url } })
  }, token)
  let shares = 0
  page.on('request', request => { if (request.url().endsWith('/care-handoff/share')) shares += 1 })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/care-handoff')
  await expect(page.getByRole('heading', { name: '交接测试宝宝' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '用药与医嘱' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '花生' })).toBeAttached()
  expect(await page.locator('.handoff-section h2').allTextContents()).toEqual(['用药与医嘱', '忌口与过敏注意', '照护注意', '正在观察', '日常安排', '慢性病史', '疫苗安排'])
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /停止分享|查看对方页面/ })).toHaveCount(0)
  expect(shares).toBe(0)
  const parentContent = await page.locator('.handoff-content').textContent()
  await page.getByRole('button', { name: '分享链接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('已分享链接')
  expect(shares).toBe(1)
  const link = await page.evaluate(() => (window as unknown as { sharedUrl: string }).sharedUrl)
  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const sharedPage = await recipient.newPage()
  const response = await sharedPage.goto(link)
  expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  await expect(sharedPage.getByRole('heading', { name: '交接测试宝宝' })).toBeVisible()
  expect(await sharedPage.locator('.handoff-content').textContent()).toBe(parentContent)
  await expect(sharedPage.getByRole('button', { name: '分享链接' })).toHaveCount(0)
  expect(await sharedPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await recipient.close()
})

test('invalid public link stays public and shows a recoverable error', async ({ page }) => {
  await page.goto('/care-handoff/shared/invalid')
  await expect(page.getByText('暂时无法打开这份照看资料，请稍后重试或联系分享者。')).toBeVisible()
  await expect(page).toHaveURL(/\/care-handoff\/shared\/invalid$/)
})
