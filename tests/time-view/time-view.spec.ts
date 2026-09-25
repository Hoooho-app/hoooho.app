import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('time-view-e2e-local-only-secret', 60 * 60_000).create({ id: 'time-view-test-account' })
async function prepare(page: Page, member = 'child-one') {
  await page.addInitScript(({ token, member }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    if (sessionStorage.getItem('hoooho:preserve-test-member') !== 'true') localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'time-view-test-account' }, currentMemberId: member, members: [], profile: null }, version: 5 }))
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
    class Recognition {
      onresult: ((event: unknown) => void) | null = null
      onend: (() => void) | null = null
      start() { setTimeout(() => this.onresult?.({ results: [{ 0: { transcript: '今天和朋友一起玩了半小时' } }] }), 40) }
      stop() { this.onend?.() }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition })
  }, { token, member })
  await page.goto('/health-events')
  await expect(page.getByRole('button', { name: '记一下', exact: true })).toBeVisible()
}

async function openSymptom(page: Page) {
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  await page.getByRole('dialog', { name: '记一下' }).getByRole('button', { name: '记录症状', exact: true }).click()
}

async function openDaily(page: Page) {
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  await page.getByRole('dialog', { name: '记一下' }).getByRole('button', { name: '记录日常', exact: true }).click()
}

async function openVisit(page: Page) {
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  await page.getByRole('dialog', { name: '记一下' }).getByRole('button', { name: '记录就医', exact: true }).click()
}

async function createDespiteDuplicateIfNeeded(page: Page) {
  const prompt = page.getByRole('dialog', { name: '这个情况刚刚记录过' })
  try {
    await prompt.waitFor({ state: 'visible', timeout: 1200 })
  } catch {
    return
  }
  await prompt.getByRole('button', { name: '仍然新增一条' }).click()
  await expect(prompt).toHaveCount(0)
}

test('symptom entry opens directly, extracts explicit facts and returns to the unified timeline', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page)
  await expect(page.getByRole('button', { name: '切换到月视图' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换到日视图' })).toHaveCount(0)
  await expect(page.getByLabel('单日时间轴').getByRole('button', { name: /缩略图视图/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/symptom-day-iphone-se.png' })
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  await expect(form).toBeVisible()
  await expect(form.getByRole('heading', { name: '主要症状（主诉）', exact: true })).toBeVisible()
  await expect(form.getByRole('button', { name: '语音输入症状', exact: true })).toHaveCount(0)
  await expect(form.getByLabel('主要症状')).toHaveCSS('font-size', '14px')
  expect(await form.getByLabel('主要症状').evaluate((field) => field.getBoundingClientRect().height)).toBe(88)
  await form.getByPlaceholder('描述哪里不舒服、有什么变化').fill('昨晚左肘窝有点发红，也很痒')
  await expect(form.getByText('已整理，可继续修改')).toBeVisible()
  await expect(form.locator('.symptom-keywords button').first()).toBeVisible()
  await expect(form.getByLabel('症状摘要（选填）')).toHaveCount(0)
  const attachment = form.getByRole('button', { name: '附件', exact: true })
  const supplement = form.getByRole('button', { name: '补充', exact: true })
  await expect(attachment).toBeInViewport()
  await expect(supplement).toBeInViewport()
  expect(await form.locator('.symptom-compact-grid').evaluate((grid) => {
    const sections = [...grid.querySelectorAll(':scope > section')]
    const [first, second] = sections.map((section) => section.getBoundingClientRect())
    return { sameWidth: Math.abs(first.width - second.width) < 1, separateRows: second.top >= first.bottom, fillsGrid: first.width >= grid.getBoundingClientRect().width - 1 }
  })).toEqual({ sameWidth: true, separateRows: true, fillsGrid: true })
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await expect(form.getByRole('button', { name: /关联其他记录/ })).toHaveCount(0)
  await expect(form.getByRole('textbox', { name: '发生时间' })).toBeInViewport()
  await expect(form.locator('.occurrence-time-control > span')).toHaveText(/^\d{2}:\d{2}$/)
  expect(await form.locator('.occurrence-time-field').evaluate((field) => {
    const label = field.querySelector(':scope > strong')!.getBoundingClientRect()
    const control = field.querySelector('.occurrence-time-control')!.getBoundingClientRect()
    return { aligned: Math.abs(label.top + label.height / 2 - control.top - control.height / 2) < 1, height: field.getBoundingClientRect().height }
  })).toEqual({ aligned: true, height: 40 })
  await expect(form.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/symptom-form-iphone-se.png' })
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  await expect(page.locator('.journal-grid-record--highlighted')).toBeVisible()
  await expect(page.locator('.journal-time-view')).toHaveAttribute('data-layout-mode', 'list')
  await expect(page.locator('.journal-hour-cell')).not.toHaveCount(0)
  await page.screenshot({ path: 'test-results/symptom-timeline-iphone-se.png' })
})

test('symptom attachments stay as six thumbnails on one row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page)
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await form.locator('input[type="file"]').setInputFiles(Array.from({ length: 6 }, (_, index) => ({ name: `symptom-${index}.png`, mimeType: 'image/png', buffer: pixel })))
  const photos = form.locator('.symptom-photo-section .quick-record-photo')
  await expect(photos).toHaveCount(6)
  await expect(form.getByText('6张', { exact: true })).toBeVisible()
  const tops = await photos.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  expect(await form.locator('.symptom-photo-section .quick-record-photos__rail').evaluate((rail) => getComputedStyle(rail).gridTemplateColumns.split(' ').length)).toBe(6)
  await page.screenshot({ path: 'outputs/symptom-form-photos-iphone-se.png' })
  while (await form.getByRole('button', { name: /删除照片/ }).count()) await form.getByRole('button', { name: /删除照片/ }).first().click()
})

test('negated fever stays absent and the compact symptom fields persist', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page)
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  await expect(form.getByRole('button', { name: '现在', exact: true })).toHaveCount(0)
  await expect(form.getByRole('button', { name: '指定时间', exact: true })).toHaveCount(0)
  await expect(form.getByRole('textbox', { name: '发生时间' })).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  await form.getByLabel('主要症状').fill('还是有皮疹，没发烧，但是皮疹情况加重了')
  await expect(form.getByRole('button', { name: '移除皮疹' })).toBeVisible()
  await expect(form.getByRole('button', { name: /移除发烧|移除发热/ })).toHaveCount(0)
  await form.getByLabel('症状部位').fill('全身')
  await expect(form.locator('input[type="file"]')).toHaveCount(1)
  await expect(page.getByRole('dialog', { name: '添加照片' })).toHaveCount(0)
  await form.getByRole('button', { name: '补充', exact: true }).click()
  await form.getByLabel('影响程度').fill('2')
  await expect(form.getByLabel('影响程度')).toHaveAttribute('aria-valuetext', '有些影响')
  await expect(form.getByLabel('变化趋势')).toHaveCount(0)
  await expect(form.getByText('反复出现', { exact: true })).toHaveCount(0)
  await expect(form.getByText('备注', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'outputs/symptom-form-impact-slider-iphone-se.png' })
  await form.getByRole('button', { name: /补充.*已填写/ }).click()
  await expect(form.getByRole('button', { name: /补充.*已填写/ })).toContainText('已填写')
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  const saved = page.locator('.journal-record--symptom').filter({ hasText: '皮疹' }).first()
  await expect(saved).toBeVisible()
  await saved.click()
  const detail = page.getByRole('dialog', { name: '症状记录详情' })
  await expect(detail.getByText('还是有皮疹，没发烧，但是皮疹情况加重了', { exact: true })).toBeVisible()
  await expect(detail.getByRole('heading', { name: '症状标签', exact: true })).toHaveCount(0)
  const mainSymptom = detail.locator('.symptom-record-detail > section').first()
  await expect(mainSymptom.locator('.symptom-detail-tags')).toContainText('皮疹')
  await expect(detail.getByText('全身', { exact: true })).toBeVisible()
  await expect(detail.getByText('发生时间', { exact: true })).toBeVisible()
  await expect(detail.getByText('创建时间', { exact: true })).toBeVisible()
  await expect(detail.getByText('有些影响', { exact: true })).toBeVisible()
  await expect(detail.getByRole('heading', { name: '已关联记录' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: '删除这条记录', exact: true })).toBeVisible()
  await expect(page.locator('.journal-saved-toast')).toBeHidden()
  await page.screenshot({ path: 'outputs/symptom-detail-tags-delete-iphone-se.png', fullPage: true })
  await detail.getByRole('button', { name: '删除这条记录', exact: true }).click()
  const confirmation = detail.getByRole('alertdialog', { name: '删除这条症状记录？' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirmation).toHaveCount(0)
  await detail.getByRole('button', { name: '删除这条记录', exact: true }).click()
  await detail.getByRole('alertdialog', { name: '删除这条症状记录？' }).getByRole('button', { name: '删除', exact: true }).click()
  await expect(detail).toHaveCount(0)
  await expect(saved).toHaveCount(0)
})

test('failed symptom save keeps the complete draft and allows retry', async ({ page }) => {
  await prepare(page)
  const submittedOccurrences: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/quick-records') submittedOccurrences.push((request.postDataJSON() as { occurredAt: string }).occurredAt)
  })
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByLabel('主要症状').fill('保存失败后仍需保留的皮疹')
  await form.getByLabel('症状部位').fill('手臂')
  await page.route('**/api/quick-records', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '暂时无法保存' } }) }), { times: 1 })
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(form.getByRole('alert')).toBeVisible()
  await expect(form.getByLabel('主要症状')).toHaveValue('保存失败后仍需保留的皮疹')
  await expect(form.getByLabel('症状部位')).toHaveValue('手臂')
  await expect(form.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  await page.waitForTimeout(1100)
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  expect(submittedOccurrences).toHaveLength(2)
  expect(submittedOccurrences[1]).toBe(submittedOccurrences[0])
})

