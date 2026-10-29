import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Fictional fixtures stay inside this browser; deployed checks never write user data.
for (const width of [375, 390, 430]) test(`bowel form follows V2 and cancels without saving at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 667 })
  const writes: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 500) errors.push(`HTTP ${response.status()}`) })
  const user = { id: 'bowel-audit-account', nickname: '表单验收', guest: false, requiresNicknameSetup: false }
  const child = { id: 'bowel-audit-child', accountId: user.id, name: '验收孩子', relationship: 'child', birthday: '2025-01-01', gender: 'female', avatar: '', createdAt: '2026-01-01T00:00:00Z' }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') writes.push(`${route.request().method()} ${path}`)
    let body: unknown = []
    if (path === '/api/auth/session') body = { token: 'bowel-browser-fixture-token', user }
    if (path === '/api/members') body = [child]
    if (path === `/api/members/${child.id}`) body = child
    if (path === '/api/account/profile') body = { ...user, avatar: '', email: null, phone: null, providers: [], hasPassword: true }
    if (path === '/api/account/entry-state') body = { familyMemberCount: 1, hasValidHealthRecord: true }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  // Recording starts at the symptom page; the calendar only reviews saved data.
  await page.goto('/nurse-station')
  await expect(page.getByRole('heading', { name: '症状记录', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByRole('button', { name: '日常', exact: true }).click()
  await page.getByRole('group', { name: '记录日常选项' }).getByRole('button', { name: '排便', exact: true }).click()
  const form = page.getByRole('dialog', { name: '记录排便', exact: true })
  await expect(form).toBeVisible()
  await expect(form.locator('.record-subject-card')).toHaveCount(0)
  await expect(form.locator('.diet-record-scroll > :nth-last-child(2)')).toHaveClass('record-time-group')
  await expect(form.locator('.diet-record-scroll > :last-child')).toHaveClass(/daily-record-settings/)
  await expect(form.locator('.diet-record-scroll > :first-child')).toContainText('形状')
  await expect(form.locator('.bowel-shape-grid > button')).toHaveCount(7)
  await expect(form.locator('.bowel-color-grid > button')).toHaveCount(8)
  await expect(form.locator('.diet-record-scroll > .bowel-fieldset').first()).toHaveCSS('box-shadow', 'none')
  await expect(form.locator('.diet-record-scroll > .bowel-fieldset').first()).toHaveCSS('border-radius', '0px')
  const shape = form.getByRole('button', { name: '光滑条状', exact: true })
  await shape.click(); await expect(shape).toHaveAttribute('aria-pressed', 'true')
  await shape.click(); await expect(shape).toHaveAttribute('aria-pressed', 'false')
  await form.getByRole('button', { name: '硬小颗粒', exact: true }).click()
  await shape.click()
  await expect(form.locator('.bowel-shape-grid [aria-pressed=true]')).toHaveCount(2)
  await form.getByRole('button', { name: '黄色', exact: true }).click()
  await expect(form.getByRole('button', { name: '黄色', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const summary = form.locator('.bowel-overview-supplement > summary')
  await summary.focus(); await summary.press('Enter')
  await expect(form.getByRole('slider', { name: '分量', exact: true })).toBeVisible()
  await form.getByRole('button', { name: '一般', exact: true }).click()
  await expect(form.getByRole('button', { name: '一般', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await summary.press('Enter')
  await expect(form.getByRole('slider', { name: '分量', exact: true })).toBeHidden()
  await expect(summary).toHaveCSS('min-height', '52px')
  await form.getByRole('textbox', { name: '发生时间', exact: true }).fill('2026-01-01T12:30')
  await expect(form.getByRole('textbox', { name: '发生时间', exact: true })).toHaveValue('2026-01-01T12:30')
  await expect(form.getByRole('button', { name: '上传照片', exact: true })).toHaveClass(/hoho-button/)
  await expect(form.getByRole('button', { name: '保存记录', exact: true })).toBeEnabled()
  expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await form.locator('.bowel-photo-section').scrollIntoViewIfNeeded()
  await mkdir('outputs/bowel-form', { recursive: true })
  const environment = process.env.BOWEL_TEST_URL ? new URL(process.env.BOWEL_TEST_URL).hostname : 'local'
  await page.screenshot({ path: `outputs/bowel-form/${environment}-${width}-lower.png` })
  await form.getByRole('button', { name: '返回记录新情况', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page).toHaveURL(/\/nurse-station$/)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
  const keyboard = page.getByRole('button', { name: '改用文字', exact: true })
  if (await keyboard.isVisible()) await keyboard.click()
  await page.getByRole('button', { name: '日常', exact: true }).click()
  await page.getByRole('group', { name: '记录日常选项' }).getByRole('button', { name: '排便', exact: true }).click()
  await expect(form.locator('.bowel-shape-grid [aria-pressed=true]')).toHaveCount(2)
  await page.screenshot({ path: `outputs/bowel-form/${environment}-${width}-top.png` })
  await info.attach('verification', { body: JSON.stringify({ width, writes, errors, device: 'iPhone SE', serverData: 'mocked in browser; no writes' }), contentType: 'application/json' })
})
