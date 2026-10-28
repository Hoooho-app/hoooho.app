import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { getLocalDateKey } from '../../src/utils/localCalendarDate'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
const day = getLocalDateKey(new Date(Date.now() - 86400000))
let memberId: string

test.beforeEach(async ({ page, request }) => {
  const response = await request.post('/api/members', { headers, data: { name: '日历回看合成对象', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(response.ok()).toBe(true)
  memberId = (await response.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
})

test('calendar has no creation controls and its month fills the space above bottom navigation', async ({ page }, info) => {
  await page.goto(`/health-events?view=month&day=${day}&month=${day.slice(0, 7)}`)
  await expect(page.getByRole('heading', { name: '健康日历', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '月历', exact: true })).toBeVisible()
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.locator('.journal-record-actions, .record-entry-actions')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^(智能记录|记录症状|记录日常)$/ })).toHaveCount(0)
    await expect(page.locator('.health-calendar__day').last()).toBeInViewport()
    const geometry = await page.locator('.health-calendar__grid').evaluate(grid => {
      const nav = document.querySelector('.hoho-bottom-navigation')!.getBoundingClientRect()
      const rect = grid.getBoundingClientRect()
      return { bottom: rect.bottom, navTop: nav.top, height: rect.height, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.navTop)
    expect(geometry.navTop - geometry.bottom).toBeLessThan(32)
    expect(geometry.height).toBeGreaterThan(500)
    expect(geometry.overflow).toBe(false)
    await page.screenshot({ path: info.outputPath(`calendar-month-${width}.png`) })
  }
  await page.getByRole('button', { name: '切换日历视图', exact: true }).click()
  await expect(page.getByRole('region', { name: '单日时间轴', exact: true })).toBeVisible()
  await expect(page.locator('.journal-record-actions, .record-entry-actions')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '主要导航' }).getByRole('button')).toHaveText(['症状记录', '健康日历', '孩子档案', '一键整理'])
})

test('saved full text remains readable from the month and recording still starts at the symptom page', async ({ page, request }) => {
  const text = '日历回看合成原文：昨日早上流鼻涕，下午精神与平时相同。'
  const created = await request.post('/api/quick-records', { headers, data: { memberId, title: '合成回看', content: text, occurredAt: `${day}T08:00:00+08:00`, inputChannel: 'text', idempotencyKey: `review-${memberId}`, journal: { categories: ['symptom'], timePrecision: 'exact' } } })
  expect(created.status(), await created.text()).toBe(201)
  let writes = 0
  page.on('request', req => { if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/quick-records') writes++ })
  await page.goto(`/health-events?view=month&day=${day}&month=${day.slice(0, 7)}`)
  const cell = page.getByRole('button', { name: new RegExp(`^${day}，`) })
  await expect(cell).toHaveAccessibleName(/1条记录/)
  await cell.click()
  const sheet = page.locator('.calendar-day-sheet')
  await expect(sheet).toBeVisible()
  await sheet.locator('.calendar-day-records button').first().click()
  await expect(page.locator('.symptom-record-sheet')).toContainText(text)
  await page.keyboard.press('Escape')
  await expect(page.locator('.symptom-record-sheet')).toHaveCount(0)
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByLabel('筛选记录类型').selectOption('symptom')
  await expect(cell).toHaveAccessibleName(/1条记录/)
  expect(writes).toBe(0)
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '症状记录', exact: true }).click()
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByRole('button', { name: '记录症状', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '记录症状', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/nurse-station$/)
  expect(writes).toBe(0)
})
