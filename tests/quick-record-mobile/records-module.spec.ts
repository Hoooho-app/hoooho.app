import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('quick-record-mobile-e2e-secret', 3600_000).create({ id: 'quick-record-e2e-account' })

async function prepare(page: Page, name: string) {
  const response = await page.request.post('/api/members', { headers: { Authorization: `Bearer ${token}` }, data: { name, birthday: '2024-01-01', gender: 'female', avatar: '', relationship: 'child', primaryRecorderRelationship: 'mother' } })
  expect(response.ok()).toBe(true)
  const member = await response.json()
  await page.addInitScript(({ authToken, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'quick-record-e2e-account' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { authToken: token, memberId: member.id })
  await page.goto('/health-events')
  await expect(page.getByRole('button', { name: '记录', exact: true })).toBeEnabled()
}

async function openEntry(page: Page) {
  await page.getByRole('button', { name: '记录', exact: true }).click()
  const entry = page.getByRole('dialog', { name: '记录新情况' })
  await expect(entry.locator('.journal-record-entry-grid > button')).toHaveCount(4)
  return entry
}

test('症状描述自动提取、手动补充、保存并再次编辑', async ({ page }) => {
  await prepare(page, '症状测试宝宝')
  const entry = await openEntry(page)
  await entry.getByRole('button', { name: /记录症状/ }).click()
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByLabel('症状描述').fill('大便有点黑，没有发烧')
  await expect(form.getByText('大便颜色偏黑', { exact: true })).toBeVisible()
  await expect(form.getByText('发热', { exact: true })).toHaveCount(0)
  await form.getByRole('button', { name: /症状摘要/ }).click()
  const picker = page.getByRole('dialog', { name: '选择症状' })
  await picker.getByRole('button', { name: '咳嗽', exact: true }).click()
  await picker.getByRole('button', { name: /完成/ }).click()
  await expect(form.getByText('大便颜色偏黑、咳嗽', { exact: true })).toBeVisible()
  await form.getByRole('button', { name: /补充信息/ }).click()
  await expect(form.getByRole('slider', { name: '严重程度' })).toBeVisible()
  await expect(form.getByText('可能诱因', { exact: true })).toBeVisible()
  await expect(form.getByText(/症状变化|加重或减轻|症状备注/)).toHaveCount(0)
  await form.getByRole('button', { name: '保存记录' }).click()
  await expect(form).toBeHidden()
  await expect(page.getByText(/已经.*记下来了|已记录/).first()).toBeVisible()
  await page.locator('.journal-record--symptom').first().click()
  const detail = page.getByRole('dialog', { name: '症状记录详情' })
  await expect(detail.getByText('大便有点黑，没有发烧')).toBeVisible()
  await detail.getByRole('button', { name: '编辑症状记录' }).click()
  await expect(page.getByRole('dialog', { name: '编辑症状记录' }).getByText(/是否加重或减轻|症状备注/)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: 'test-results/symptom-record-edit-iphone-se.png', fullPage: true })
})

test('日常入口恰好八项且营养补剂只关联症状并按实际时间保存', async ({ page }) => {
  await prepare(page, '日常测试宝宝')
  const entry = await openEntry(page)
  await entry.getByRole('button', { name: /记录日常/ }).click()
  const daily = page.getByRole('dialog', { name: '记录日常' })
  await expect(daily.locator('.journal-daily-grid > button')).toHaveCount(8)
  for (const label of ['饮食', '母乳亲喂', '配方奶', '瓶喂母乳', '辅食', '营养补剂', '睡眠', '排便']) await expect(daily.getByRole('button', { name: new RegExp(label) })).toBeVisible()
  await daily.getByRole('button', { name: /营养补剂/ }).click()
  const form = page.getByRole('dialog', { name: '记录营养补剂' })
  await form.getByLabel('输入营养补剂名称').fill('维生素D')
  await form.getByRole('button', { name: '添加营养补剂' }).click()
  await form.getByLabel('用量').fill('1')
  await expect(form.getByText('补充症状信息', { exact: true })).toBeVisible()
  await expect(form.getByText(/补充就医|补充用药|补充描述/)).toHaveCount(0)
  await expect(form.getByLabel('实际发生时间')).toBeVisible()
  await form.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText(/营养补剂/).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: 'test-results/daily-supplement-iphone-se.png', fullPage: true })
})
