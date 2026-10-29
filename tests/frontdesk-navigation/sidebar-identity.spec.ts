import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
let first: string, second: string
const drawer = (page: Page) => page.getByRole('dialog', { name: '侧边栏菜单', exact: true })
const menu = async (page: Page) => page.getByRole('button', { name: '打开菜单', exact: true }).click()

test.beforeEach(async ({ page, request }) => {
  expect((await request.patch('/api/account/profile', { headers, data: { nickname: '刘磊' } })).ok()).toBe(true)
  const create = async (name: string, gender: string, avatar: string) => {
    const res = await request.post('/api/members', { headers, data: { name, relationship: 'child', birthday: '2024-10-01', gender, avatar } })
    expect(res.ok()).toBe(true); return (await res.json()).id
  }
  first = await create('刘景一', 'female', 'girl-age2-east-asian')
  second = await create('刘景二', 'male', 'boy-age2-east-asian')
  expect((await page.request.get('/api/auth/session', { headers })).ok()).toBe(true)
  const selected = await page.request.post('/api/auth/current-member', { headers, data: { memberId: first } })
  expect(selected.ok(), await selected.text()).toBe(true)
  await page.addInitScript(({ token, first }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test', nickname: '刘磊' }, currentMemberId: first, members: [], profile: null }, version: 5 }))
  }, { token, first })
  await page.goto('/nurse-station')
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeEnabled()
})

test.afterEach(async ({ request }) => {
  for (const id of [first, second]) if (id) await request.delete('/api/members/' + id, { headers })
})

test('account dominates the child selector with both avatars, private names and no mobile overflow', async ({ page }, info) => {
  await menu(page)
  await expect(drawer(page).locator('.drawer-account-avatar')).toHaveText('磊')
  await expect(drawer(page).locator('.drawer-account')).toContainText('*磊')
  await expect(drawer(page).locator('.drawer-account-copy>span')).toHaveText('记录者')
  await expect(drawer(page).locator('.drawer-account-action')).toHaveText('我的')
  await expect(drawer(page).locator('.drawer-subject')).toContainText('刘*一')
  await expect(drawer(page).locator('.drawer-subject')).toContainText('女儿 · 2岁')
  await expect(drawer(page).locator('.drawer-subject img')).toBeVisible()
  await expect(drawer(page)).not.toContainText('刘景一')
  await expect(drawer(page)).not.toContainText('刘磊')
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 568 })
    const sizes = await drawer(page).evaluate(root => {
      const rect = (selector: string) => root.querySelector(selector)!.getBoundingClientRect()
      const font = (selector: string) => parseFloat(getComputedStyle(root.querySelector(selector)!).fontSize)
      return { accountAvatar: rect('.drawer-account-avatar').width, childAvatar: rect('.drawer-subject>:first-child').width,
        glyphX: rect('.drawer-account-avatar__glyph').x + rect('.drawer-account-avatar__glyph').width / 2,
        glyphY: rect('.drawer-account-avatar__glyph').y + rect('.drawer-account-avatar__glyph').height / 2,
        circleX: rect('.drawer-account-avatar').x + rect('.drawer-account-avatar').width / 2,
        circleY: rect('.drawer-account-avatar').y + rect('.drawer-account-avatar').height / 2,
        nameBottom: rect('.drawer-account-copy strong').bottom, roleTop: rect('.drawer-account-copy>span').top,
        nameX: rect('.drawer-account-copy strong').x, roleX: rect('.drawer-account-copy>span').x,
        actionX: rect('.drawer-account-action').x, nameRight: rect('.drawer-account-copy').right,
        glyphLineHeight: getComputedStyle(root.querySelector('.drawer-account-avatar__glyph')!).lineHeight,
        glyphFontSize: getComputedStyle(root.querySelector('.drawer-account-avatar__glyph')!).fontSize,
        accountFont: font('.drawer-account strong'), childFont: font('.drawer-subject strong'), accountHeight: rect('.drawer-account').height,
        childHeight: rect('.drawer-subject').height, fits: Array.from(root.querySelectorAll('.hoho-drawer,.drawer-identities,.drawer-subject,.drawer-subject-detail')).every(node => node.scrollWidth <= node.clientWidth) }
    })
    expect(Math.abs(sizes.glyphX - sizes.circleX)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(sizes.glyphY - sizes.circleY)).toBeLessThanOrEqual(0.5)
    expect(sizes.glyphLineHeight).toBe(sizes.glyphFontSize)
    expect(sizes.roleTop).toBeGreaterThanOrEqual(sizes.nameBottom)
    expect(sizes.roleX).toBe(sizes.nameX)
    expect(sizes.actionX).toBeGreaterThanOrEqual(sizes.nameRight)
    expect(sizes.accountAvatar).toBeGreaterThan(sizes.childAvatar)
    expect(sizes.accountFont).toBeGreaterThan(sizes.childFont)
    expect(sizes.accountHeight).toBeGreaterThan(sizes.childHeight)
    expect(sizes.childHeight).toBeGreaterThanOrEqual(44)
    expect(sizes.fits).toBe(true)
    await expect(drawer(page).getByRole('button', { name: '反馈', exact: true })).toBeInViewport()
    await expect(drawer(page).getByRole('button', { name: '关于', exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`sidebar-account-${width}.png`) })
  }
})

