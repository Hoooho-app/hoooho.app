import { expect, test, type Page } from '@playwright/test'

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

async function registerMember(page: Page) {
  await registerAccount(page)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('123')
  await page.getByRole('textbox', { name: '出生日期' }).pressSequentially('20260901')
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

test('护士视频资源失败时页面结构和核心任务仍可使用', async ({ page }) => {
  await page.route('**/*nurse-station-idle-1*.mp4', (route) => route.abort())
  await registerMember(page)
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('height', '136px')
  await expect(page.locator('.idle-nurse-visual video')).toHaveAttribute('poster', /nurse-station-idle-1-poster/)
  await expect(page.getByRole('tab', { name: '用药提醒' })).toBeVisible()
  await page.getByRole('tab', { name: '排敏测试' }).click()
  await expect(page.getByText('还没有排敏测试', { exact: true })).toBeVisible()
})

test('参考图首页在 iPhone SE 上保持核心入口和守护任务交互', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await registerMember(page)
  await expect(page.locator('.nurse-station-hero')).toBeVisible()
  await expect(page.locator('.nurse-station-identity')).toContainText('123')
  await expect(page.locator('.nurse-station-guarded')).toContainText('已守护')
  await expect(page.locator('.nurse-station-guarded')).toHaveCSS('margin-top', '8px')
  await expect(page.locator('.nurse-station-fact')).toHaveCSS('margin-top', '4px')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('height', '136px')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('border-color', 'rgb(220, 237, 234)')
  await expect(page.locator('.nurse-station-visual')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const facts = ['全球食物过敏率约3%～8%', '低龄儿童更容易发生食物过敏', '时间、诱因和频率都是重要线索', '早点留下记录，就能少一点麻烦']
  for (const fact of facts) {
    const metrics = await page.locator('.nurse-station-fact').evaluate((element, text) => {
      const copy = element.querySelector('span')
      if (copy) copy.textContent = text
      return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }
    }, fact)
    expect(metrics.scrollHeight).toBeLessThanOrEqual(36)
    expect(metrics.clientHeight).toBeLessThanOrEqual(36)
  }
  await expect(page.locator('.nurse-primary-entries strong')).toHaveText(['健康事件记录', '健康档案'])
  await expect(page.locator('.nurse-primary-entries small span')).toHaveText(['健康事件记一下', '日常喂养记一下', '病症用药记一下', '补充基础信息', '补充过敏史', '补充家族史'])
  await expect(page.locator('.nurse-more-service--unavailable strong')).toHaveText(['过敏出示', '能不能吃', '附近就医'])
  const unavailableServices = page.locator('.nurse-more-service--unavailable')
  await expect(unavailableServices).toHaveCount(3)
  for (const service of await unavailableServices.all()) {
    await expect(service).toBeDisabled()
  }
  await expect(page.getByRole('button', { name: '就诊情况单', exact: true })).toBeDisabled()
  await expect(page.getByText(/正在准备中。/, { exact: true })).toHaveCount(0)
  await expect(page.getByText('说明与帮助', { exact: true })).toHaveCount(0)
  await expect(page.locator('.guardian-task-heading > p')).toHaveCount(0)
  await expect(page.locator('.guardian-notification-notice')).toHaveCount(0)
  const reducedVideo = page.locator('.idle-nurse-visual video[data-video-phase="idle1"]')
  await expect(reducedVideo).toHaveAttribute('poster', /nurse-station-idle-1-poster/)
  await expect.poll(() => reducedVideo.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => reducedVideo.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
  await page.screenshot({ path: 'test-results/nurse-station-first-screen-375x667.png', fullPage: true })
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveText(['用药提醒', '排敏测试'])
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('新增用药提醒', { exact: true })).toBeVisible()
  await expect(page.getByText('创建下一次用药提醒', { exact: true })).toBeVisible()
  await tabs.nth(1).click()
  await expect(page.getByText('新增排敏测试', { exact: true })).toBeVisible()
  await expect(page.getByText('还没有排敏测试', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/nurse-station-allergy-empty-375x667.png', fullPage: true })
  for (let index = 0; index < 4; index += 1) {
    await tabs.nth(index % 2).click()
  }
  await tabs.first().click()
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await page.locator('.guardian-task-view').click()
  await page.getByRole('button', { name: '已归档任务', exact: true }).click()
  await expect(page.locator('.guardian-task-view')).toHaveText(/已归档任务/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
  }
  expect(errors).toEqual([])
})

test('用药提醒三步在 320x568 与 375x667 一屏完成并持久化', async ({ page }) => {
  await registerMember(page)
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
    const medicationName = `复方盐酸西替利嗪儿童滴剂超长名称换行验收${viewport.width}`
    await page.setViewportSize(viewport)
    await page.getByRole('tab', { name: '用药提醒' }).click()
    await page.getByText('新增用药提醒', { exact: true }).click()
    const flow=page.getByRole('dialog',{name:'新增用药提醒'})
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
})

test('加载失败与可用空状态明确区分且重试可恢复', async ({ page }) => {
  await registerMember(page)
  await page.getByText('新增用药提醒', { exact: true }).click()
  const flow = page.getByRole('dialog', { name: '新增用药提醒' })
  await flow.getByLabel('药品名称').fill('失败时仍保留的用药计划')
  await flow.getByLabel('每次用量').fill('1')
  await flow.getByRole('button', { name: /下一步：设置规律/ }).click()
  await flow.getByRole('textbox', { name: '第1次提醒时间', exact: true }).fill('08:30')
  await flow.getByRole('button', { name: '3天', exact: true }).click()
  await flow.getByRole('button', { name: /下一步：确认/ }).click()
  await flow.getByRole('button', { name: '确认并开启提醒' }).click()
  await expect(page.getByText('失败时仍保留的用药计划', { exact: true })).toBeVisible()
  await page.route('**/api/account/entry-state', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试网络失败' } }) })
  })
  await page.reload()
  await expect(page.getByText('当前人物资料加载失败，已保存内容没有改变。', { exact: true })).toBeVisible()
  await expect(page.getByText('最新数据加载失败，已保存任务仍会保留。', { exact: true })).toBeVisible()
  await expect(page.getByText('失败时仍保留的用药计划', { exact: true })).toBeVisible()
  await expect(page.getByText('还没有用药提醒', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/nurse-station-loading-failure-375x667.png', fullPage: true })
  await page.unroute('**/api/account/entry-state')
  await page.getByRole('button', { name: '重新加载' }).last().click()
  await expect(page.locator('.nurse-station-hero')).toBeVisible()
  await expect(page.getByText('失败时仍保留的用药计划', { exact: true })).toBeVisible()
})

test('切换到另一人物时任务归属同步更新且不显示人物任务副标题', async ({ page }) => {
  await registerMember(page)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('这是一个非常非常长的孩子姓名')
  await page.getByRole('textbox', { name: '出生日期' }).pressSequentially('20260801')
  await page.getByRole('button', { name: '女', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: '打开我的孩子' }).click()
  await page.getByRole('dialog', { name: '我的孩子' }).locator('.current-child-sheet__select').filter({ hasText: '这是一个非常非常长的孩子姓名' }).click()
  await expect(page.locator('.nurse-station-identity')).toContainText('这是一个非常非常长的孩子姓名')
  await expect(page.locator('.guardian-task-heading > p')).toHaveCount(0)
  await expect(page.getByText('还没有用药提醒', { exact: true })).toBeVisible()
})

test('关键控件满足触控、键盘、文字间距与 200% 缩放验收', async ({ page }, testInfo) => {
  await registerMember(page)
  const firstTab = page.getByRole('tab').first()
  await firstTab.focus()
  await expect(firstTab).toBeFocused()
  const measurements = await page.evaluate(() => {
    const tab = document.querySelector<HTMLElement>('.guardian-task-tabs button[aria-selected="true"]')!
    const add = document.querySelector<HTMLElement>('.guardian-task-add')!
    const unavailable = document.querySelector<HTMLElement>('.nurse-more-service--unavailable')!
    const title = document.querySelector<HTMLElement>('.guardian-task-add strong')!
    const detail = document.querySelector<HTMLElement>('.guardian-task-add small')!
    const tabStyle = getComputedStyle(tab)
    const unavailableStyle = getComputedStyle(unavailable)
    return {
      addHeight: add.getBoundingClientRect().height,
      detailFontSize: detail ? getComputedStyle(detail).fontSize : '',
      maxPageWidth: document.querySelector<HTMLElement>('.app-shell')?.getBoundingClientRect().width,
      pageWidth: document.documentElement.scrollWidth,
      tabBackground: tabStyle.backgroundColor,
      tabColor: tabStyle.color,
      tabHeight: tab.getBoundingClientRect().height,
      titleFontSize: title ? getComputedStyle(title).fontSize : '',
      unavailableBackground: unavailableStyle.backgroundColor,
      unavailableColor: unavailableStyle.color,
      unavailableHeight: unavailable.getBoundingClientRect().height
    }
  })
  expect(measurements.tabHeight).toBeGreaterThanOrEqual(44)
  expect(measurements.addHeight).toBeGreaterThanOrEqual(72)
  expect(measurements.unavailableHeight).toBeGreaterThanOrEqual(44)
  expect(contrastRatio(measurements.tabColor, measurements.tabBackground)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(measurements.unavailableColor, measurements.unavailableBackground)).toBeGreaterThanOrEqual(4.5)

  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  // A 1440px desktop viewport at 200% browser zoom exposes 720 CSS pixels.
  // Test that equivalent CSS viewport directly because Chromium device emulation
  // intentionally honours this app's non-scalable mobile viewport contract.
  await page.setViewportSize({ width: 720, height: 450 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720)
  await page.screenshot({ path: 'test-results/nurse-station-zoom-200-equivalent-720x450.png', fullPage: true })
  await testInfo.attach('nurse-station-measurements.json', { body: Buffer.from(JSON.stringify({ ...measurements, selectedContrast: contrastRatio(measurements.tabColor, measurements.tabBackground), unavailableContrast: contrastRatio(measurements.unavailableColor, measurements.unavailableBackground), zoomCheck: '1440 desktop at 200% equivalent: 720 CSS px' }, null, 2)), contentType: 'application/json' })
})

test('用药卡片到点记录、逐次撤回、左滑归档和删除确认均持久化', async ({ browser, page }) => {
  await registerMember(page)
  await createReminder(page, { name: '四周到点用药', days: 28, times: ['00:00', '00:01', '00:02', '00:03'] })
  await createReminder(page, { name: '五周换行用药', days: 35, times: ['23:59'], startOffsetDays: 1 })
  await createReminder(page, { name: '短疗程用药', days: 5, times: ['23:59'], startOffsetDays: 1 })
  await createReminder(page, { name: '移动删除用药', days: 7, times: ['23:59'], startOffsetDays: 1 })
  await page.reload()
  const dueCard = page.locator('.medication-course-card').filter({ hasText: '四周到点用药' })
  await expect(dueCard).toContainText('今日 0/4')
  await expect(dueCard.getByRole('button', { name: '已服用' })).toBeEnabled()
  await dueCard.screenshot({ path: 'test-results/medication-card-enabled-375x667.png' })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await dueCard.screenshot({ path: 'test-results/medication-card-enabled-320x568.png' })
  await page.setViewportSize({ width: 375, height: 667 })
  await dueCard.getByRole('button', { name: '已服用' }).click()
  await expect(dueCard).toContainText('今日 1/4')
  await expect(dueCard.locator('i.is-completed')).toHaveCount(1)
  await dueCard.getByRole('button', { name: '撤回' }).click()
  await expect(dueCard).toContainText('今日 0/4')
  await expect(dueCard.locator('i.is-completed')).toHaveCount(0)
  await page.route('**/api/medication-reminders/*/complete', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '记录暂时失败' } }) }))
  await dueCard.getByRole('button', { name: '已服用' }).click()
  await expect(page.locator('.nurse-station-save-notice')).toContainText('记录暂时失败')
  await expect(dueCard).toContainText('今日 0/4')
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
  const dialog = page.getByRole('dialog', { name: '删除提醒？' })
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
  await page.getByRole('dialog', { name: '删除提醒？' }).getByRole('button', { name: '删除提醒' }).click()
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
  await page.locator('.guardian-task-view').click(); await page.getByRole('button', { name: '已归档任务', exact: true }).click()
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
  await page.getByRole('dialog', { name: '删除提醒？' }).getByRole('button', { name: '删除提醒' }).click()
  await expect(archivedCard).toHaveCount(0)
  await expect(page.getByText('暂无已归档任务', { exact: true })).toBeVisible()
  await page.locator('.guardian-task-view').click(); await page.getByRole('button', { name: '守护任务', exact: true }).click()
  const fiveWeekCard = page.locator('.medication-course-card').filter({ hasText: '五周换行用药' })
  await expect(page.locator('.nurse-station-save-notice')).toBeHidden()
  const fiveWeekRows = fiveWeekCard.locator('.medication-course-card__week-row')
  await expect(fiveWeekRows).toHaveCount(2)
  await expect(fiveWeekRows.nth(0).locator('.medication-course-card__week')).toHaveCount(4)
  await expect(fiveWeekRows.nth(1).locator('.medication-course-card__week')).toHaveCount(1)
  await fiveWeekCard.screenshot({ path: 'test-results/medication-card-five-weeks-375x667.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const desktopContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4197', storageState: await page.context().storageState(), viewport: { width: 1440, height: 900 } })
  await desktopContext.addInitScript((token) => sessionStorage.setItem('hoooho-auth-token', token), pageTokens.get(page) ?? '')
  const desktopPage = await desktopContext.newPage()
  await desktopPage.goto('/nurse-station')
  const desktopCard = desktopPage.locator('.medication-course-card').filter({ hasText: '五周换行用药' })
  expect(await desktopPage.evaluate(() => ({ innerWidth, wide: matchMedia('(min-width: 768px)').matches }))).toEqual({ innerWidth: 1440, wide: true })
  const desktopActions = desktopCard.locator('.medication-course-card__desktop-actions')
  await expect(desktopActions).toHaveCount(1)
  expect(await desktopActions.evaluate((element) => getComputedStyle(element).display)).toBe('flex')
  await expect(desktopActions.getByRole('button', { name: '归档' })).toBeVisible()
  expect(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await desktopPage.screenshot({ path: 'test-results/medication-card-desktop-1440x900.png', fullPage: true })
  await desktopPage.route('**/api/medication-reminders/*', (route) => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '删除暂时失败' } }) }) : route.continue())
  await desktopActions.getByRole('button', { name: '删除提醒' }).click()
  await desktopPage.getByRole('dialog', { name: '删除提醒？' }).getByRole('button', { name: '删除提醒' }).click()
  await expect(desktopCard).toBeVisible()
  await expect(desktopPage.locator('.nurse-station-save-notice')).toContainText('删除暂时失败')
  await desktopPage.unroute('**/api/medication-reminders/*')
  await desktopPage.getByRole('dialog', { name: '删除提醒？' }).getByRole('button', { name: '删除提醒' }).click()
  await expect(desktopCard).toHaveCount(0)
  await desktopContext.close()
  await page.reload()
  await expect(page.locator('.medication-course-card').filter({ hasText: '五周换行用药' })).toHaveCount(0)
  await expect(page.locator('.medication-course-card').filter({ hasText: '移动删除用药' })).toHaveCount(0)
  await page.locator('.guardian-task-view').click(); await page.getByRole('button', { name: '已归档任务', exact: true }).click()
  await expect(page.locator('.medication-course-card').filter({ hasText: '短疗程用药' })).toHaveCount(0)
  await expect(page.getByText('暂无已归档任务', { exact: true })).toBeVisible()
})

