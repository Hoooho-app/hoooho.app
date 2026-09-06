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
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: account }, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 5 }))
  }, { authToken: token, account: accountId, member: memberId })
}

async function prepareAccount(page: Page, authToken: string, account: string) {
  await page.addInitScript(({ token, accountId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: accountId }, opsAuthUser: null,
      currentMemberId: 'self', members: [], profile: null
    }, version: 5 }))
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

    // Bootstrap now restores the first valid member before rendering this page.
    await expect(page.getByText('当前', { exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await expect(page).toHaveURL(/\/health-events$/)
    await page.getByRole('button', { name: '打开菜单' }).click()
    await expect(page.getByText('当前记录对象', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '切换人物' })).toBeVisible()
    const startedAt = Date.now()
    await page.getByRole('button', { name: '编辑资料' }).click()
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

test('侧边栏当前孩子条目打开可切换、编辑和添加的我的孩子弹窗', async ({ page, request }, testInfo) => {
  test.skip(!['iphone-se', 'mobile-390', 'mobile-430'].includes(testInfo.project.name), '只验证要求的三档移动视口')
  const account = 'drawer-member-' + testInfo.project.name
  const authToken = new TokenService('child-profile-e2e-secret', 60 * 60_000).create({ id: account })
  const createMember = async (name: string, birthday: string) => {
    const response = await request.post('/api/members', {
      headers: { Authorization: 'Bearer ' + authToken },
      data: { name, relationship: 'child', gender: 'female', birthday, avatar: 'girl-age1-east-asian' }
    })
    expect(response.status()).toBe(201)
    return response.json()
  }
  const created = await createMember('刘景宜', '2024-12-04')
  const second = await createMember('刘景安', '2022-07-04')
  const extraMembers = testInfo.project.name === 'iphone-se'
    ? await Promise.all(['小满', '安安', '宁宁', '乐乐', '可可', '一一'].map((name, index) => createMember(name, `202${index % 3 + 1}-06-04`)))
    : []
  await prepareAccount(page, authToken, account)

  try {
    await page.goto('/health-events')
    await page.getByRole('button', { name: '打开菜单' }).click()
    const drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
    await expect(drawer.getByText('刘景宜', { exact: true })).toBeVisible()
    await expect(drawer.getByText('当前记录对象', { exact: true })).toBeVisible()
    await expect(drawer.getByText('切换人物', { exact: true })).toHaveCount(0)
    await expect(drawer.getByText('编辑资料', { exact: true })).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: '健康随身记' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '健康档案夹' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '说明', exact: true })).toBeVisible()
    const accountButton = drawer.getByRole('button', { name: /已同步/ })
    const accountBox = await accountButton.boundingBox()
    expect(accountBox && accountBox.y + accountBox.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    await page.screenshot({ path: testInfo.outputPath('current-member-drawer.png') })
    await drawer.getByRole('button', { name: '打开我的孩子' }).click()
    const sheet = page.getByRole('dialog', { name: '我的孩子' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('heading', { name: '我的孩子' })).toBeVisible()
    await expect(sheet.getByText('选择健康内容的记录对象')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: '添加孩子' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: '刘景宜，当前记录对象' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: '切换到刘景安' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: '编辑刘景安的资料' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('my-children-sheet.png') })

    if (testInfo.project.name !== 'iphone-se') return

    const sheetBox = await sheet.boundingBox()
    expect(sheetBox && sheetBox.y + sheetBox.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    const list = sheet.locator('.current-child-sheet__list')
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy()
    const titleBeforeScroll = await sheet.getByRole('heading', { name: '我的孩子' }).boundingBox()
    const addBeforeScroll = await sheet.getByRole('button', { name: '添加孩子' }).boundingBox()
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight })
    expect((await sheet.getByRole('heading', { name: '我的孩子' }).boundingBox())?.y).toBe(titleBeforeScroll?.y)
    expect((await sheet.getByRole('button', { name: '添加孩子' }).boundingBox())?.y).toBe(addBeforeScroll?.y)
    await sheet.getByRole('button', { name: '关闭我的孩子' }).click()
    await expect(sheet).toBeHidden()
    await page.getByRole('button', { name: '打开我的孩子' }).click()
    await page.locator('.current-child-sheet-backdrop').click({ position: { x: 360, y: 40 } })
    await expect(sheet).toBeHidden()
    await page.getByRole('button', { name: '打开我的孩子' }).click()
    let switchRequests = 0
    page.on('request', (browserRequest) => {
      if (browserRequest.url().endsWith('/api/auth/current-member')) switchRequests += 1
    })
    await sheet.getByRole('button', { name: '编辑刘景安的资料' }).click()
    await expect(page).toHaveURL(new RegExp(`/family/${second.id}/edit$`))
    expect(switchRequests).toBe(0)

    await page.goto('/health-events')
    await page.getByRole('button', { name: '打开菜单' }).click()
    await page.getByRole('button', { name: '打开我的孩子' }).click()
    await page.route('**/api/auth/current-member', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: '暂时无法切换' } }) }), { times: 1 })
    await page.getByRole('dialog', { name: '我的孩子' }).getByRole('button', { name: '切换到刘景安' }).click()
    await expect(page.getByRole('alert')).toHaveText('暂时无法切换')
    await expect(page.getByRole('dialog', { name: '我的孩子' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: '打开我的孩子' })).toContainText('刘景宜')

    await page.getByRole('dialog', { name: '我的孩子' }).getByRole('button', { name: '切换到刘景安' }).click()
    await expect(page.getByRole('dialog', { name: '我的孩子' })).toBeHidden()
    await expect(page).toHaveURL(/\/health-events$/)
    await expect(page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: '打开我的孩子' })).toContainText('刘景安')

    await page.getByRole('button', { name: '打开我的孩子' }).click()
    const handle = page.locator('.current-child-sheet__drag-zone')
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 30)
    await page.mouse.up()
    await expect(page.getByRole('dialog', { name: '我的孩子' })).toBeVisible()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 90)
    await page.mouse.up()
    await expect(page.getByRole('dialog', { name: '我的孩子' })).toBeHidden()

    await page.getByRole('button', { name: '打开我的孩子' }).click()
    await page.getByRole('dialog', { name: '我的孩子' }).getByRole('button', { name: '添加孩子' }).click()
    await expect(page).toHaveURL(/\/family\/new$/)
  } finally {
    await request.delete('/api/members/' + created.id, { headers: { Authorization: 'Bearer ' + authToken } })
    await request.delete('/api/members/' + second.id, { headers: { Authorization: 'Bearer ' + authToken } })
    for (const member of extraMembers) await request.delete('/api/members/' + member.id, { headers: { Authorization: 'Bearer ' + authToken } })
  }
})

