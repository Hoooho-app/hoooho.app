import { expect, test, type Locator, type Page } from '@playwright/test'

let registrationSequence = 0
const pageTokens = new WeakMap<Page, string>()

async function registerAccount(page: Page) {
  registrationSequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${registrationSequence}` })
  await page.goto('/login')
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`护士站测试${Date.now().toString().slice(-8)}`)
  await page.getByPlaceholder('设置一个密码').fill('12345678')
  const registration = page.waitForResponse((response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '注册并进入' }).click()
  const session = await (await registration).json()
  pageTokens.set(page, session.token)
  await expect(page).toHaveURL(/\/nurse-station$/)
}

async function fillDateInput(input: Locator, isoDate: string) {
  await input.fill(isoDate)
  if (await input.inputValue() !== isoDate) {
    await input.pressSequentially(isoDate.replaceAll('-', ''))
  }
  await expect(input).toHaveValue(isoDate)
}

async function registerMember(page: Page) {
  await registerAccount(page)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('123')
  await fillDateInput(page.getByRole('textbox', { name: '出生日期' }), '2026-09-01')
  await page.getByRole('button', { name: '男', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
  await page.goto('/nurse-station')
}

async function createReminder(page: Page, input: { name: string; days: number; times: string[]; startOffsetDays?: number }) {
  const token = pageTokens.get(page) ?? ''
  return page.evaluate(async ({ value, token }) => {
    const membersResponse = await fetch('/api/members', { headers: { Authorization: `Bearer ${token}` } })
    const members = await membersResponse.json()
    const date = new Date(); date.setDate(date.getDate() + (value.startOffsetDays ?? 0))
    const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const response = await fetch('/api/medication-reminders', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: members[0].id, plan: { medicationName: value.name, medicationType: 'tablet', amount: 1, unit: '粒', route: 'oral', mode: 'daily', times: value.times, startDate, durationDays: value.days, reminderTargets: ['我'], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }) })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, { value: input, token })
}

function contrastRatio(foreground: string, background: string) {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const luminance = (value: string) => {
    const channels = value.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
    return 0.2126 * channel(channels[0]) + 0.7152 * channel(channels[1]) + 0.0722 * channel(channels[2])
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

test('护士站待机视频仍使用真实单一循环资源', async ({ page }) => {
  await registerMember(page)
  const video = page.locator('.idle-nurse-visual video[data-video-phase="idle1"]')
  await expect(video).toHaveCount(1)
  await expect(video).toHaveAttribute('loop', '')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ height: element.videoHeight, paused: element.paused, width: element.videoWidth }))).toMatchObject({ height: 360, paused: false, width: 360 })
})

test('前台侧边栏使用首页图标，旧指数地址说明已停止', async ({ page }) => {
  await registerMember(page)
  await page.getByRole('button', { name: '打开菜单' }).click()
  const frontDesk = page.getByRole('button', { name: '前台', exact: true })
  await expect(frontDesk.locator('svg.lucide-house')).toHaveCount(1)
  await expect(frontDesk).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: 'test-results/nurse-station-home-icon-375x667.png' })
  await page.getByRole('button', { name: '关闭菜单' }).click()
  await expect(page.locator('.nurse-station-allergy-index')).toHaveCount(0)
  await expect(page.locator('.nurse-home-entry')).toHaveCount(5)
  expect(await page.evaluate(() => fetch('/api/food-allergy-index?memberId=unused').then((response) => response.status))).toBe(404)
  await page.goto('/food-allergy-status-index')
  await expect(page.getByText('指数功能已停止。原有记录仍然保留。')).toBeVisible()
})

test('护士视频资源失败时页面结构和核心任务仍可使用', async ({ page }) => {
  await page.route('**/*nurse-station-idle-1*.mp4', (route) => route.abort())
  await registerMember(page)
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('min-height', '190px')
  await expect(page.locator('.idle-nurse-visual video')).toHaveAttribute('poster', /nurse-station-idle-1-poster/)
  await expect(page.getByRole('link', { name: /用药提醒/ })).toBeVisible()
  await page.goto('/desensitization-tests')
  await expect(page.getByRole('heading', { name: '排敏测试', exact: true })).toBeVisible()
  await expect(page.getByText('还没有排敏测试', { exact: true })).toBeVisible()
})

test('用药与排敏二级页常驻状态与顶部新建入口', async ({ page }) => {
  await registerMember(page)
  await page.getByRole('link', { name: /用药提醒/ }).click()
  await expect(page.getByRole('tab', { name: /进行中/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /已归档/ })).toBeVisible()
  await expect(page.getByText('还没有用药提醒', { exact: true })).toBeVisible()
  await page.screenshot({ fullPage: true, path: 'test-results/medication-list-empty-375x667.png' })
  await page.getByRole('button', { name: '新增提醒', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新增用药提醒' })).toBeVisible()
  await page.getByRole('dialog', { name: '新增用药提醒' }).getByRole('button', { name: '返回' }).click()
  await page.goto('/desensitization-tests')
  await expect(page.getByRole('tab', { name: /进行中/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /已归档/ })).toBeVisible()
  await expect(page.getByText('还没有排敏测试', { exact: true })).toBeVisible()
  await page.screenshot({ fullPage: true, path: 'test-results/desensitization-list-empty-375x667.png' })
  await page.getByRole('button', { name: '新增测试', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station\/desensitization\/new$/)
})

test('首页在 iPhone SE 和桌面端保持五个等高入口并只承担导航', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await registerMember(page)
  await expect(page.locator('.nurse-station-hero')).toBeVisible()
  await expect(page.locator('.nurse-station-identity')).toContainText('123')
  await expect(page.locator('.nurse-station-guarded')).toContainText('已守护')
  await expect(page.locator('.nurse-station-guarded')).toHaveCSS('margin-top', '7px')
  await expect(page.locator('.nurse-station-fact')).toHaveCount(0)
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('min-height', '190px')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.nurse-station-overview')).toHaveCSS('border-color', 'rgb(220, 237, 234)')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('border-top-width', '0px')
  await expect(page.locator('.nurse-station-visual')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const guardedTypography = await page.locator('.nurse-station-guarded').evaluate((element) => ({
    fontSize: getComputedStyle(element).fontSize,
    numberFontSize: getComputedStyle(element.querySelector('strong')!).fontSize,
    numberColor: getComputedStyle(element.querySelector('strong')!).color,
  }))
  expect(guardedTypography).toEqual({ fontSize: '12.5px', numberFontSize: '12.5px', numberColor: 'rgb(27, 122, 110)' })
  const heroAlignment = await page.locator('.nurse-station-hero').evaluate((element) => {
    const gender = element.querySelector<HTMLElement>('.nurse-station-identity em')!
    const guarded = element.querySelector<HTMLElement>('.nurse-station-guarded')!
    const growth = element.querySelector<HTMLElement>('.nurse-station-growth-data')!
    const buttons = Array.from(growth.querySelectorAll<HTMLElement>('button'))
    return {
      genderLeft: gender.getBoundingClientRect().left,
      guardedLeft: guarded.getBoundingClientRect().left,
      growthHeight: growth.getBoundingClientRect().height,
      dividerWidths: buttons.slice(0, -1).map((button) => getComputedStyle(button).borderRightWidth),
    }
  })
  expect(Math.abs(heroAlignment.genderLeft - heroAlignment.guardedLeft)).toBeLessThanOrEqual(1)
  expect(heroAlignment.growthHeight).toBeGreaterThanOrEqual(69)
  expect(heroAlignment.dividerWidths).toEqual(['1px', '1px'])
  await expect(page.locator('.nurse-station-allergy-index')).toHaveCount(0)
  const entries = page.locator('.nurse-home-entry')
  await expect(entries).toHaveCount(5)
  await expect(entries.locator('strong')).toHaveText(['就诊情况单', '忌口出示卡', '健康随记', '健康档案', '用药提醒'])
  await expect(entries.locator('small')).toHaveText(['就诊前，一页理清病情', '哪些不能吃，出示就懂', '记录日常与身体变化', '整理家人的健康信息', '0 个提醒任务'])
  await expect(page.getByRole('link', { name: /健康随记/ })).toHaveAttribute('href', '/health-events')
  await expect(page.getByRole('link', { name: /健康档案/ })).toHaveAttribute('href', '/health-profile')
  await expect(page.getByRole('link', { name: /就诊情况单/ })).toHaveAttribute('href', '/visit-summary')
  await expect(page.getByText(/正在准备中。/, { exact: true })).toHaveCount(0)
  await expect(page.getByText('说明与帮助', { exact: true })).toHaveCount(0)
  await expect(page.getByText('更多服务', { exact: true })).toHaveCount(0)
  await expect(page.getByText('能不能吃', { exact: true })).toHaveCount(0)
  await expect(page.getByText('附近就医', { exact: true })).toHaveCount(0)
  await expect(page.getByText('过敏出示', { exact: true })).toHaveCount(0)
  await expect(page.locator('.guardian-tasks')).toHaveCount(0)
  const reducedVideo = page.locator('.idle-nurse-visual video[data-video-phase="idle1"]')
  await expect(reducedVideo).toHaveAttribute('poster', /nurse-station-idle-1-poster/)
  await expect.poll(() => reducedVideo.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => reducedVideo.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
  await page.screenshot({ path: 'test-results/nurse-station-first-screen-375x667.png', fullPage: true })
  await page.locator('.nurse-station-guarded strong').evaluate((element) => { element.textContent = '99999' })
  const fiveDigitLayout = await page.locator('.nurse-station-hero__main').evaluate((element) => {
    const guarded = element.querySelector<HTMLElement>('.nurse-station-guarded')!
    const visual = element.querySelector<HTMLElement>('.nurse-station-visual')!
    return {
      guardedRight: guarded.getBoundingClientRect().right,
      visualLeft: visual.getBoundingClientRect().left,
      overflow: guarded.scrollWidth > guarded.clientWidth,
    }
  })
  expect(fiveDigitLayout.overflow).toBe(false)
  expect(fiveDigitLayout.guardedRight).toBeLessThanOrEqual(fiveDigitLayout.visualLeft)
  await page.screenshot({ path: 'test-results/nurse-station-five-digit-guarded-days-375x667.png', fullPage: true })
  for (const [name, path] of [['健康随记', '/health-events'], ['健康档案', '/health-profile'], ['就诊情况单', '/visit-summary'], ['忌口出示卡', '/dietary-card'], ['用药提醒', '/medication-reminders']] as const) {
    await page.getByRole('link', { name: new RegExp(name) }).click()
    await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`))
    await page.goBack()
    await expect(page).toHaveURL(/\/nurse-station$/)
    await expect(page.locator('.nurse-home-entry')).toHaveCount(5)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    const cardMetrics = await entries.evaluateAll((cards) => cards.map((card) => {
      const title = card.querySelector('strong')!
      const subtitle = card.querySelector('small')!
      return { height: card.getBoundingClientRect().height, subtitleFits: subtitle.scrollHeight <= subtitle.clientHeight, titleFits: title.scrollWidth <= title.clientWidth }
    }))
    expect(cardMetrics).toHaveLength(5)
    expect(cardMetrics.every((metric) => metric.height === 88 && metric.titleFits && metric.subtitleFits)).toBe(true)
    if (viewport.width === 1440) await page.screenshot({ path: 'test-results/nurse-station-home-desktop-1440x900.png', fullPage: true })
  }

  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/food-allergy-status-index')
  await expect(page.getByText('指数功能已停止。原有记录仍然保留。')).toBeVisible()
  await page.goto('/nurse-station')
  await expect(page.locator('.nurse-station-allergy-index')).toHaveCount(0)
  await expect(page.locator('.nurse-home-entry')).toHaveCount(5)
  expect(errors).toEqual([])
})