test('就诊情况单从当前人物随记生成病情摘要并支持索引和依据抽屉', async ({ page }) => {
  await registerMember(page)
  await page.goto('/health-events')
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  await page.getByRole('dialog', { name: '记一下' }).getByRole('button', { name: '记录症状' }).click()
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByLabel('主要症状').fill('昨晚左肘窝有点发红，也很痒')
  await form.locator('.symptom-location-input > input').fill('左肘窝')
  await expect(form.locator('.symptom-location-input > input')).toHaveValue('左肘窝')
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '就诊情况单', exact: true }).click()
  await expect(page).toHaveURL(/\/visit-summary\//)
  await expect(page.getByRole('heading', { name: '这次想解决什么问题' })).toBeVisible()
  await expect(page.getByText('选择一项已有情况，或填写这次想解决的问题。', { exact: true })).toBeVisible()
  await expect(page.getByText(/正在为：/)).toBeVisible()
  await expect(page.getByRole('button', { name: '生成病情摘要' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/visit-summary-chooser-iphone-se.png', fullPage: true })
  await page.getByRole('radio').first().check()
  await expect(page.getByText('还有想补充的吗？（选填）', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '生成病情摘要' })).toBeEnabled()
  await page.screenshot({ path: 'test-results/visit-summary-selected-iphone-se.png', fullPage: true })
  await page.getByRole('button', { name: '取消已有情况选择' }).click()
  await expect(page.getByText('本次主诉（必填）', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '生成病情摘要' })).toBeDisabled()
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: '生成病情摘要' }).click()
  await expect(page.getByRole('heading', { name: '病情摘要' })).toBeVisible()
  await page.getByRole('button', { name: '病程' }).click()
  await expect(page.locator('.visit-summary-rail').getByRole('button', { name: '病程' })).toHaveAttribute('aria-current', 'location')
  await page.getByRole('button', { name: '查看依据 ›' }).first().click()
  const evidence = page.getByRole('dialog', { name: /原始依据/ })
  await expect(evidence.getByText('来源', { exact: true }).first()).toBeVisible()
  await expect(evidence.getByText('记录时间', { exact: true }).first()).toBeVisible()
  await expect(evidence.getByText('状态', { exact: true }).first()).toBeVisible()
  await evidence.getByRole('button', { name: '关闭依据' }).click()
  await page.screenshot({ path: 'test-results/visit-summary-iphone-se.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await page.screenshot({ path: 'test-results/visit-summary-desktop-1440x900.png', fullPage: true })
})
