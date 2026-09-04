import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'
import { childAvatarAssetPaths } from '../../src/generated/childAvatarAssets'

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

test('48 张最终儿童头像均可访问并使用长期不可变缓存', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', '静态资源全集只需验证一次')
  const paths = Object.values(childAvatarAssetPaths)
  expect(paths).toHaveLength(48)
  for (const assetPath of paths) {
    const response = await request.get(assetPath)
    expect(response.status(), assetPath).toBe(200)
    expect(response.headers()['content-type'], assetPath).toContain('image/webp')
    expect(response.headers()['cache-control'], assetPath).toBe('public, max-age=31536000, immutable')
  }
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
      avatar: 'girl-age0-east-asian',
      caregivers: ['mother'],
      primaryRecorderRelationship: 'mother',
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
    await expect(page.getByLabel('你是孩子的谁？')).toHaveValue('mother')
    await expect(page.getByText('主要照顾者')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: '其他照看者' })).toHaveCount(0)
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
  const childAvatarRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/avatars/children/v1/')) childAvatarRequests.push(request.url())
  })
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()))
  await page.route(`**/api/members/${memberId}*`, async (route) => {
    if (route.request().method() === 'PATCH') patchCount += 1
    await route.continue()
  })
  await preparePage(page, memberId)
  const avatarLoadStartedAt = Date.now()
  await page.goto(`/family/${memberId}/edit`)

  await expect(page.getByRole('heading', { name: '编辑孩子资料' })).toBeVisible()
  await expect(page.getByRole('button', { name: '换一个' })).toBeVisible()
  const cartoonImage = page.locator('img[src*="/avatars/children/v1/"]').first()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age3-east-asian\.[a-f0-9]{10}\.webp/)
  expect(Date.now() - avatarLoadStartedAt).toBeLessThan(1_500)
  await expect.poll(() => new Set(childAvatarRequests).size).toBe(3)
  expect([...new Set(childAvatarRequests)].every((url) => /girl-age3-(?:east-asian|european|african)\.[a-f0-9]{10}\.webp/.test(url))).toBeTruthy()
  expect(new Set(childAvatarRequests).size).toBeLessThanOrEqual(3)
  const avatarSwitchBox = await page.getByRole('button', { name: '换一个' }).boundingBox()
  expect(avatarSwitchBox?.height).toBeLessThanOrEqual(36)
  expect(avatarSwitchBox?.width).toBeLessThanOrEqual(90)
  const avatarBox = await page.locator('section[aria-label="卡通形象"] > div').first().boundingBox()
  expect(avatarBox?.height).toBeLessThanOrEqual(112)
  expect(avatarBox?.width).toBeLessThanOrEqual(112)
  await expect(page.getByRole('button', { name: '保存修改' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  const profileRows = page.locator('section[aria-label="孩子基本资料"] > label, section[aria-label="孩子基本资料"] > div, section[aria-label="孩子基本资料"] > fieldset')
  await expect(profileRows).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    expect((await profileRows.nth(index).boundingBox())?.height).toBeLessThanOrEqual(64)
  }
  await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveCount(0)
  await expect(page.getByLabel('你是孩子的谁？')).toHaveValue('mother')
  await expect(page.getByText('主要照顾者')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '其他照看者' })).toHaveCount(0)

  const birthday = page.getByLabel('出生日期')
  const min = await birthday.getAttribute('min')
  const max = await birthday.getAttribute('max')
  expect(min).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await birthday.fill(max!)
  await birthday.fill('2010-01-01')
  await expect(page.getByText('孩子应尚未满8周岁')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存修改' })).toBeDisabled()
  await birthday.fill('2022-05-12')
  await expect(cartoonImage).toHaveAttribute('src', /girl-age4-east-asian\.[a-f0-9]{10}\.webp/)

  const changeAvatar = page.getByRole('button', { name: '换一个' })
  await changeAvatar.click()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age4-european\.[a-f0-9]{10}\.webp/)
  await changeAvatar.click()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age4-african\.[a-f0-9]{10}\.webp/)
  await changeAvatar.click()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age4-east-asian\.[a-f0-9]{10}\.webp/)
  await changeAvatar.click()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age4-european\.[a-f0-9]{10}\.webp/)
  await page.getByRole('button', { name: '男' }).click()
  await expect(cartoonImage).toHaveAttribute('src', /boy-age4-european\.[a-f0-9]{10}\.webp/)
  await page.getByRole('button', { name: '女' }).click()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age4-european\.[a-f0-9]{10}\.webp/)
  await page.getByLabel('你是孩子的谁？').selectOption('father')

  const save = page.getByRole('button', { name: '保存修改' })
  const editUrl = page.url()
  await save.click()
  await expect(page).toHaveURL(editUrl)
  await expect(page.getByRole('button', { name: '已保存' })).toBeDisabled()
  let persistedResponse = await request.get(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${token}` } })
  let persisted = await persistedResponse.json()
  expect(persisted.avatar).toBe('girl-age4-european')
  await page.reload()
  await expect(page.locator('img[src*="/avatars/children/v1/"]').first()).toHaveAttribute('src', /girl-age4-european\.[a-f0-9]{10}\.webp/)

  await page.getByRole('button', { name: '照片' }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'child.png', mimeType: 'image/png', buffer: photo })
  const cropDialog = page.getByRole('dialog', { name: '调整照片' })
  await expect(cropDialog).toBeVisible()
  await cropDialog.getByRole('button', { name: '使用这张照片' }).click()
  await expect(page.getByRole('button', { name: '更换照片头像' })).toBeVisible()

  await save.dblclick({ delay: 10 })
  await expect(page).toHaveURL(editUrl)
  await expect(page.getByRole('button', { name: '已保存' })).toBeDisabled()
  expect(patchCount).toBe(2)

  const nameInput = page.locator('input[maxlength="50"]')
  const originalName = await nameInput.inputValue()
  await nameInput.fill(`${originalName}新`)
  await expect(page.getByRole('button', { name: '保存修改' })).toBeEnabled()
  await nameInput.fill(originalName)
  await expect(page.getByRole('button', { name: '保存修改' })).toBeDisabled()

  persistedResponse = await request.get(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(persistedResponse.ok(), await persistedResponse.text()).toBeTruthy()
  persisted = await persistedResponse.json()
  expect(persisted.caregivers).toEqual(['father', 'mother'])
  expect(persisted.primaryRecorderRelationship).toBe('father')
  expect(persisted.otherRelative).toBe('姨妈')
  expect(persisted.otherCaregiver).toBeNull()
  expect(persisted.avatar).toMatch(/^data:image\/webp;base64,/)

  await page.reload()
  await expect(page.getByRole('button', { name: '更换照片头像' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '其他照看者' })).toHaveCount(0)
  await expect(page.getByLabel('你是孩子的谁？')).toHaveValue('father')
  await expect(page.getByText('主要照顾者')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.getByRole('button', { name: '卡通形象' }).click()
  await expect(page.getByRole('button', { name: '换一个' })).toBeVisible()
  await page.getByRole('button', { name: '照片' }).click()
  await expect(page.getByRole('button', { name: '更换照片头像' })).toBeVisible()
  await page.getByRole('button', { name: '卡通形象' }).click()
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
  await page.route(`**/api/members/${memberId}*`, async (route) => {
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
  await expect(page.getByRole('textbox', { name: '其他亲属' })).toHaveCount(0)

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
    expect(created).toMatchObject({ birthday: localToday, relationship: 'child', isSelf: false, avatar: 'girl-age0-east-asian' })
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