test('成长数据入口迁移并保持血型独立编辑与部分测量值', async ({ page }) => {
  await registerMember(page)
  await expect(page.getByRole('button', { name: /身高，未记录，查看成长数据/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /体重，未记录，查看成长数据/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /血型，未填写，编辑/ })).toBeVisible()

  await page.getByRole('button', { name: /查看123的成长数据/ }).click()
  await expect(page).toHaveURL(/\/health-profile\/basic$/)
  await expect(page.getByRole('heading', { name: '成长数据', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /记录列表/ })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)

  await page.getByRole('button', { name: /血型，未填写，编辑/ }).click()
  const editor = page.getByRole('dialog', { name: '编辑血型' })
  await expect(editor.getByText(/当前：/)).toHaveCount(0)
  await expect(editor.getByText('RhD', { exact: true })).toHaveCount(0)
  await expect(editor.locator('.blood-type-sheet__heading')).toHaveCSS('display', 'flex')
  await editor.getByRole('button', { name: 'AB型', exact: true }).click()
  await page.screenshot({ path: 'test-results/nurse-station-blood-type-editor-375x667.png', fullPage: true })
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: /血型，未填写，编辑/ })).toBeVisible()

  await page.getByRole('button', { name: /血型，未填写，编辑/ }).click()
  await editor.getByRole('button', { name: 'AB型', exact: true }).click()
  await page.route('**/api/members/*', (route) => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试保存失败' } }) })
    : route.continue())
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('测试保存失败')
  await expect(editor.getByRole('button', { name: 'AB型', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.unroute('**/api/members/*')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByRole('button', { name: /血型，AB型，编辑/ })).toBeVisible()
  const bloodValueLayout = await page.locator('.nurse-station-blood-type > span').evaluate((element) => ({
    direction: getComputedStyle(element).flexDirection,
    iconTop: element.querySelector('svg')?.getBoundingClientRect().top ?? 0,
    textBottom: element.querySelector('strong')?.getBoundingClientRect().bottom ?? 0,
  }))
  expect(bloodValueLayout.direction).toBe('column')
  expect(bloodValueLayout.iconTop).toBeGreaterThanOrEqual(bloodValueLayout.textBottom)

  const token = pageTokens.get(page) ?? ''
  await page.evaluate(async (authToken) => {
    const membersResponse = await fetch('/api/members', { headers: { Authorization: `Bearer ${authToken}` } })
    const members = await membersResponse.json() as Array<{ id: string; name: string }>
    const member = members.find((item) => item.name === '123')!
    const save = (body: Record<string, unknown>) => fetch('/api/growth-measurements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, measurementType: 'height', dataStatus: 'confirmed', standardId: 'who-2006', ...body }),
    })
    const first = await save({ measuredAt: '2026-09-20', heightCm: null, weightKg: 10.7 })
    const second = await save({ measuredAt: '2026-09-21', heightCm: 84.2, weightKg: null })
    if (!first.ok || !second.ok) throw new Error('无法建立成长数据测试记录')
  }, token)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await expect(page.getByRole('button', { name: /身高，84.2，查看成长数据/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /体重，10.7，查看成长数据/ })).toBeVisible()
  await expect(page.locator('.nurse-station-fact')).toHaveCount(0)
  await expect.poll(() => page.locator('.idle-nurse-visual video').evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(360)
  await page.screenshot({ path: 'test-results/nurse-station-growth-data-375x667.png', fullPage: true })

  await page.getByRole('link', { name: /健康档案/ }).click()
  await expect(page.locator('.health-profile-record-subject')).toBeVisible()
  await expect(page.locator('.growth-identity-card__metrics')).toHaveCount(0)
  await expect(page.locator('.health-profile-record-subject + nav[aria-label="档案分类"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/health-profile-without-growth-card-375x667.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await page.screenshot({ path: 'test-results/health-profile-without-growth-card-1440x900.png', fullPage: true })
  await page.goto('/nurse-station')
  await expect(page.getByRole('button', { name: /身高，84.2，查看成长数据/ })).toBeVisible()
  await expect.poll(() => page.locator('.idle-nurse-visual video').evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(360)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await page.screenshot({ path: 'test-results/nurse-station-growth-data-1440x900.png', fullPage: true })
})

test('排敏测试从新增到症状记录、趋势和刷新持久化形成闭环', async ({ page }) => {
  await registerMember(page)
  await page.goto('/desensitization-tests')
  await page.getByRole('button', { name: '新增测试', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station\/desensitization\/new$/)
  await expect(page.getByText('当前孩子', { exact: true })).toHaveCount(0)
  await page.getByPlaceholder('输入食物名称，如牛肉').fill('牛')
  await expect(page.getByText('你指的是？')).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-new-ambiguous-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '牛肉', exact: true }).click()
  await expect(page.getByRole('button', { name: /自动归入牛肉类/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-new-ready-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '开始观察' }).click()
  await expect(page).toHaveURL(/\/desensitization-tests/)
  await expect(page.getByRole('dialog', { name: /牛肉.*变化与下一步/ })).toBeVisible()
  await expect(page.getByText('未记录 / 情况不清楚')).toBeVisible()
  await page.getByRole('dialog', { name: /牛肉.*变化与下一步/ }).getByLabel(/关闭牛肉.*变化与下一步/).click()

  const card = page.getByTestId('desensitization-card-牛肉')
  await expect(card).toBeVisible()
  expect((await card.boundingBox())?.height).toBeLessThanOrEqual(125)
  const recordButton = card.locator('header').getByRole('button', { name: '记一笔' })
  const trendButton = card.locator('footer').getByRole('button', { name: /查看牛肉近7日趋势/ })
  await expect(recordButton).toBeVisible()
  await expect(trendButton).toBeVisible()
  await expect(card.getByRole('button', { name: /管理/ })).toBeVisible()
  expect((await recordButton.boundingBox())?.y).toBeLessThan((await trendButton.boundingBox())?.y ?? 0)
  await page.screenshot({ path: 'test-results/desensitization-card-empty-375x667.png', fullPage: true })
  await recordButton.click()
  await page.getByRole('button', { name: '有症状', exact: true }).click()
  await page.getByRole('button', { name: '红疹', exact: true }).click()
  await page.getByRole('button', { name: '消化道', exact: true }).click()
  await page.getByRole('button', { name: '腹痛', exact: true }).click()
  await page.getByRole('button', { name: '呼吸道', exact: true }).click()
  await page.getByRole('button', { name: '呼吸困难', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('立即联系当地急救')
  await page.getByRole('button', { name: '没吃过', exact: true }).click()
  await page.screenshot({ path: 'test-results/desensitization-record-severe-cross-region-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText('记录已保存，趋势已更新')).toHaveCount(0)
  await expect(card.getByText('暂停进阶', { exact: true })).toHaveCount(0)
  await expect(card.getByText(/已暂停进阶，请按已有安排处理并联系医疗团队/)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/desensitization-card-symptom-375x667.png', fullPage: true })

  await page.reload()
  const persistedCard = page.getByTestId('desensitization-card-牛肉')
  await expect(persistedCard.getByText('暂停进阶', { exact: true })).toHaveCount(0)
  await expect(persistedCard.getByRole('button', { name: /管理/ })).toBeVisible()
  await persistedCard.locator('footer').getByRole('button', { name: /查看牛肉近7日趋势/ }).click()
  await expect(page.getByText(/进阶保持暂停/)).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-trend-375x667.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await page.getByRole('button', { name: '医生安排 / 复评' }).click()
  await page.getByLabel('医生 / 机构与来源').fill('测试医院儿科 · 家长按医嘱转录')
  await page.getByLabel('就诊日期').fill('2026-09-25')
  await page.getByLabel('具体食品').fill('熟牛肉泥')
  await page.getByLabel('烹调 / 形态').fill('充分煮熟泥状')
  await page.getByLabel('首份量').fill('1')
  await page.getByLabel('单位').fill('克')
  await page.getByLabel('执行场所').fill('医院')
  await page.getByLabel('频率').fill('按医生安排')
  await page.getByLabel('观察时段').fill('2小时')
  await page.getByText('进阶与停止规则', { exact: true }).click()
  await page.getByLabel('进阶条件').fill('仅在医生确认后进入下一步')
  await page.getByLabel('停止及处理规则').fill('出现症状立即停止并按既有应急方案处理')
  await page.getByLabel(/这是一份新的完整医疗安排/).check()
  await page.screenshot({ path: 'test-results/desensitization-review-plan-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '保存安排' }).click()
  await expect(page.getByText(/当前执行卡 · 第 1 版/)).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-execution-card-375x667.png', fullPage: true })
  await page.getByRole('dialog', { name: /牛肉.*变化与下一步/ }).getByLabel(/关闭牛肉.*变化与下一步/).click()

  await page.getByRole('button', { name: '新增测试', exact: true }).click()
  await page.getByPlaceholder('输入食物名称，如牛肉').fill('牛奶')
  await page.getByRole('button', { name: '开始观察' }).click()
  await page.getByRole('dialog', { name: /牛奶.*变化与下一步/ }).getByLabel(/关闭牛奶.*变化与下一步/).click()
  const milkCard = page.getByTestId('desensitization-card-牛奶')
  await milkCard.getByRole('button', { name: '记一笔' }).click()
  await page.getByRole('button', { name: '没症状', exact: true }).click()
  await page.getByRole('button', { name: '吃过', exact: true }).click()
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText('记录已保存，趋势已更新')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/desensitization-multiple-cards-375x667.png', fullPage: true })

  await milkCard.evaluate((element) => {
    const surface = element.querySelector('.desensitization-card__surface')
    surface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 300 }))
    surface?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 210, clientY: 302 }))
  })
  await expect(milkCard).toHaveClass(/is-open/)
  await page.screenshot({ path: 'test-results/desensitization-swipe-actions-375x667.png', fullPage: true })
  await milkCard.locator('.desensitization-card__actions').getByRole('button', { name: /删除/ }).click()
  await expect(page.getByRole('dialog', { name: /删除“牛奶”测试/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-delete-confirm-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '删除测试' }).click()
  await expect(page.getByRole('button', { name: '撤销' })).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-delete-undo-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByTestId('desensitization-card-牛奶')).toBeVisible()

  const restoredMilkCard = page.getByTestId('desensitization-card-牛奶')
  await restoredMilkCard.evaluate((element) => {
    const surface = element.querySelector('.desensitization-card__surface')
    surface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 300 }))
    surface?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 210, clientY: 302 }))
  })
  await expect(restoredMilkCard).toHaveClass(/is-open/)
  await restoredMilkCard.locator('.desensitization-card__actions').getByRole('button', { name: /归档/ }).click()
  await page.getByRole('tab', { name: /已归档/ }).click()
  await expect(page.getByTestId('desensitization-card-牛奶')).toBeVisible()
  await page.screenshot({ path: 'test-results/desensitization-archived-375x667.png', fullPage: true })
  await page.getByRole('tab', { name: /进行中/ }).click()

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await expect(page.getByTestId('desensitization-card-牛肉')).toBeVisible()
    await page.screenshot({ path: `test-results/desensitization-card-${viewport.width}x${viewport.height}.png`, fullPage: true })
  }
  await page.goto('/nurse-station')
  await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  await page.goto('/desensitization-tests')
  await expect(page.getByTestId('desensitization-card-牛肉')).toBeVisible()
})

