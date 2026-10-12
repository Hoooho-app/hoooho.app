import { expect, test, type Page, type Route } from '@playwright/test'
import sharp from 'sharp'

const iconFoods = [
  ['orange', '橘子', 'Orange'], ['apple', '苹果', 'Apple'], ['banana', '香蕉', 'Banana'], ['milk', '牛奶', 'Milk'],
  ['egg', '鸡蛋', 'Egg'], ['peanut', '花生', 'Peanut'], ['soy', '大豆', 'Soy'], ['wheat', '小麦', 'Wheat'],
  ['fish', '鱼', 'Fish'], ['shrimp', '虾', 'Shrimp'], ['crab', '螃蟹', 'Crab'], ['beef', '牛肉', 'Beef'],
  ['lamb-mutton', '羊肉', 'Lamb / Mutton'], ['carrot', '胡萝卜', 'Carrot'], ['broccoli', '西兰花', 'Broccoli'], ['tomato', '番茄', 'Tomato']
] as const

async function prepareIcons(page: Page) {
  const control = await prepare(page)
  const items = [...iconFoods, ['dragon-fruit', '火龙果', 'Dragon fruit']].map(([foodId, name, englishName], index) => ({
    id: `manual:${foodId}`, foodId, name, englishName, group: index < 8 ? 'avoid' : 'temporary', visible: true,
    manuallyAdded: true, nameAdjusted: true, groupAdjusted: true
  }))
  control.sections.set(`${memberId}:dietary-card`, { memberId, sectionId: 'dietary-card', revision: 1,
    records: [{ version: 1, memberId, items, avoidCrossContact: false, savedAt: '2026-10-12T00:00:00Z', syncedAt: '2026-10-12T00:00:00Z' }] })
  return control
}

async function captureCanvas(page: Page) {
  await page.evaluate(() => {
    const imageOriginal = CanvasRenderingContext2D.prototype.drawImage
    const textOriginal = CanvasRenderingContext2D.prototype.fillText
    const draws: Array<{ src: string; x: number; y: number; width: number; height: number; naturalWidth: number }> = []
    const texts: string[] = []
    Object.assign(window, { foodIconDraws: draws, foodIconTexts: texts })
    CanvasRenderingContext2D.prototype.drawImage = function (image: CanvasImageSource, ...args: number[]) {
      if (image instanceof HTMLImageElement) draws.push({ src: image.src, x: args[0], y: args[1], width: args[2], height: args[3], naturalWidth: image.naturalWidth })
      return Reflect.apply(imageOriginal, this, [image, ...args])
    }
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof textOriginal>) {
      texts.push(args[0])
      return textOriginal.apply(this, args)
    }
  })
}

const accountId = 'dietary-card-e2e-account'
const memberId = 'dietary-card-e2e-child'
const otherMemberId = 'dietary-card-e2e-other-child'
const token = 'dietary-card-e2e-token'
const member = { id: memberId, accountId, name: '小禾', relationship: 'child', gender: 'female', birthday: '2024-12-20', avatar: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
const otherMember = { ...member, id: otherMemberId, name: '小树' }

type Section = { memberId: string; sectionId: string; records: unknown[]; revision: number }

function allergy(name: string, status: string, id = `allergy-${name}`, owner = memberId) {
  return {
    id, accountId, memberId: owner, category: 'food', name, customName: '', currentStatus: status,
    dietaryAction: status === 'confirmed' ? 'avoid' : 'temporary',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z', reactions: [], tests: [], evidenceLinks: []
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status })
}