test('我的家人支持左滑删除并在确认后更新列表', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', '左滑手势只需在固定 iPhone SE 执行一次')
  const account = 'family-swipe-delete'
  const authToken = new TokenService('child-profile-e2e-secret', 60 * 60_000).create({ id: account })
  const createMember = async (name: string) => {
    const response = await request.post('/api/members', {
      headers: { Authorization: 'Bearer ' + authToken },
      data: { name, relationship: 'child', gender: 'female', birthday: '2023-05-12', avatar: 'clay:v1:toddler-girl:east-asian' }
    })
    expect(response.status()).toBe(201)
    return response.json()
  }
  const first = await createMember('滑动成员A')
  const second = await createMember('滑动成员B')
  await prepareAccount(page, authToken, account)

  try {
    await page.goto('/family')
    await expect(page.getByText('选择家人即可查看和记录对应的健康情况。')).toHaveCount(0)
    await expect(page.getByText('记录对象', { exact: true })).toHaveCount(0)
    await expect(page.getByText('当前', { exact: true })).toHaveCount(1)
    await expect(page.getByText('当前角色', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '切换记录对象' })).toHaveCount(0)
    const switchButtons = page.getByRole('button', { name: '切换', exact: true })
    await expect(switchButtons).toHaveCount(1)
    const switchButtonColors = await switchButtons.first().evaluate((element) => {
      const styles = getComputedStyle(element)
      return { border: styles.borderColor, text: styles.color }
    })
    expect(switchButtonColors).toEqual({ border: 'rgb(24, 49, 47)', text: 'rgb(24, 49, 47)' })

    const row = page.getByRole('group', { name: /滑动成员A/ })
    const box = await row.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width - 20, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width - 110, box!.y + box!.height / 2, { steps: 6 })
    await page.mouse.up()

    const deleteButton = row.getByRole('button', { name: '删除' })
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    let confirmation = page.getByRole('dialog', { name: '删除滑动成员A？' })
    await expect(confirmation).toBeVisible()
    await expect(confirmation.getByRole('button', { name: '取消' })).toBeFocused()
    await confirmation.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('滑动成员A')).toBeVisible()

    let failDelete = true
    await page.route('**/api/members/' + first.id, async (route) => {
      if (failDelete && route.request().method() === 'DELETE') {
        failDelete = false
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '删除暂时失败，请重试' } }) })
      }
      await route.continue()
    })
    await row.focus()
    await page.keyboard.press('ArrowLeft')
    await deleteButton.click()
    confirmation = page.getByRole('dialog', { name: '删除滑动成员A？' })
    await confirmation.getByRole('button', { name: '确认删除' }).click()
    await expect(page.getByText('删除暂时失败，请重试')).toBeVisible()
    await expect(page.getByText('滑动成员A')).toBeVisible()

    await row.focus()
    await page.keyboard.press('ArrowLeft')
    await deleteButton.click()
    confirmation = page.getByRole('dialog', { name: '删除滑动成员A？' })
    await confirmation.getByRole('button', { name: '确认删除' }).click()
    await expect(page.getByText('滑动成员A')).toHaveCount(0)
    await expect(page.getByText('滑动成员B')).toBeVisible()
    expect((await request.get('/api/members/' + first.id, { headers: { Authorization: 'Bearer ' + authToken } })).status()).toBe(404)
  } finally {
    await request.delete('/api/members/' + first.id, { headers: { Authorization: 'Bearer ' + authToken } })
    await request.delete('/api/members/' + second.id, { headers: { Authorization: 'Bearer ' + authToken } })
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
  const avatarSwitch = page.getByRole('button', { name: '换一个' })
  await expect(avatarSwitch).toBeVisible()
  await expect(avatarSwitch).toHaveText('')
  const cartoonImage = page.locator('img[src*="/avatars/children/v1/"]').first()
  await expect(cartoonImage).toHaveAttribute('src', /girl-age3-east-asian\.[a-f0-9]{10}\.webp/)
  expect(Date.now() - avatarLoadStartedAt).toBeLessThan(1_500)
  await expect.poll(() => new Set(childAvatarRequests).size).toBe(3)
  expect([...new Set(childAvatarRequests)].every((url) => /girl-age3-(?:east-asian|european|african)\.[a-f0-9]{10}\.webp/.test(url))).toBeTruthy()
  expect(new Set(childAvatarRequests).size).toBeLessThanOrEqual(3)
  const avatarSwitchBox = await avatarSwitch.boundingBox()
  expect(avatarSwitchBox?.height).toBeLessThanOrEqual(36)
  expect(avatarSwitchBox?.width).toBeLessThanOrEqual(36)
  const avatarBox = await page.locator('section[aria-label="卡通形象"] > div').first().boundingBox()
  expect(avatarBox?.height).toBeLessThanOrEqual(96)
  expect(avatarBox?.width).toBeLessThanOrEqual(96)
  expect(avatarSwitchBox!.x).toBeGreaterThanOrEqual(avatarBox!.x + avatarBox!.width - 12)
  await expect(page.getByRole('button', { name: '保存修改' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  const profileRows = page.locator('section[aria-label="孩子基本资料"] > label, section[aria-label="孩子基本资料"] > div, section[aria-label="孩子基本资料"] > fieldset')
  await expect(profileRows).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    expect((await profileRows.nth(index).boundingBox())?.height).toBeLessThanOrEqual(56)
  }
  if (testInfo.project.name === 'iphone-se') {
    const deleteBox = await page.getByRole('button', { name: '删除孩子资料' }).boundingBox()
    const viewport = page.viewportSize()
    expect(deleteBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(deleteBox!.y + deleteBox!.height).toBeLessThanOrEqual(viewport!.height)
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

test('添加家庭成员使用空白孩子资料表单并一次保存头像和记录者', async ({ page, request }, testInfo) => {
  const account = `blank-child-${testInfo.project.name}`
  const authToken = new TokenService('child-profile-e2e-secret', 60 * 60_000).create({ id: account })
  await prepareAccount(page, authToken, account)
  let createdId = ''
  let createAttempts = 0
  await page.route('**/api/members', async (route) => {
    if (route.request().method() === 'POST') {
      createAttempts += 1
      if (createAttempts === 1) return route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: { message: '添加暂时失败，请重试' } })
      })
    }
    await route.continue()
  })
  try {
    await page.goto('/family/new')
    await expect(page.getByRole('heading', { name: '添加家庭成员' })).toBeVisible()
    const name = page.getByRole('textbox', { name: '姓名' })
    const birthday = page.getByLabel('出生日期')
    const recorder = page.getByLabel('你是孩子的谁？')
    const add = page.getByRole('button', { name: '添加家庭成员', exact: true })
    await expect(name).toHaveValue('')
    await expect(birthday).toHaveValue('')
    await expect(recorder).toHaveValue('')
    await expect(page.getByRole('button', { name: '男', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: '女', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: '换一个' })).toBeVisible()
    await expect(page.getByRole('button', { name: '照片', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '删除孩子资料' })).toHaveCount(0)
    await expect(add).toBeDisabled()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    const addBox = await add.boundingBox()
    expect(addBox!.y + addBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    const blankEvidence = path.resolve('docs/design/child-profile/evidence/2026-09-05')
    await mkdir(blankEvidence, { recursive: true })
    await page.screenshot({ path: path.join(blankEvidence, `${testInfo.project.name}-add-child-profile.png`), fullPage: true })

    await name.fill('空白表单宝宝')
    const today = await birthday.getAttribute('max')
    await birthday.fill(today!)
    await expect(add).toBeDisabled()
    await page.getByRole('button', { name: '女', exact: true }).click()
    await recorder.selectOption('mother')
    await page.getByRole('button', { name: '换一个' }).click()
    await page.getByRole('button', { name: '照片', exact: true }).click()
    await expect(add).toBeDisabled()
    await page.getByRole('button', { name: '卡通形象', exact: true }).click()
    await add.click()
    await expect(page.getByText('添加暂时失败，请重试')).toBeVisible()
    await expect(name).toHaveValue('空白表单宝宝')
    await expect(recorder).toHaveValue('mother')
    const createdResponse = page.waitForResponse((response) => response.url().endsWith('/api/members') && response.request().method() === 'POST')
    await add.dblclick({ delay: 10 })
    const created = await (await createdResponse).json()
    createdId = created.id
    await expect(page).toHaveURL(/\/family$/)
    expect(createAttempts).toBe(2)
    const saved = await (await request.get('/api/members/' + createdId, { headers: { Authorization: 'Bearer ' + authToken } })).json()
    expect(saved).toMatchObject({
      name: '空白表单宝宝', birthday: today, gender: 'female', relationship: 'child',
      primaryRecorderRelationship: 'mother', avatar: 'girl-age0-european'
    })
    await page.goto('/family/' + createdId + '/edit')
    await expect(name).toHaveValue('空白表单宝宝')
    await expect(recorder).toHaveValue('mother')
    await expect(page.getByRole('button', { name: '删除孩子资料' })).toBeVisible()
  } finally {
    if (createdId) await request.delete('/api/members/' + createdId, { headers: { Authorization: 'Bearer ' + authToken } })
  }
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
    await page.getByRole('textbox', { name: '姓名' }).fill('凌晨宝宝')
    await page.getByLabel('出生日期').fill(localToday)
    await page.getByRole('button', { name: '女', exact: true }).click()
    const createResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith('/api/members') && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: '添加家庭成员' }).click()
    const created = await (await createResponsePromise).json()
    memberId = created.id
    expect(created).toMatchObject({ birthday: localToday, relationship: 'child', isSelf: false, avatar: 'girl-age0-east-asian' })
    await expect(page).toHaveURL(/\/family$/)
    await expect(page.getByText('未满1个月')).toBeVisible()

    await page.getByRole('button', { name: '切换', exact: true }).click()
    await expect(page).toHaveURL(/\/health-events$/)
    await page.getByRole('button', { name: '打开菜单' }).click()
    await expect(page.getByText('当前记录对象', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '编辑资料' }).click()
    await expect(page).toHaveURL(new RegExp(`/family/${memberId}/edit$`))
    await expect(page.getByRole('heading', { name: '编辑孩子资料' })).toBeVisible()
    await expect(page.getByText('该页面仅用于编辑孩子资料')).toHaveCount(0)
    await expect(page.getByLabel('出生日期')).toHaveValue(localToday)
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
  } finally {
    if (memberId) await request.delete(`/api/members/${memberId}`, { headers: { Authorization: `Bearer ${authToken}` } })
  }
})
