import { expect, test, type Page, type Route } from '@playwright/test'

type Mode = 'ok' | 'failure' | 'offline' | 'expired'
async function setup(page: Page) {
  const state = {
    mode: 'ok' as Mode, profileMode: 'ok' as Mode, accountId: 'recovery-account',
    sessionCalls: 0, memberCalls: 0, writes: [] as string[],
    sessionGate: undefined as Promise<void> | undefined, profileGate: undefined as Promise<void> | undefined,
    member401: false, accountPatch401: false, entryFailure: false
  }
  const user = () => ({ id: state.accountId, nickname: state.accountId === 'recovery-account' ? '验收家长' : '另一位家长', guest: false, requiresNicknameSetup: false })
  const child = () => ({ id: `${state.accountId}-child`, accountId: state.accountId, name: state.accountId === 'recovery-account' ? '验收孩子' : '另一位孩子', relationship: 'child', birthday: '2025-01-01', gender: 'female', avatar: '', createdAt: '2026-01-01T00:00:00Z' })
  const send = (route: Route, json: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (method !== 'GET') state.writes.push(`${method} ${path}`)
    if (path === '/api/auth/session') {
      state.sessionCalls++
      await state.sessionGate
      if (state.mode === 'offline') return route.abort('internetdisconnected')
      if (state.mode === 'failure') return send(route, { error: { code: 'TEMPORARY_FAILURE', message: 'temporarily unavailable' } }, 503)
      if (state.mode === 'expired') return send(route, { unauthenticated: true })
      return send(route, { token: `recovery-token-${state.sessionCalls}`, user: user() })
    }
    if (path === '/api/auth/nickname/login' || path === '/api/auth/register') {
      const input = route.request().postDataJSON()
      if (input.nickname === '另一位家长') state.accountId = 'another-account'
      state.mode = 'ok'
      return send(route, { token: 'new-login-token', user: user() })
    }
    if (path === '/api/auth/logout') { state.mode = 'expired'; return send(route, { success: true }) }
    if (path === '/api/auth/profile-sections') {
      await state.profileGate
      return state.profileMode === 'failure' ? send(route, { error: { code: 'PROFILE_TEMPORARY_FAILURE' } }, 503) : send(route, [])
    }
    if (path === '/api/members') {
      state.memberCalls++
      if (state.member401) { state.member401 = false; return send(route, { error: { code: 'UNAUTHORIZED' } }, 401) }
      return send(route, [child()])
    }
    if (path.startsWith('/api/members/') && !path.slice('/api/members/'.length).includes('/')) {
      return path.endsWith(child().id) ? send(route, child()) : send(route, { error: { code: 'FORBIDDEN', message: '无法查看这份资料' } }, 403)
    }
    if (path === '/api/account/profile') {
      if (method === 'PATCH' && state.accountPatch401) return send(route, { error: { code: 'UNAUTHORIZED' } }, 401)
      return send(route, { ...user(), avatar: '', email: null, phone: null, providers: [], hasPassword: true })
    }
    if (path === '/api/account/entry-state') return state.entryFailure ? send(route, { error: { code: 'TEMPORARY_FAILURE' } }, 503) : send(route, { familyMemberCount: 1, hasValidHealthRecord: true })
    return send(route, [])
  })
  return state
}

async function resume(page: Page) {
  // Simulate returning after 31 seconds, without waiting for wall-clock time.
  await page.evaluate(() => {
    const original = Date.now
    Date.now = () => original() + 31_000
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    Date.now = original
  })
}

test('cold startup has a branded shell, hides unverified data, and retries in place', async ({ page }, info) => {
  const state = await setup(page)
  let release = () => {}
  state.sessionGate = new Promise<void>(resolve => { release = resolve })
  state.mode = 'failure'
  await page.addInitScript(() => localStorage.setItem('hoooho-app', JSON.stringify({ version: 5, state: { authUser: { id: 'recovery-account' }, members: [{ id: 'cached-child', name: '未验证的旧资料' }], currentMemberId: 'cached-child' } })))
  await page.goto('/account/nickname')
  await expect(page.getByRole('heading', { name: '正在打开 Hoooho' })).toBeVisible()
  await expect(page.getByText('未验证的旧资料')).toHaveCount(0)
  await expect(page.locator('.session-recovery-art')).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: '暂时没能连接上' })).toBeVisible()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 667 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`startup-${width}.png`) })
  }
  state.mode = 'ok'; state.sessionGate = undefined
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('验收家长')
  await expect(page).toHaveURL(/account\/nickname/)
})

