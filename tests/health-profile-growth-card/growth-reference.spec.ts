import { expect, test, type Page } from '@playwright/test'

async function prepare(page: Page, gender = 'female', birthday = '2024-12-15') {
  const accountId = 'growth-reference-test-account', memberId = 'growth-reference-test-child', token = 'growth-reference-test-token'
  const member = { id: memberId, accountId, name: '成长测试', relationship: 'child', gender, birthday, avatar: null, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-12-15T00:00:00.000Z' }
  const records = [
    { id: 'height-record', accountId, memberId, measuredAt: '2025-12-15', heightCm: 72, weightKg: null, createdAt: '2025-12-15T00:00:00.000Z', updatedAt: '2025-12-15T00:00:00.000Z' },
    { id: 'weight-record', accountId, memberId, measuredAt: '2025-11-15', heightCm: null, weightKg: 8, createdAt: '2025-11-15T00:00:00.000Z', updatedAt: '2025-11-15T00:00:00.000Z' }
  ]
  await page.addInitScript(({ token, accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, accountProfile: null, opsAuthUser: null, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, accountId, memberId })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status })
    if (path === '/api/auth/session') return json({ token, user: { id: accountId, currentMemberId: memberId, nickname: '测试家长', createdAt: '2025-01-01T00:00:00.000Z' } })
    if (path === '/api/members') return json([member])
    if (path === `/api/members/${memberId}`) return json(member)
    if (path === '/api/account/entry-state') return json({ familyMemberCount: 1, hasValidHealthRecord: false })
    if (path === '/api/growth-measurements') return json(records)
    if (path.endsWith('/cases')) return json({ active: [], archived: [], timezone: 'Asia/Shanghai' })
    return json([])
  })
}

test('both curves show WHO P50 inline and retain third-item history navigation', async ({ page }, testInfo) => {
  await prepare(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/health-profile/basic')
  await expect(page.locator('.growth-data-reference')).toHaveText('标准参考值：74.0cm')
  await expect(page.locator('.growth-data-latest')).toContainText('72.0 cm')
  expect(await page.locator('.growth-data-content > section').first().getAttribute('class')).toContain('growth-data-measurement')
  await expect(page.getByLabel('测量日期')).toHaveCount(0)
  await expect(page.getByText('记录本次测量', { exact: true })).toHaveCount(0)
  expect(await page.locator('.growth-data-reference').evaluate(el => getComputedStyle(el).textAlign)).toBe('right')
  await expect(page.locator('.growth-record-list-entry')).toHaveCount(0)
  await page.getByRole('button', { name: '身高增加0.1厘米' }).click()
  await expect(page.locator('.growth-data-reference')).toHaveText('标准参考值：74.0cm')
  await page.screenshot({ path: testInfo.outputPath('growth-height-reference.png'), fullPage: true })
  await page.getByRole('tab', { name: '体重曲线' }).click()
  await expect(page.locator('.growth-data-reference')).toHaveText('标准参考值：8.7kg')
  await expect(page.locator('.growth-data-latest')).toContainText('2025-11-15')
  await page.screenshot({ path: testInfo.outputPath('growth-weight-reference.png'), fullPage: true })
  for (const selector of ['.growth-data-latest-value']) {
    const value = await page.locator(`${selector} > strong`).boundingBox()
    const reference = await page.locator(`${selector} > p`).boundingBox()
    expect(reference!.x).toBeGreaterThanOrEqual(value!.x + value!.width)
    expect(reference!.y).toBeLessThan(value!.y + value!.height)
  }
  const entry = page.locator('.growth-data-tabs').getByRole('button', { name: '记录列表' })
  const weightTab = await page.getByRole('tab', { name: '体重曲线' }).boundingBox()
  const entryBox = await entry.boundingBox()
  expect(entryBox!.x).toBeGreaterThanOrEqual(weightTab!.x + weightTab!.width)
  expect(entryBox!.y).toBe(weightTab!.y)
  await expect(page.locator('.hoho-page-header').getByRole('button', { name: '记录列表' })).toHaveCount(0)
  await entry.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '记录列表' })).toBeVisible()
  await expect(page.locator('.growth-record-row')).toHaveCount(2)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByRole('tab', { name: '体重曲线' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '72.1 cm', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

for (const [label, gender, birthday] of [['missing gender', 'undisclosed', '2024-12-15'], ['missing birthday', 'female', ''], ['outside WHO age range', 'female', '2018-01-01']]) {
  test(`${label} shows reference unavailable on both curves`, async ({ page }) => {
    await prepare(page, gender, birthday)
    await page.goto('/health-profile/basic')
    await expect(page.locator('.growth-data-reference')).toHaveText('标准参考值：暂不可用')
    await page.getByRole('tab', { name: '体重曲线' }).click()
    await expect(page.locator('.growth-data-reference')).toHaveText('标准参考值：暂不可用')
  })
}