test('account opens a full page with settings, security and binding; returning preserves unsent work and subject', async ({ page, request }, info) => {
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('稍后继续补充的内容')
  await menu(page)
  await drawer(page).getByRole('button', { name: '我的账户', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: '我的账户', exact: true })).toBeVisible()
  await expect(drawer(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '账户', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath('account-page.png') })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.goBack()
  await page.getByRole('button', { name: '账户与安全', exact: true }).click()
  await expect(page).toHaveURL(/\/account\/security$/)
  await expect(page.getByRole('button', { name: /手机号/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /邮箱/ })).toBeVisible()
  await page.getByRole('button', { name: /第三方账户/ }).click()
  await expect(page).toHaveURL(/\/account\/providers$/)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/account\/security$/)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(page.getByLabel('对话输入', { exact: true })).toHaveValue('稍后继续补充的内容')
  await menu(page)
  await expect(drawer(page).locator('.drawer-subject')).toContainText('刘*一')
  expect((await (await request.get('/api/account/profile', { headers })).json()).nickname).toBe('刘磊')
})

test('child switch failure retains the original child; retry switches its identity without changing the account', async ({ page }) => {
  let writes = 0
  await page.route('**/api/auth/current-member', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    writes++
    if (writes === 1) return route.fulfill({ status: 503, json: { error: { message: '合成切换失败，请重试' } } })
    return route.continue()
  })
  await menu(page)
  await drawer(page).getByRole('button', { name: '切换记录对象', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '我的孩子', exact: true })
  await sheet.getByRole('button', { name: '切换到刘*二', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText('合成切换失败')
  await expect(sheet.getByRole('button', { name: '刘*一，当前记录对象', exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: '切换到刘*二', exact: true }).click()
  await expect(sheet).toBeHidden()
  await menu(page)
  await expect(drawer(page).locator('.drawer-account-avatar')).toHaveText('磊')
  await expect(drawer(page).locator('.drawer-subject')).toContainText('刘*二')
  await expect(drawer(page).locator('.drawer-subject')).toContainText('儿子')
  expect(writes).toBe(2)
})

test('Unicode nickname uses its last character in the avatar and editing preserves the full stored name', async ({ page, request }) => {
  expect((await request.patch('/api/account/profile', { headers, data: { nickname: '𠮷田' } })).ok()).toBe(true)
  await page.reload(); await menu(page)
  await expect(drawer(page).locator('.drawer-account-avatar')).toHaveText('田')
  await expect(drawer(page).locator('.drawer-account strong')).toHaveText('*田')
  await drawer(page).getByRole('button', { name: '我的账户', exact: true }).click()
  await page.getByRole('button', { name: '账户与安全', exact: true }).click()
  await page.getByRole('button', { name: /昵称/ }).click()
  await expect(page.getByRole('textbox', { name: /^昵称/ })).toHaveValue('𠮷田')
})

test('the account entry returns to its actual source page', async ({ page }) => {
  await page.goto('/health-profile')
  await menu(page); await drawer(page).getByRole('button', { name: '我的账户', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的账户', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/health-profile$/)
})