async function prepare(page: Page, allergyRecords: unknown[] = []) {
  const sections = new Map<string, Section>()
  let failProfileRead = false
  let failDietarySave = false
  if (allergyRecords.length) sections.set(`${memberId}:allergy`, { memberId, sectionId: 'allergy', records: allergyRecords, revision: 1 })
  await page.addInitScript(({ authToken, account, currentMember }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: account }, accountProfile: null, opsAuthUser: null, currentMemberId: currentMember, members: [], profile: null }, version: 5 }))
  }, { authToken: token, account: accountId, currentMember: memberId })
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (path === '/api/auth/session') return json(route, { token, user: { id: accountId, currentMemberId: memberId, nickname: '家长', createdAt: '2026-09-01T00:00:00.000Z' } })
    if (path === '/api/members') return json(route, [member, otherMember])
    if (path === `/api/members/${memberId}`) return json(route, member)
    if (path.endsWith('/cases')) return json(route, { active: [], archived: [], timezone: 'Asia/Shanghai' })
    if (path === '/api/account/entry-state') return json(route, { familyMemberCount: 2, hasValidHealthRecord: false })
    if (path === '/api/events') return json(route, [])
    if (path === '/api/growth-measurements') return json(route, [])
    if (path === '/api/medication-reminders') return json(route, [])
    if (path === '/api/desensitization-tests') return json(route, { tasks: [], suggestions: [] })
    if (path === '/api/auth/profile-sections' && request.method() === 'GET') return failProfileRead ? json(route, { error: { message: '同步暂时失败' } }, 503) : json(route, [...sections.values()])
    if (path === '/api/auth/profile-sections' && request.method() === 'POST') {
      const input = request.postDataJSON() as { memberId: string; sectionId: string; records: unknown[]; revision?: number }
      if (input.sectionId === 'dietary-card' && failDietarySave) return json(route, { error: { message: '保存暂时失败' } }, 503)
      const key = `${input.memberId}:${input.sectionId}`
      const existing = sections.get(key)
      const saved = { memberId: input.memberId, sectionId: input.sectionId, records: input.records, revision: (existing?.revision ?? 0) + 1 }
      sections.set(key, saved)
      return json(route, saved)
    }
    return json(route, {})
  })
  return { sections, setFailDietarySave: (value: boolean) => { failDietarySave = value }, setFailProfileRead: (value: boolean) => { failProfileRead = value } }
}

