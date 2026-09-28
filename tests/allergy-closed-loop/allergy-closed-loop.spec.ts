import { expect, test, type Page, type Route } from '@playwright/test'

const accountId = 'allergy-e2e-account'
const memberId = 'allergy-e2e-child'
const token = 'allergy-e2e-token'
const member = { id: memberId, accountId, name: '刘璟宜', relationship: 'child', gender: 'female', birthday: '2024-12-20', avatar: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status })
}

function storedItem(overrides: Record<string, unknown>) {
  return {
    id: 'allergy-milk', accountId, memberId, category: 'food', name: '牛乳', customName: '牛乳', currentStatus: 'confirmed',
    sourceType: 'clinician', sourceLabel: '医生告知', dietaryAction: '', ingredientRelations: [], sourceReferences: [], history: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', reactions: [], tests: [], evidenceLinks: [], ...overrides
  }
}

async function prepare(page: Page, initialRecords: unknown[] = []) {
  const state = { records: initialRecords, revision: 0, failWrites: 0 }
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
    if (path === '/api/auth/profile-sections' && request.method() === 'GET') return json(route, state.records.length ? [{ memberId, sectionId: 'allergy', records: state.records, revision: state.revision }] : [])
    if (path === '/api/auth/profile-sections' && request.method() === 'POST') {
      if (state.failWrites > 0) { state.failWrites -= 1; return json(route, { error: 'temporary' }, 503) }
      const input = request.postDataJSON() as { records: unknown[] }
      state.records = input.records; state.revision += 1
      return json(route, { memberId, sectionId: 'allergy', records: state.records, revision: state.revision })
    }
    return json(route, {})
  })
  return state
}

async function openQuickAdd(page: Page) {
  await page.locator('.allergy-header-add').click()
  await expect(page.getByRole('heading', { name: '添加过敏史' })).toBeVisible()
}

test('空状态、快速添加、编辑、详情和返回形成三层闭环', async ({ page }, testInfo) => {
  await prepare(page)
  await page.goto('/health-profile/allergy')
  await expect(page.getByRole('heading', { name: '过敏史', exact: true })).toBeVisible()
  await expect(page.getByText('还没有过敏史')).toBeVisible()
  await expect(page.getByRole('button', { name: /检查报告/ })).toBeVisible()
  await expect(page.getByText('刘璟宜', { exact: true })).toHaveCount(0)

  await openQuickAdd(page)
  for (const category of ['食物', '药物', '动物', '环境', '接触物', '尚未明确']) await expect(page.getByRole('button', { name: new RegExp(category) }).last()).toBeVisible()
  await page.getByLabel('过敏对象').fill('面包')
  await page.getByLabel('反应（选填）').fill('食用后皮肤发红')
  await page.getByLabel('可能原料／来源（选填）').fill('小麦、牛乳、鸡蛋')
  await page.getByRole('button', { name: /待排查/ }).click()
  if (testInfo.project.name === 'iphone-se') {
    await page.locator('.allergy-quick-sheet .hoho-bottom-sheet__body').evaluate((element) => element.scrollTo(0, 0))
    await page.screenshot({ path: '../../artifacts/allergy-history-20260928/iphone-se-quick-add.png', fullPage: true })
  }
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已加入过敏史')).toBeVisible()
  await expect(page.getByText('面包', { exact: true })).toBeVisible()
  await expect(page.getByText('具体来源待核实')).toBeVisible()

  await page.getByRole('button', { name: /面包/ }).click()
  await expect(page.getByRole('heading', { name: '食品与可能来源' })).toBeVisible()
  await expect(page.getByText('食用后皮肤发红')).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('button', { name: /已明确/ }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已更新这条过敏史')).toBeVisible()
  await expect(page.getByText(/食物 · 已明确/)).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page).toHaveURL(/\/health-profile\/allergy$/)
  await expect(page.getByRole('heading', { name: '已明确' })).toBeVisible()
  await expect(page.locator('.allergy-toast')).toBeHidden()

  if (testInfo.project.name === 'iphone-se') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await page.screenshot({ path: '../../artifacts/allergy-history-20260928/iphone-se-list.png', fullPage: true })
  } else {
    await page.screenshot({ path: '../../artifacts/allergy-history-20260928/desktop-list.png', fullPage: true })
  }
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page).toHaveURL(/\/health-profile$/)
})

test('保存失败保留输入并可重试，重复保存不生成第二条', async ({ page }) => {
  const state = await prepare(page)
  await page.goto('/health-profile/allergy')
  await openQuickAdd(page)
  await page.getByLabel('过敏对象').fill('花生')
  state.failWrites = 1
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText(/保存失败/)).toBeVisible()
  await expect(page.getByLabel('过敏对象')).toHaveValue('花生')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('花生', { exact: true })).toBeVisible()
  expect((state.records as Array<{ name?: string }>).filter((item) => item.name === '花生')).toHaveLength(1)
})

test('报告支持多项人工核对，阳性保持待排查且未采用项不生成记录', async ({ page }) => {
  const state = await prepare(page)
  await page.goto('/health-profile/allergy')
  await page.getByRole('button', { name: /检查报告/ }).click()
  await expect(page.getByText('当前没有可用的自动识别能力')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'allergy-report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('report') })
  await expect(page.getByText('未使用自动识别')).toBeVisible()
  await page.getByLabel('对象').fill('牛乳')
  await page.getByLabel('检查结果').selectOption('positive')
  await page.getByRole('button', { name: /添加报告项目/ }).click()
  await page.getByText('报告项目 2').locator('..').getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: /保存报告和采用项/ }).click()
  await expect(page.getByText('报告和已核对线索已保存')).toBeVisible()
  await expect(page.getByRole('heading', { name: '待排查' })).toBeVisible()
  await page.getByRole('button', { name: /牛乳/ }).click()
  await expect(page.getByText('检查报告 · 阳性')).toBeVisible()
  await expect(page.getByText('单项结果不等于确诊')).toBeVisible()
  expect((state.records as Array<{ recordType?: string }>).filter((item) => item.recordType === 'allergy-report')).toHaveLength(1)
})

test('当前成员严格隔离其他成员记录', async ({ page }) => {
  await prepare(page, [
    storedItem({ id: 'other-allergy', memberId: 'other-member', name: '鸡蛋' }),
    storedItem({ id: 'current-allergy', name: '牛乳' })
  ])
  await page.goto('/health-profile/allergy')
  await expect(page.getByText('牛乳', { exact: true })).toBeVisible()
  await expect(page.getByText('鸡蛋', { exact: true })).toHaveCount(0)
})
