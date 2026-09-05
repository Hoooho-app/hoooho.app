import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'design-quality-account'
const memberId = 'design-quality-member'
const token = new TokenService('design-quality-e2e-secret', 60 * 60_000).create({ id: accountId })
const phase = process.env.DESIGN_AUDIT_PHASE === 'after' ? 'after' : 'before'
const evidenceRoot = path.resolve(`docs/design/audit-reports/2026-09-03-initial/evidence/${phase}`)
let eventId = ''

async function preparePage(page: Page) {
  await page.addInitScript(({ authToken, account, member }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: account }, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 5 }))
  }, { authToken: token, account: accountId, member: memberId })
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

const routes = [
  { slug: 'health-events', path: '/health-events' },
  { slug: 'health-event-detail', path: () => `/health-events/${eventId}` },
  { slug: 'family', path: '/family' },
  { slug: 'health-profile', path: '/health-profile' },
  { slug: 'guide', path: '/guide' },
  { slug: 'feedback', path: '/feedback' },
  { slug: 'settings', path: '/settings' }
] as const

for (const route of routes) {
  test(`${route.slug} renders without overflow and records evidence`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()))
    await preparePage(page)
    const target = typeof route.path === 'function' ? route.path() : route.path
    await page.goto(target)
    await expect(page.locator('main')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(target)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
    await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-${route.slug}.png`), fullPage: true })
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
  })
}

test('login records public-state evidence and keeps the page scale fixed', async ({ page }, testInfo) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  if (phase === 'after') {
    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('initial-scale=1')
    expect(viewport).toContain('minimum-scale=1')
    expect(viewport).toContain('maximum-scale=1')
    expect(viewport).toContain('user-scalable=no')
    expect(viewport).toContain('viewport-fit=cover')
  }
  if (phase === 'after' && testInfo.project.name === 'iphone-se') {
    const session = await page.context().newCDPSession(page)
    const initialScale = await page.evaluate(() => window.visualViewport?.scale ?? 1)
    await session.send('Input.synthesizePinchGesture', { x: 188, y: 334, scaleFactor: 2, relativeSpeed: 800 })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(initialScale)
    await session.send('Input.synthesizePinchGesture', { x: 188, y: 334, scaleFactor: 0.5, relativeSpeed: 800 })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(initialScale)
  }
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-login.png`), fullPage: true })
})

test('protected deep link returns after login without fallible member bootstrap', async ({ page }) => {
  test.skip(phase === 'before')
  let loggedIn = false
  await page.route('**/api/auth/session', (route) => loggedIn
    ? route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token, user: { id: accountId, email: 'design@hoooho.test' } })
    })
    : route.continue())
  await page.route('**/api/auth/profile-sections', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]'
  }))
  await page.route('**/api/auth/email/login', (route) => {
    loggedIn = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token, user: { id: accountId, email: 'design@hoooho.test' } })
    })
  })
  await page.goto('/settings?panel=privacy#controls')
  await page.getByPlaceholder('请输入邮箱地址').fill('design@hoooho.test')
  await page.getByPlaceholder('请输入验证码').fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/settings\?panel=privacy#controls$/)
})

test('filter drawer and delete confirmation trap and restore focus', async ({ page }, testInfo) => {
  test.skip(phase === 'before')
  await preparePage(page)
  await page.goto('/health-events')
  await page.getByRole('button', { name: '列表视图' }).click()
  const filterTrigger = page.getByRole('button', { name: '筛选健康随记' })
  await filterTrigger.click()
  const filter = page.getByRole('dialog', { name: '健康随记筛选' })
  await expect(filter).toBeVisible()
  await expect(filter.getByRole('button', { name: '关闭' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(filter.getByRole('button', { name: '确定' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(filter.getByRole('button', { name: '关闭' })).toBeFocused()
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-filter-focus.png`), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(filter).toBeHidden()
  await expect(filterTrigger).toBeFocused()
  const eventCard = page.locator(`[data-event-id="${eventId}"]`)
  const deleteTrigger = eventCard.getByRole('button', { name: '删除这条健康随记' })
  await deleteTrigger.focus()
  await deleteTrigger.evaluate((button: HTMLButtonElement) => button.click())
  const confirmation = page.getByRole('dialog', { name: '删除这条健康随记？' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(confirmation.getByRole('button', { name: '确认删除' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: '取消' })).toBeFocused()
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-delete-confirm-focus.png`), fullPage: true })
  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(confirmation).toBeHidden()
  await expect(deleteTrigger).toBeFocused()
  await expect(eventCard).toBeVisible()
})

test('feedback success, empty, and error states record evidence', async ({ page }, testInfo) => {
  test.skip(phase === 'before')
  await preparePage(page)
  let feedbackCreated = false
  await page.route('**/api/feedback', async (route) => {
    if (route.request().method() === 'POST') {
      feedbackCreated = true
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'design-quality-feedback', status: 'received', createdAt: '2026-09-03T10:00:00.000Z' })
      })
    }
    const createdFeedback = {
      id: 'design-quality-feedback',
      category: '页面显示',
      problemPage: null,
      problemType: 'display_issue',
      description: '375px 下的问题类型选项过于拥挤。',
      summary: '移动端问题类型选项拥挤',
      sourcePath: '/feedback',
      sourceName: '反馈意见',
      appVersion: 'design-quality',
      status: 'received',
      createdAt: '2026-09-03T10:00:00.000Z',
      updatedAt: '2026-09-03T10:00:00.000Z',
      statusUpdatedAt: '2026-09-03T10:00:00.000Z',
      latestReply: null,
      unreadReplyCount: 0,
      attachmentCount: 0
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feedbackCreated ? [createdFeedback] : []) })
  })
  await page.goto('/feedback')
  await page.getByRole('button', { name: '页面显示' }).click()
  await page.getByRole('textbox', { name: '反馈内容' }).fill('375px 下的问题类型选项过于拥挤。')
  await page.getByRole('button', { name: '确认提交反馈' }).click()
  await expect(page).toHaveURL(/\/feedback\/mine$/)
  await expect(page.getByRole('status')).toContainText('反馈已收到')
  await expect(page.getByText('你已帮助 Hoooho 提交了')).toContainText('1')
  await expect(page.getByText('移动端问题类型选项拥挤')).toBeVisible()
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-feedback-success.png`), fullPage: true })

  await page.unroute('**/api/feedback')
  await page.route('**/api/feedback', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('/feedback/mine')
  await expect(page.getByRole('heading', { name: '还没有反馈记录' })).toBeVisible()
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-feedback-empty.png`), fullPage: true })

  await page.unroute('**/api/feedback')
  await page.route('**/api/feedback', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: '反馈记录暂时无法读取' } })
  }))
  await page.goto('/feedback/mine')
  await expect(page.getByRole('alert')).toContainText('反馈记录暂时无法读取')
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-feedback-error.png`), fullPage: true })
})

test('reduced-motion mode remains layout stable', async ({ page }, testInfo) => {
  test.skip(phase === 'before')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await preparePage(page)
  await page.goto('/guide')
  await expect(page.locator('main')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-reduced-motion-guide.png`), fullPage: true })
})