test('排敏记录未保存保护与草稿在刷新后继续', async ({ page }) => {
  await registerMember(page)
  await page.goto('/desensitization-tests')
  await page.getByRole('button', { name: '新增测试', exact: true }).click()
  await page.getByPlaceholder('输入食物名称，如牛肉').fill('鸡蛋')
  await page.getByRole('button', { name: '开始观察' }).click()
  await page.getByRole('dialog', { name: /鸡蛋.*变化与下一步/ }).getByLabel(/关闭鸡蛋.*变化与下一步/).click()
  await page.getByTestId('desensitization-card-鸡蛋').getByRole('button', { name: '记一笔' }).click()
  await page.getByRole('button', { name: '没症状', exact: true }).click()
  await page.getByRole('dialog', { name: /记一笔.*鸡蛋/ }).getByLabel(/关闭记一笔.*鸡蛋/).click()
  await expect(page.getByRole('heading', { name: '这次填写还没保存' })).toBeVisible()
  await page.getByRole('button', { name: '保留草稿并返回' }).click()
  await expect(page.getByText('草稿已保留')).toBeVisible()
  await page.reload()
  await page.getByTestId('desensitization-card-鸡蛋').getByRole('button', { name: '记一笔' }).click()
  await expect(page.getByRole('button', { name: '没症状', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '吃过', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: '没吃过', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '吃过', exact: true }).click()
  await page.screenshot({ path: 'test-results/desensitization-record-clear-375x667.png', fullPage: true })
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('修改已保存，趋势已重算')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('desensitization-card-鸡蛋').getByText(/最近1次未见症状/)).toBeVisible()
})

