import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'child-profile-account'
const token = new TokenService('child-profile-e2e-secret', 60 * 60_000).create({ id: accountId })
const evidenceRoot = path.resolve('docs/design/child-profile/evidence/2026-09-04')
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNkYPj/n4GBgQEACfYDA9dHLlcAAAAASUVORK5CYII=', 'base64')

async function preparePage(page: Page, memberId: string) {
  await page.addInitScript(({ authToken, account, member }) => {
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authToken, authUser: { id: account }, opsAuthToken: null, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 4 }))
  }, { authToken: token, account: accountId, member: memberId })
}

async function prepareAccount(page: Page, authToken: string, account: string) {
  await page.addInitScript(({ token, accountId }) => {
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authToken: token, authUser: { id: accountId }, opsAuthToken: null, opsAuthUser: null,
      currentMemberId: 'self', members: [], profile: null
    }, version: 4 }))
  }, { token: authToken, accountId: account })
}

test.beforeAll(async () => {
  await mkdir(evidenceRoot, { recursive: true })
})

test('从已加载家人列表进入编辑页时不等待后台成员刷新', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', '加载性能边界只需在固定 iPhone SE 执行一次')
  const account = 'child-loading-' + testInfo.project.name
  const authToken = new TokenService('child-profile-e2e-secret', 60 * 60_000).create({ id: account })
  const createdResponse = await request.post('/api/members', {
    headers: { Authorization: 'Bearer ' + authToken },
    data: {
      name: '加载测试宝宝',
      relationship: 'child',
      gender: 'female',
      birthday: '2026-09-04',
      avatar: 'clay:v1:baby-girl:east-asian',
      caregivers: ['mother'],
      otherRelative: '姨妈',
      otherCaregiver: '王老师'
    }
  })
  expect(createdResponse.status()).toBe(201)
  const created = await createdResponse.json()
  await prepareAccount(page, authToken, account)

  try {
    await page.goto('/family')
    await expect(page.getByText('加载测试宝宝')).toBeVisible()
    await page.route('**/api/members/' + created.id, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      await route.continue()
    })

    await page.getByRole('button', { name: '切换角色' }).click()
    await expect(page).toHaveURL(/\/health-events$/)
    await page.getByRole('button', { name: '打开菜单' }).click()
    const startedAt = Date.now()
    await page.getByRole('button', { name: '编辑加载测试宝宝的资料' }).click()
    await expect(page.locator('input[maxlength="50"]')).toHaveValue('加载测试宝宝', { timeout: 800 })
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    await expect(page.getByRole('button', { name: '妈妈' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveValue('姨妈')
    await expect(page.getByRole('textbox', { name: '其他照看者' })).toHaveValue('王老师')
  } finally {
    await request.delete('/api/members/' + created.id, {
      headers: { Authorization: 'Bearer ' + authToken }
    })
  }
})

test('孩子资料完整交互、持久化、响应式和删除失败恢复', async ({ page, request }, testInfo) => {
  const memberId = `child-profile-${testInfo.project.name}`
  const runtimeErrors: string[] = []
  let patchCount = 0
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()))
  await page.route(`**/api/members/${memberId}`, async (route) => {
    if (route.request().method() === 'PATCH') patchCount += 1
    await route.continue()
  })
  await preparePage(page, memberId)
  await page.goto(`/family/${memberId}/edit`)

  await expect(page.getByRole('heading', { name: '编辑孩子资料' })).toBeVisible()
  await expect(page.getByRole('button', { name: '换一个' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存修改' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()

  const birthday = page.getByLabel('出生日期')
  const min = await birthday.getAttribute('min')
  const max = await birthday.getAttribute('max')
  expect(min).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await birthday.fill(max!)
  await birthday.fill('2010-01-01')
  await expect(page.getByText('孩子应尚未满8周岁')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存修改' })).toBeDisabled()
  await birthday.fill('2023-05-12')

  await page.getByRole('button', { name: '换一个' }).click()
  await page.getByRole('button', { name: '女' }).click()
  await page.getByRole('button', { name: '爷爷' }).click()
  await page.getByRole('button', { name: '爸爸' }).click()
  await expect(page.getByRole('button', { name: '爸爸' })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('textbox', { name: '其他亲属' }).fill(' 姨妈 ')
  await page.getByRole('textbox', { name: '其他照看者' }).fill(' 王老师 ')

  await page.getByRole('button', { name: '照片' }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'child.png', mimeType: 'image/png', buffer: photo })
  const cropDialog = page.getByRole('dialog', { name: '调整照片' })
  await expect(cropDialog).toBeVisible()
  await cropDialog.getByRole('button', { name: '使用这张照片' }).click()
  await expect(page.getByRole('button', { name: '更换照片头像' })).toBeVisible()

  const save = page.getByRole('button', { name: '保存修改' })
  await save.dblclick({ delay: 10 })
  await expect(page).toHaveURL(/\/family$/)
  expect(patchCount).toBe(1)

  const persistedResponse = await request.get(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(persistedResponse.ok(), await persistedResponse.text()).toBeTruthy()
  const persisted = await persistedResponse.json()
  expect(persisted.caregivers).toEqual(['mother', 'paternal_grandfather'])
  expect(persisted.otherRelative).toBe('姨妈')
  expect(persisted.otherCaregiver).toBe('王老师')
  expect(persisted.avatar).toMatch(/^data:image\/webp;base64,/)

  await page.goto(`/family/${memberId}/edit`)
  await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveValue('姨妈')
  await expect(page.getByRole('textbox', { name: '其他照看者' })).toHaveValue('王老师')
  await expect(page.getByRole('button', { name: '妈妈' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '爷爷' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.getByRole('button', { name: '卡通形象' }).click()
  await expect(page.getByRole('button', { name: '换一个' })).toBeVisible()
  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')
    if (shell) {
      shell.style.height = 'auto'
      shell.style.overflow = 'visible'
    }
  })
  await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-edit-child-profile.png`), fullPage: true })

  const deleteButton = page.getByRole('button', { name: '删除孩子资料' })
  await deleteButton.click()
  let confirmation = page.getByRole('dialog', { name: '删除孩子资料？' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: '取消' })).toBeFocused()
  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(confirmation).toBeHidden()
  expect((await request.get(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200)
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])

  let failDelete = true
  await page.route(`**/api/members/${memberId}`, async (route) => {
    if (failDelete && route.request().method() === 'DELETE') {
      failDelete = false
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '删除暂时失败，请重试' } }) })
    }
    await route.continue()
  })
  await deleteButton.click()
  confirmation = page.getByRole('dialog', { name: '删除孩子资料？' })
  await confirmation.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByText('删除暂时失败，请重试')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveValue('姨妈')

  await deleteButton.click()
  confirmation = page.getByRole('dialog', { name: '删除孩子资料？' })
  await confirmation.getByRole('button', { name: '确认删除' }).click()
  await expect(page).toHaveURL(/\/family$|\/health-events$/)
  expect((await request.get(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(404)
  expect(runtimeErrors).toEqual(['Failed to load resource: the server responded with a status of 503 (Service Unavailable)'])
})

test('真实入口允许编辑在上海当天出生的新建孩子', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', '真实入口边界只需在固定 iPhone SE 执行一次')
  const account = `child-entry-${testInfo.project.name}`
  const authToken = new TokenService('child-profile-e2e-secret', 60 * 60_000).create({ id: account })
  let memberId = ''
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()))
  await prepareAccount(page, authToken, account)

  try {
    await page.goto('/family')
    await page.getByRole('button', { name: /添加家人/ }).click()
    const localToday = await page.evaluate(() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })
    await page.getByLabel('姓名 *').fill('凌晨宝宝')
    await page.getByLabel('出生日期 *').fill(localToday)
    await page.getByLabel('女').check()
    const createResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith('/api/members') && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: '添加家庭成员' }).click()
    const created = await (await createResponsePromise).json()
    memberId = created.id
    expect(created).toMatchObject({ birthday: localToday, relationship: 'child', isSelf: false })
    await expect(page).toHaveURL(/\/family$/)
    await expect(page.getByText('未满1个月')).toBeVisible()

    await page.getByRole('button', { name: '切换角色' }).click()
    await expect(page).toHaveURL(/\/health-events$/)
    await page.getByRole('button', { name: '打开菜单' }).click()
    await page.getByRole('button', { name: '编辑凌晨宝宝的资料' }).click()
    await expect(page).toHaveURL(new RegExp(`/family/${memberId}/edit$`))
    await expect(page.getByRole('heading', { name: '编辑孩子资料' })).toBeVisible()
    await expect(page.getByText('该页面仅用于编辑孩子资料')).toHaveCount(0)
    await expect(page.getByLabel('出生日期')).toHaveValue(localToday)
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
  } finally {
    if (memberId) await request.delete(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${authToken}` } })
  }
})
