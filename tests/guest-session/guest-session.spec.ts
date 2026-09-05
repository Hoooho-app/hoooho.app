import { test, expect, chromium, devices, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const baseURL = 'http://127.0.0.1:4196'
async function identity(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session')
    const value = await response.json()
    return value.user?.id ?? null
  })
}
async function seed(page: Page) {
  return page.evaluate(async () => {
    const session = await (await fetch('/api/auth/session')).json()
    const call = async (url: string, body: unknown) => {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error(`test API ${url}: ${response.status}`)
      return response.json()
    }
    const member = await call('/api/members', { name: '验收宝宝', relationship: 'child', birthday: '2023-01-01', gender: 'female', avatar: 'girl-age3-east-asian' })
    const event = await call('/api/events', { memberId: member.id, title: '游客持久化验收', category: 'other', startTime: '2026-01-01T00:00:00Z' })
    await call(`/api/events/${event.id}/records`, { type: 'note', content: '隔离测试记录', occurredAt: '2026-01-01T01:00:00Z' })
    await call(`/api/events/${event.id}/records`, { type: 'note', content: '追加隔离测试记录', occurredAt: '2026-01-01T02:00:00Z' })
    await call('/api/auth/current-member', { memberId: member.id })
    await call('/api/auth/profile-sections', { memberId: member.id, sectionId: 'medication', revision: 0, records: [{ name: '测试档案', _savedAt: new Date().toISOString() }] })
    return { memberId: member.id, eventId: event.id }
  })
}

test('guest survives reload, hard reload, tabs and browser restart with server records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-guest-profile-'))
  const options = { ...devices['iPhone SE'], executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }
  let context = await chromium.launchPersistentContext(directory, options)
  const runtimeErrors: string[] = []
  const observe = (page: Page) => page.on('pageerror', () => runtimeErrors.push('pageerror'))
  try {
    let page = await context.newPage()
    observe(page)
    await page.goto(`${baseURL}/login`)
    await page.getByRole('button', { name: '暂不登录，先体验' }).click()
    await expect(page).toHaveURL(/health-events/)
    const accountId = await identity(page)
    expect(accountId).toBeTruthy()
    const records = await seed(page)
    for (const hard of [false, true]) {
      if (hard) { const cdp = await context.newCDPSession(page); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.detach() }
      await page.reload()
      await expect(page.getByRole('button', { name: '快速记录' })).toBeVisible()
      expect(await identity(page)).toBe(accountId)
    }
    const tab = await context.newPage()
    await tab.goto(`${baseURL}/health-events`)
    await expect(tab.getByRole('button', { name: '快速记录' })).toBeVisible()
    expect(await identity(tab)).toBe(accountId)
    await tab.close(); await page.close()
    await context.close()
    context = await chromium.launchPersistentContext(directory, options)
    page = await context.newPage()
    observe(page)
    await page.goto(`${baseURL}/health-events/${records.eventId}`)
    await expect(page.getByText('追加隔离测试记录', { exact: true }).first()).toBeVisible()
    expect(await identity(page)).toBe(accountId)
    const cookies = await context.cookies()
    const cookie = cookies.find((item) => item.name === 'hoooho_session')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 179 * 86400)
    expect(await page.evaluate(() => document.cookie.includes('hoooho_session'))).toBe(false)
    await page.screenshot({ path: 'tests/guest-session/restored-iphone-se.png', fullPage: true })
    expect(runtimeErrors).toEqual([])
  } finally { await context.close(); await rm(directory, { recursive: true, force: true }) }
})

test('failed restoration offers retry and never creates a guest; browsers stay isolated', async ({ page, browser }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: '暂不登录，先体验' }).click()
  await expect(page).toHaveURL(/health-events/)
  const accountId = await identity(page)
  let created = 0
  page.on('request', (request) => { if (request.url().endsWith('/api/auth/guest')) created++ })
  await page.route('**/api/auth/session', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  expect(created).toBe(0)
  await page.unroute('**/api/auth/session')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  expect(await identity(page)).toBe(accountId)
  const other = await browser.newContext()
  try {
    const otherPage = await other.newPage()
    await otherPage.goto(`${baseURL}/health-events`)
    await expect(otherPage).toHaveURL(/login/)
    expect(await identity(otherPage)).toBeNull()
  } finally { await other.close() }
})
