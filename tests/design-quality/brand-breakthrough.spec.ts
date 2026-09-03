import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'design-quality-account'
const memberId = 'design-quality-member'
const token = new TokenService('design-quality-e2e-secret', 60 * 60_000).create({ id: accountId })
const phase = process.env.BRAND_AUDIT_PHASE
if (phase !== 'before' && phase !== 'after') {
  throw new Error('BRAND_AUDIT_PHASE must be explicitly set to before or after')
}
const evidenceRoot = path.resolve(`docs/design/audit-reports/2026-09-03-brand-breakthrough/evidence/${phase}`)
let eventId = ''

async function preparePage(page: Page) {
  await page.addInitScript(({ authToken, account, member }) => {
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authToken, authUser: { id: account }, opsAuthToken: null, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 4 }))
  }, { authToken: token, account: accountId, member: memberId })
}

async function capture(page: Page, name: string, projectName: string) {
  await expect(page.locator('main')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.screenshot({ path: path.join(evidenceRoot, `${projectName}-${name}.png`), fullPage: true })
}

test.beforeAll(async ({ request }) => {
  const created = await request.post('/api/events', {
    headers: { Authorization: `Bearer ${token}` },
    data: { memberId, title: '连续发热观察', category: 'fever', startTime: '2026-08-29T09:20:00+08:00' }
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  eventId = (await created.json()).id
  const record = await request.post(`/api/events/${eventId}/records`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'symptom', content: '上午腋温 38.2℃，有轻微头痛，喝水后精神尚可。', occurredAt: '2026-08-29T10:10:00+08:00' }
  })
  expect(record.ok(), await record.text()).toBeTruthy()
  await mkdir(evidenceRoot, { recursive: true })
})

test.beforeEach(async ({ page }) => {
  await preparePage(page)
})

test('home triage brand sample', async ({ page }, testInfo) => {
  await page.goto('/health-events')
  await expect(page.getByRole('button', { name: '快速记录' })).toBeVisible()
  await capture(page, 'home-triage', testInfo.project.name)
})

test('health events list brand sample', async ({ page }, testInfo) => {
  await page.goto('/health-events')
  await page.getByRole('button', { name: '列表视图' }).click()
  await expect(page.locator(`[data-event-id="${eventId}"]`)).toBeVisible()
  await capture(page, 'health-events-list', testInfo.project.name)
})

test('health profile brand sample', async ({ page }, testInfo) => {
  await page.goto('/health-profile')
  await expect(page.getByRole('heading', { name: '建议优先补充' })).toBeVisible()
  await capture(page, 'health-profile', testInfo.project.name)
})

test('family brand sample', async ({ page }, testInfo) => {
  await page.goto('/family')
  await expect(page.getByText('刘磊')).toBeVisible()
  await capture(page, 'family', testInfo.project.name)
})
