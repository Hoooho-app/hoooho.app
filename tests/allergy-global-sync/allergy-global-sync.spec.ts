import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

async function prepare(page: Page) {
  const registered = await page.request.post('/api/auth/register', { data: { nickname: `联动${randomUUID().slice(0, 8)}`, password: 'synthetic7', idempotencyKey: randomUUID() } })
  expect(registered.ok()).toBe(true)
  const session = await registered.json()
  const headers = { Authorization: `Bearer ${session.token}` }
  const response = await page.request.post('/api/members', { headers, data: { name: '联动测试孩子', relationship: 'child', gender: 'female', birthday: '2024-01-01' } })
  expect(response.ok()).toBe(true)
  const member = await response.json()
  expect((await page.request.post('/api/auth/current-member', { headers, data: { memberId: member.id } })).ok()).toBe(true)
  await page.addInitScript(({ token, accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [] }, version: 5 }))
  }, { token: session.token, accountId: session.user.id, memberId: member.id })
  return { headers, member }
}

async function addFood(page: Page, name: string, group = 'avoid') {
  await page.getByRole('button', { name: '添加食物', exact: true }).click()
  await page.getByLabel('食物名称', { exact: true }).fill(name)
  await page.getByLabel('所属分组').selectOption(group)
  await page.getByRole('button', { name: '添加到清单', exact: true }).click()
}

test('真实后端：卡片新增→过敏史→档案改名/删除/撤销→卡片自动更新，取消不保存', async ({ page }) => {
  await prepare(page)
  await page.goto('/dietary-card')
  await page.getByRole('button', { name: '修改', exact: true }).click()
  await addFood(page, '牛奶')
  await addFood(page, '鸡蛋', 'temporary')
  await page.getByRole('button', { name: '保存并更新', exact: true }).click()
  await expect(page).toHaveURL(/\/dietary-card$/)
  await page.goto('/health-profile/allergy')
  await expect(page.getByRole('button', { name: '编辑牛奶', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑鸡蛋', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '编辑牛奶', exact: true }).click()
  await page.getByRole('textbox').fill('牛奶蛋白')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑牛奶蛋白', exact: true })).toBeVisible()
  await page.goto('/dietary-card')
  await page.getByLabel('选择出示语言').selectOption('zh')
  await expect(page.getByText('牛奶蛋白', { exact: true })).toBeVisible()
  await expect(page.getByText('牛奶', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '修改', exact: true }).click()
  await addFood(page, '花生')
  await page.getByRole('button', { name: '取消修改', exact: true }).click()
  await page.goto('/health-profile/allergy')
  await expect(page.getByRole('button', { name: '编辑花生', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '删除牛奶蛋白', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible()
  const cardPage = await page.context().newPage()
  await cardPage.goto('/dietary-card')
  await cardPage.getByLabel('选择出示语言').selectOption('zh')
  await expect(cardPage.getByText('鸡蛋', { exact: true })).toBeVisible()
  await expect(cardPage.getByText('牛奶蛋白', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(cardPage.getByText('牛奶蛋白', { exact: true })).toBeVisible()
  await cardPage.close()
})

test('两个页面并发：新的过敏资料不被旧卡片草稿覆盖，失败时保留草稿', async ({ page }) => {
  const { headers, member } = await prepare(page)
  await page.goto('/dietary-card')
  await page.getByRole('button', { name: '修改', exact: true }).click()
  await addFood(page, '花生')
  const response = await page.request.post(`/api/members/${member.id}/profile-list/allergy`, { headers, data: { action: 'add', name: '虾', group: '食物', key: randomUUID() } })
  expect(response.ok()).toBe(true)
  // The request is real. Trigger the same foreground refresh as returning from
  // a second browser page, while keeping the existing edit draft untouched.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('button', { name: '保存并更新', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('过敏资料已更新')
  await expect(page.getByText('花生', { exact: true })).toBeVisible()
  const sections = await (await page.request.get('/api/auth/profile-sections', { headers })).json()
  expect(sections.find((s: { sectionId: string }) => s.sectionId === 'allergy').records.map((r: { name: string }) => r.name)).toEqual(['虾'])
})
