import { expect, test, type Locator, type Page } from '@playwright/test'
import { openFirstUseLogin } from '../helpers/first-child'

let sequence = 0
let memberId: string
let headers: { Authorization: string }
let pageErrors: string[]
let httpErrors: { path: string; status: number }[]
let consoleErrors: string[]

async function outline(icon: Locator) {
  await expect(icon).toBeVisible()
  const state = await icon.evaluate(svg => ({ outline: getComputedStyle(svg.querySelector('.hoho-icon__outline')!).display, solid: getComputedStyle(svg.querySelector('.hoho-icon__solid')!).display }))
  expect(state.outline).not.toBe('none')
  expect(state.solid).toBe('none')
}

async function pageIcons(page: Page) {
  await expect(page.locator('svg.lucide, [class*="lucide-"]')).toHaveCount(0)
  const invalid = await page.locator('svg.hoho-icon').evaluateAll(icons => icons.flatMap(svg => {
    const box = svg.getBoundingClientRect()
    if (!box.width || !box.height) return []
    const paths = [...svg.querySelectorAll('path')]
    return paths.length !== 2 || paths.some(path => !(path.getAttribute('d')?.length) || getComputedStyle(path).stroke !== 'none')
      ? [svg.getAttribute('data-icon')] : []
  }))
  expect(invalid).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test.beforeEach(async ({ page }, info) => {
  pageErrors = []
  httpErrors = []
  consoleErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() }) })
  sequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${sequence}` })
  await openFirstUseLogin(page)
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`图标核验${Date.now()}${info.project.name.slice(-3)}`)
  await page.getByPlaceholder('设置一个密码').fill('synthetic-icons-only')
  const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '注册并进入', exact: true }).click()
  await expect(page).toHaveURL(/nurse-station/)
  const { token } = await (await registration).json()
  expect(Boolean(token)).toBe(true)
  headers = { Authorization: `Bearer ${token}` }
  const response = await page.request.post('/api/members', { headers, data: { name: '图标合成宝宝', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(response.ok(), await response.text()).toBe(true)
  memberId = (await response.json()).id
  const selection = await page.request.post('/api/auth/current-member', { headers, data: { memberId } })
  expect(selection.ok(), await selection.text()).toBe(true)
  await page.evaluate(id => {
    const stored = JSON.parse(localStorage.getItem('hoooho-app')!)
    stored.state.currentMemberId = id
    localStorage.setItem('hoooho-app', JSON.stringify(stored))
  }, memberId)
})

test.afterEach(async ({}, info) => {
  await info.attach('browser-diagnostics.json', { body: JSON.stringify({ pageErrors, httpErrors, consoleErrors }, null, 2), contentType: 'application/json' })
  expect(pageErrors).toEqual([])
})

test('about keeps eight text entries, outline chevrons and working back/refresh', async ({ page }, info) => {
  const sections = [
    ['updates', '更新记录'], ['terms', '用户协议'], ['privacy', '隐私政策'], ['children', '儿童信息保护'],
    ['boundaries', '产品边界'], ['permissions', '数据与权限'], ['legal', '版权与法律声明'], ['business', '商业合作']
  ]
  await page.goto('/about')
  const menu = page.getByRole('region', { name: '关于页入口', exact: true })
  await expect(menu.getByRole('button')).toHaveCount(8)
  await expect(menu.locator('svg')).toHaveCount(8)
  await expect(page.getByRole('img', { name: 'Hoooho', exact: true })).toBeVisible()
  for (const [id, label] of sections) {
    await outline(menu.getByRole('button', { name: label, exact: true }).locator('[data-icon="chevron_right"]'))
    await menu.getByRole('button', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/about\\?section=${id}$`))
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
    const back = page.getByRole('button', { name: '返回', exact: true })
    await outline(back.locator('[data-icon="chevron_left"]'))
    await pageIcons(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
    await back.click()
    await expect(menu).toBeVisible()
  }
  await page.screenshot({ path: info.outputPath('about.png'), fullPage: true })
})