test('desktop symptom flow stays aligned through save and detail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await prepare(page)
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByLabel('主要症状').fill('桌面端出现轻微皮疹')
  await page.screenshot({ path: 'test-results/symptom-form-desktop-1440.png' })
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await createDespiteDuplicateIfNeeded(page)
  await expect(form).toHaveCount(0)
  const saved = page.locator('.journal-record--symptom').filter({ hasText: '皮疹' }).first()
  await expect(saved).toBeVisible()
  await saved.click()
  const detail = page.getByRole('dialog', { name: '症状记录详情' })
  await expect(detail.getByText('桌面端出现轻微皮疹', { exact: true })).toBeVisible()
  await expect(detail.getByRole('heading', { name: '已关联记录' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/symptom-detail-desktop-1440.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('manual record button opens the four-class hub and symptom continues directly', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  const hub = page.getByRole('dialog', { name: '记一下' })
  await expect(hub.locator('.journal-entry-hub__item')).toHaveCount(4)
  await hub.getByRole('button', { name: '记录症状', exact: true }).click()
  const form = page.getByRole('dialog', { name: '记录症状' })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('主要症状')).toBeVisible()
  await expect(form.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/manual-record-four-class-hub-iphone-se.png' })
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '记一下' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/health-events$/)
})

test('health journal names the existing summary action medical prep', async ({ page }) => {
  await prepare(page)
  const button = page.getByRole('button', { name: '就诊情况单，孩子情况快速整理', exact: true })
  await expect(button).toHaveClass(/medical-prep-button/)
  await expect(button.locator('.medical-prep-button__label strong')).toHaveText('就诊情况单')
  await expect(page.getByRole('button', { name: '摘要生成', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/medical-prep-copy-iphone-se.png' })
})

test('empty today shows one contextual prompt and current-time marker without the old empty state', async ({ page }) => {
  await prepare(page, 'child-two')
  const today = await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` })
  await page.getByLabel('选择日期').fill(today)
  await expect(page.locator('.journal-timeline-row--now > time')).toHaveText('现在')
  await expect(page.locator('.journal-now-cell')).toHaveText(/^\d{2}:\d{2}:\d{2}$/)
  await expect(page.locator('.journal-now-cell')).not.toContainText('当前')
  await expect(page.locator('.journal-current-line')).toHaveCount(0)
  await expect(page.locator('.trigger-opportunity-card')).toHaveCount(1)
  const illustration = page.locator('.trigger-opportunity-illustration img')
  const cardId = await page.locator('.trigger-opportunity-card').getAttribute('data-card-id')
  if (cardId?.startsWith('sleep')) await expect(illustration).toBeHidden()
  else {
    await expect(illustration).toBeVisible()
    await expect.poll(() => illustration.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  }
  await expect(page.locator('.trigger-opportunity-options button')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '暂时关闭此提醒' })).toBeVisible()
  await expect(page.getByText('不是这件事，记点别的', { exact: true })).toHaveCount(0)
  const promptLayout = await page.locator('.trigger-opportunity-card').evaluate((card) => ({ height: card.getBoundingClientRect().height, overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth }))
  expect(promptLayout.height).toBeLessThanOrEqual(cardId?.startsWith('sleep') ? 300 : 440)
  expect(promptLayout.overflows).toBe(false)
  await expect(page.getByText('这一天还没有记录', { exact: true })).toHaveCount(0)
  await expect(page.getByText('饮食、活动或身体变化，都可以记下来。', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/journal-context-prompt-iphone-se.png' })
  await page.locator('.trigger-opportunity-action').scrollIntoViewIfNeeded()
  await expect(page.locator('.trigger-opportunity-action')).toBeVisible()
})

test('compact hour cells stop at now, persist routines and convert confirmation into one actual record', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T05:26:00.000Z'))
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page, 'routine-child')
  await expect(page.locator('.journal-timeline-row--now')).toHaveCount(1)
  await expect(page.locator('.journal-timeline-row--now > time')).toHaveText('现在')
  await expect(page.locator('.journal-now-cell svg')).toHaveCount(0)
  await expect(page.locator('.journal-timeline-row--empty')).toHaveCount(14)
  expect(await page.locator('.journal-timeline-row[data-hour]').evaluateAll((rows) => rows.every((row) => Number((row as HTMLElement).dataset.hour) <= 13))).toBe(true)

  await page.getByRole('button', { name: '调整作息' }).click()
  const setup = page.getByRole('dialog', { name: '设置日常作息' })
  await expect(setup.getByRole('button', { name: '停用日常作息' })).toHaveCount(0)
  const sleepSwitch = setup.getByRole('switch', { name: '夜间睡眠作息' })
  await sleepSwitch.click()
  await expect(setup.getByLabel('夜间睡眠通常入睡')).toBeVisible()
  await expect(setup.getByLabel('夜间睡眠通常醒来')).toBeVisible()
  await setup.getByLabel('夜间睡眠通常入睡').fill('21:00')
  await setup.getByLabel('夜间睡眠通常醒来').fill('08:28')
  const nextDay = setup.getByText('次日', { exact: true })
  await expect(nextDay).toBeVisible()
  const nextDayLayout = await nextDay.evaluate((node) => {
    const badge = node.getBoundingClientRect()
    const input = node.parentElement!.querySelector('input')!.getBoundingClientRect()
    return { insideInput: badge.top >= input.top && badge.bottom <= input.bottom, sameLine: Math.abs((badge.top + badge.bottom) / 2 - (input.top + input.bottom) / 2) < 2 }
  })
  expect(nextDayLayout).toEqual({ insideInput: true, sameLine: true })
  const sleepStartBox = await setup.getByLabel('夜间睡眠通常入睡').boundingBox()
  const sleepEndBox = await setup.getByLabel('夜间睡眠通常醒来').boundingBox()
  expect(Math.abs(sleepStartBox!.y - sleepEndBox!.y)).toBeLessThan(3)
  expect(sleepStartBox!.width).toBeGreaterThanOrEqual(90)
  expect(sleepEndBox!.width).toBeGreaterThanOrEqual(90)
  expect(sleepStartBox!.x + sleepStartBox!.width).toBeLessThanOrEqual(sleepEndBox!.x)
  const routineLayout = await setup.locator('.routine-setup-row').first().evaluate((row) => {
    const rowBox = row.getBoundingClientRect()
    const fieldsBox = row.querySelector('.routine-time-fields')!.getBoundingClientRect()
    return {
      fieldsWithinRow: fieldsBox.left >= rowBox.left && fieldsBox.right <= rowBox.right,
      horizontalOverflow: row.scrollWidth > row.clientWidth
    }
  })
  expect(routineLayout).toEqual({ fieldsWithinRow: true, horizontalOverflow: false })
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    const responsiveLayout = await setup.locator('.routine-setup-row').first().evaluate((row) => {
      const rowBox = row.getBoundingClientRect()
      const fieldsBox = row.querySelector('.routine-time-fields')!.getBoundingClientRect()
      const inputs = Array.from(row.querySelectorAll<HTMLInputElement>("input[type='time']"))
      return {
        fieldsWithinRow: fieldsBox.left >= rowBox.left && fieldsBox.right <= rowBox.right,
        horizontalOverflow: row.scrollWidth > row.clientWidth,
        inputWidths: inputs.map((input) => input.getBoundingClientRect().width)
      }
    })
    expect(responsiveLayout.fieldsWithinRow).toBe(true)
    expect(responsiveLayout.horizontalOverflow).toBe(false)
    expect(responsiveLayout.inputWidths.every((inputWidth) => inputWidth >= 90)).toBe(true)
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.screenshot({ path: 'outputs/routine-setup-sleep-inline-iphone-se.png' })
  await sleepSwitch.click()
  const disableConfirm = page.getByRole('dialog', { name: '关闭这项作息？' })
  await expect(disableConfirm).toContainText('此前的记录保留')
  await expect(disableConfirm).toContainText('夜间睡眠')
  await disableConfirm.getByRole('button', { name: '关闭作息' }).click()
  await expect(sleepSwitch).toHaveAttribute('aria-checked', 'false')
  await setup.getByRole('switch', { name: '午餐作息' }).click()
  await expect(setup.getByLabel('午餐开始时间')).toHaveValue('')
  await expect(setup.getByLabel('午餐结束时间')).toHaveValue('')
  await setup.getByLabel('午餐开始时间').fill('12:00')
  await setup.getByLabel('午餐结束时间').fill('12:30')
  await page.screenshot({ path: 'outputs/routine-setup-iphone-se.png' })
  await setup.getByRole('button', { name: '保存并执行' }).click()
  await expect(page.getByText('已保存并执行', { exact: true })).toBeVisible()
  await expect(page.getByText('全天时间轴', { exact: true })).toHaveCount(0)
  const lunchTrack = page.locator('.journal-activity-row--routine').filter({ hasText: '午餐' }).first()
  await expect(lunchTrack).toContainText('共30分')
  await page.reload()
  await expect(page.locator('.journal-activity-row--routine').filter({ hasText: '午餐' }).first()).toBeVisible()
  await page.locator('.journal-activity-row--routine').filter({ hasText: '午餐' }).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/routine-grid-track-iphone-se.png' })
  await page.locator('.journal-activity-row--routine').filter({ hasText: '午餐' }).first().click()
  const trackSheet = page.getByRole('dialog', { name: '午餐日常轨迹' })
  await expect(trackSheet.getByRole('button', { name: '按平常记录' })).toBeEnabled()
  await page.screenshot({ path: 'test-results/routine-grid-confirm-sheet-iphone-se.png' })
  await trackSheet.getByRole('button', { name: '按平常记录' }).click()
  await expect(page.getByText('已记录', { exact: true })).toBeVisible()
  const confirmed = page.locator('.journal-activity-row--meal').filter({ hasText: '午餐' })
  await expect(confirmed).toHaveCount(2)
  await expect(confirmed.first()).toBeVisible()
  await expect(page.locator('.journal-activity-row--routine').filter({ hasText: '午餐' })).toHaveCount(0)
  const response = await page.request.get('/api/routines/routine-child?day=2026-09-22', { headers: { Authorization: `Bearer ${token}`, 'X-Hoooho-Timezone': 'Asia/Shanghai' } })
  expect(response.ok()).toBe(true)
  const routineDay = await response.json()
  expect(routineDay.tracks).toHaveLength(1)
  expect(routineDay.tracks[0]).toMatchObject({ itemKey: 'lunch', status: 'confirmed' })
  await page.screenshot({ path: 'test-results/routine-grid-confirmed-iphone-se.png' })

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.journal-timeline-row--empty')).not.toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/routine-grid-confirmed-desktop.png' })
  await page.getByLabel('选择日期').fill('2026-09-21')
  await expect(page.locator('.journal-timeline-row--now')).toHaveCount(0)
  expect((await page.request.delete(`/api/records/${routineDay.tracks[0].recordId}`, { headers: { Authorization: `Bearer ${token}` } })).ok()).toBe(true)
  await page.request.patch('/api/routines/routine-child', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai' }, data: { status: 'disabled' } })
})

test('custom routines save with a stable identity and switches replace the old stop action', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T05:26:00.000Z'))
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page, 'routine-child')
  await page.request.patch('/api/routines/routine-child', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai' },
    data: { effectiveFrom: '2026-09-22', enabled: false, items: {} }
  })
  await page.reload()
  await page.getByRole('button', { name: '调整作息' }).click()
  let setup = page.getByRole('dialog', { name: '设置日常作息' })
  await setup.getByRole('button', { name: '添加其他作息' }).click()
  await setup.getByLabel('其他作息1名称').fill('户外散步')
  await setup.getByLabel('户外散步开始时间').fill('10:00')
  await setup.getByLabel('户外散步结束时间').fill('10:30')
  await page.screenshot({ path: 'outputs/routine-setup-custom-iphone-se.png' })
  await setup.getByRole('button', { name: '保存并执行' }).click()
  await expect(page.getByText('已保存并执行', { exact: true })).toBeVisible()
  const customTrack = page.locator('.journal-activity-row--routine').filter({ hasText: '户外散步' })
  await expect(customTrack.first()).toBeVisible()
  const response = await page.request.get('/api/routines/routine-child?day=2026-09-22', { headers: { Authorization: `Bearer ${token}`, 'X-Hoooho-Timezone': 'Asia/Shanghai' } })
  const routineDay = await response.json()
  expect(routineDay.tracks).toHaveLength(1)
  expect(routineDay.tracks[0]).toMatchObject({ category: 'activity', title: '户外散步', time: '10:00', endTime: '10:30' })

  await page.getByRole('button', { name: '调整作息' }).click()
  setup = page.getByRole('dialog', { name: '设置日常作息' })
  await expect(setup.getByRole('button', { name: '停用日常作息' })).toHaveCount(0)
  await setup.getByRole('switch', { name: '户外散步作息' }).click()
  const disableConfirm = page.getByRole('dialog', { name: '关闭这项作息？' })
  await expect(disableConfirm).toContainText('此前的记录保留')
  await expect(disableConfirm).toContainText('之后的作息将不再延续记录')
  await disableConfirm.getByRole('button', { name: '关闭作息' }).click()
  await setup.getByRole('button', { name: '保存并执行' }).click()
  await expect(page.getByText('已停用日常作息，此前记录已保留', { exact: true })).toBeVisible()
  const disabled = await page.request.get('/api/routines/routine-child?day=2026-09-22', { headers: { Authorization: `Bearer ${token}`, 'X-Hoooho-Timezone': 'Asia/Shanghai' } })
  expect((await disabled.json()).tracks).toHaveLength(0)
})

test('today excludes future routine points and projects one cross-night sleep summary', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T05:04:00.000Z'))
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page, 'child-two')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai' }
  const template = await page.request.patch('/api/routines/child-two', { headers, data: { effectiveFrom: '2026-09-23', enabled: true, items: {
    nightSleep: { enabled: true, time: '21:00', endTime: '08:28' },
    breakfast: { enabled: true, time: '09:30', endTime: '10:00' }, lunch: { enabled: true, time: '12:00', endTime: '12:30' }, dinner: { enabled: true, time: '18:00', endTime: '18:30' }
  } } })
  expect(template.ok()).toBe(true)
  await page.reload()
  await expect(page.locator('.journal-timeline-row--now > time')).toHaveText('现在')
  await expect(page.locator('.journal-activity-row--routine').filter({ hasText: '早餐' }).first()).toBeVisible()
  await expect(page.locator('.journal-activity-row--routine').filter({ hasText: '午餐' }).first()).toBeVisible()
  await expect(page.locator('.journal-activity-row--routine').filter({ hasText: '晚餐' })).toHaveCount(0)
  await expect(page.locator('[data-routine-key*="2026-09-24:nightSleep"]')).toHaveCount(0)
  await expect(page.locator('.journal-activity-row--sleep.journal-activity-row--ongoing')).toHaveCount(9)
  const summary = page.locator('.journal-activity-row--sleep.journal-activity-row--end')
  await expect(summary).toHaveCount(1)
  await expect(summary).toContainText('睡眠· 共11小时28分')
  await expect(summary).not.toContainText('按作息推算')
  await expect(page.locator('.journal-timeline-row[data-time="08:28"]')).toContainText('睡眠· 共11小时28分')
  await page.screenshot({ path: 'test-results/timeline-cross-night-iphone-se.png', fullPage: true })
  await page.request.patch('/api/routines/child-two', { headers, data: { status: 'disabled' } })
})

test('timeline clock recalibrates on the minute and foreground recovery including midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-24T15:59:59.000Z') })
  await prepare(page, 'child-two')
  await expect(page.locator('.journal-timeline-row--now > time')).toHaveText('现在')
  await page.clock.runFor(1100)
  await expect(page.locator('.journal-now-cell')).toHaveAccessibleName('当前时间，00:00:00', { timeout: 2000 })
  await expect(page.locator('.journal-timeline-row--now')).toHaveClass(/journal-timeline-row--now-reset/)
  expect(await page.locator('.journal-now-cell').evaluate((cell) => getComputedStyle(cell, '::before').transitionDuration)).toBe('0s')
  await expect(page.getByLabel('选择日期')).toHaveValue('2026-09-25')
  await page.clock.setFixedTime(new Date('2026-09-25T00:18:00.000Z'))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.journal-now-cell')).toHaveAccessibleName('当前时间，08:18:00')
})

test('current cell uses the whole background as second-level progress without rebuilding or scrolling the list', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-24T05:48:12.000Z') })
  await prepare(page, 'child-two')
  const current = page.locator('.journal-timeline-row--now')
  await expect(current).toHaveCount(1)
  await expect(page.locator('.journal-day-grid > .journal-timeline-row').first()).toHaveClass(/journal-timeline-row--now/)
  await expect(current.locator('.journal-now-cell')).toHaveAccessibleName('当前时间，13:48:12')
  const typography = await current.evaluate((row) => {
    const label = row.querySelector(':scope > time')!
    const cell = row.querySelector<HTMLElement>('.journal-now-cell')!
    const clock = cell.querySelector<HTMLElement>('span')!
    return {
      rowHeight: row.getBoundingClientRect().height,
      cellHeight: cell.getBoundingClientRect().height,
      labelFontSize: getComputedStyle(label).fontSize,
      clockFontSize: getComputedStyle(clock).fontSize,
      clockFontWeight: getComputedStyle(clock).fontWeight,
    }
  })
  expect(typography).toEqual({ rowHeight: 32, cellHeight: 32, labelFontSize: '12px', clockFontSize: '12px', clockFontWeight: '400' })
  expect(await current.locator('.journal-now-cell').evaluate((cell) => Number.parseFloat((cell as HTMLElement).style.getPropertyValue('--journal-now-progress')))).toBeCloseTo(80.333, 2)
  const scroll = page.locator('.journal-scroll-region')
  await scroll.evaluate((element) => { element.scrollTop = 160 })
  const before = await scroll.evaluate((element) => element.scrollTop)
  await page.clock.runFor(1100)
  await expect(current.locator('.journal-now-cell')).toHaveAccessibleName('当前时间，13:48:13')
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(before)
  const progressLayer = await current.locator('.journal-now-cell').evaluate((cell) => ({ children: cell.children.length, fill: getComputedStyle(cell, '::before').backgroundColor }))
  expect(progressLayer.children).toBe(1)
  expect(progressLayer.fill).not.toBe('rgba(0, 0, 0, 0)')
  const dotAnimation = await current.locator('.journal-timeline-marker > span').evaluate((dot) => ({ duration: getComputedStyle(dot).animationDuration, name: getComputedStyle(dot).animationName }))
  expect(dotAnimation.duration).toBe('1s')
  expect(dotAnimation.name).toBe('journal-now-dot-tick')
})

test('one real meal activity projects independent cells, preserves interleaved records, and edits or deletes through the source record', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T12:48:12.000Z'))
  await prepare(page, 'routine-child')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai' }
  const save = async (data: Record<string, unknown>) => {
    const response = await page.request.post('/api/quick-records', { headers, data })
    expect(response.ok()).toBe(true)
    return (await response.json()).recordId as string
  }
  const activityId = await save({ memberId: 'routine-child', content: '正餐 · 晚餐\n米饭、青菜 · 吃完', occurredAt: '2026-09-24T09:20:00.000Z', inputChannel: 'text', idempotencyKey: 'meal-interval-source', title: '晚餐', journal: { categories: ['diet'], occurredAt: '2026-09-24T09:20:00.000Z', timePrecision: 'exact', diet: { kind: 'meal', meal: '晚餐', foods: ['米饭', '青菜'], amount: '吃完', appetite: '和平时差不多', reactions: [], startedAt: '2026-09-24T09:20:00.000Z', endedAt: '2026-09-24T10:40:00.000Z' } } })
  const noteId = await save({ memberId: 'routine-child', content: '翻身', occurredAt: '2026-09-24T10:10:00.000Z', inputChannel: 'text', idempotencyKey: 'meal-interval-note', title: '备注 · 翻身', journal: { categories: ['other'], occurredAt: '2026-09-24T10:10:00.000Z', timePrecision: 'exact' } })
  const currentHourNoteId = await save({ memberId: 'routine-child', content: '本小时记录', occurredAt: '2026-09-24T12:42:00.000Z', inputChannel: 'text', idempotencyKey: 'current-hour-note', title: '备注 · 本小时记录', journal: { categories: ['other'], occurredAt: '2026-09-24T12:42:00.000Z', timePrecision: 'exact' } })
  const separateMealId = await save({ memberId: 'routine-child', content: '正餐 · 晚餐\n水果 · 少量', occurredAt: '2026-09-24T09:50:00.000Z', inputChannel: 'text', idempotencyKey: 'meal-point-separate', title: '晚餐', journal: { categories: ['diet'], occurredAt: '2026-09-24T09:50:00.000Z', timePrecision: 'exact', diet: { kind: 'meal', meal: '晚餐', foods: ['水果'], amount: '少量', appetite: '比平时少', reactions: [] } } })
  await page.reload()
  const fragments = page.locator(`.journal-activity-row[data-record-id="${activityId}"]`)
  await expect(fragments).toHaveCount(3)
  await expect(page.locator('.journal-timeline-row[data-time="17:20"]')).toContainText('晚餐· 开始')
  await expect(page.locator('.journal-timeline-row[data-time="18:00"]')).toContainText('晚餐· 持续')
  await expect(page.locator('.journal-timeline-row[data-time="18:40"]')).toContainText('晚餐· 共1小时20分')
  await expect(page.locator('.journal-timeline-row[data-time="18:10"]')).toContainText('翻身')
  await expect(page.locator(`.journal-record[data-record-id="${separateMealId}"]`)).toHaveCount(1)
  await expect(page.locator('.journal-now-cell')).toHaveAccessibleName('当前时间，20:48:12')
  await expect(page.locator('.journal-timeline-row--now')).toHaveAttribute('data-time', 'now')
  const currentHourOrder = await page.locator('.journal-day-grid > .journal-timeline-row').evaluateAll((rows, recordId) => ({ current: rows.findIndex((row) => row.classList.contains('journal-timeline-row--now')), recent: rows.findIndex((row) => row.querySelector(`[data-record-id="${recordId}"]`)), hour: rows.findIndex((row) => (row as HTMLElement).dataset.time === '20:00') }), currentHourNoteId)
  expect(currentHourOrder.recent).toBeGreaterThanOrEqual(0)
  expect(currentHourOrder.current).toBeLessThan(currentHourOrder.recent)
  expect(currentHourOrder.recent).toBeLessThan(currentHourOrder.hour)
  expect(await page.locator('.journal-now-cell').evaluate((cell) => ({ oneLine: cell.scrollHeight <= cell.clientHeight + 1, visibleText: cell.scrollWidth <= cell.clientWidth + 1 }))).toEqual({ oneLine: true, visibleText: true })
  await page.getByRole('button', { name: /记录顺序/ }).click()
  await expect(page.locator('.journal-day-grid > .journal-timeline-row').last()).toHaveClass(/journal-timeline-row--now/)
  await expect(page.locator('.journal-timeline-row--now')).toHaveCount(1)
  await page.getByRole('button', { name: /记录顺序/ }).click()
  await expect(page.locator('.journal-day-grid > .journal-timeline-row').first()).toHaveClass(/journal-timeline-row--now/)
  await page.screenshot({ path: 'outputs/health-events-timeline-iphone-se.png', fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'outputs/health-events-timeline-desktop.png', fullPage: false })
  await page.setViewportSize({ width: 320, height: 568 })
  await fragments.first().click()
  const detail = page.getByRole('dialog', { name: '晚餐记录详情' })
  await detail.getByRole('button', { name: '修改起止时间' }).click()
  await detail.getByLabel('晚餐开始时间').fill('2026-09-24T17:30')
  await detail.getByLabel('晚餐结束时间').fill('2026-09-24T18:50')
  await detail.getByRole('button', { name: '保存时间' }).click()
  await expect(detail).toHaveCount(0)
  await expect(page.locator(`.journal-activity-row[data-record-id="${activityId}"]`)).toHaveCount(3)
  await expect(page.locator('.journal-timeline-row[data-time="17:30"]')).toContainText('晚餐· 开始')
  await expect(page.locator('.journal-timeline-row[data-time="18:50"]')).toContainText('晚餐· 共1小时20分')
  await page.locator(`.journal-activity-row[data-record-id="${activityId}"]`).first().click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('dialog', { name: '晚餐记录详情' }).getByRole('button', { name: '删除这条记录' }).click()
  await expect(page.locator(`.journal-activity-row[data-record-id="${activityId}"]`)).toHaveCount(0)
  await expect(page.locator(`.journal-record[data-record-id="${separateMealId}"]`)).toHaveCount(1)
  expect((await page.request.delete(`/api/records/${noteId}`, { headers })).ok()).toBe(true)
  expect((await page.request.delete(`/api/records/${separateMealId}`, { headers })).ok()).toBe(true)
})

test('dense hours keep every record expanded inside one growing hour cell', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T05:26:00.000Z'))
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page, 'routine-child')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai' }
  const template = await page.request.patch('/api/routines/routine-child', { headers, data: { effectiveFrom: '2026-09-22', enabled: true, items: { breakfast: { enabled: true, time: '06:30', endTime: '06:50' } } } })
  expect(template.ok()).toBe(true)
  const denseRecords = [
    ['05', '清晨喝了少量温水', 'diet'],
    ['15', '清晨排便一次', 'elimination'],
    ['25', '清晨测量体温', 'measurement'],
    ['35', '清晨服用日常药物', 'medication'],
    ['45', '清晨在小区散步', 'activity']
  ] as const
  const createdRecordIds: string[] = []
  for (const [index, [minute, content, category]] of denseRecords.entries()) {
    const occurredAt = `2026-09-22T06:${minute}:00+08:00`
    const saved = await page.request.post('/api/quick-records', { headers, data: { memberId: 'routine-child', content, occurredAt, inputChannel: 'text', idempotencyKey: `dense-hour-${index}`, title: content, journal: { categories: [category], occurredAt, timePrecision: 'exact' } } })
    expect(saved.ok()).toBe(true)
    createdRecordIds.push((await saved.json()).recordId)
  }
  await page.reload()
  const hour = page.locator('.journal-timeline-row[data-hour="6"]')
  await expect(hour).toHaveCount(8)
  expect(await hour.evaluateAll((nodes) => nodes.every((node) => node.getBoundingClientRect().height <= 50))).toBe(true)
  await expect(hour.getByRole('button', { name: /还有 \d+ 条/ })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '这个小时的全部内容' })).toHaveCount(0)
  await expect(hour.locator('.journal-record')).toHaveCount(5)
  await expect(hour.locator('.journal-activity-row--routine')).toHaveCount(2)
  await expect(hour.locator(':scope > time')).toHaveText(['06:50', '06:45', '06:35', '06:30', '06:25', '06:15', '06:05', '06:00'])
  expect(await hour.evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).overflowY !== 'scroll'))).toBe(true)
  await page.screenshot({ path: 'test-results/routine-grid-dense-hour-iphone-se.png' })
  for (const recordId of createdRecordIds) expect((await page.request.delete(`/api/records/${recordId}`, { headers })).ok()).toBe(true)
  await page.request.patch('/api/routines/routine-child', { headers, data: { status: 'disabled' } })
})

test('trigger card switches to English without mixed-language copy or overflow', async ({ page }) => {
  await prepare(page, 'child-two')
  await page.evaluate(() => document.documentElement.lang = 'en')
  const card = page.locator('.trigger-opportunity-card')
  const illustration = card.locator('.trigger-opportunity-illustration img')
  const cardId = await card.getAttribute('data-card-id')
  if (cardId?.startsWith('sleep')) await expect(illustration).toBeHidden()
  else await expect.poll(() => illustration.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await expect(card).toContainText(/Late night|Morning|Midday|Evening|Record gap|Daytime/)
  await expect(card).not.toContainText(/记录|睡眠|排便|活动/)
  const layout = await card.evaluate((node) => ({ pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth, optionsWrap: [...node.querySelectorAll('.trigger-opportunity-options button')].every((button) => button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight + 20) }))
  expect(layout.pageOverflows).toBe(false)
  expect(layout.optionsWrap).toBe(true)
  await page.screenshot({ path: 'test-results/journal-trigger-card-en-iphone-se.png' })
  await card.locator('.trigger-opportunity-action').scrollIntoViewIfNeeded()
})

test('00:15 sleep option opens the existing flow with scoped prefill and dismissal persists', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-12T16:15:00.000Z'))
  await prepare(page, 'child-two')
  const card = page.locator('.trigger-opportunity-card')
  await expect(card).toContainText('今晚入睡顺利吗？')
  await expect(card).not.toContainText('昨晚')
  await card.getByRole('button', { name: '已经睡着', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '记录睡眠' })).toBeVisible()
  const suggestion = await page.evaluate(() => JSON.parse(sessionStorage.getItem('hoooho:journal-suggestion') ?? '{}'))
  expect(suggestion).toMatchObject({ accountId:'time-view-test-account',memberId:'child-two',cardId:'sleep-late',prefill:{status:'ongoing'} })
  await page.reload()
  await page.getByRole('button', { name: '暂时关闭此提醒' }).click()
  await page.reload()
  await expect(page.locator('[data-card-id="sleep-late"]')).toHaveCount(0)
})

test('sleep prompt starts one persistent session, restores after reload and ends it', async ({ page }) => {
  await prepare(page, 'child-two')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('hoooho:timeline-prompt', { detail: { target: 'sleep', mode: 'start' } })))
  await expect(page.getByRole('dialog', { name: '记录睡眠' })).toContainText('准备睡觉')
  await page.getByRole('button', { name: '开始睡眠' }).click()
  const activeSleep = page.locator('.journal-activity-row--sleep:not(.journal-activity-row--routine)').first()
  await expect(activeSleep).toBeVisible()
  await page.reload()
  await expect(activeSleep).toBeVisible()
  await activeSleep.click()
  const detail = page.getByRole('dialog', { name: '正在记录睡眠' })
  await detail.getByRole('button', { name: '结束睡眠' }).click()
  await expect(detail).toHaveCount(0)
  await expect(page.locator('.journal-activity-row--sleep.journal-activity-row--end:not(.journal-activity-row--routine)')).toBeVisible()
})

test('records in the same minute share one hour cell with aligned times and no overlap', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T05:26:00.000Z'))
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page, 'routine-child')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Timezone': 'Asia/Shanghai' }
  const ids: string[] = []
  const sameMinuteRecords = [['同分钟吃了早餐', 'diet'], ['同分钟排便一次', 'elimination'], ['同分钟户外散步', 'activity']] as const
  for (const [index, [content, category]] of sameMinuteRecords.entries()) {
    const occurredAt = '2026-09-22T10:15:00+08:00'
    const response = await page.request.post('/api/quick-records', { headers, data: { memberId: 'routine-child', content, occurredAt, inputChannel: 'text', idempotencyKey: `same-minute-group-${index}`, title: content, journal: { categories: [category], occurredAt, timePrecision: 'exact' } } })
    expect(response.ok()).toBe(true)
    ids.push((await response.json()).recordId)
  }
  await page.reload()
  const group = page.locator('.journal-timeline-row[data-hour="10"][data-time="10:15"]')
  await expect(group).toHaveCount(3)
  for (const [content] of sameMinuteRecords) await expect(page.getByText(content, { exact: true })).toBeVisible()
  const cards = await group.locator('.journal-record').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map((box) => ({ top: box.top, bottom: box.bottom })))
  expect(cards[0].bottom).toBeLessThanOrEqual(cards[1].top)
  expect(cards[1].bottom).toBeLessThanOrEqual(cards[2].top)
  for (const id of ids) expect((await page.request.delete(`/api/records/${id}`, { headers })).ok()).toBe(true)
})

test('a historical symptom save switches to its occurrence day and highlights the real saved record', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page, 'child-two')
  const historical = await page.evaluate(() => { const date = new Date(); date.setDate(date.getDate() - 2); date.setHours(10, 15, 0, 0); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); return { input: local, day: local.slice(0, 10) } })
  await page.getByLabel('选择日期').fill(historical.day)
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByLabel('主要症状').fill('历史补录定位验收')
  await expect(form.getByRole('textbox', { name: '发生时间' })).toHaveValue(new RegExp(`^${historical.day}T`))
  await form.getByRole('textbox', { name: '发生时间' }).fill(historical.input)
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByLabel('选择日期')).toHaveValue(historical.day)
  const highlighted = page.locator('.journal-grid-record--highlighted').filter({ hasText: '历史补录定位验收' })
  await expect(highlighted).toBeVisible()
  const recordId = await highlighted.getAttribute('data-record-id')
  expect(recordId).toBeTruthy()
  expect((await page.request.delete(`/api/records/${recordId}`, { headers: { Authorization: `Bearer ${token}` } })).ok()).toBe(true)
})

test('specified occurrence stays fixed while editing and rejects a future time beside the field', async ({ page }) => {
  await prepare(page, 'child-two')
  await openSymptom(page)
  const form = page.getByRole('dialog', { name: '记录症状' })
  await form.getByLabel('主要症状').fill('指定时间校验记录')
  const values = await page.evaluate(() => {
    const format = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    return { future: format(new Date(Date.now() + 10 * 60_000)), past: format(new Date(Date.now() - 10 * 60_000)) }
  })
  const input = form.getByRole('textbox', { name: '发生时间' })
  await input.fill(values.future)
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(form.getByText('发生时间不能晚于现在', { exact: true })).toBeVisible()
  await expect(form.getByLabel('主要症状')).toHaveValue('指定时间校验记录')
  await expect(input).toHaveValue(values.future)
  await input.fill(values.past)
  await form.getByLabel('症状部位').fill('手臂')
  await expect(input).toHaveValue(values.past)
})

test('abnormal ongoing sleep keeps the original record and can be corrected to a valid interval', async ({ page }) => {
  await prepare(page)
  const sleepAt = new Date(Date.now() - 26 * 60 * 60_000).toISOString()
  const created = await page.request.post('/api/quick-records', { headers: { Authorization: `Bearer ${token}` }, data: {
    memberId: 'child-one', content: '夜间睡眠 · 已开始', occurredAt: sleepAt, inputChannel: 'text', idempotencyKey: 'abnormal-sleep-correction', title: '睡眠记录',
    journal: { categories: ['sleep'], occurredAt: sleepAt, timePrecision: 'exact', sleep: { kind: 'night', sleepAt, status: 'ongoing' } }
  } })
  expect(created.status()).toBe(201)
  await page.reload()
  await expect(page.locator('.journal-activity-row--open')).toHaveCount(0)
  const sleepDay = await page.evaluate((value) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }, sleepAt)
  await page.getByLabel('选择日期').fill(sleepDay)
  const ongoing = page.locator('.journal-activity-row--sleep.journal-activity-row--open')
  await expect(ongoing).toContainText('睡眠· 开始')
  await expect(ongoing).not.toContainText('核对时间')
  await expect(ongoing).not.toContainText('26小时')
  await ongoing.click()
  const detail = page.getByRole('dialog', { name: '睡眠时间未补全' })
  await expect(detail).toContainText('原始开始时间')
  await detail.getByRole('button', { name: '核对时间' }).click()
  await expect(detail.getByLabel('实际结束时间')).toHaveValue('')
  await expect(detail.getByText('请填写实际结束时间。', { exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: '确认并结束睡眠' })).toBeDisabled()
  const values = await page.evaluate(() => {
    const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    return { start: local(new Date(Date.now() - 2 * 60 * 60_000)), end: local(new Date(Date.now() - 60 * 60_000)) }
  })
  await detail.getByLabel('实际开始时间').fill(values.start)
  await detail.getByLabel('实际结束时间').fill(values.end)
  await page.screenshot({ path: 'test-results/abnormal-sleep-correction-iphone-se.png' })
  await page.route('**/api/records/*/sleep/end', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '结束睡眠失败，请重试' } }) }), { times: 1 })
  await detail.getByRole('button', { name: '确认并结束睡眠' }).click()
  await expect(detail.getByRole('alert')).toHaveText('结束睡眠失败，请重试')
  await expect(detail.getByLabel('实际开始时间')).toHaveValue(values.start)
  await expect(detail.getByLabel('实际结束时间')).toHaveValue(values.end)
  await detail.getByRole('button', { name: '确认并结束睡眠' }).click()
  await expect(page.locator('.journal-grid-record--ongoing')).toHaveCount(0)
})

test('health journal removes the footer quick-record control and keeps timeline tools borderless', async ({ page }) => {
  await prepare(page)
  const manual = page.getByRole('button', { name: '记一下', exact: true })
  await expect(manual).toHaveCSS('background-color', 'rgb(27, 122, 110)')
  await expect(manual).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.getByRole('button', { name: '快捷记录', exact: true })).toHaveCount(0)
  for (const tool of [page.getByRole('button', { name: '搜索健康随记', exact: true }), page.getByRole('button', { name: /^记录顺序：/ }), page.getByRole('button', { name: '调整作息', exact: true })]) {
    await expect(tool).toHaveCSS('border-top-width', '0px')
    await expect(tool).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
})

test('symptom record button is centered, compact, and fills the footer', async ({ page }) => {
  await prepare(page)
  const button = page.getByRole('button', { name: '记一下', exact: true })
  await expect(button).not.toContainText('手动记录')
  await expect(button.locator('.journal-manual-record-action__label')).toHaveText('记一下')
  await expect(button.locator('.journal-manual-record-action__prompt-window')).toHaveCount(0)

  const layout = await button.evaluate((element) => {
    const visual = element.querySelector('.journal-manual-record-action__label')!.getBoundingClientRect()
    const buttonBox = element.getBoundingClientRect()
    const footerBox = element.closest('.journal-record-actions')!.querySelector(':scope > div')!.getBoundingClientRect()
    return {
      visuallyCentered: Math.abs((visual.left + visual.width / 2) - (buttonBox.left + buttonBox.width / 2)) < 1,
      buttonHeight: buttonBox.height,
      fillsFooter: Math.abs(buttonBox.width - footerBox.width) < 1,
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(layout).toEqual({ visuallyCentered: true, buttonHeight: 52, fillsFooter: true, pageOverflows: false })
  await page.screenshot({ path: 'test-results/manual-record-concise-iphone-se.png' })

  await button.click()
  const hub = page.getByRole('dialog', { name: '记一下' })
  await expect(hub.locator('.journal-entry-hub__item')).toHaveText(['记录症状', '记录日常', '记录就医', '记录用药'])
  await expect(hub.locator('.journal-entry-hub__image')).toHaveCount(4)
  expect(await hub.locator('.journal-entry-hub__image').evaluateAll((images) => images.every((image) => image.getAttribute('aria-hidden') === 'true'))).toBe(true)
  await hub.evaluate((sheet) => Promise.all(sheet.getAnimations().map((animation) => animation.finished)))
  await page.screenshot({ path: 'test-results/manual-record-image-cards-iphone-se.png' })
})

test('record entry image cards stay in a two-column grid without viewport overflow', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 667 }, { width: 430, height: 667 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport)
    await prepare(page)
    await page.getByRole('button', { name: '记一下', exact: true }).click()
    const hub = page.getByRole('dialog', { name: '记一下' })
    await expect(hub).toBeVisible()
    await expect(hub.locator('.journal-entry-hub__image')).toHaveCount(4)
    await hub.evaluate((sheet) => Promise.all(sheet.getAnimations().map((animation) => animation.finished)))
    const layout = await hub.evaluate((sheet) => {
      const cards = [...sheet.querySelectorAll<HTMLElement>('.journal-entry-hub__item')].map((card) => card.getBoundingClientRect())
      const imagesLoaded = [...sheet.querySelectorAll<HTMLImageElement>('.journal-entry-hub__image')].every((image) => image.complete && image.naturalWidth === 512 && image.naturalHeight === 512)
      const sheetBox = sheet.getBoundingClientRect()
      return {
        imagesLoaded,
        twoColumns: cards.length === 4 && Math.abs(cards[0].left - cards[2].left) < 1 && Math.abs(cards[1].left - cards[3].left) < 1,
        noOverlap: cards.length === 4 && cards[0].bottom <= cards[2].top && cards[1].bottom <= cards[3].top,
        insideViewport: sheetBox.left >= -1 && sheetBox.right <= window.innerWidth + 1 && sheetBox.top >= -1 && sheetBox.bottom <= window.innerHeight + 1,
        pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    expect(layout).toEqual({ imagesLoaded: true, twoColumns: true, noOverlap: true, insideViewport: true, pageOverflows: false })
    await hub.getByRole('button', { name: '关闭记一下' }).click()
  }
})

test('symptom record footer stays full width at the required mobile widths', async ({ page }) => {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    await prepare(page)
    const layout = await page.locator('.journal-record-actions > div').evaluate((footer) => {
      const manual = footer.querySelector('.journal-manual-record-action')!.getBoundingClientRect()
      const label = footer.querySelector('.journal-manual-record-action__label')!.getBoundingClientRect()
      const footerBox = footer.getBoundingClientRect()
      return {
        fullWidth: Math.abs(manual.width - footerBox.width) < 1,
        labelVisible: label.width > 0,
        pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    expect(layout).toEqual({ fullWidth: true, labelVisible: true, pageOverflows: false })
  }
})

test('health journal medical prep uses a centered title and report icon', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page)
  const button = page.getByRole('button', { name: '就诊情况单，孩子情况快速整理', exact: true })
  await expect(button).toBeEnabled()
  await expect(button.locator('.lucide-clipboard-list')).toBeVisible()
  await expect(button.locator('.medical-prep-button__dot')).toHaveCount(0)
  const layout = await button.evaluate((element) => {
    const icon = element.querySelector('.medical-prep-button__icon')!.getBoundingClientRect()
    const content = element.querySelector('.hoho-button__content')!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    return {
      buttonHeight: box.height,
      buttonWidth: box.width,
      iconWidth: icon.width,
      iconHeight: icon.height,
      contentCentered: Math.abs((content.left + content.width / 2) - (box.left + box.width / 2)) < 1,
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(layout).toEqual({ buttonHeight: 50, buttonWidth: 140, iconWidth: 24, iconHeight: 24, contentCentered: true, pageOverflows: false })
  await page.screenshot({ path: 'test-results/medical-prep-report-iphone-se.png' })
})

test('medical prep keeps its established desktop dimensions and stable label', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await prepare(page)
  const button = page.getByRole('button', { name: '就诊情况单，孩子情况快速整理', exact: true })
  await expect(button).toHaveCSS('height', '50px')
  await expect(button.locator('.medical-prep-button__label strong')).toHaveText('就诊情况单')
  await expect(button.locator('.medical-prep-button__label small')).toHaveText('孩子情况快速整理')
  expect(await button.evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true)
})

test('nurse station uses the same centered report icon', async ({ page }) => {
  await prepare(page)
  await page.goto('/nurse-station')
  const button = page.getByRole('button', { name: '就诊情况单', exact: true })
  await expect(button).toBeVisible()
  await expect(button.locator('.lucide-clipboard-list')).toBeVisible()
  await expect(button.locator('.medical-prep-button__icon')).toHaveCSS('width', '40px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.screenshot({ path: 'outputs/medical-prep-nurse-station-iphone-se.png' })
})

test('single-day timeline keeps the frozen top controls, unified hour cells and stable sort order', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hoooho:journal-layout', 'thumbnail'))
  await prepare(page)
  await expect(page.getByText('记录发生了什么', { exact: true })).toHaveCount(0)
  await expect(page.getByText('当前记录对象', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '后一天', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '搜索健康随记' })).toBeVisible()
  await expect(page.getByRole('button', { name: /缩略图视图/ })).toHaveCount(0)
  await expect(page.locator('.journal-time-view')).toHaveAttribute('data-layout-mode', 'list')
  expect(await page.evaluate(() => sessionStorage.getItem('hoooho:journal-layout'))).toBeNull()
  await expect(page.getByRole('button', { name: '筛选健康随身记' })).toHaveCount(0)
  await expect(page.getByText(`${new Date().getFullYear()}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '昨天', exact: true })).toHaveCount(0)
  await expect(page.locator('.journal-day-picker')).not.toContainText('今天 ·')
  const navigationLayout = await page.locator('.journal-date-navigation').evaluate((navigation) => {
    const controls = [...navigation.querySelectorAll(':scope > label, :scope > .journal-yesterday-entry, :scope > button')].map((element) => element.getBoundingClientRect())
    const search = navigation.querySelector('[aria-label="搜索健康随记"]')!.getBoundingClientRect()
    const sort = navigation.querySelector('[aria-label^="记录顺序："]')!.getBoundingClientRect()
    const settings = navigation.querySelector('[aria-label="调整作息"]')!.getBoundingClientRect()
    const box = navigation.getBoundingClientRect()
    const date = navigation.querySelector('.journal-day-picker > span')!
    const dateBox = date.getBoundingClientRect()
    const previous = navigation.querySelector('[aria-label="前一天"]')!.getBoundingClientRect()
    const next = navigation.querySelector('[aria-label="后一天"]')!.getBoundingClientRect()
    return { height: box.height, sameRow: controls.every((item) => item.top >= box.top && item.bottom <= box.bottom), ordered: search.right <= sort.left && sort.right <= settings.left, searchTarget: { width: search.width, height: search.height }, dateFits: dateBox.left >= previous.right && dateBox.right <= next.left, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
  })
  expect(navigationLayout).toEqual({ height: 50, sameRow: true, ordered: true, searchTarget: { width: 34, height: 44 }, dateFits: true, pageOverflow: false })
  await page.getByLabel('选择年月').fill('2025-12')
  await expect(page.getByText('2025', { exact: true })).toBeVisible()
  await page.getByLabel('选择日期').fill(await page.evaluate(() => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }))
  await expect(page.locator('.journal-day-picker')).not.toContainText('今天 ·')
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect(page.locator('.journal-day-picker')).not.toContainText('昨天 ·')
  expect(await page.locator('.journal-day-picker > span').evaluate((date) => date.getBoundingClientRect().right <= document.querySelector('[aria-label="后一天"]')!.getBoundingClientRect().left)).toBe(true)
  await expect.poll(() => page.locator('.journal-record').count()).toBeGreaterThanOrEqual(9)
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('时间未明确', { exact: true })).toHaveCount(0)
  expect(await page.locator('.journal-record-content').first().evaluate((element) => ({ whiteSpace: getComputedStyle(element).whiteSpace, oneLine: element.scrollHeight <= element.clientHeight + 1 }))).toEqual({ whiteSpace: 'nowrap', oneLine: true })
  expect(await page.locator('.journal-record').first().evaluate((record) => {
    const icon = record.querySelector('.journal-record-main > svg')!.getBoundingClientRect()
    const summary = record.querySelector('.journal-record-summary')!.getBoundingClientRect()
    return { summaryAfterIcon: summary.left >= icon.right }
  })).toEqual({ summaryAfterIcon: true })
  expect(await page.locator('.journal-record-summary').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12)
  const morning = page.locator('.journal-timeline-row[data-hour="9"]')
  await expect(morning.locator('.journal-record')).toHaveCount(3)
  await expect(morning.locator(':scope > time')).toHaveText(['09:45', '09:30', '09:10', '09:00'])
  await expect(page.getByRole('button', { name: /还有 \d+ 条/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^记录顺序：/ }).click()
  await expect(page.getByRole('button', { name: /^记录顺序：/ }).locator('.lucide-arrow-up-down')).toBeVisible()
  await expect(page.locator('.journal-timeline-row[data-hour="9"] > time')).toHaveText(['09:00', '09:10', '09:30', '09:45'])
  await expect(page.getByText('隔离对象专属记录')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/time-view-iphone-se.png' })
  const subjectBox = await page.locator('.journal-subject-card').boundingBox()
  const summaryBox = await page.getByRole('button', { name: '就诊情况单，孩子情况快速整理', exact: true }).boundingBox()
  expect(subjectBox!.height).toBe(summaryBox!.height)
  const manualBox = await page.getByRole('button', { name: '记一下', exact: true }).boundingBox()
  const footerBox = await page.locator('.journal-record-actions > div').boundingBox()
  expect(manualBox!.width).toBe(footerBox!.width)
  expect(manualBox!.height).toBe(52)
  await expect(page.getByRole('button', { name: '快捷记录', exact: true })).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect(page.getByRole('button', { name: '记一下', exact: true })).toHaveAttribute('data-variant', 'secondary')
  await expect(page.getByRole('button', { name: '就诊情况单，孩子情况快速整理', exact: true })).toHaveAttribute('data-variant', 'primary')
  const subjectBackground = await page.locator('.journal-subject-card').evaluate((element) => getComputedStyle(element).backgroundColor)
  const summaryBackground = await page.getByRole('button', { name: '就诊情况单，孩子情况快速整理', exact: true }).evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(summaryBackground).not.toBe(subjectBackground)
})

test('journal search stays minimal, scopes results, highlights matches, and preserves state around details', async ({ page }) => {
  await prepare(page)
  const list = page.locator('.journal-scroll-region')
  await page.getByRole('button', { name: '前一天' }).click()
  await expect.poll(() => page.locator('.journal-record').count()).toBeGreaterThanOrEqual(9)
  await list.evaluate((element) => { element.scrollTop = Math.min(20, element.scrollHeight - element.clientHeight) })
  const originalScrollTop = await list.evaluate((element) => element.scrollTop)
  expect(originalScrollTop).toBeGreaterThan(0)
  await page.getByRole('button', { name: '搜索健康随记' }).click()
  await expect(page).toHaveURL(/\/health-events\/search$/)
  const savedScrollTop = await page.evaluate(() => window.history.state?.usr?.journalReturn?.scrollTop as number)
  expect(savedScrollTop).toBeGreaterThan(0)
  const input = page.getByRole('searchbox', { name: '搜索健康随身记' })
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('placeholder', '输入名称，即可查看发生时间')
  await expect(input).toHaveCSS('font-size', '13px')
  await expect(input).toHaveCSS('color', 'rgb(82, 105, 102)')
  await expect(page.getByText('查找随记中发生过的情况', { exact: true })).toHaveCount(0)
  await expect(page.getByText('最近搜索', { exact: true })).toHaveCount(0)
  await expect(page.locator('.journal-search-body')).toBeEmpty()

  await input.fill('  医嘱  ')
  await expect(page.getByText('找到 1 条相关随记', { exact: true })).toBeVisible()
  await expect(page.locator('.journal-search-summary')).toContainText('最早')
  await expect(page.locator('.journal-search-summary')).toContainText('最近')
  const result = page.locator('.journal-search-result')
  await expect(result).toHaveCount(1)
  await expect(result).toContainText('按医嘱服用了药')
  await expect(result.locator('mark')).toHaveText('医嘱')
  await expect(page.getByText('隔离对象专属记录')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/journal-search-results-iphone-se.png' })
  await result.click()
  await expect(page.getByRole('dialog', { name: '记录详情' })).toBeVisible()
  await page.getByRole('dialog', { name: '记录详情' }).getByRole('button', { name: '关闭记录详情' }).click({ force: true })
  await expect(input).toHaveValue('  医嘱  ')
  await expect(result).toHaveCount(1)

  await page.getByRole('button', { name: '清除搜索' }).click()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('')
  await expect(page.locator('.journal-search-body')).toBeEmpty()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page).toHaveURL(/\/health-events$/)
  await expect(page.getByRole('button', { name: '搜索健康随记' })).toBeVisible()
  await expect(page.locator('.journal-day-picker')).not.toContainText('昨天 ·')
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(savedScrollTop)
  await page.screenshot({ path: 'test-results/journal-search-return-iphone-se.png' })
})

test('journal row opens record details over the list without visiting symptom tracking', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await page.locator('.journal-record').first().click()
  const detail = page.getByRole('dialog', { name: '症状记录详情' })
  await expect(detail).toBeVisible()
  await expect(page.getByRole('heading', { name: '健康随记', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '症状跟踪', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/health-events$/)
  await detail.getByRole('button', { name: '关闭症状记录详情' }).click()
  await expect(detail).toHaveCount(0)
  await expect.poll(() => page.locator('.journal-record').count()).toBeGreaterThanOrEqual(9)

  await page.goto('/health-events/event-one?recordId=record-0')
  await expect(page).toHaveURL(/\/health-events\?eventId=event-one&recordId=record-0$/)
  await expect(page.getByRole('dialog', { name: '症状记录详情' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '健康随记', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '症状跟踪', exact: true })).toHaveCount(0)
})

test('manual category cards navigate directly without a start action', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  const hub = page.getByRole('dialog', { name: '记一下' })
  await expect(hub.locator('.journal-entry-hub__item')).toHaveText(['记录症状', '记录日常', '记录就医', '记录用药'])
  await expect(page.getByText('先记下来，不用一次性记完，想到时继续补充', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(情绪|社交|测量|生长发育|接触环境|检查报告|其他)$/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '经历与环境' })).toHaveCount(0)
  await hub.getByRole('button', { name: '记录日常' }).click()
  const daily = page.getByRole('dialog', { name: '记录日常' })
  await expect(daily.locator('.journal-entry-hub__item')).toHaveCount(4)
  await expect(daily.locator('.journal-entry-hub__image')).toHaveCount(4)
  expect(await daily.locator('.journal-entry-hub__image').evaluateAll((images) => images.every((image) => {
    const asset = image as HTMLImageElement
    return asset.complete && asset.naturalWidth === 640 && asset.naturalHeight === 640 && asset.getAttribute('aria-hidden') === 'true'
  }))).toBe(true)
  await expect(page.getByRole('button', { name: '意外受伤', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '护理干预', exact: true })).toHaveCount(0)
  const diet = daily.getByRole('button', { name: '喂养/饮食', exact: true })
  await expect(diet.locator('.journal-entry-hub__image')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始记录', exact: true })).toHaveCount(0)
  await daily.evaluate((sheet) => Promise.all(sheet.getAnimations().map((animation) => animation.finished)))
  await page.screenshot({ path: 'test-results/daily-record-image-cards-iphone-se.png' })
  await diet.click()
  await expect(page.getByRole('heading', { name: '记录喂养/饮食', exact: true })).toBeVisible()
})

test('visit form keeps allergy departments and removes redundant result fields', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page)
  await openVisit(page)
  const form = page.getByRole('dialog', { name: '记录就医' })
  const departments = form.locator('.visit-department-grid').first().getByRole('button')
  await expect(departments).toHaveText(['变态反应科', '儿科', '儿童皮肤科', '儿童呼吸科', '儿童消化科', '儿童耳鼻喉科', '儿童眼科', '其他', '不清楚'])
  await expect(form.getByLabel('医生姓名（选填）')).toHaveCount(0)
  await form.getByRole('button', { name: /就医结果与资料/ }).click()
  await expect(form.getByRole('button', { name: '拍病历或处方', exact: true })).toBeVisible()
  await expect(form.getByRole('button', { name: '从相册选择', exact: true })).toHaveCount(0)
  await expect(form.getByText('医生怎么说？（医嘱）', { exact: true })).toBeVisible()
  await expect(form.getByText('备注（选填）', { exact: true })).toHaveCount(0)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.screenshot({ path: 'test-results/visit-record-allergy-iphone-se.png', fullPage: true })
})

test('bowel record is one continuous form, restores its member draft and saves real structured data', async ({ page }) => {
  await prepare(page)
  await openDaily(page)
  const entrySheet = page.getByRole('dialog', { name: '记录日常' })
  const entryLayout = await entrySheet.evaluate((sheet) => {
    const body = sheet.querySelector('.hoho-bottom-sheet__body') as HTMLElement
    return { sheetFits: sheet.scrollHeight <= sheet.clientHeight + 1, bodyFits: body.scrollHeight <= body.clientHeight + 1, overflowY: getComputedStyle(body).overflowY }
  })
  expect(entryLayout).toEqual({ sheetFits: true, bodyFits: true, overflowY: 'auto' })
  await entrySheet.getByRole('button', { name: '排便', exact: true }).click()
  await expect(page.getByRole('heading', { name: '记录排便', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '记录排便' })).toHaveCount(1)
  await expect(page.getByText(/排便类型|布里斯托|正常|异常/)).toHaveCount(0)
  await page.getByRole('group', { name: '形状 （可多选）' }).getByRole('button', { name: '光滑条状' }).click()
  await page.getByRole('group', { name: '形状 （可多选）' }).getByRole('button', { name: '糊状' }).click()
  await page.getByRole('group', { name: '颜色' }).getByRole('button', { name: '黄褐' }).click()
  await page.getByRole('slider', { name: '分量' }).fill('2')
  await expect(page.getByRole('group', { name: '分量' }).locator('output')).toHaveText('一般')
  await page.getByRole('slider', { name: '排便大约用了多久？' }).fill('1')
  await expect(page.getByRole('group', { name: '排便大约用了多久？（可选）' }).locator('output')).toHaveText('2–5分钟')
  await page.getByRole('group', { name: '有没有看到血迹？（可选）' }).getByRole('button', { name: '少量', exact: true }).click()
  const observations = page.getByRole('group', { name: '还观察到什么？（可多选）' })
  await observations.getByRole('button', { name: '黏液' }).click()
  await expect(observations.getByRole('button', { name: /腹胀|肚子痛|没有特别发现/ })).toHaveCount(0)
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await expect(page.getByRole('button', { name: '上传照片', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /拍照|从相册选择/ })).toHaveCount(0)
  await expect(page.getByText('照片只用于记录所见，可以稍后补充')).toHaveCount(0)
  await page.locator('.bowel-photo-section input[type=file]').setInputFiles(Array.from({ length: 7 }, (_, index) => ({ name: `bowel-${index}.png`, mimeType: 'image/png', buffer: pixel })))
  await expect(page.locator('.bowel-photo-grid img')).toHaveCount(6)
  await expect(page.getByText('6/6', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回记录新情况' }).click()
  await page.getByRole('dialog', { name: '记录日常' }).getByRole('button', { name: '排便' }).click()
  await expect(page.getByRole('button', { name: '光滑条状' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.bowel-photo-grid img')).toHaveCount(6)
  const form = page.getByRole('dialog', { name: '记录排便' })
  await expect(form.getByText('记录时间', { exact: true })).toBeVisible()
  const order = await form.evaluate((node) => {
    const photo = node.querySelector('.bowel-photo-section')!
    const time = node.querySelector('.occurrence-time-field')!
    const save = [...node.querySelectorAll('button')].find((button) => button.textContent?.includes('保存记录'))!
    return Boolean(photo.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(time.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
  const time = form.locator('.occurrence-time-field')
  await time.scrollIntoViewIfNeeded()
  await expect(time.getByRole('textbox', { name: '记录时间' })).toHaveAttribute('type', 'datetime-local')
  await expect(time.locator('.occurrence-time-control > span')).toHaveText(/^\d{2}:\d{2}$/)
  const timeBox = await time.boundingBox()
  const saveBox = await page.getByRole('button', { name: '保存记录', exact: true }).boundingBox()
  expect(timeBox!.y + timeBox!.height).toBeLessThanOrEqual(saveBox!.y)
  await page.screenshot({ path: 'test-results/bowel-record-iphone-se.png', fullPage: true })
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-saved-toast')).toHaveText('已记录')
  const saved = page.locator('.journal-record').filter({ hasText: '光滑条状、糊状 · 黄褐色 · 一般' })
  await expect(saved).toBeVisible()
  await expect(saved).not.toContainText('今天第1次')
  await expect(saved.getByLabel('6 个附件')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.journal-record').filter({ hasText: '光滑条状、糊状 · 黄褐色 · 一般' })).toBeVisible()
})

async function openDietTypes(page: Page) {
  await openDaily(page)
  await page.getByRole('dialog', { name: '记录日常' }).getByRole('button', { name: '喂养/饮食', exact: true }).click()
  await expect(page.getByRole('heading', { name: '记录喂养/饮食', exact: true })).toBeVisible()
}

test('feeding and diet type sheet is complete, non-scrollable and returns with selection preserved', async ({ page }) => {
  await prepare(page)
  await openDietTypes(page)
  const dialog = page.getByRole('dialog', { name: '记录喂养/饮食' })
  await expect(dialog.getByText('先记下来，之后还可以继续补充', { exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^喂养/ }).locator('.diet-type-icon--feeding-bottle')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^辅食/ }).locator('.journal-category-icon--spoon')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^正餐/ }).locator('.diet-type-icon--meal-pot')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^补剂/ }).locator('.diet-type-icon--supplement-bottle')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^辅食/ })).toContainText('泥糊 / 颗粒')
  await expect(dialog.getByRole('button', { name: /^辅食/ })).not.toContainText('手指食物')
  await expect(dialog.getByText(/推荐/)).toHaveCount(0)
  await expect(dialog.getByText(/个月|记录对象|已按年龄优先显示/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '开始记录', exact: true })).toHaveCount(0)
  const layout = await dialog.evaluate((sheet) => {
    const body = sheet.querySelector('.hoho-bottom-sheet__body') as HTMLElement
    const handle = sheet.querySelector('.hoho-bottom-sheet__handle') as HTMLElement
    return { sheetFits: sheet.scrollHeight <= sheet.clientHeight + 1, bodyFits: body.scrollHeight <= body.clientHeight + 1, overflowY: getComputedStyle(body).overflowY, handle: getComputedStyle(handle).display }
  })
  expect(layout).toEqual({ sheetFits: true, bodyFits: true, overflowY: 'visible', handle: 'none' })
  await page.screenshot({ path: 'test-results/diet-types-icons-iphone-se.png' })

  const choices = [
    { button: /^喂养/, heading: '记录喂养' },
    { button: /^辅食/, heading: '记录辅食' },
    { button: /^正餐/, heading: '记录正餐' },
    { button: /^零食/, heading: '记录零食' },
    { button: /^补剂/, heading: '记录补剂' }
  ]
  for (const choice of choices) {
    const button = dialog.getByRole('button', { name: choice.button })
    await button.click()
    await expect(page.getByRole('heading', { name: choice.heading, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回喂养/饮食类型选择' }).click()
    await expect(page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: choice.button })).toBeVisible()
  }
})

test('five diet record kinds save through the real API and show only the concise success message', async ({ page }) => {
  await prepare(page)

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^喂养/ }).click()
  await page.getByLabel('左侧手填分钟').fill('3')
  await page.getByLabel('右侧手填分钟').fill('2')
  await expect(page.getByText('本次喂养总时长').locator('..').getByText('5分00秒')).toBeVisible()
  await page.getByRole('group', { name: '进食状态（可选）' }).getByRole('button', { name: '抗拒', exact: true }).click()
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-saved-toast')).toHaveText('已记录')
  const feedingRecord = page.locator('.journal-record').filter({ hasText: '母乳 · 5分钟' })
  await expect(feedingRecord).toBeVisible()
  await expect(feedingRecord.locator('.diet-type-icon--feeding-bottle')).toBeVisible()
  await expect(feedingRecord.locator('.journal-record-summary')).not.toContainText('抗拒')

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^辅食/ }).click()
  await page.getByRole('button', { name: '鸡蛋黄', exact: true }).click()
  await page.getByRole('button', { name: '南瓜泥', exact: true }).click()
  await expect(page.getByText('上传照片', { exact: true })).toHaveCount(0)
  await expect(page.getByText('首次尝试这种食物', { exact: true })).toHaveCount(0)
  await page.getByRole('group', { name: '食物形态' }).getByRole('button', { name: '泥糊' }).click()
  const amountSlider = page.getByRole('slider', { name: '吃了多少' })
  await expect(amountSlider).toHaveAttribute('aria-valuetext', '尝了几口')
  await amountSlider.press('ArrowRight')
  await amountSlider.press('ArrowRight')
  await expect(amountSlider).toHaveAttribute('aria-valuetext', '约 1/2 碗')
  const reactions = page.getByRole('group', { name: '进食后有无异常' })
  await expect(reactions.getByRole('button', { name: /^(皮肤|呼吸|消化)$/ })).toHaveCount(3)
  await expect(reactions.getByRole('button', { name: '暂未发现', exact: true })).toHaveCount(0)
  await expect(reactions.getByRole('button', { name: '其他', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  const complementary = page.locator('.journal-record').filter({ hasText: '鸡蛋黄、南瓜泥 · 约 1/2 碗' })
  await expect(complementary).toBeVisible()

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^正餐/ }).click()
  await page.getByRole('button', { name: '米饭', exact: true }).click()
  await expect(page.getByRole('button', { name: '语音记录', exact: true })).toHaveCount(0)
  await expect(page.getByText('上传照片', { exact: true })).toHaveCount(0)
  const mealAmount = page.getByRole('slider', { name: '吃了多少' })
  await mealAmount.press('ArrowRight')
  await mealAmount.press('ArrowRight')
  await expect(mealAmount).toHaveAttribute('aria-valuetext', '一半')
  await page.getByRole('group', { name: '食欲' }).getByRole('button', { name: '和平时差不多' }).click()
  await expect(page.getByRole('group', { name: '进食后有无异常' }).getByRole('button', { name: /^(皮肤|呼吸|消化)$/ })).toHaveCount(3)
  await expect(page.getByText('观察到的情况', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/meal-observations-iphone-se.png', fullPage: true })
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '正餐 ·' })).toBeVisible()

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^零食/ }).click()
  await page.getByLabel('输入食物名称').fill('苹果')
  await page.getByRole('button', { name: '添加食物' }).click()
  await expect(page.getByRole('button', { name: '语音记录', exact: true })).toHaveCount(0)
  await expect(page.getByText('上传照片', { exact: true })).toHaveCount(0)
  const snackAmount = page.getByRole('slider', { name: '吃了多少' })
  await snackAmount.press('ArrowRight')
  await expect(snackAmount).toHaveAttribute('aria-valuetext', '少量')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '零食' })).toBeVisible()

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^补剂/ }).click()
  await page.getByRole('button', { name: '维生素D', exact: true }).click()
  await page.getByLabel('用量').fill('1')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '维生素D · 1滴' })).toBeVisible()
  await expect(page.getByText(/保存成功|已经成功|已为/)).toHaveCount(0)
})