test('用药提醒三步在 320x568 与 375x667 一屏完成并持久化', async ({ page }) => {
  await registerMember(page)
  await page.getByRole('link', { name: /用药提醒/ }).click()
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
    const medicationName = `复方盐酸西替利嗪儿童滴剂超长名称换行验收${viewport.width}`
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: '新增提醒', exact: true }).click()
    const flow=page.getByRole('dialog',{name:'新增用药提醒'})
    await expect(flow.locator('.med-member-strip')).toHaveCount(0)
    await expect(flow.getByText(/为.*设置/)).toHaveCount(0)
    const routeGrid = flow.locator('.med-route-grid')
    await expect(routeGrid.locator('button')).toHaveText(['口服', '外用', '吸入'])
    expect(await routeGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
    const uploadButton = flow.getByRole('button', { name: '拍照或上传药品图片' })
    await expect(uploadButton).toHaveCSS('display', 'grid')
    await expect(uploadButton).toHaveCSS('align-items', 'center')
    await expect(uploadButton).toHaveCSS('justify-items', 'center')
    await flow.getByLabel('药品名称').fill(medicationName)
    await flow.getByLabel('每次用量').fill('5')
    await expect(flow).toBeVisible()
    expect(await flow.evaluate((node)=>({h:node.scrollHeight,v:window.innerHeight,w:document.documentElement.scrollWidth}))).toEqual({h:viewport.height,v:viewport.height,w:viewport.width})
    await page.screenshot({path:`test-results/medication-step1-${viewport.width}x${viewport.height}.png`})
    await flow.getByRole('button',{name:/下一步：设置规律/}).click()
    await flow.getByRole('textbox', { name: '第1次提醒时间', exact: true }).fill(viewport.width === 320 ? '08:00' : '09:15')
    await flow.getByRole('button', { name: '5天', exact: true }).click()
    if (viewport.width === 375) {
      await flow.getByRole('button', { name: '每隔一段时间' }).click()
      await flow.getByLabel('间隔小时数').fill('6')
      await flow.getByLabel('首次提醒时间').fill('09:15')
    }
    expect(await flow.evaluate((node)=>node.scrollHeight)).toBeLessThanOrEqual(viewport.height)
    await page.screenshot({path:`test-results/medication-step2-${viewport.width}x${viewport.height}.png`})
    await flow.getByRole('button',{name:/下一步：确认/}).click()
    await expect(flow.getByText(/接下来三次/)).toBeVisible()
    expect(await flow.evaluate((node)=>node.scrollHeight)).toBeLessThanOrEqual(viewport.height)
    await page.screenshot({path:`test-results/medication-confirm-${viewport.width}x${viewport.height}.png`})
    await flow.getByRole('button',{name:'确认并开启提醒'}).click()
    await expect(page.getByText(medicationName,{exact:true}).last()).toBeVisible()
    await expect(page.getByText(/^下次：/).last()).toBeVisible()
    await expect(page.locator('.medication-course-card').last()).toContainText('每次5滴')
    const titleMetrics = await page.locator('.medication-course-card h3').filter({ hasText: medicationName }).evaluate((element) => ({ height: element.getBoundingClientRect().height, whiteSpace: getComputedStyle(element).whiteSpace }))
    expect(titleMetrics.whiteSpace).toBe('normal')
    expect(titleMetrics.height).toBeGreaterThan(20)
    await expect(page.locator('.nurse-station-save-notice')).toBeHidden()
    await page.screenshot({path:`test-results/nurse-station-long-medication-${viewport.width}x${viewport.height}.png`, fullPage:true})
    await page.reload()
    await expect(page.getByText(medicationName,{exact:true}).last()).toBeVisible()
    if(viewport.width===320) { await page.getByText(medicationName,{exact:true}).last().click(); await expect(page.getByRole('dialog')).toHaveCount(0) }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: 'test-results/nurse-station-medication-desktop-1440x900.png', fullPage: true })
  await page.goto('/nurse-station')
  await expect(page.getByRole('link', { name: /用药提醒，2 个提醒任务/ })).toBeVisible()
})