test('provider brands remain original through bind failure and unbind cancellation', async ({ page }, info) => {
  const profile = await (await page.request.get('/api/account/profile', { headers })).json()
  profile.providers = profile.providers.map((provider: { provider: string }) => ({ ...provider, bound: provider.provider === 'apple' }))
  await page.route('**/api/account/profile', route => route.fulfill({ json: profile }))
  await page.evaluate(value => {
    const stored = JSON.parse(localStorage.getItem('hoooho-app')!)
    stored.state.accountProfile = value
    localStorage.setItem('hoooho-app', JSON.stringify(stored))
  }, profile)
  let calls = 0
  await page.route('**/api/account/provider', async route => {
    calls += 1
    await route.fulfill({ status: 503, json: { error: { code: 'SYNTHETIC_UNAVAILABLE', message: '第三方绑定暂未开放（合成响应）' } } })
  })
  await page.goto('/account/providers')
  await expect(page.locator('[data-brand]')).toHaveCount(3)
  const marks = await page.locator('[data-brand]').evaluateAll(icons => icons.map(icon => ({ brand: icon.getAttribute('data-brand'), markup: icon.innerHTML, viewBox: icon.getAttribute('viewBox') })))
  expect(marks.map(mark => mark.brand).sort()).toEqual(['apple', 'qq', 'wechat'])
  expect(marks.find(mark => mark.brand === 'qq')?.viewBox).toBe('0 0 24 25')
  const paints = await page.locator('.provider-mark [data-brand]').evaluateAll(icons => icons.map(svg => ({
    provider: svg.getAttribute('data-brand'), color: getComputedStyle(svg).color,
    paths: [...svg.querySelectorAll('path')].map(path => getComputedStyle(path).fill)
  })))
  await info.attach('provider-paints.json', { body: JSON.stringify(paints, null, 2), contentType: 'application/json' })
  for (const paint of paints) {
    expect(paint.color, paint.provider!).toBe('rgb(255, 255, 255)')
    expect(paint.paths.every(fill => fill === paint.color), paint.provider!).toBe(true)
  }
  const wechat = page.locator('.provider-row').filter({ has: page.locator('[data-brand="wechat"]') })
  await wechat.getByRole('button', { name: '绑定', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('暂未开放')
  await outline(page.getByRole('alert').locator('[data-icon]'))
  await wechat.getByRole('button', { name: '绑定', exact: true }).click()
  await expect.poll(() => calls).toBe(2)
  const apple = page.locator('.provider-row').filter({ has: page.locator('[data-brand="apple"]') })
  await apple.getByRole('button', { name: '已绑定', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '管理第三方账户', exact: true })
  await expect(sheet).toBeVisible()
  await outline(sheet.getByRole('button', { name: '关闭管理第三方账户', exact: true }).locator('[data-icon="close"]'))
  await sheet.getByRole('button', { name: '关闭管理第三方账户', exact: true }).click()
  await expect(sheet).toBeHidden()
  expect(calls).toBe(2)
  expect(await page.locator('[data-brand]').evaluateAll(icons => icons.map(icon => ({ brand: icon.getAttribute('data-brand'), markup: icon.innerHTML, viewBox: icon.getAttribute('viewBox') })))).toEqual(marks)
  await pageIcons(page)
  await page.screenshot({ path: info.outputPath('providers-error.png'), fullPage: true })
})

test('phone and email preserve disabled, busy, failure and retry icon states without sending codes', async ({ page }, info) => {
  let bindingCalls = 0
  let release: (() => void) | undefined
  await page.route('**/api/account/bind/send-code', route => route.fulfill({ status: 503, json: { error: { code: 'SYNTHETIC_UNAVAILABLE', message: '验证码发送失败（合成响应）' } } }))
  await page.route('**/api/account/bind/confirm', async route => {
    bindingCalls += 1
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ status: 503, json: { error: { code: 'SYNTHETIC_UNAVAILABLE', message: '绑定失败，请重试（合成响应）' } } })
  })
  for (const [kind, placeholder, value, confirm] of [
    ['phone', '请输入 11 位手机号', '13800000000', '确认绑定'], ['email', '请输入新邮箱地址', 'icons@example.invalid', '确认更换']
  ]) {
    await page.goto(`/account/${kind}`)
    const send = page.getByRole('button', { name: '获取验证码', exact: true })
    const save = page.getByRole('button', { name: confirm, exact: true })
    await expect(send).toBeDisabled()
    await expect(save).toBeDisabled()
    await page.getByPlaceholder(placeholder).fill(value)
    await send.click()
    await expect(page.getByRole('alert')).toContainText('验证码发送失败')
    await expect(send).toBeEnabled()
    await page.getByLabel(kind === 'phone' ? '短信验证码' : '邮箱验证码', { exact: true }).fill('123456')
    await save.click()
    await expect(save).toBeDisabled()
    await outline(save.locator('[data-icon="progress_activity"]'))
    release!()
    await expect(page.getByRole('alert')).toContainText('绑定失败')
    await expect(save).toBeEnabled()
    await expect(save.locator('[data-icon="progress_activity"]')).toHaveCount(0)
    await pageIcons(page)
    await page.screenshot({ path: info.outputPath(`${kind}-error.png`), fullPage: true })
  }
  expect(bindingCalls).toBe(2)
})

