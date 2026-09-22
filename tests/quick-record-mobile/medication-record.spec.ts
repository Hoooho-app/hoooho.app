import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('quick-record-mobile-e2e-secret', 3600_000).create({ id: 'quick-record-e2e-account' })

async function prepare(page: Page) {
  const response = await page.request.post('/api/members', { headers: { Authorization: `Bearer ${token}` }, data: { name: '测试宝宝', birthday: '2024-01-01', gender: 'male', avatar: '', relationship: 'child', primaryRecorderRelationship: 'father' } })
  expect(response.ok()).toBe(true)
  const member = await response.json()
  await page.addInitScript(({ authToken, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'quick-record-e2e-account' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { authToken: token, memberId: member.id })
  await page.goto('/health-events')
  await expect(page.getByRole('button', { name: '记录', exact: true })).toBeEnabled()
}

async function openMedicationForm(page: Page) {
  await page.getByRole('button', { name: '记录', exact: true }).click()
  const entry = page.getByRole('dialog', { name: '记录新情况' })
  await expect(entry.locator('.journal-record-entry-grid > button')).toHaveCount(4)
  await entry.getByRole('button', { name: /记录用药/ }).click()
  return page.getByRole('dialog', { name: '记录用药' })
}

test('iPhone SE 四项入口直达精简用药表单且没有横向溢出', async ({ page }) => {
  await prepare(page)
  const form = await openMedicationForm(page)
  await expect(form.getByRole('heading', { name: '药品名称' })).toBeVisible()
  await expect(form.getByRole('heading', { name: '本次实际用量' })).toBeVisible()
  await expect(form.getByLabel('实际用药时间')).toBeVisible()
  await expect(form.getByText('补充对应症状', { exact: true })).toBeVisible()
  await expect(form.getByText('补充对应就医', { exact: true })).toBeVisible()
  await expect(form.getByText(/设置用药提醒|使用方式|补充日常信息|营养补剂/)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await expect(form.getByRole('button', { name: '保存记录' })).toBeVisible()
  await page.screenshot({ path: 'test-results/medication-record-iphone-se.png', fullPage: true })
})

test('多药分别保留实际剂量并一次真实保存', async ({ page }) => {
  await prepare(page)
  const form = await openMedicationForm(page)
  await form.getByLabel('药品名称').fill('布洛芬混悬液')
  await form.getByLabel('实际用量').fill('2.5')
  await form.getByLabel('用量单位').selectOption('mL')
  await form.getByRole('button', { name: '添加另一种药' }).click()
  await expect(form.getByRole('tab', { name: /药品 2/ })).toHaveAttribute('aria-selected', 'true')
  await form.getByLabel('药品名称').fill('西替利嗪')
  await form.getByLabel('实际用量').fill('1')
  await form.getByLabel('用量单位').selectOption('片')
  await form.getByRole('tab', { name: /布洛芬/ }).click()
  await expect(form.getByLabel('实际用量')).toHaveValue('2.5')
  await form.getByRole('tab', { name: /西替利嗪/ }).click()
  await form.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText(/已经.*记下来了|已记录/).first()).toBeVisible()
  await expect(page.getByText('用药 · 共2种')).toBeVisible()
})

test('桌面 1440×900 保持移动优先容器且控件可用', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await prepare(page)
  const form = await openMedicationForm(page)
  const box = await form.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeLessThan(760)
  expect(box!.x).toBeGreaterThan(0)
  await expect(form.getByRole('button', { name: '保存记录' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
  await page.screenshot({ path: 'test-results/medication-record-desktop.png', fullPage: true })
})
