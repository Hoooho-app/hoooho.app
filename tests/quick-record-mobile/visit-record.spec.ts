import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'quick-record-e2e-account'
const memberId = 'quick-record-e2e-member'
const token = new TokenService('quick-record-mobile-e2e-secret', 60 * 60_000).create({ id: accountId })
const documentImage = { name: '检查报告.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }

async function prepare(page: Page) {
  await page.route('**/api/members', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch(); const members = await response.json()
    await route.fulfill({ response, json: members.map((member: Record<string, unknown>) => ({ ...member, relationship: 'child' })) })
  })
  await page.addInitScript(({ authToken, account, member }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: account }, opsAuthUser: null, currentMemberId: member, members: [], profile: null }, version: 5 }))
  }, { authToken: token, account: accountId, member: memberId })
  await page.goto('/health-events')
}

test('iPhone SE 就医入口上传真实资料并在识别不可用时保留原件', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '记录', exact: true }).click()
  const entry = page.getByRole('dialog', { name: '记录新情况' })
  await entry.getByRole('button', { name: /记录就医/ }).click()
  const form = page.getByRole('dialog', { name: '记录就医' })
  await expect(form.getByText('先上传就医资料')).toBeVisible()
  await expect(form.getByRole('button', { name: '拍照' })).toBeVisible()
  await expect(form.getByRole('button', { name: '从相册选择' })).toBeVisible()
  await expect(form.getByRole('button', { name: '上传文件' })).toBeVisible()
  await expect(form.getByText(/医生安排|补充日常|补充用药/)).toHaveCount(0)

  const chooserPromise = page.waitForEvent('filechooser')
  await form.getByRole('button', { name: '从相册选择' }).click()
  await (await chooserPromise).setFiles(documentImage)
  await expect(form.getByText('检查报告.png')).toBeVisible()
  await expect(form.getByText(/自动整理不可用|整理失败/)).toBeVisible()
  const local = new Date(Date.now() - 60_000); local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  await form.getByLabel('实际就医时间').fill(local.toISOString().slice(0, 16))
  await form.getByRole('button', { name: '保存就医记录' }).click()
  await expect(page.getByText(/已经.*记下来了|已记录/).first()).toBeVisible()
  await expect(page.getByText(/就医资料 检查报告\.png/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: 'test-results/visit-record-iphone-se.png', fullPage: true })
})