test('profile empty/error/retry and record menus retain Material icons when edits and deletion are cancelled', async ({ page }, info) => {
  let writes = 0
  page.on('request', request => { if (new URL(request.url()).pathname === `/api/members/${memberId}/profile-list/surgery` && request.method() !== 'GET') writes += 1 })
  await page.goto('/health-profile/surgery')
  await expect(page.getByText('暂无已录入记录', { exact: true })).toBeVisible()
  const add = page.getByRole('button', { name: '添加手术史', exact: true })
  await outline(add.locator('[data-icon="add"]'))
  let failed = false
  await page.route(`**/api/members/${memberId}/profile-list/surgery`, async route => {
    if (!failed && route.request().method() === 'GET') {
      failed = true
      await route.fulfill({ status: 503, json: { error: { code: 'SYNTHETIC_UNAVAILABLE', message: '档案读取失败（合成响应）' } } })
    } else await route.continue()
  })
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('档案读取失败')
  await outline(page.getByRole('alert').locator('[data-icon]'))
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('暂无已录入记录', { exact: true })).toBeVisible()
  await add.click()
  const editor = page.getByRole('dialog', { name: '添加手术史', exact: true })
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await editor.getByLabel('手术名称或描述', { exact: true }).fill('未保存合成草稿')
  await outline(editor.getByRole('button', { name: '关闭添加手术史', exact: true }).locator('[data-icon="close"]'))
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor).toBeHidden()
  const created = await page.request.post(`/api/members/${memberId}/profile-list/surgery`, { headers, data: { key: crypto.randomUUID(), action: 'add', name: '合成手术记录', group: '' } })
  expect(created.ok(), await created.text()).toBe(true)
  expect((await created.json()).rows.map((row: { name: string }) => row.name)).toEqual(['合成手术记录'])
  await page.reload()
  const manage = page.getByRole('button', { name: '管理合成手术记录', exact: true })
  await outline(manage.locator('[data-icon="more_horiz"]'))
  await manage.click()
  const menu = page.getByRole('dialog', { name: '记录操作', exact: true })
  await outline(menu.getByRole('button', { name: '编辑', exact: true }).locator('[data-icon="edit"]'))
  await outline(menu.getByRole('button', { name: '删除', exact: true }).locator('[data-icon="delete"]'))
  await menu.getByRole('button', { name: '删除', exact: true }).click()
  const remove = page.getByRole('dialog', { name: '确认删除', exact: true })
  await expect(remove).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(remove).toBeHidden()
  await expect(manage).toBeVisible()
  expect(writes).toBe(0)
  await pageIcons(page)
  await page.screenshot({ path: info.outputPath('profile-record.png'), fullPage: true })
})

test('journal detail keeps loading/error/retry/back icons and the saved text after reopening', async ({ page }, info) => {
  const occurredAt = new Date(Date.now() - 3600_000).toISOString()
  const created = await page.request.post('/api/quick-records', { headers, data: { memberId, title: '图标详情核验', content: '合成记录原文：早上有流鼻涕，精神如常。', occurredAt, inputChannel: 'text', idempotencyKey: `icons-${memberId}`, journal: { categories: ['symptom'], timePrecision: 'exact' } } })
  expect(created.status(), await created.text()).toBe(201)
  const saved = await created.json()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let fail = true
  await page.route(`**/api/events/${saved.eventId}`, async route => {
    if (fail) {
      await pending
      await route.fulfill({ status: 503, json: { error: { code: 'SYNTHETIC_UNAVAILABLE', message: '记录读取失败（合成响应）' } } })
    } else await route.continue()
  })
  const url = `/health-events?eventId=${saved.eventId}&recordId=${saved.recordId}`
  await page.goto(url)
  const status = page.getByRole('dialog', { name: '记录详情', exact: true })
  await expect(status.getByText('正在读取记录详情', { exact: true })).toBeVisible()
  await outline(status.getByRole('button', { name: '关闭记录详情', exact: true }).locator('[data-icon="close"]'))
  release()
  await expect(status.getByRole('alert')).toContainText('记录读取失败')
  await outline(status.getByRole('alert').locator('[data-icon]'))
  fail = false
  await status.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('合成记录原文：早上有流鼻涕，精神如常。', { exact: true }).first()).toBeVisible()
  await pageIcons(page)
  await page.screenshot({ path: info.outputPath('journal-detail.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: '主要导航', exact: true })
  const calendar = nav.getByRole('button', { name: '健康日历', exact: true })
  await expect(calendar).toHaveAttribute('aria-current', 'page')
  expect(await calendar.locator('.hoho-icon__outline').evaluate(path => getComputedStyle(path).display)).toBe('none')
  await outline(nav.getByRole('button', { name: '症状记录', exact: true }).locator('[data-icon]'))
  await page.goto(url)
  await expect(page.getByText('合成记录原文：早上有流鼻涕，精神如常。', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByText('合成记录原文：早上有流鼻涕，精神如常。', { exact: true }).first()).toBeVisible()
  await pageIcons(page)
})