test('P-001 首页进入空状态，保存图片禁用且页面无横向溢出', async ({ page }, testInfo) => {
  await prepare(page)
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('button', { name: '忌口卡', exact: true }).click()
  await expect(page).toHaveURL(/\/dietary-card$/)
  await expect(page.getByRole('heading', { name: '目前还没有记录食物过敏' })).toBeVisible()
  await expect(page.getByText('希望每一餐，都吃得安心')).toBeVisible()
  await expect(page.getByText('如有需要，可点「修改编辑」补充忌口食物')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存图片' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/dietary-card-empty-${testInfo.project.name}.png`, fullPage: true })
})

test('P-002 单项直接出示、切换英文并导出 PNG', async ({ page }, testInfo) => {
  await prepare(page, [allergy('牛奶', 'confirmed'), allergy('鸡蛋', 'confirmed', 'other-egg', otherMemberId)])
  await page.goto('/dietary-card')
  await page.getByLabel('选择出示语言').selectOption('zh')
  await expect(page.getByRole('heading', { name: '用餐忌口提示' })).toBeVisible()
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  await expect(page.getByText('鸡蛋', { exact: true })).toHaveCount(0)
  await page.getByLabel('选择出示语言').selectOption('en')
  await expect(page.getByText('Milk', { exact: true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存图片' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^Hoooho_忌口卡_\d{4}-\d{2}-\d{2}\.png$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const metadata = await sharp(path!).metadata()
  expect(metadata.format).toBe('png')
  expect(metadata.width).toBe(1200)
  await page.screenshot({ path: `test-results/dietary-card-single-${testInfo.project.name}.png`, fullPage: true })
})

test('P-003 长清单完整滚动并导出视口外全部食物', async ({ page }, testInfo) => {
  const names = ['牛奶', '鸡蛋', '花生', '小麦', '大豆', '芝麻', '核桃', '杏仁', '腰果', '虾', '蟹', '鱼', '芒果', '猕猴桃', '草莓', '桃', '番茄', '燕麦']
  await prepare(page, names.map((name, index) => allergy(name, index < 12 ? 'confirmed' : 'investigating')))
  await page.goto('/dietary-card')
  await page.getByLabel('选择出示语言').selectOption('zh')
  await expect(page.getByText('共18项，请下滑查看全部')).toBeVisible()
  await expect(page.getByText('明确不能吃', { exact: true })).toBeVisible()
  await expect(page.getByText('暂时请避开', { exact: true })).toBeVisible()
  await page.getByText('燕麦', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByText('燕麦', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存图片' }).click()
  const download = await downloadPromise
  const path = await download.path()
  const metadata = await sharp(path!).metadata()
  expect(metadata.height).toBeGreaterThan(1200)
  await page.screenshot({ path: `test-results/dietary-card-long-${testInfo.project.name}.png`, fullPage: true })
})

test('P-004 编辑使用独立草稿，取消不修改已保存资料', async ({ page }, testInfo) => {
  const sourceRecords = [allergy('牛奶', 'confirmed'), allergy('鸡蛋', 'suspected')]
  const control = await prepare(page, sourceRecords)
  await page.goto('/dietary-card')
  await page.getByRole('button', { name: '修改编辑', exact: true }).click()
  await expect(page).toHaveURL(/\/dietary-card\/edit$/)
  await page.getByRole('button', { name: '取消选择牛奶' }).click()
  await page.getByRole('button', { name: '修改鸡蛋' }).click()
  await page.getByLabel('食物名称', { exact: true }).fill('未保存名称')
  await page.getByLabel('所属分组').selectOption('avoid')
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('button', { name: '添加食物' }).click()
  await page.getByLabel('食物名称', { exact: true }).fill('未保存香料')
  await page.getByRole('button', { name: '添加到清单' }).click()
  await page.getByRole('button', { name: '取消修改', exact: true }).click()
  await page.getByLabel('选择出示语言').selectOption('zh')
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  await expect(page.getByText('鸡蛋', { exact: true })).toBeVisible()
  await expect(page.getByText('未保存名称', { exact: true })).toHaveCount(0)
  await expect(page.getByText('未保存香料', { exact: true })).toHaveCount(0)
  expect(control.sections.get(`${memberId}:allergy`)?.records).toEqual(sourceRecords)
  expect(control.sections.has(`${memberId}:dietary-card`)).toBe(false)
  await page.screenshot({ path: `test-results/dietary-card-cancelled-${testInfo.project.name}.png`, fullPage: true })
})

test('更新或保存失败保留当前卡片与编辑草稿', async ({ page }) => {
  const control = await prepare(page, [allergy('牛奶', 'confirmed')])
  await page.goto('/dietary-card')
  await page.getByLabel('选择出示语言').selectOption('zh')
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  control.setFailProfileRead(true)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('status')).toContainText('最新来源读取失败')
  control.setFailProfileRead(false)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.dietary-inline-error')).toHaveCount(0)
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  control.setFailProfileRead(false)
  await page.getByRole('button', { name: '修改编辑', exact: true }).click()
  await page.getByRole('button', { name: '添加食物' }).click()
  await page.getByLabel('食物名称', { exact: true }).fill('保留中的草稿食物')
  await page.getByRole('button', { name: '添加到清单' }).click()
  control.setFailDietarySave(true)
  await page.getByRole('button', { name: '保存并更新' }).click()
  await expect(page.getByRole('alert')).toHaveText('保存失败，请重试')
  await expect(page.getByText('保留中的草稿食物', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/dietary-card\/edit$/)
})

test('320px 窄屏工具栏、长名称和编辑操作不重叠', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', '窄屏专项仅在移动项目运行')
  await page.setViewportSize({ width: 320, height: 568 })
  await prepare(page, [allergy('非常非常长的自定义复合食物配料名称用于检查完整换行', 'confirmed')])
  await page.goto('/dietary-card')
  await page.getByLabel('选择出示语言').selectOption('zh')
  await expect(page.getByText('非常非常长的自定义复合食物配料名称用于检查完整换行', { exact: true })).toBeVisible()
  for (const name of ['修改编辑', '保存图片']) await expect(page.getByRole('button', { name })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/dietary-card-320x568.png', fullPage: true })
})

test('纯英文切换、键盘操作及 PNG 实际绘制文字无中文', async ({ page }, testInfo) => {
  await prepare(page, [allergy('牛奶', 'confirmed'), allergy('鸡蛋', 'suspected')])
  await page.goto('/dietary-card')
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  const choice = page.getByLabel('选择出示语言')
  await expect(choice.locator('option')).toHaveText(['简体中文', 'English'])
  await choice.selectOption('en')
  await choice.focus()
  await page.keyboard.press('ArrowUp')
  await expect(choice).toHaveValue('zh')
  await page.keyboard.press('ArrowDown')
  await expect(choice).toHaveValue('en')
  await choice.selectOption('en')
  const card = page.getByRole('article', { name: '忌口卡正文' })
  await expect(card.getByText('Milk', { exact: true })).toBeVisible()
  await expect(card.getByText('Egg', { exact: true })).toBeVisible()
  expect(await card.innerText()).not.toMatch(/\p{Script=Han}/u)
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.fillText
    const texts: string[] = []
    Object.assign(window, { dietaryExportTexts: texts })
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof original>) {
      texts.push(args[0])
      return original.apply(this, args)
    }
  })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存图片' }).click()
  const download = await downloadPromise
  const file = `test-results/dietary-card-english-${testInfo.project.name}.png`
  await download.saveAs(file)
  expect((await sharp(file).metadata()).width).toBe(1200)
  const texts = await page.evaluate(() => (window as unknown as { dietaryExportTexts: string[] }).dietaryExportTexts)
  expect(texts.join(' ')).not.toMatch(/\p{Script=Han}/u)
  expect(texts).toContain('Food Restrictions')
  expect(texts.join(' ')).toContain('Milk')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/dietary-card-english-ui-${testInfo.project.name}.png`, fullPage: true })
})

test('台湾设备仅提供繁体和英文，默认单一繁体且正文及导出一致', async ({ page }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'language', { get: () => 'zh-TW' }))
  await prepare(page, [allergy('鸡蛋', 'confirmed'), allergy('虾', 'suspected')])
  await page.goto('/dietary-card')
  const choice = page.getByLabel('选择出示语言')
  await expect(choice.locator('option')).toHaveText(['繁體中文', 'English'])
  await expect(choice).toHaveValue('zh-Hant')
  const card = page.getByRole('article', { name: '忌口卡正文' })
  await expect(card.getByText('雞蛋', { exact: true })).toBeVisible()
  await choice.selectOption('zh-Hant')
  await expect(card.getByText('明確不能吃', { exact: true })).toBeVisible()
  await expect(card.getByText('雞蛋', { exact: true })).toBeVisible()
  await expect(card.locator('strong').filter({ hasText: /^蝦$/ })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存图片' }).click()
  await (await downloadPromise).saveAs(`test-results/dietary-card-traditional-${testInfo.project.name}.png`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/dietary-card-traditional-ui-${testInfo.project.name}.png`, fullPage: true })
})

test('缺失英文不会遗漏食物或生成伪纯英文卡片，补充后可切换', async ({ page }) => {
  await prepare(page, [allergy('自制香料', 'confirmed')])
  await page.goto('/dietary-card')
  await expect(page.getByText('自制香料', { exact: true })).toBeVisible()
  await page.getByLabel('选择出示语言').selectOption('en')
  await expect(page.getByText('请先补充英文名称', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: '忌口卡正文' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存图片' })).toBeDisabled()
  await page.getByRole('button', { name: '补充英文名称' }).click()
  await page.getByRole('button', { name: '修改自制香料' }).click()
  await page.getByLabel('英文食物名称（可核对修改）').fill('Homemade spices')
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('button', { name: '保存并更新' }).click()
  await page.getByLabel('选择出示语言').selectOption('en')
  await expect(page.getByText('Homemade spices', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存图片' })).toBeEnabled()
})

test('访问和恢复前台自动更新，保留隐藏和手工项且无需写入', async ({ page }, testInfo) => {
  const control = await prepare(page, [allergy('牛奶', 'confirmed'), allergy('火龙果', 'suspected')])
  const saved = {
    version: 1, memberId, avoidCrossContact: true, savedAt: '2026-09-01T00:00:00.000Z', syncedAt: '2026-09-01T00:00:00.000Z',
    items: [
      { id: 'source:allergy-牛奶', sourceId: 'allergy-牛奶', name: '牛奶', group: 'avoid', visible: false, manuallyAdded: false, nameAdjusted: false, groupAdjusted: false },
      { id: 'source:allergy-鸡蛋', sourceId: 'allergy-鸡蛋', name: '鸡蛋', group: 'avoid', visible: true, manuallyAdded: false, nameAdjusted: false, groupAdjusted: false },
      { id: 'manual:spices', name: '自制香料', englishName: 'Homemade spices', group: 'temporary', visible: true, manuallyAdded: true, nameAdjusted: true, groupAdjusted: true }
    ]
  }
  control.sections.set(`${memberId}:dietary-card`, { memberId, sectionId: 'dietary-card', records: [saved], revision: 1 })
  const mutations: string[] = []
  // Session restoration selects the current member; card reads must never save profile records.
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/profile-sections' && request.method() !== 'GET') mutations.push(request.method()) })
  await page.goto('/dietary-card')
  await expect(page.getByRole('heading', { name: '忌口卡', exact: true })).toBeVisible()
  await expect(page.locator('.dietary-page-header p')).toHaveCount(0)
  await expect(page.getByLabel('选择出示语言')).toHaveValue('zh')
  await expect(page.getByText('火龙果', { exact: true })).toBeVisible()
  await expect(page.getByText('自制香料', { exact: true })).toBeVisible()
  await expect(page.getByText('牛奶', { exact: true })).toHaveCount(0)
  await expect(page.getByText('鸡蛋', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '更新', exact: true })).toHaveCount(0)
  await expect(page.locator('.dietary-cross-contact')).toHaveCount(0)
  const widths = await page.locator('.dietary-toolbar > *').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
  expect(widths).toHaveLength(3)
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1)
  control.sections.set(`${memberId}:allergy`, { memberId, sectionId: 'allergy', records: [allergy('牛奶', 'confirmed'), allergy('火龙果', 'confirmed'), allergy('鳕鱼', 'suspected')], revision: 2 })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('[data-group="avoid"] .dietary-food-item').getByText('火龙果', { exact: true })).toBeVisible()
  await expect(page.getByText('鳕鱼', { exact: true })).toBeVisible()
  await expect(page.getByText('自制香料', { exact: true })).toBeVisible()
  await expect(page.getByText('牛奶', { exact: true })).toHaveCount(0)
  expect(mutations).toEqual([])
  expect(control.sections.get(`${memberId}:dietary-card`)?.records).toEqual([saved])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/dietary-card-auto-${testInfo.project.name}.png`, fullPage: true })
})

test('16 个图标在正文和编辑页共用映射，切换英文保持图标且只请求 96px', async ({ page }, testInfo) => {
  await prepareIcons(page)
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/food-icons/')) requests.push(request.url()) })
  await page.goto('/dietary-card')
  const icons = page.locator('.dietary-display-card .dietary-food-icon img')
  await expect(icons).toHaveCount(16)
  await expect.poll(() => icons.evaluateAll(elements => elements.every(element => (element as HTMLImageElement).naturalWidth === 96))).toBe(true)
  await expect(page.locator('.dietary-display-card .dietary-food-glyph')).toHaveText(['火'])
  const before = await icons.evaluateAll(elements => elements.map(element => (element as HTMLImageElement).src))
  const sizes = await page.locator('.dietary-display-card .dietary-food-icon').evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })))
  expect(sizes.every(size => size.width === 40 && size.height === 40)).toBe(true)
  await page.getByLabel('选择出示语言').selectOption('en')
  await expect(page.getByText('Milk', { exact: true })).toBeVisible()
  expect(await icons.evaluateAll(elements => elements.map(element => (element as HTMLImageElement).src))).toEqual(before)
  await expect(page.locator('.dietary-display-card .dietary-food-glyph')).toHaveText(['D'])
  expect(requests.every(url => url.includes('/webp-96/'))).toBe(true)
  await page.screenshot({ path: `test-results/dietary-icons-english-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: '修改编辑', exact: true }).click()
  const editIcons = page.locator('.dietary-edit-item .dietary-food-icon img')
  await expect(editIcons).toHaveCount(16)
  await expect.poll(() => editIcons.evaluateAll(elements => elements.every(element => (element as HTMLImageElement).naturalWidth === 96))).toBe(true)
  expect(await editIcons.evaluateAll(elements => elements.map(element => (element as HTMLImageElement).src))).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/dietary-icons-editor-${testInfo.project.name}.png`, fullPage: true })
})

test('真实 PNG 绘制 16 个 144px 图标且透明像素保留卡片背景', async ({ page }, testInfo) => {
  await prepareIcons(page)
  await page.goto('/dietary-card')
  await expect(page.getByText('橘子', { exact: true })).toBeVisible()
  await captureCanvas(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存图片', exact: true }).click()
  const download = await downloadPromise
  const file = `test-results/dietary-icons-export-${testInfo.project.name}.png`
  await download.saveAs(file)
  const draws = await page.evaluate(() => (window as unknown as { foodIconDraws: Array<{ src: string; x: number; y: number; width: number; height: number; naturalWidth: number }> }).foodIconDraws)
  expect(draws).toHaveLength(16)
  expect(draws.every(draw => draw.src.includes('/webp-144/') && draw.naturalWidth === 144 && draw.width === 80 && draw.height === 80)).toBe(true)
  expect(draws.some(draw => draw.src.includes('dragon'))).toBe(false)
  expect((await sharp(file).metadata()).width).toBe(1200)
  const first = draws[0]
  const pixels = await sharp(file).extract({ left: Math.round(first.x), top: Math.round(first.y), width: 80, height: 80 }).removeAlpha().raw().toBuffer()
  expect([...pixels.subarray(0, 3)]).toEqual([255, 248, 246])
  let colored = 0
  for (let i = 0; i < pixels.length; i += 3) if (pixels[i] !== 255 || pixels[i + 1] !== 248 || pixels[i + 2] !== 246) colored++
  expect(colored).toBeGreaterThan(400)
})

test('页面和导出图片失败回退单字，保留完整名称和固定占位', async ({ page }, testInfo) => {
  await prepare(page, [allergy('牛奶', 'confirmed'), allergy('火龙果', 'suspected')])
  await page.route('**/food-icons/**/milk.*.webp', route => route.abort('failed'))
  await page.goto('/dietary-card')
  const milk = page.locator('.dietary-food-icon[data-icon="milk"]')
  await expect(milk.locator('img')).toHaveCount(0)
  await expect(milk.locator('.dietary-food-glyph')).toHaveText('牛')
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  expect(await milk.evaluate(element => element.getBoundingClientRect().width)).toBe(40)
  await captureCanvas(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存图片', exact: true }).click()
  const file = `test-results/dietary-icons-fallback-export-${testInfo.project.name}.png`
  await (await downloadPromise).saveAs(file)
  expect((await sharp(file).metadata()).width).toBe(1200)
  const result = await page.evaluate(() => ({ draws: (window as unknown as { foodIconDraws: unknown[] }).foodIconDraws, texts: (window as unknown as { foodIconTexts: string[] }).foodIconTexts }))
  expect(result.draws).toEqual([])
  expect(result.texts).toContain('牛')
  expect(result.texts.join('')).toContain('牛奶')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('导出 decode 停滞在五秒预算后回退且恢复保存按钮', async ({ page }, testInfo) => {
  test.skip(!['iphone-se', 'webkit-iphone-se'].includes(testInfo.project.name), '超时兼容性专项覆盖 Chromium 与 WebKit')
  await prepare(page, [allergy('牛奶', 'confirmed')])
  await page.goto('/dietary-card')
  await expect(page.getByText('牛奶', { exact: true })).toBeVisible()
  await captureCanvas(page)
  await page.evaluate(() => {
    const original = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function () {
      return this.src.includes('/webp-144/') ? new Promise<void>(() => {}) : original.call(this)
    }
  })
  const started = Date.now()
  const downloadPromise = page.waitForEvent('download', { timeout: 12000 })
  await page.getByRole('button', { name: '保存图片', exact: true }).click()
  await expect(page.getByRole('button', { name: '生成中', exact: true })).toBeDisabled()
  const file = `test-results/dietary-icons-decode-timeout-${testInfo.project.name}.png`
  await (await downloadPromise).saveAs(file)
  expect(Date.now() - started).toBeLessThan(11000)
  expect((await sharp(file).metadata()).width).toBe(1200)
  await expect(page.getByRole('button', { name: '保存图片', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => (window as unknown as { foodIconTexts: string[] }).foodIconTexts)).toContain('牛')
})