test('slow recovery keeps the form node and scroll, then removes its delayed status', async ({ page }, info) => {
  const state = await setup(page)
  await page.goto('/family/recovery-account-child/edit')
  const input = page.getByRole('textbox', { name: '姓名', exact: true })
  await input.fill('未保存的名字')
  await input.evaluate(node => { node.dataset.recoveryMarker = 'original-form' })
  await page.evaluate(() => window.scrollTo(0, 200))
  const scroll = await page.evaluate(() => scrollY)
  let release = () => {}
  state.sessionGate = new Promise<void>(resolve => { release = resolve })
  await resume(page)
  await expect(page.locator('.session-recovery-chip')).toBeVisible()
  await expect(input).toHaveValue('未保存的名字')
  expect(await input.getAttribute('data-recovery-marker')).toBe('original-form')
  expect(await page.evaluate(() => scrollY)).toBe(scroll)
  await page.screenshot({ path: info.outputPath('warm-recovering.png') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.session-recovery-chip .session-recovery-spinner').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  release(); state.sessionGate = undefined
  await expect(page.locator('.session-recovery-chip')).toContainText('已重新连接')
  await expect(page.locator('.session-recovery-chip')).toHaveCount(0)
  await expect(input).toHaveValue('未保存的名字')
  expect(await input.getAttribute('data-recovery-marker')).toBe('original-form')
  expect(await page.evaluate(() => scrollY)).toBe(scroll)
  expect(state.writes).toEqual([])
})

test('temporary failure and retry keep an authenticated page and do not submit a draft', async ({ page }, info) => {
  const state = await setup(page)
  await page.goto('/account/nickname')
  const input = page.getByRole('textbox', { name: /^昵称/ })
  await expect(input).toHaveValue('验收家长')
  await input.fill('还没提交的昵称')
  state.mode = 'failure'
  await resume(page)
  await expect(page.locator('.session-recovery-notice')).toContainText('连接暂时中断')
  await expect(input).toHaveValue('还没提交的昵称')
  await expect(page.locator('[data-session-recovery-screen]')).toHaveCount(0)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 667 })
    await expect(page.locator('.session-recovery-notice')).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`warm-failure-${width}.png`) })
  }
  let release = () => {}
  state.mode = 'ok'; state.sessionGate = new Promise<void>(resolve => { release = resolve })
  const before = state.sessionCalls
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => state.sessionCalls).toBe(before + 1)
  release(); state.sessionGate = undefined
  await expect(page.locator('.session-recovery-notice')).toHaveCount(0)
  await expect(input).toHaveValue('还没提交的昵称')
  expect(state.writes).toEqual([])
})

test('profile failure does not block an unrelated page and archive routes wait for their own data', async ({ page }) => {
  const state = await setup(page)
  state.profileMode = 'failure'
  await page.goto('/account/nickname')
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('验收家长')
  await expect(page.locator('.session-recovery-notice')).toContainText('部分资料暂未更新')
  await page.goto('/health-profile/identity')
  await expect(page.getByRole('heading', { name: '部分资料暂时未加载' })).toBeVisible()
  await expect(page.getByText('暂无过敏史', { exact: true })).toHaveCount(0)
  state.profileMode = 'ok'
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(page.locator('[data-session-recovery-screen]')).toHaveCount(0)
  await expect(page).toHaveURL(/health-profile\/identity/)
})

test('a 401 during member hydration recovers its token without a dependency deadlock', async ({ page }) => {
  const state = await setup(page)
  state.member401 = true
  await page.goto('/account/nickname')
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('验收家长', { timeout: 6000 })
  expect(state.sessionCalls).toBe(2)
  expect(state.memberCalls).toBe(2)
})