test('加载失败与可用空状态明确区分且重试可恢复', async ({ page }) => {
  await registerMember(page)
  await page.getByRole('link', { name: /用药提醒/ }).click()
  await page.getByRole('button', { name: '新增提醒', exact: true }).click()
  const flow = page.getByRole('dialog', { name: '新增用药提醒' })
  await flow.getByLabel('药品名称').fill('失败时仍保留的用药计划')
  await flow.getByLabel('每次用量').fill('1')
  await flow.getByRole('button', { name: /下一步：设置规律/ }).click()
  await flow.getByRole('textbox', { name: '第1次提醒时间', exact: true }).fill('08:30')
  await flow.getByRole('button', { name: '3天', exact: true }).click()
  await flow.getByRole('button', { name: /下一步：确认/ }).click()
  await flow.getByRole('button', { name: '确认并开启提醒' }).click()
  await expect(page.getByText('失败时仍保留的用药计划', { exact: true })).toBeVisible()
  await page.route('**/api/medication-reminders?*', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试网络失败' } }) })
  })
  await page.reload()
  await expect(page.getByText('用药提醒加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('任务数量暂时无法读取', { exact: true })).toBeVisible()
  await expect(page.getByText('还没有用药提醒', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/medication-list-loading-failure-375x667.png', fullPage: true })
  await page.unroute('**/api/medication-reminders?*')
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('失败时仍保留的用药计划', { exact: true })).toBeVisible()
})

test('切换到另一人物时任务归属同步更新且不显示人物任务副标题', async ({ page }) => {
  await registerMember(page)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('这是一个非常非常长的孩子姓名')
  await fillDateInput(page.getByRole('textbox', { name: '出生日期' }), '2026-08-01')
  await page.getByRole('button', { name: '女', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: '打开我的孩子' }).click()
  await page.getByRole('dialog', { name: '我的孩子' }).locator('.current-child-sheet__select').filter({ hasText: '这是一个非常非常长的孩子姓名' }).click()
  await expect(page.locator('.nurse-station-identity')).toContainText('这是一个非常非常长的孩子姓名')
  await expect(page.getByRole('link', { name: /用药提醒，0 个提醒任务/ })).toBeVisible()
  await page.getByRole('link', { name: /用药提醒/ }).click()
  await expect(page.getByText('还没有用药提醒', { exact: true })).toBeVisible()
})

test('关键控件满足触控、键盘、文字间距与 200% 缩放验收', async ({ page }, testInfo) => {
  await registerMember(page)
  await expect(page.locator('.nurse-home-entry')).toHaveCount(5)
  const entryMeasurements = await page.evaluate(() => {
    const entry = document.querySelector<HTMLElement>('.nurse-home-entry')!
    const entrySubtitle = entry.querySelector<HTMLElement>('small')!
    const entryStyle = getComputedStyle(entry)
    return { entryBackground: entryStyle.backgroundColor, entryHeight: entry.getBoundingClientRect().height, entrySubtitleColor: getComputedStyle(entrySubtitle).color }
  })
  await page.getByRole('link', { name: /用药提醒/ }).click()
  const firstTab = page.getByRole('tab').first()
  await firstTab.focus()
  await expect(firstTab).toBeFocused()
  const measurements = await page.evaluate(() => {
    const tab = document.querySelector<HTMLElement>('.guardian-task-page__tabs button[aria-selected="true"]')!
    const add = document.querySelector<HTMLElement>('.guardian-task-page__add')!
    const tabStyle = getComputedStyle(tab)
    return {
      addHeight: add.getBoundingClientRect().height,
      actionFontSize: getComputedStyle(add).fontSize,
      maxPageWidth: document.querySelector<HTMLElement>('.app-shell')?.getBoundingClientRect().width,
      pageWidth: document.documentElement.scrollWidth,
      tabBackground: tabStyle.backgroundColor,
      tabColor: tabStyle.color,
      tabHeight: tab.getBoundingClientRect().height
    }
  })
  expect(measurements.tabHeight).toBeGreaterThanOrEqual(44)
  expect(measurements.addHeight).toBeGreaterThanOrEqual(44)
  expect(entryMeasurements.entryHeight).toBe(88)
  expect(contrastRatio(measurements.tabColor, measurements.tabBackground)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(entryMeasurements.entrySubtitleColor, entryMeasurements.entryBackground)).toBeGreaterThanOrEqual(4.5)

  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  // A 1440px desktop viewport at 200% browser zoom exposes 720 CSS pixels.
  // Test that equivalent CSS viewport directly because Chromium device emulation
  // intentionally honours this app's non-scalable mobile viewport contract.
  await page.setViewportSize({ width: 720, height: 450 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720)
  await page.screenshot({ path: 'test-results/nurse-station-zoom-200-equivalent-720x450.png', fullPage: true })
  await testInfo.attach('nurse-station-measurements.json', { body: Buffer.from(JSON.stringify({ ...entryMeasurements, ...measurements, entrySubtitleContrast: contrastRatio(entryMeasurements.entrySubtitleColor, entryMeasurements.entryBackground), selectedContrast: contrastRatio(measurements.tabColor, measurements.tabBackground), zoomCheck: '1440 desktop at 200% equivalent: 720 CSS px' }, null, 2)), contentType: 'application/json' })
})

test('用药卡片到点记录、逐次撤回、左滑归档和删除确认均持久化', async ({ browser, page }) => {
  await registerMember(page)
  await createReminder(page, { name: '每日一次排版用药', days: 3, times: ['00:00'] })
  await createReminder(page, { name: '逾期一次用药', days: 3, times: ['23:59'], startOffsetDays: -1 })
  await createReminder(page, { name: '四周到点用药', days: 28, times: ['00:00', '00:01', '00:02', '00:03'] })
  await createReminder(page, { name: '五周换行用药', days: 35, times: ['23:59'], startOffsetDays: 1 })
  await createReminder(page, { name: '短疗程用药', days: 5, times: ['23:59'], startOffsetDays: 1 })
  await createReminder(page, { name: '移动删除用药', days: 7, times: ['23:59'], startOffsetDays: 1 })
  await page.goto('/medication-reminders')
  const dailyCard = page.locator('.medication-course-card').filter({ hasText: '每日一次排版用药' })
  await expect(dailyCard).toContainText('疗程：共3天，每天1次')
  await expect(dailyCard).toContainText('用法：每次1粒（口服）')
  await dailyCard.getByRole('button', { name: '已服用' }).click()
  await expect(dailyCard).toContainText('今日：1/1')
  await expect(dailyCard.locator('.medication-course-card__course > p')).toHaveCount(0)
  await expect(dailyCard).not.toContainText('共3天 · 第1天')
  await expect(dailyCard.locator('.medication-course-card__week > span')).toHaveText('第1天')
  await expect(page.locator('.nurse-station-save-notice')).toBeHidden()
  await dailyCard.screenshot({ path: 'test-results/medication-card-daily-copy-375x667.png' })
  const overdueCard = page.locator('.medication-course-card').filter({ hasText: '逾期一次用药' })
  await expect(overdueCard).toContainText('今日：0/1')
  await overdueCard.getByRole('button', { name: '已服用' }).click()
  await expect(overdueCard).toContainText('今日：1/1')
  const dueCard = page.locator('.medication-course-card').filter({ hasText: '四周到点用药' })
  await expect(dueCard).toContainText('疗程：共28天，每天4次')
  await expect(dueCard).toContainText('用法：每次1粒（口服）')
  await expect(dueCard).toContainText('今日：0/4')
  await expect(dueCard.getByRole('button', { name: '已服用' })).toBeEnabled()
  const cardAlignment = await dueCard.evaluate((card) => {
    const today = card.querySelector<HTMLElement>('.medication-course-card__today')!
    const next = card.querySelector<HTMLElement>('.medication-course-card__next')!
    const take = card.querySelector<HTMLElement>('.medication-course-card__take')!
    const undo = card.querySelector<HTMLElement>('.medication-course-card__undo')!
    const summary = card.querySelector<HTMLElement>('.medication-course-card__summary')!
    const summaryLines = [summary.querySelector<HTMLElement>('h3')!, ...summary.querySelectorAll<HTMLElement>('p')]
    return {
      summaryContainsToday: summary.contains(today),
      controlsContainToday: card.querySelector('.medication-course-card__controls')?.contains(today),
      summaryFontSizes: summaryLines.map((line) => getComputedStyle(line).fontSize),
      summaryFontWeights: summaryLines.map((line) => getComputedStyle(line).fontWeight),
      takeTop: take.getBoundingClientRect().top,
      todayTop: today.getBoundingClientRect().top,
      todayBottom: today.getBoundingClientRect().bottom,
      nextTop: next.getBoundingClientRect().top,
      undoTop: undo.getBoundingClientRect().top
    }
  })
  expect(cardAlignment.summaryContainsToday).toBe(true)
  expect(cardAlignment.controlsContainToday).toBe(false)
  expect(cardAlignment.summaryFontSizes).toEqual(['12px', '12px', '12px', '12px', '12px'])
  expect(cardAlignment.summaryFontWeights).toEqual(['400', '400', '400', '400', '400'])
  expect(cardAlignment.todayBottom).toBeLessThanOrEqual(cardAlignment.nextTop)
  expect(cardAlignment.takeTop).toBeLessThan(cardAlignment.todayTop)
  expect(cardAlignment.undoTop).toBeGreaterThan(cardAlignment.takeTop)
  await dueCard.screenshot({ path: 'test-results/medication-card-enabled-375x667.png' })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await dueCard.screenshot({ path: 'test-results/medication-card-enabled-320x568.png' })
  await page.setViewportSize({ width: 375, height: 667 })
  await dueCard.getByRole('button', { name: '已服用' }).click()
  await expect(dueCard).toContainText('今日：1/4')
  await expect(dueCard.locator('i.is-completed')).toHaveCount(1)
  await dueCard.getByRole('button', { name: '撤回' }).click()
  await expect(dueCard).toContainText('今日：0/4')
  await expect(dueCard.locator('i.is-completed')).toHaveCount(0)
  await page.route('**/api/medication-reminders/*/complete', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '记录暂时失败' } }) }))
  await dueCard.getByRole('button', { name: '已服用' }).click()
  await expect(page.locator('.nurse-station-save-notice')).toContainText('记录暂时失败')
  await expect(dueCard).toContainText('今日：0/4')
  await page.unroute('**/api/medication-reminders/*/complete')
  await expect(page.locator('.nurse-station-save-notice')).toBeHidden()
  const futureCard = page.locator('.medication-course-card').filter({ hasText: '短疗程用药' })
  await expect(futureCard.getByRole('button', { name: '已服用' })).toBeDisabled()
  await futureCard.screenshot({ path: 'test-results/medication-card-short-course-375x667.png' })
  await dueCard.scrollIntoViewIfNeeded()
  const box = await dueCard.boundingBox(); expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width - 10, box!.y + 35); await page.mouse.down(); await page.mouse.move(box!.x + 40, box!.y + 35, { steps: 8 }); await page.mouse.up()
  await expect(dueCard).toHaveClass(/is-open/)
  await page.screenshot({ path: 'test-results/medication-card-swipe-actions-375x667.png', fullPage: true })
  await dueCard.getByRole('button', { name: '删除提醒' }).click()
  const dialog = page.getByRole('dialog', { name: /删除.*提醒/ })
  await expect(dialog).toContainText('这条提醒和它生成的服用记录都会移除')
  await page.screenshot({ path: 'test-results/medication-delete-confirm-375x667.png', fullPage: true })
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dueCard).toBeVisible()
  await expect(dueCard).not.toHaveClass(/is-open/)
  const mobileDeleteCard = page.locator('.medication-course-card').filter({ hasText: '移动删除用药' })
  const mobileDeleteTop = mobileDeleteCard.locator('.medication-course-card__top')
  await mobileDeleteTop.scrollIntoViewIfNeeded()
  const mobileDeleteBox = await mobileDeleteTop.boundingBox(); expect(mobileDeleteBox).not.toBeNull()
  await page.mouse.move(mobileDeleteBox!.x + mobileDeleteBox!.width - 10, mobileDeleteBox!.y + 35); await page.mouse.down(); await page.mouse.move(mobileDeleteBox!.x + 40, mobileDeleteBox!.y + 35, { steps: 8 }); await page.mouse.up()
  await expect(mobileDeleteCard).toHaveClass(/is-open/)
  await mobileDeleteCard.getByRole('button', { name: '删除提醒' }).click()
  await page.getByRole('dialog', { name: /删除.*提醒/ }).getByRole('button', { name: '删除提醒' }).click()
  await expect(mobileDeleteCard).toHaveCount(0)
  await expect(page.locator('.nurse-station-save-notice')).toContainText('提醒及记录已删除')
  await futureCard.scrollIntoViewIfNeeded()
  const shortBox = await futureCard.boundingBox(); await page.mouse.move(shortBox!.x + shortBox!.width - 10, shortBox!.y + 35); await page.mouse.down(); await page.mouse.move(shortBox!.x + 40, shortBox!.y + 35, { steps: 8 }); await page.mouse.up()
  await page.route('**/api/medication-reminders/*/archive', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '归档暂时失败' } }) }))
  await futureCard.getByRole('button', { name: '归档' }).click()
  await expect(futureCard).toBeVisible()
  await expect(page.locator('.nurse-station-save-notice')).toContainText('归档暂时失败')
  await page.unroute('**/api/medication-reminders/*/archive')
  await futureCard.getByRole('button', { name: '归档' }).click()
  await expect(futureCard).toHaveCount(0)
  await page.getByRole('tab', { name: /已归档/ }).click()
  const archivedCard = page.locator('.medication-course-card').filter({ hasText: '短疗程用药' })
  await expect(archivedCard).toContainText('已归档')
  await expect(archivedCard).toContainText('计划已停止')
  await page.screenshot({ path: 'test-results/medication-archived-375x667.png', fullPage: true })
  const archivedBox = await archivedCard.boundingBox(); expect(archivedBox).not.toBeNull()
  await page.mouse.move(archivedBox!.x + archivedBox!.width - 10, archivedBox!.y + 35); await page.mouse.down(); await page.mouse.move(archivedBox!.x + 40, archivedBox!.y + 35, { steps: 8 }); await page.mouse.up()
  await expect(archivedCard).toHaveClass(/is-open/)
  await expect(archivedCard.getByRole('button', { name: '归档' })).toHaveCount(0)
  await expect(archivedCard.getByRole('button', { name: '删除提醒' })).toBeVisible()
  await page.screenshot({ path: 'test-results/medication-archived-swipe-delete-375x667.png', fullPage: true })
  await archivedCard.getByRole('button', { name: '删除提醒' }).click()
  await page.getByRole('dialog', { name: /删除.*提醒/ }).getByRole('button', { name: '删除提醒' }).click()
  await expect(archivedCard).toHaveCount(0)
  await expect(page.getByText('暂无已归档任务', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /进行中/ }).click()
  const fiveWeekCard = page.locator('.medication-course-card').filter({ hasText: '五周换行用药' })
  await expect(page.locator('.nurse-station-save-notice')).toBeHidden()
  const fiveWeekRows = fiveWeekCard.locator('.medication-course-card__week-row')
  await expect(fiveWeekRows).toHaveCount(2)
  await expect(fiveWeekRows.nth(0).locator('.medication-course-card__week')).toHaveCount(4)
  await expect(fiveWeekRows.nth(1).locator('.medication-course-card__week')).toHaveCount(1)
  await fiveWeekCard.screenshot({ path: 'test-results/medication-card-five-weeks-375x667.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const desktopContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4297', storageState: await page.context().storageState(), viewport: { width: 1440, height: 900 } })
  await desktopContext.addInitScript((token) => sessionStorage.setItem('hoooho-auth-token', token), pageTokens.get(page) ?? '')
  const desktopPage = await desktopContext.newPage()
  await desktopPage.goto('/medication-reminders')
  const desktopCard = desktopPage.locator('.medication-course-card').filter({ hasText: '五周换行用药' })
  expect(await desktopPage.evaluate(() => ({ innerWidth, wide: matchMedia('(min-width: 768px)').matches }))).toEqual({ innerWidth: 1440, wide: true })
  await expect(desktopCard.locator('.medication-course-card__swipe-actions')).toBeHidden()
  await desktopCard.getByRole('button', { name: /管理/ }).click()
  await expect(desktopCard.getByRole('menuitem', { name: '归档' })).toBeVisible()
  await expect(desktopCard.getByRole('menuitem', { name: '删除提醒' })).toBeVisible()
  expect(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await desktopPage.screenshot({ path: 'test-results/medication-card-desktop-1440x900.png', fullPage: true })
  await desktopPage.route('**/api/medication-reminders/*', (route) => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '删除暂时失败' } }) }) : route.continue())
  await desktopCard.getByRole('menuitem', { name: '删除提醒' }).click()
  await desktopPage.getByRole('dialog', { name: /删除.*提醒/ }).getByRole('button', { name: '删除提醒' }).click()
  await expect(desktopCard).toBeVisible()
  await expect(desktopPage.locator('.nurse-station-save-notice')).toContainText('删除暂时失败')
  await desktopPage.unroute('**/api/medication-reminders/*')
  await desktopPage.getByRole('dialog', { name: /删除.*提醒/ }).getByRole('button', { name: '删除提醒' }).click()
  await expect(desktopCard).toHaveCount(0)
  await desktopContext.close()
  await page.reload()
  await expect(page.locator('.medication-course-card').filter({ hasText: '五周换行用药' })).toHaveCount(0)
  await expect(page.locator('.medication-course-card').filter({ hasText: '移动删除用药' })).toHaveCount(0)
  await page.getByRole('tab', { name: /已归档/ }).click()
  await expect(page.locator('.medication-course-card').filter({ hasText: '短疗程用药' })).toHaveCount(0)
  await expect(page.getByText('暂无已归档任务', { exact: true })).toBeVisible()
})