test('frequent foods are editable, persist after reload and stay scoped to the current member', async ({ page }) => {
  await prepare(page)
  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^辅食/ }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('button', { name: '删除常吃食物鸡蛋黄' }).click()
  await page.getByRole('textbox', { name: '添加常吃食物', exact: true }).fill('牛油果')
  await page.getByRole('button', { name: '确认添加常吃食物' }).click()
  await page.screenshot({ path: 'test-results/frequent-foods-editor-iphone-se.png' })
  const persisted = page.waitForResponse((response) => response.url().endsWith('/api/members/child-one') && response.request().method() === 'PATCH')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  expect((await persisted).status()).toBe(200)
  await expect(page.getByRole('button', { name: '牛油果', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '鸡蛋黄', exact: true })).toHaveCount(0)
  await page.reload()
  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^辅食/ }).click()
  await expect(page.getByRole('button', { name: '牛油果', exact: true })).toBeVisible()
  const members = await (await page.request.get('/api/members', { headers: { Authorization: `Bearer ${token}` } })).json()
  const first = members.find((member: { id: string }) => member.id === 'child-one')
  const second = members.find((member: { id: string }) => member.id === 'child-two')
  expect(first.dietFrequentFoods.complementary).toContain('牛油果')
  expect(second.dietFrequentFoods).toBeUndefined()
})

