import { expect, test, type Page, type Route } from '@playwright/test'

const accountId = 'allergy-e2e-account'
const memberId = 'allergy-e2e-child'
const token = 'allergy-e2e-token'
const member = { id: memberId, accountId, name: '刘璟宜', relationship: 'child', gender: 'female', birthday: '2024-12-20', avatar: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status })
}

async function prepare(page: Page) {
  let records: unknown[] = []
  let revision = 0
  await page.addInitScript(({ authToken, account, currentMember }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: account }, accountProfile: null, opsAuthUser: null, currentMemberId: currentMember, members: [], profile: null }, version: 5 }))
  }, { authToken: token, account: accountId, currentMember: memberId })
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (path === '/api/auth/session') return json(route, { token, user: { id: accountId, currentMemberId: memberId, nickname: '家长', createdAt: '2026-09-01T00:00:00.000Z' } })
    if (path === '/api/members') return json(route, [member])
    if (path === '/api/account/entry-state') return json(route, { familyMemberCount: 1, hasValidHealthRecord: false })
    if (path === '/api/events') return json(route, [])
    if (path === '/api/auth/profile-sections' && request.method() === 'GET') return json(route, records.length ? [{ memberId, sectionId: 'allergy', records, revision }] : [])
    if (path === '/api/auth/profile-sections' && request.method() === 'POST') {
      const input = request.postDataJSON() as { records: unknown[] }
      records = input.records; revision += 1
      return json(route, { memberId, sectionId: 'allergy', records, revision })
    }
    return json(route, {})
  })
}

test.beforeEach(async ({ page }) => { await prepare(page) })

test('首次记录、症状回看、检查回看和稳定返回形成闭环', async ({ page }, testInfo) => {
  await page.goto('/health-profile/allergy')
  await expect(page.getByRole('heading', { name: '请记下你知道的过敏信息' })).toBeVisible()
  for (const category of ['食物', '药物', '环境', '昆虫', '接触物', '尚未明确']) await expect(page.getByRole('button', { name: new RegExp(category) })).toBeVisible()
  await expect(page.getByText('刘璟宜', { exact: true })).toBeVisible()
  if (testInfo.project.name === 'iphone-se') {
    const lastCategory = await page.getByRole('button', { name: /尚未明确/ }).boundingBox()
    expect(lastCategory && lastCategory.y + lastCategory.height).toBeLessThanOrEqual(620)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  }

  await page.getByRole('button', { name: /食物/ }).click()
  await expect(page).toHaveURL(/\/health-profile\/allergy\/new\/food$/)
  await page.getByRole('button', { name: '牛奶', exact: true }).click()
  await page.getByRole('button', { name: '添加相关信息（1）' }).click()
  await expect(page).toHaveURL(/\/health-profile\/allergy$/)
  await expect(page.getByRole('button', { name: /牛奶.*症状 0.*检查 0/ })).toBeVisible()

  await page.getByRole('button', { name: /牛奶.*症状 0.*检查 0/ }).click()
  await page.getByRole('button', { name: '记录一次症状' }).click()
  await expect(page.getByText('当前记录对象')).toBeVisible()
  await page.getByRole('button', { name: '皮肤' }).click()
  await page.getByLabel('具体表现（选填）').fill('嘴角发红\n持续约半小时')
  await page.getByRole('button', { name: '2小时内' }).click()
  await page.getByRole('button', { name: '保存这次症状' }).click()
  await expect(page).toHaveURL(/\/health-profile\/allergy\/allergy-[^/]+$/)
  await expect(page.getByRole('heading', { name: '症状记录（1）' })).toBeVisible()
  await expect(page.getByRole('button', { name: /嘴角发红/ })).toBeVisible()
  await page.getByRole('button', { name: /嘴角发红/ }).click()
  await expect(page.getByText('持续约半小时')).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByRole('heading', { name: '症状记录（1）' })).toBeVisible()

  await page.getByRole('button', { name: '添加检查或报告' }).click()
  await page.getByRole('button', { name: '回避—再引入观察' }).click()
  await expect(page.getByText('检查结果（选填）')).toHaveCount(0)
  await expect(page.getByLabel('原始数值')).toHaveCount(0)
  await expect(page.getByText('未上传', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存检查或观察' }).click()
  await expect(page.getByRole('heading', { name: '检查与报告（1）' })).toBeVisible()
  await page.getByRole('button', { name: /回避—再引入观察.*未上传附件/ }).click()
  await expect(page.getByText('未上传／待补充')).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page).toHaveURL(/\/health-profile\/allergy$/)
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page).toHaveURL(/\/health-profile$/)
})

test('已记录对象仍可点击查看且尚未明确直接进入症状页', async ({ page }) => {
  await page.goto('/health-profile/allergy')
  await page.getByRole('button', { name: /食物/ }).click()
  await page.getByRole('button', { name: '牛奶', exact: true }).click()
  await page.getByRole('button', { name: '添加相关信息（1）' }).click()
  await page.getByRole('button', { name: /添加相关信息/ }).click()
  await page.getByRole('button', { name: /食物/ }).click()
  await expect(page.getByRole('button', { name: /牛奶，已记录，查看或继续补充/ })).toBeEnabled()
  await page.getByRole('button', { name: /牛奶，已记录，查看或继续补充/ }).click()
  await expect(page.getByText('牛奶', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await page.getByRole('button', { name: /添加相关信息/ }).click()
  await page.getByRole('button', { name: /尚未明确/ }).click()
  await expect(page).toHaveURL(/\/reaction$/)
  await expect(page.getByText('尚未明确 · 尚未明确')).toBeVisible()
})
