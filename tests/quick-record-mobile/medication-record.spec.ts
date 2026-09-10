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
  await expect(page.getByRole('button', { name: '手动记录' })).toBeEnabled()
}

async function openMedicationForm(page: Page) {
  await page.getByRole('button', { name: '手动记录' }).click()
  await page.getByRole('button', { name: '用药' }).click()
  await page.getByRole('button', { name: '开始记录' }).click()
  return page.getByRole('dialog', { name: '记录用药' })
}

test('iPhone SE 默认态一屏可保存且没有页面横向溢出', async ({ page }) => {
  await prepare(page)
  const form = await openMedicationForm(page)
  await expect(form.getByRole('tab', { name: /药品 1/ })).toBeVisible()
  await expect(form.getByRole('button', { name: '添加另一种药' })).toBeVisible()
  await expect(form.getByRole('button', { name: '保存记录' })).toBeVisible()
  const layout = await form.evaluate((node) => {
    const save = node.querySelector('.medication-fixed-save')!.getBoundingClientRect()
    const scroll = node.querySelector('.medication-record-scroll') as HTMLElement
    return { saveBottom: save.bottom, viewportHeight: window.innerHeight, pageOverflow: document.documentElement.scrollWidth > window.innerWidth, contentOverflow: scroll.scrollHeight > scroll.clientHeight + 1 }
  })
  expect(layout.saveBottom).toBeLessThanOrEqual(layout.viewportHeight)
  expect(layout.pageOverflow).toBe(false)
  expect(layout.contentOverflow).toBe(false)
  await page.screenshot({ path: 'test-results/medication-record-iphone-se.png', fullPage: true })
})

test('多药标签保留独立剂量和提醒并一次真实保存', async ({ page }) => {
  await prepare(page)
  const form = await openMedicationForm(page)
  await form.getByLabel('药品名称').fill('布洛芬混悬液')
  await form.getByRole('button', { name: '增加用量' }).click()
  await expect(form.getByLabel('本次用量')).toHaveValue('0.5')
  await expect(form.getByLabel('已填写完整')).toBeVisible()

  await form.getByRole('button', { name: '添加另一种药' }).click()
  await expect(form.getByRole('tab', { name: /药品 2/ })).toHaveAttribute('aria-selected', 'true')
  await form.getByLabel('药品名称').fill('西替利嗪')
  await form.getByLabel('本次用量').fill('1')
  await form.getByLabel('用量单位').selectOption('片')
  await form.getByRole('switch', { name: '设置用药提醒' }).check()
  const reminderSheet = page.getByRole('dialog', { name: '设置用药提醒' })
  await expect(reminderSheet).toBeVisible()
  await reminderSheet.getByRole('button', { name: '5天' }).click()
  await reminderSheet.getByRole('button', { name: '完成设置' }).click()
  await expect(form.getByText(/每天 3 次.*共 5 天/)).toBeVisible()

  await form.getByRole('tab', { name: /布洛芬/ }).click()
  await expect(form.getByLabel('本次用量')).toHaveValue('0.5')
  await expect(form.getByRole('switch', { name: '设置用药提醒' })).not.toBeChecked()
  await form.getByRole('tab', { name: /西替利嗪/ }).click()
  await expect(form.getByLabel('本次用量')).toHaveValue('1')
  await expect(form.getByRole('switch', { name: '设置用药提醒' })).toBeChecked()

  await form.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText('已记录').first()).toBeVisible()
  await expect(page.getByText('用药 · 共2种')).toBeVisible()
  await expect(page.getByText(/布洛芬混悬液 · 0.5 mL/)).toBeVisible()
})

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px 视口没有页面横向溢出`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await prepare(page)
    await openMedicationForm(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  })
}