test('complementary record survives reload and remains isolated to the selected member', async ({ page }) => {
  await prepare(page)
  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^辅食/ }).click()
  await page.getByRole('button', { name: '大米粥', exact: true }).click()
  await page.getByRole('group', { name: '食物形态' }).getByRole('button', { name: '小颗粒' }).click()
  await expect(page.getByRole('slider', { name: '吃了多少' })).toHaveAttribute('aria-valuetext', '尝了几口')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '大米粥 · 尝了几口' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.journal-record').filter({ hasText: '大米粥 · 尝了几口' })).toBeVisible()
  await page.evaluate(() => {
    sessionStorage.setItem('hoooho:preserve-test-member', 'true')
    const stored = JSON.parse(localStorage.getItem('hoooho-app') ?? '{}')
    stored.state.currentMemberId = 'child-two'
    localStorage.setItem('hoooho-app', JSON.stringify(stored))
  })
  await page.reload()
  await expect(page.locator('.journal-record').filter({ hasText: '大米粥 · 尝了几口' })).toHaveCount(0)
})

test('health journal footer does not expose the removed quick record button', async ({ page }) => {
  await prepare(page)
  await expect(page.getByRole('button', { name: '快捷记录', exact: true })).toHaveCount(0)
})

test('another member never sees the first member timeline', async ({ page }) => {
  await prepare(page, 'child-two')
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect(page.locator('.journal-record')).toHaveCount(1)
  await expect(page.locator('.journal-record')).toContainText('隔离对象专属记录')
})