test('confirmed expiry shows a focused login dialog and same-account login preserves the original edit', async ({ page }, info) => {
  const state = await setup(page)
  await page.goto('/family/recovery-account-child/edit')
  const input = page.getByRole('textbox', { name: '姓名', exact: true })
  await input.fill('登录后继续的草稿')
  const original = await input.elementHandle()
  state.mode = 'expired'
  await resume(page)
  const dialog = page.getByRole('dialog', { name: '重新登录后继续' })
  await expect(dialog).toBeVisible()
  expect(await page.locator('#root').getAttribute('inert')).not.toBeNull()
  await expect(page).toHaveURL(/family\/recovery-account-child\/edit/)
  await page.screenshot({ path: info.outputPath('expired-dialog.png') })
  await dialog.getByRole('button', { name: '重新登录', exact: true }).click()
  await page.setViewportSize({ width: 320, height: 420 })
  await expect(dialog).toBeInViewport()
  await dialog.getByPlaceholder('输入你的昵称').fill('验收家长')
  await dialog.getByPlaceholder('输入密码').fill('test-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(input).toHaveValue('登录后继续的草稿')
  expect(await original!.evaluate(node => node.isConnected)).toBe(true)
  expect(await page.locator('#root').getAttribute('inert')).toBeNull()
  await expect(page).toHaveURL(/family\/recovery-account-child\/edit/)
})

test('logging into another account clears the former account view and draft', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/account/nickname')
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('验收家长')
  await page.getByRole('textbox', { name: /^昵称/ }).fill('旧账号的私有草稿')
  state.mode = 'expired'
  await resume(page)
  const dialog = page.getByRole('dialog', { name: '重新登录后继续' })
  await dialog.getByRole('button', { name: '重新登录', exact: true }).click()
  await dialog.getByPlaceholder('输入你的昵称').fill('另一位家长')
  await dialog.getByPlaceholder('输入密码').fill('test-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('另一位家长')
  expect(await page.locator('input').evaluateAll(nodes => nodes.map(node => node.value))).not.toContain('旧账号的私有草稿')
})

test('fast recovery stays silent and offline recovery retries once before reconnecting online', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/account/nickname')
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('验收家长')
  const before = state.sessionCalls
  await resume(page)
  await expect.poll(() => state.sessionCalls).toBe(before + 1)
  await page.waitForTimeout(150)
  await expect(page.locator('.session-recovery-chip')).toHaveCount(0)
  state.mode = 'offline'
  const offlineBefore = state.sessionCalls
  await resume(page)
  await expect(page.locator('.session-recovery-notice')).toContainText('连接暂时中断')
  expect(state.sessionCalls).toBe(offlineBefore + 2)
  state.mode = 'ok'
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('.session-recovery-notice')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('验收家长')
})

test('an established archive editor survives token refresh and a gate revalidation failure', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/health-profile/identity')
  await expect(page.locator('[data-session-recovery-screen]')).toHaveCount(0)
  const content = page.locator('main.app-shell').last()
  await content.evaluate(node => { node.dataset.recoveryMarker = 'original-archive-editor' })
  state.entryFailure = true
  const before = state.sessionCalls
  await resume(page)
  await expect.poll(() => state.sessionCalls).toBe(before + 1)
  await page.waitForTimeout(150)
  await expect(content).toHaveAttribute('data-recovery-marker', 'original-archive-editor')
  await expect(page.locator('[data-session-recovery-screen]')).toHaveCount(0)
})

test('a denied save opens reauthentication without replaying or clearing the unsaved form', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/account/nickname')
  const input = page.getByRole('textbox', { name: /^昵称/ })
  await expect(input).toHaveValue('验收家长')
  await input.fill('尚未保存')
  const originalInput = await input.elementHandle()
  state.mode = 'expired'; state.accountPatch401 = true
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '重新登录后继续' })).toBeVisible()
  expect(state.writes.filter(path => path === 'PATCH /api/account/profile')).toHaveLength(1)
  expect(await originalInput!.evaluate(node => (node as HTMLInputElement).value)).toBe('尚未保存')
  await expect(page).toHaveURL(/account\/nickname/)
})

test('logout invalidates an in-flight recovery and its late response cannot restore the account', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/settings/account')
  await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible()
  let release = () => {}
  state.sessionGate = new Promise<void>(resolve => { release = resolve })
  await resume(page)
  await expect(page.locator('.session-recovery-chip')).toBeVisible()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/login/)
  state.mode = 'ok'; release(); state.sessionGate = undefined
  await page.waitForTimeout(200)
  await expect(page).toHaveURL(/login/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hoooho-app') || '{}').state.authUser)).toBeNull()
})

test('a token rejected again after recovery preserves the route and requires reauthentication', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/account/nickname')
  const input = page.getByRole('textbox', { name: /^昵称/ })
  await expect(input).toHaveValue('验收家长')
  await input.fill('拒绝后也保留')
  const originalInput = await input.elementHandle()
  state.accountPatch401 = true
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '重新登录后继续' })).toBeVisible()
  await expect(page).toHaveURL(/account\/nickname/)
  expect(await originalInput!.evaluate(node => (node as HTMLInputElement).value)).toBe('拒绝后也保留')
})
