import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'quick-record-e2e-account'
const memberId = 'quick-record-e2e-member'
const token = new TokenService('quick-record-mobile-e2e-secret', 60 * 60_000).create({ id: accountId })

async function prepare(page: Page) {
  await page.route('**/api/members', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    const members = await response.json()
    await route.fulfill({ response, json: members.map((member: Record<string, unknown>) => ({ ...member, relationship: 'child' })) })
  })
  await page.addInitScript(({ authToken, account, member }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: account }, opsAuthUser: null, currentMemberId: member, members: [], profile: null }, version: 5 }))
  }, { authToken: token, account: accountId, member: memberId })
  await page.goto('/health-events')
}

test('iPhone SE 顶层入口仅保留四个真实记录流程', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '记录', exact: true }).click()
  const entry = page.getByRole('dialog', { name: '记录新情况' })
  const buttons = entry.locator('.journal-record-entry-grid > button')
  await expect(buttons).toHaveCount(4)
  await expect(buttons).toHaveText([/记录症状/, /记录日常/, /记录就医/, /记录用药/])
  await expect(entry.getByText(/疫苗|活动|即将开放/)).toHaveCount(0)
})