test('failed timeline request offers retry without claiming an empty day', async ({ page }) => {
  let failing = true
  await page.route('**/records?view=time', (route) => failing ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.continue())
  await prepare(page)
  await expect(page.getByText('记录加载失败，请重试', { exact: true })).toBeVisible()
  failing = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect.poll(() => page.locator('.journal-record').count()).toBeGreaterThanOrEqual(9)
})

test('short keyboard viewport keeps direct symptom form actionable and closeable', async ({ page }) => {
  await prepare(page)
  await openSymptom(page)
  await page.setViewportSize({ width: 375, height: 430 })
  await page.getByRole('textbox', { name: '主要症状', exact: true }).fill('键盘布局验收')
  const save = page.getByRole('button', { name: '保存', exact: true })
  await save.scrollIntoViewIfNeeded()
  const box = await save.boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(430)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const width of [320, 390, 430, 1280, 1440]) test(`layout remains usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 })
  await prepare(page)
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect.poll(() => page.locator('.journal-record').count()).toBeGreaterThanOrEqual(9)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: /缩略图视图/ })).toHaveCount(0)
  const last = page.locator('.journal-record').last()
  await last.scrollIntoViewIfNeeded()
  const lastBox = await last.boundingBox()
  const footer = await page.locator('.journal-record-actions').boundingBox()
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(footer!.y + 1)
  if (width === 1440) await page.screenshot({ path: 'test-results/health-journal-timeline-desktop-1440.png', fullPage: true })
})

test('free symptom narratives save without tags and location remains optional', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepare(page)
  await expect(page.getByRole('heading', { name: '健康随记', exact: true })).toBeVisible()

  await openSymptom(page)
  let form = page.getByRole('dialog', { name: '记录症状' })
  await expect(form.getByText(/正在为：/)).toHaveCount(0)
  await expect(form.getByPlaceholder('例如：左肘窝')).toBeVisible()
  await expect(form.getByRole('button', { name: '部位定位器', exact: true })).toBeVisible()
  await expect(form.getByLabel('主要症状')).not.toBeFocused()
  await form.getByLabel('主要症状').focus()
  await form.getByLabel('症状部位').focus()
  await expect(form.getByText('请填写主要症状', { exact: true })).toHaveCount(0)
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(form.getByText('请填写主要症状', { exact: true })).toBeVisible()
  await form.getByRole('button', { name: '关闭', exact: true }).click()

  for (const narrative of ['感冒', '手冰凉']) {
    await openSymptom(page)
    form = page.getByRole('dialog', { name: '记录症状' })
    await expect(form.getByText(/正在为：/)).toHaveCount(0)
    await form.getByLabel('主要症状').fill(narrative)
    await expect(form.getByText(/已整理|暂未生成摘要|暂时无法整理/)).toBeVisible()
    await expect(form.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    if (narrative === '感冒') {
      await form.getByLabel('症状部位').fill('1')
      await form.getByLabel('症状部位').fill('')
    }
    await form.getByRole('button', { name: '保存', exact: true }).click()
    await createDespiteDuplicateIfNeeded(page)
    await expect(page.getByText('已记录', { exact: true })).toBeVisible()
    await expect(page.locator('.journal-record--symptom').filter({ hasText: narrative }).first()).toBeVisible()
  }
  await page.screenshot({ path: 'test-results/symptom-free-text-iphone-se.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
