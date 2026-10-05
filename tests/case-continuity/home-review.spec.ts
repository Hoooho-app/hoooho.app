import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

let token: string, userId: string, firstId: string, secondId: string
let cookies: Awaited<ReturnType<import('@playwright/test').APIRequestContext['storageState']>>['cookies']
const output = 'outputs/home-prefix-growth-dates-20261005/local'

test('F01 结束疗程和长期计划区分历史待确认与真正未来；不自动改状态', async ({ page, request }) => {
  await initialize(page)
  const headers = { Authorization: `Bearer ${token}` }
  for (const [name, longTerm] of [['合成已结束疗程', false], ['合成长期计划', true]] as const) {
    const response = await request.post('/api/medication-reminders', { headers, data: { memberId: firstId, plan: { medicationName: name, medicationType: 'tablet', amount: 1, unit: '粒', route: 'oral', mode: 'daily', times: ['08:00'], startDate: '2026-09-01', ...(longTerm ? { longTerm: true } : { durationDays: 3 }), timezone: 'Asia/Shanghai' } } })
    expect(response.ok()).toBe(true)
  }
  try {
    await page.locator('.nurse-home-entry--medication').click()
    const ended = page.locator('.medication-course-card').filter({ hasText: '合成已结束疗程' })
    const ongoing = page.locator('.medication-course-card').filter({ hasText: '合成长期计划' })
    await expect(ended).toContainText('疗程已结束')
    await expect(ended).toContainText('今日：无计划')
    await expect(ended).toContainText('下次：无未来计划')
    for (const card of [ended, ongoing]) {
      await expect(card.locator('.medication-course-card__pending')).toContainText('9月1日')
      await expect(card).toContainText('不代表未服用')
      await expect(card.getByRole('button', { name: '记录服用', exact: true })).toBeEnabled()
    }
    await expect(ongoing.locator('.medication-course-card__next')).not.toContainText('9月1日')
    await expect(ongoing.locator('.medication-course-card__next')).not.toContainText('无未来计划')
    for (const width of [320,375,390,430]) {
      await page.setViewportSize({ width, height: 667 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    const reminders = await (await request.get(`/api/medication-reminders?memberId=${firstId}`, { headers })).json()
    expect(reminders).toHaveLength(2)
    expect(reminders.every((r: any) => r.status === 'active' && r.completions.length === 0)).toBe(true)
  } finally {
    const reminders = await (await request.get(`/api/medication-reminders?memberId=${firstId}`, { headers })).json()
    for (const reminder of reminders) await request.delete(`/api/medication-reminders/${reminder.id}`, { headers })
  }
})
test.beforeAll(async ({ request }) => {
  await mkdir(output, { recursive: true })
  const registration = await request.post('/api/auth/register', { data: { nickname: '首页评审验收' + crypto.randomUUID().slice(0, 8), password: 'fixture-home-review-only', idempotencyKey: crypto.randomUUID() }, headers: { 'x-forwarded-for': '198.51.100.231' } })
  expect(registration.ok()).toBe(true)
  const session = await registration.json(); token = session.token; userId = session.user.id
  cookies = (await request.storageState()).cookies
  const headers = { Authorization: `Bearer ${token}` }
  for (const name of ['评审一（合成）', '评审二（合成）']) {
    const response = await request.post('/api/members', { headers, data: { name, relationship: 'child', gender: 'female', birthday: '2025-01-01' } })
    expect(response.ok()).toBe(true)
    if (!firstId) firstId = (await response.json()).id; else secondId = (await response.json()).id
  }
  for (const data of [
    { memberId: firstId, measuredAt: '2026-09-28', heightCm: 84.1, weightKg: null },
    { memberId: firstId, measuredAt: '2026-09-27', heightCm: null, weightKg: 10.7 },
    { memberId: secondId, measuredAt: '2026-09-26', heightCm: 80.2, weightKg: 9.3 },
  ]) {
    const response = await request.post('/api/growth-measurements', { headers, data: { ...data, measurementType: 'height', dataStatus: 'confirmed', standardId: 'who-2006' } })
    expect(response.ok()).toBe(true)
  }
})
async function initialize(page: Page) {
  await page.context().addCookies(cookies)
  await page.addInitScript(({ token, userId, firstId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: userId }, currentMemberId: firstId, members: [], profile: null }, version: 5 }))
  }, { token, userId, firstId })
  await page.goto('/nurse-station')
  await expect(page.locator('.nurse-station-identity')).toContainText('评审一')
}
test('H01 我的孩子桌面关闭控件和遮罩均在视口中', async ({ page }) => {
  await initialize(page)
  for (const width of [1363, 640, 375, 320, 430]) {
    await page.setViewportSize({ width, height: width > 640 ? 936 : 667 })
    await page.getByRole('button', { name: '打开菜单' }).click()
    await page.getByRole('button', { name: '打开我的孩子' }).click()
    const dialog = page.getByRole('dialog', { name: '我的孩子' })
    await expect(dialog).toBeVisible()
    const bounds = await dialog.evaluate(el => {
      const r = el.getBoundingClientRect(), close = el.querySelector('header button')!.getBoundingClientRect(), mask = document.querySelector('.current-child-sheet-backdrop')!.getBoundingClientRect()
      return { left: r.left, right: r.right, closeRight: close.right, closeLeft: close.left, maskRight: mask.right, maskLeft: mask.left, viewport: innerWidth }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width)
    expect(bounds.right - bounds.left).toBeLessThanOrEqual(640)
    expect(bounds.closeRight).toBeLessThanOrEqual(width); expect(bounds.closeLeft).toBeGreaterThanOrEqual(0)
    expect(bounds.maskRight).toBeLessThanOrEqual(width); expect(bounds.maskLeft).toBeGreaterThanOrEqual(0)
    await dialog.getByRole('button', { name: '关闭我的孩子' }).focus()
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  }
})
test('H02 首页身高体重指标优先于上一轮曲线；前进后退保留本次入口', async ({ page }) => {
  await initialize(page)
  await page.getByRole('button', { name: /体重，/ }).click()
  await expect(page.getByRole('tab', { name: '体重曲线' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '身高曲线' }).click(); await page.goBack()
  await page.getByRole('button', { name: /体重，/ }).click()
  await expect(page.getByRole('tab', { name: '体重曲线' })).toHaveAttribute('aria-selected', 'true')
  await page.goBack(); await page.getByRole('button', { name: /身高，/ }).click()
  await expect(page.getByRole('tab', { name: '身高曲线' })).toHaveAttribute('aria-selected', 'true')
  await page.goBack(); await page.goForward()
  await expect(page.getByRole('tab', { name: '身高曲线' })).toHaveAttribute('aria-selected', 'true')
  await page.reload(); await expect(page.getByRole('tab', { name: '身高曲线' })).toHaveAttribute('aria-selected', 'true')
})

test('H03 H06 姓名入口切换真实成员，指标点击独立且日期对应各自记录', async ({ page }) => {
  await initialize(page)
  const height = page.getByRole('button', { name: /身高，/ }), weight = page.getByRole('button', { name: /体重，/ })
  await expect(height).toContainText('84.1'); await expect(height.locator('time')).toHaveCount(0)
  await expect(weight).toContainText('10.7'); await expect(weight.locator('time')).toHaveCount(0)
  await height.click()
  await expect(page.locator('.growth-step-card').nth(0).locator('time')).toHaveAttribute('datetime', '2026-09-28')
  await expect(page.locator('.growth-step-card').nth(1).locator('time')).toHaveAttribute('datetime', '2026-09-27')
  await page.goBack()
  await page.getByRole('button', { name: /选择孩子，当前/ }).click()
  const dialog = page.getByRole('dialog', { name: '我的孩子' })
  await dialog.getByRole('button', { name: '切换到评审二（合成）', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(page.locator('.nurse-station-identity')).toContainText('评审二')
  await expect(height).toContainText('80.2'); await expect(weight).toContainText('9.3')
  await expect(height.locator('time')).toHaveCount(0)
  await height.click(); await expect(page.getByRole('tab', { name: '身高曲线' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.growth-step-card').nth(0).locator('time')).toHaveAttribute('datetime', '2026-09-26')
  await expect(page.locator('.growth-step-card').nth(1).locator('time')).toHaveAttribute('datetime', '2026-09-26')
  await expect(dialog).toHaveCount(0); await page.goBack()
  await page.getByRole('button', { name: /选择孩子，当前/ }).focus(); await page.keyboard.press('Enter')
  await dialog.getByRole('button', { name: '切换到评审一（合成）', exact: true }).click()
  await expect(height).toContainText('84.1')
  await expect(page.locator('.nurse-station-child-chevron')).toBeVisible()
  for (const width of [375,390,430]) {
    await page.setViewportSize({ width, height: 667 })
    await expect(page.locator('.continuity-record-entry__example')).toContainText('示例：')
    await expect(page.getByText('记录示例 · 点击记录', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `${output}/home-${width}.png` })
  }
})

test('H04 示例身份始终可见；文字与按钮进入空记录页', async ({ page }) => {
  await initialize(page)
  const label = page.locator('.continuity-record-entry__example')
  await expect(label).toContainText('示例：')
  for (const selector of ['.continuity-record-entry__record', '.continuity-record-entry__action']) {
    await page.locator(selector).click(); await expect(page).toHaveURL(/\/smart-record$/)
    await expect(page.getByRole('textbox', { name: '哪里不舒服', exact: true })).toHaveValue('')
    await page.goBack(); await expect(label).toContainText('示例：')
  }
})

test('H05 真实跟进计数、康复、失败保留与成员隔离；F02 移除资料主操作', async ({ page, request }) => {
  await initialize(page)
  const headers = { Authorization: `Bearer ${token}` }
  await expect(page.locator('.continuity-record-entry__count')).toHaveText('0')
  const capture = async (memberId: string, text: string) => {
    const response = await request.post(`/api/members/${memberId}/case-records`, { headers, data: { requestId: crypto.randomUUID(), text, occurredAt: '2026-10-01T01:00:00.000Z', timeUnknown: false, identity: 'parent', files: [] } })
    expect(response.ok()).toBe(true); return response.json()
  }
  const first = await capture(firstId, '合成验收：昨天手臂红，今天稍淡')
  await capture(firstId, '合成验收：今天鼻塞，没有发烧')
  await capture(secondId, '另一合成孩子：上午鼻子痒')
  await page.getByRole('button', { name: /^跟进/ }).click()
  await expect(page.getByRole('tab', { name: /跟进中/ })).toHaveText('跟进中 2')
  await expect(page.getByRole('button', { name: '带回问诊资料', exact: true })).toHaveCount(0)
  await page.goBack(); await expect(page.locator('.continuity-record-entry__count')).toHaveText('2')
  await page.getByRole('button', { name: /^跟进/ }).click()
  await page.locator('.continuity-card').filter({ hasText: '昨天手臂红' }).getByRole('button', { name: '标记已康复' }).click()
  await expect(page.getByRole('tab', { name: /跟进中/ })).toHaveText('跟进中 1')
  await page.goBack(); await expect(page.locator('.continuity-record-entry__count')).toHaveText('1')
  await page.getByRole('button', { name: /^跟进/ }).click()
  await expect(page.getByRole('tab', { name: /跟进中/ })).toHaveText('跟进中 1')
  await page.route('**/api/members/*/cases?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '合成同步失败' } }) }))
  await page.goBack(); await expect(page.locator('.continuity-record-entry__count')).toHaveText('1!')
  await expect(page.locator('#home-follow-up-sync')).toContainText('同步失败')
  await page.unroute('**/api/members/*/cases?*')
  await page.getByRole('button', { name: /选择孩子，当前/ }).click()
  await page.getByRole('dialog', { name: '我的孩子' }).getByRole('button', { name: '切换到评审二（合成）', exact: true }).click()
  await expect(page.locator('.continuity-record-entry__count')).toHaveText('1')
  const recovered = await request.post(`/api/members/${firstId}/cases/${first.eventId}/recovery`, { headers, data: { action: 'restore', requestId: crypto.randomUUID() } })
  expect(recovered.ok()).toBe(true)
})

test('F03 返回首页保留成功数值；后台同步不替换为加载卡或假零', async ({ page }) => {
  await initialize(page)
  await expect(page.getByRole('button', { name: /身高，84.1/ })).toBeVisible()
  await expect(page.locator('.nurse-home-entry--medication small')).toContainText('0 个提醒任务')
  await page.getByRole('button', { name: /体重，/ }).click()
  await expect(page.getByRole('tab', { name: '体重曲线' })).toHaveAttribute('aria-selected', 'true')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/growth-measurements?*', async route => { await gate; await route.continue() })
  await page.route('**/api/medication-reminders?*', async route => { await gate; await route.continue() })
  try {
    await page.goBack()
    await expect(page).toHaveURL(/\/nurse-station$/)
    await expect(page.getByRole('button', { name: /选择孩子，当前/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /身高，84.1/ })).toBeVisible()
    await expect(page.locator('.nurse-station-hero--loading')).toHaveCount(0)
    await expect(page.locator('.nurse-home-entry--medication small')).toContainText('0 个提醒任务')
  } finally { release() }
})
