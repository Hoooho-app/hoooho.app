import { expect, test, type Page } from '@playwright/test'
import { openFirstUseLogin } from '../helpers/first-child'

const legacyKey = 'hoooho-record-updates-v1'
let memberId: string
let headers: { Authorization: string }
let sequence = 0
let errors: string[]

async function noUpdateDots(page: Page) {
  await expect(page.getByRole('img', { name: '有新内容', exact: true })).toHaveCount(0)
  await expect(page.locator('.record-update-dot')).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBeNull()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  sequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${sequence}` })
  await openFirstUseLogin(page)
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`移除提示${Date.now()}`)
  await page.getByPlaceholder('设置一个密码').fill('synthetic-badges-only')
  const registering = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '注册并进入', exact: true }).click()
  await expect(page).toHaveURL(/nurse-station/)
  const session = await (await registering).json()
  headers = { Authorization: `Bearer ${session.token}` }
  const created = await page.request.post('/api/members', { headers, data: { name: '无红点合成宝宝', birthday: '2024-01-01', relationship: 'child', gender: 'female' } })
  expect(created.ok(), await created.text()).toBe(true)
  memberId = (await created.json()).id
  expect((await page.request.post('/api/auth/current-member', { headers, data: { memberId } })).ok()).toBe(true)
  await page.evaluate(id => {
    const persisted = JSON.parse(localStorage.getItem('hoooho-app')!)
    persisted.state.currentMemberId = id
    localStorage.setItem('hoooho-app', JSON.stringify(persisted))
  }, memberId)
})

test.afterEach(() => { expect(errors).toEqual([]) })

test('upgrade removes old account/member indicators and profile saves remain readable without any dots', async ({ page }, info) => {
  await page.evaluate(({ key, memberId }) => {
    const state = JSON.parse(localStorage.getItem('hoooho-app')!).state
    localStorage.setItem(key, JSON.stringify({ state: { items: [
      { id: 'profile', accountId: state.authUser.id, memberId, destination: 'profile', sectionId: 'surgery', at: Date.now() },
      { id: 'calendar', accountId: state.authUser.id, memberId, destination: 'calendar', at: Date.now() },
      { id: 'other-child', accountId: state.authUser.id, memberId: 'another-child', destination: 'symptom', at: Date.now() }
    ] }, version: 0 }))
  }, { key: legacyKey, memberId })
  await page.goto('/health-profile')
  await expect(page.getByRole('navigation', { name: '档案分类', exact: true })).toBeVisible()
  await noUpdateDots(page)
  await page.getByRole('button', { name: /^手术史/ }).click()
  await page.getByRole('button', { name: '添加手术史', exact: true }).click()
  await page.getByLabel('手术名称或描述', { exact: true }).fill('合成手术资料，完整保留')
  const saving = page.waitForResponse(response => new URL(response.url()).pathname === `/api/members/${memberId}/profile-list/surgery` && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saving).ok()).toBe(true)
  await expect(page.locator('.inline-profile-item')).toContainText('合成手术资料，完整保留')
  await noUpdateDots(page)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByRole('button', { name: /^手术史/ })).toContainText('1条')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '侧边栏菜单', exact: true })).toBeVisible()
  await noUpdateDots(page)
  await page.keyboard.press('Escape')
  await page.reload()
  await noUpdateDots(page)
  await page.screenshot({ path: info.outputPath('profile-without-dots.png'), fullPage: true, scale: 'css' })
  const saved = await page.request.get(`/api/members/${memberId}/profile-list/surgery`, { headers })
  expect((await saved.json()).rows.map((row: { name: string }) => row.name)).toEqual(['合成手术资料，完整保留'])
  const second = await page.request.post('/api/members', { headers, data: { name: '二宝', birthday: '2025-01-01', relationship: 'child', gender: 'male' } })
  expect(second.ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: '切换记录对象', exact: true }).click()
  const children = page.getByRole('dialog', { name: '我的孩子', exact: true })
  await children.getByRole('button', { name: '切换到*宝', exact: true }).click()
  await expect(children).toBeHidden()
  await expect(page.getByRole('button', { name: /^手术史/ })).toContainText('未记录')
  await noUpdateDots(page)
  expect((await (await page.request.get(`/api/members/${memberId}/profile-list/surgery`, { headers })).json()).rows).toHaveLength(1)
})

test('saving a real daily record, retrying and reopening its calendar detail never recreates notification state', async ({ page }, info) => {
  await page.addInitScript(key => {
    ;(window as unknown as { badgeWrites: number }).badgeWrites = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) (window as unknown as { badgeWrites: number }).badgeWrites += 1
      return original.call(this, name, value)
    }
  }, legacyKey)
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByRole('button', { name: '日常', exact: true }).click()
  await page.getByRole('button', { name: '喂养与饮食', exact: true }).click()
  const form = page.getByRole('dialog', { name: '喂养/饮食', exact: true })
  await form.getByRole('radio', { name: '配方奶', exact: true }).click()
  await form.getByLabel('本次记录名称', { exact: true }).fill('不带红点的合成奶量记录')
  await form.getByRole('spinbutton', { name: /^喂奶量/ }).fill('120')
  let fail = true
  await page.route('**/api/quick-records', async route => {
    if (route.request().method() === 'POST' && fail) {
      fail = false
      await route.fulfill({ status: 503, json: { error: { code: 'SYNTHETIC_FAILURE', message: '合成保存失败，请重试' } } })
    } else await route.continue()
  })
  const save = form.getByRole('button', { name: '保存记录', exact: true })
  await save.click()
  await expect(form.getByText('合成保存失败，请重试', { exact: true })).toBeVisible()
  await noUpdateDots(page)
  const response = page.waitForResponse(result => new URL(result.url()).pathname === '/api/quick-records' && result.request().method() === 'POST' && result.status() === 201)
  await save.click()
  const saved = await (await response).json()
  expect(await page.evaluate(() => (window as unknown as { badgeWrites: number }).badgeWrites)).toBe(0)
  await noUpdateDots(page)
  await page.goto('/health-events?view=month')
  await expect(page.getByRole('region', { name: '月历', exact: true })).toBeVisible()
  await noUpdateDots(page)
  await page.screenshot({ path: info.outputPath('calendar-without-dots.png'), scale: 'css' })
  const url = `/health-events?eventId=${saved.eventId}&recordId=${saved.recordId}`
  await page.goto(url)
  await expect(page.getByRole('dialog')).toContainText('不带红点的合成奶量记录')
  await noUpdateDots(page)
  await page.reload()
  await expect(page.getByRole('dialog')).toContainText('不带红点的合成奶量记录')
  await noUpdateDots(page)
  const records = await (await page.request.get(`/api/events/${saved.eventId}/records`, { headers })).json()
  expect(records.filter((record: { id: string }) => record.id === saved.recordId)).toHaveLength(1)
})

test('malformed or unavailable legacy badge storage cannot block normal pages', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, 'not valid JSON'), legacyKey)
  await page.goto('/health-events')
  await expect(page.getByRole('heading', { name: '健康日历', exact: true })).toBeVisible()
  await noUpdateDots(page)
  await page.addInitScript(key => {
    localStorage.setItem(key, 'retired unread data')
    const original = Storage.prototype.removeItem
    Storage.prototype.removeItem = function (name) {
      if (name === key) throw new DOMException('Synthetic legacy-cache restriction', 'SecurityError')
      return original.call(this, name)
    }
  }, legacyKey)
  await page.goto('/health-profile')
  await expect(page.getByRole('navigation', { name: '档案分类', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '有新内容', exact: true })).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe('retired unread data')
})