test('就诊情况单从当前人物随记生成报告并支持目录和依据抽屉', async ({ page }) => {
  await registerMember(page)
  await page.goto('/health-events')
  await page.getByRole('button', { name: '记录症状', exact: true }).click()
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByRole('textbox', { name: '哪里不舒服' }).fill('昨晚左肘窝有点发红，也很痒')
  await form.getByRole('textbox', { name: '手动补充症状部位' }).fill('左肘窝')
  await expect(form.getByRole('textbox', { name: '手动补充症状部位' })).toHaveValue('左肘窝')
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  await page.goto('/nurse-station')
  await page.getByRole('link', { name: /就诊情况单/ }).click()
  await expect(page).toHaveURL(/\/visit-summary$/)
  await expect(page.getByRole('button', { name: '章节目录' })).toBeEnabled()
  await expect(page.locator('[data-visit-sheet-root]')).toContainText('左肘窝')
  await page.screenshot({ path: 'test-results/visit-summary-iphone-se.png', fullPage: true })
  await page.getByRole('button', { name: '章节目录' }).click()
  const directory = page.getByRole('dialog', { name: '章节目录' })
  await expect(directory.locator('[data-visit-sheet-index] button')).not.toHaveCount(0)
  await directory.getByRole('button', { name: '关闭章节目录', exact: true }).click()
  const evidenceAction = page.getByRole('button', { name: '查看依据', exact: true }).first()
  await expect(evidenceAction).toBeVisible()
  await evidenceAction.click()
  const evidence = page.getByRole('dialog', { name: '原始依据' })
  await expect(evidence).toContainText('发生：')
  await expect(evidence).toContainText('录入：')
  await evidence.getByRole('button', { name: '关闭原始依据', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await page.screenshot({ path: 'test-results/visit-summary-desktop-1440x900.png', fullPage: true })
})
