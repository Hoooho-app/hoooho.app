import { expect, type Page } from '@playwright/test'

export async function openFirstUseLogin(page: Page) {
  await page.goto('/login')
  await page.locator('.hoooho-onboarding, [role="tablist"][aria-label="登录或注册"]').first().waitFor()
  const start = page.getByRole('button', { name: '开始', exact: true })
  if (await start.isVisible()) await start.click()
}

export async function answerFirstChild(page: Page, value: string) {
  const keyboard = page.getByRole('button', { name: '改用文字', exact: true })
  if (await keyboard.isVisible()) await keyboard.click()
  await page.getByLabel('对话输入', { exact: true }).fill(value)
  await page.getByRole('button', { name: '发送', exact: true }).click()
}

export async function prepareFirstChildReview(page: Page, input: { name: string; birthday: string; gender: 'male' | 'female'; recorder?: string }) {
  await expect(page.getByText('先认识一下孩子。孩子叫什么名字？姓名或小名都可以。', { exact: true })).toBeVisible()
  await answerFirstChild(page, input.name)
  await page.getByLabel('出生日期', { exact: true }).fill(input.birthday)
  await page.getByRole('button', { name: '确认出生日期', exact: true }).click()
  await page.getByRole('button', { name: input.gender === 'female' ? '女孩' : '男孩', exact: true }).click()
  await page.getByRole('button', { name: input.recorder ?? '妈妈', exact: true }).click()
  await expect(page.getByRole('region', { name: '核对孩子信息', exact: true })).toBeVisible()
}

export async function createFirstChild(page: Page, input: { name: string; birthday: string; gender: 'male' | 'female'; recorder?: string }) {
  await page.goto('/nurse-station')
  await prepareFirstChildReview(page, input)
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/members' && r.request().method() === 'POST')
  await page.getByRole('button', { name: '确认添加，开始记录', exact: true }).click()
  const result = await response
  expect(result.ok()).toBe(true)
  const member = await result.json()
  await expect(page.getByRole('region', { name: '记录介绍', exact: true }).locator('.front-desk-welcome__portrait')).toBeVisible()
  return member
}
