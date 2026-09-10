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

test('iPhone SE 活动、疫苗和就医入口置灰并提示即将开放', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '记一下' }).click()
  const entry = page.getByRole('dialog', { name: '记录新情况' })
  for (const label of ['活动', '疫苗', '就医']) {
    const button = entry.getByRole('button', { name: label, exact: true })
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveCSS('opacity', '0.52')
    await button.click({ force: true })
    await expect(entry.getByRole('status')).toHaveText('即将开放功能')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(entry.getByRole('button', { name: '开始记录' })).toBeDisabled()
  }
})
