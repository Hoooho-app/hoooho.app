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
  await expect(page.getByRole('button', { name: '记一下' })).toBeEnabled()
}

async function openMedicationForm(page: Page) {
  await page.getByRole('button', { name: '记一下' }).click()
  await page.getByRole('button', { name: '用药' }).click()
  await page.getByRole('button', { name: '开始记录' }).click()
  return page.getByRole('dialog', { name: '记录用药' })
}

test('iPhone SE 默认态一屏可保存且没有页面横向溢出', async ({ page }) => {
  await prepare(page)
  const form = await openMedicationForm(page)
  await expect(form.getByRole('tab', { name: /药品 1/ })).toBeVisible()
  await expect(form.getByRole('button', { name: '添加另一种药' })).toBeVisible()
  await expect(form.getByRole('heading', { name: '药品名称' })).toBeVisible()
  await expect(form.getByRole('heading', { name: '剂量' })).toBeVisible()
  await expect(form.getByText('请按实际使用量记录')).toHaveCount(0)
  await form.getByRole('button', { name: '添加药品图片' }).click()
  const photoSheet = page.getByRole('dialog', { name: '选择药品图片来源' })
  await expect(photoSheet.getByRole('button', { name: /拍照/ })).toBeVisible()
  await expect(photoSheet.getByRole('button', { name: /从相册选择/ })).toBeVisible()
  await photoSheet.getByRole('button', { name: '关闭选择药品图片来源' }).click()
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
  await form.getByRole('switch', { name: '设置用药提醒' }).click()
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
  await expect(page.getByText('布洛芬混悬液、西替利嗪', { exact: true })).toBeVisible()
})

test('四种提醒周期切换专属表单并支持校验、撤销和恢复', async ({ page }) => {
  await prepare(page)
  const form = await openMedicationForm(page)
  const reminderSwitch = form.getByRole('switch', { name: '设置用药提醒' })

  await reminderSwitch.click()
  let sheet = page.getByRole('dialog', { name: '设置用药提醒' })
  await expect(sheet.getByText('每天提醒几次')).toBeVisible()
  await sheet.getByRole('button', { name: '每隔几小时' }).click()
  await expect(sheet.getByText('间隔多久')).toBeVisible()
  await expect(sheet.getByLabel('首次提醒')).toBeVisible()
  await expect(sheet.getByText('每天提醒几次')).toHaveCount(0)
  await sheet.getByRole('button', { name: '每周', exact: true }).click()
  await expect(sheet.getByText('每周哪几天')).toBeVisible()
  await page.screenshot({ path: 'test-results/medication-reminder-weekly-iphone-se.png', fullPage: true })
  await sheet.getByRole('button', { name: '自定义', exact: true }).first().click()
  await expect(sheet.getByText('选择日期')).toBeVisible()
  await sheet.getByRole('button', { name: '关闭设置用药提醒' }).click()
  await expect(reminderSwitch).not.toBeChecked()

  await reminderSwitch.click()
  sheet = page.getByRole('dialog', { name: '设置用药提醒' })
  await expect(sheet.getByRole('button', { name: '每天', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: '每周', exact: true }).click()
  await sheet.locator('.medication-weekdays button[aria-pressed="true"]').click()
  await sheet.getByRole('button', { name: '完成设置' }).click()
  await expect(sheet.getByText('请至少选择一天')).toBeVisible()
  await sheet.locator('.medication-weekdays').getByRole('button', { name: '三' }).click()
  await sheet.getByRole('button', { name: '减少提醒次数' }).click()
  await sheet.getByRole('button', { name: '减少提醒次数' }).click()
  await sheet.getByRole('button', { name: '2周' }).click()
  await sheet.getByRole('button', { name: '完成设置' }).click()
  await expect(reminderSwitch).toBeChecked()
  await expect(form.getByText(/每周三 · 08:00 · 共 2 周/)).toBeVisible()

  await form.getByText('编辑').click()
  sheet = page.getByRole('dialog', { name: '设置用药提醒' })
  await expect(sheet.getByRole('button', { name: '每周', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: '自定义', exact: true }).first().click()
  await sheet.getByRole('button', { name: '完成设置' }).click()
  await expect(sheet.getByText('请至少选择一个日期')).toBeVisible()
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await sheet.getByLabel('添加提醒日期').fill(tomorrow)
  await sheet.getByRole('button', { name: '继续添加日期' }).click()
  await sheet.getByRole('button', { name: '完成设置' }).click()
  await expect(form.getByText(/月.*日 · 08:00/)).toBeVisible()

  await reminderSwitch.uncheck()
  await expect(form.getByText('编辑')).toHaveCount(0)
  await reminderSwitch.check()
  await expect(form.getByText(/月.*日 · 08:00/)).toBeVisible()
})

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px 视口没有页面横向溢出`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await prepare(page)
    await openMedicationForm(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  })
}
