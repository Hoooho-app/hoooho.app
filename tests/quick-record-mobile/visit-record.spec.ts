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

test('iPhone SE 就医入口不可用且不再进入记录表单', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '手动记录' }).click()
  const entry = page.getByRole('dialog', { name: '记录新情况' })
  const button = entry.getByRole('button', { name: '就医', exact: true })
  await expect(button).toHaveAttribute('aria-disabled', 'true')
  await button.click({ force: true })
  await expect(entry.getByRole('status')).toHaveText('即将开放功能')
  await expect(page.getByRole('dialog', { name: '记录就医' })).toBeHidden()
  await expect(entry.getByRole('button', { name: '开始记录' })).toBeDisabled()
})
