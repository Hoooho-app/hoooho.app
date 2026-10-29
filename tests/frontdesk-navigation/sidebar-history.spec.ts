import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
const original = '脸上有个小痘痘，不确定是包包还什么'
let memberId: string, contextId: string
test.beforeEach(async ({ page, request }) => {
  const created = await request.post('/api/members', { headers, data: { name: '合成宝宝', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(created.ok()).toBe(true); memberId = (await created.json()).id
  const context = await request.post(`/api/members/${memberId}/front-desk-record`, { headers, data: { kind: 'legacy', requestId: crypto.randomUUID(), updatedAt: Date.now(), turns: [{ id: crypto.randomUUID(), role: 'user', text: original, at: Date.now() }], files: [], voiceFiles: [] } })
  expect(context.ok()).toBe(true); contextId = (await context.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/health-profile')
  await expect(page.getByRole('navigation', { name: '档案分类' })).toBeVisible()
})

test('sidebar uses a distinct new-conversation icon and actual source keywords; opening and returning keep the original', async ({ page }, info) => {
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  let drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true }).locator('svg')).toHaveAttribute('data-icon', 'add_comment')
  await expect(drawer.getByRole('button', { name: '编辑我的信息', exact: true }).locator('svg').last()).toHaveAttribute('data-icon', 'edit')
  await expect(drawer.getByRole('button', { name: /脸上.*小痘痘.*包包（待确认）/ })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '查看全部对话' })).toHaveCount(0)
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    expect(await drawer.locator('.hoho-drawer').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(drawer.getByRole('button', { name: '反馈', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`history-${width}.png`), fullPage: true })
  }
  await drawer.getByRole('button', { name: /脸上.*小痘痘/ }).click()
  await expect(page).toHaveURL(new RegExp(`/conversation-history/${contextId}\\?from=sidebar$`))
  await expect(page.getByText(original, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/health-profile$/)
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await drawer.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: /脸上.*小痘痘/ })).toBeVisible()
})

test('more than 30 histories stay in the sidebar; a failed page retries without losing or duplicating the earlier rows', async ({ page, request }) => {
  const actual = (await (await request.get(`/api/members/${memberId}/front-desk-record/history`, { headers })).json()).items[0]
  const rows = Array.from({ length: 32 }, (_, index) => ({ ...actual, id: 'history-' + index, title: '对话关键词' + index, updatedAt: new Date(Date.now() - index * 1000).toISOString() }))
  let attempts = 0
  await page.route('**/front-desk-record/history*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    if (offset && ++attempts === 1) { await route.fulfill({ status: 503, json: { error: { message: '合成分页失败' } } }); return }
    await route.fulfill({ json: { items: rows.slice(offset, offset + 30), hasMore: offset === 0, nextOffset: offset + 30 } })
  })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '侧边栏菜单' }), items = drawer.locator('.drawer-history-group > button')
  await expect(items).toHaveCount(30)
  await drawer.getByRole('navigation', { name: '对话记录' }).evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(drawer.getByText('更早对话暂未加载，已显示的对话仍保留。')).toBeVisible()
  await expect(items).toHaveCount(30)
  await drawer.getByRole('button', { name: '重试', exact: true }).click()
  await expect(items).toHaveCount(32)
  expect(await items.last().innerText()).toContain('对话关键词31')
  await drawer.getByRole('navigation', { name: '对话记录' }).evaluate(node => { node.scrollTop = node.scrollHeight })
  expect(attempts).toBe(2)
  await expect(drawer.getByRole('button', { name: '查看全部对话' })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true })).toBeVisible()
})

test('closing the sidebar cancels a delayed page so it cannot populate a reopened history', async ({ page, request }) => {
  const actual = (await (await request.get(`/api/members/${memberId}/front-desk-record/history`, { headers })).json()).items[0]
  let generation = 0, finish: (() => void) | undefined
  await page.route('**/front-desk-record/history*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    if (offset) {
      await new Promise<void>(resolve => { finish = resolve })
      await route.fulfill({ json: { items: [{ ...actual, id: 'late', title: '迟到的旧对话' }], hasMore: false, nextOffset: 60 } }).catch(() => undefined)
    } else {
      generation++
      await route.fulfill({ json: { items: generation === 1 ? Array.from({ length: 30 }, (_, n) => ({ ...actual, id: 'first-' + n })) : [{ ...actual, title: '重新打开后的对话' }], hasMore: generation === 1, nextOffset: 30 } })
    }
  })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  let drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.locator('.drawer-history-group > button')).toHaveCount(30)
  await drawer.getByRole('navigation', { name: '对话记录' }).evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect.poll(() => Boolean(finish)).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.getByRole('button', { name: /重新打开后的对话/ })).toBeVisible()
  finish!()
  await expect(drawer.locator('.drawer-history-group > button')).toHaveCount(1)
  await expect(drawer.getByRole('button', { name: /迟到的旧对话/ })).toHaveCount(0)
})

test('a tall sidebar automatically loads the next page when the first 30 rows do not fill it', async ({ page, request }) => {
  const actual = (await (await request.get(`/api/members/${memberId}/front-desk-record/history`, { headers })).json()).items[0]
  await page.setViewportSize({ width: 1280, height: 2400 })
  await page.route('**/front-desk-record/history*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    await route.fulfill({ json: { items: Array.from({ length: offset ? 1 : 30 }, (_, n) => ({ ...actual, id: 'tall-' + (n + offset), title: '历史主题' + (n + offset) })), hasMore: !offset, nextOffset: offset + 30 } })
  })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '侧边栏菜单' }).locator('.drawer-history-group > button')).toHaveCount(31)
})
