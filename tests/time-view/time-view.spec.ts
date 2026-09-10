import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('time-view-e2e-local-only-secret', 60 * 60_000).create({ id: 'time-view-test-account' })
async function prepare(page: Page, member = 'child-one') {
  await page.addInitScript(({ token, member }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'time-view-test-account' }, currentMemberId: member, members: [], profile: null }, version: 5 }))
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
  await expect(page.getByRole('button', { name: '手动记录', exact: true })).toBeVisible()
}

test('manual record sheet groups supported care actions under health events', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '手动记录', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '记录新情况' })
  const eating = sheet.getByRole('button', { name: '进食', exact: true })
  await expect(eating).toBeVisible()
  await expect(eating.locator('.journal-category-icon--spoon')).toBeVisible()
  await expect(sheet.getByRole('button', { name: '喂养/饮食', exact: true })).toHaveCount(0)
  const healthEvents = sheet.getByRole('region', { name: '健康事件' })
  await expect(healthEvents.getByRole('button')).toHaveCount(4)
  await expect(healthEvents.getByRole('button')).toHaveText(['症状', '用药', '疫苗', '就医'])
  await expect(sheet.getByRole('region', { name: '照护处理' })).toHaveCount(0)
  await expect(sheet.getByText('先记下来，不用一次性记完，想到时继续补充', { exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: '意外受伤', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: '护理干预', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/manual-record-entries-iphone-se.png' })
})

test('health journal names the existing summary action medical prep', async ({ page }) => {
  await prepare(page)
  await expect(page.getByRole('button', { name: '就医准备', exact: true })).toHaveClass(/medical-prep-button/)
  await expect(page.getByRole('button', { name: '摘要生成', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/medical-prep-copy-iphone-se.png' })
})

test('quick record is unavailable and timeline tools are borderless', async ({ page }) => {
  await prepare(page)
  await expect(page.getByRole('button', { name: '快捷记录', exact: true })).toBeDisabled()
  for (const name of ['筛选健康随身记', '切换记录顺序']) {
    const tool = page.getByRole('button', { name, exact: true })
    await expect(tool).toHaveCSS('border-top-width', '0px')
    await expect(tool).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
})

test('manual record button keeps its fixed content stable while typing in a clipped prompt window', async ({ page }) => {
  await prepare(page)
  const button = page.getByRole('button', { name: '手动记录', exact: true })
  await expect(button).not.toContainText('手动记录')
  await expect(button.locator('.journal-manual-record-action__label')).toHaveText('记录')
  await expect(button.locator('.journal-manual-record-action__underscore')).toHaveText('_')
  await expect(button.locator('.lucide-pencil')).toBeVisible()
  await expect(button.locator('.lucide-pen-line')).toHaveCount(0)
  await expect(button.locator('.journal-manual-record-action__prompt-window')).toContainText('不舒服就记下来', { timeout: 2_000 })

  const layout = await button.evaluate((element) => {
    const fixed = element.querySelector('.journal-manual-record-action__label')!.getBoundingClientRect()
    const underscore = element.querySelector('.journal-manual-record-action__underscore')!.getBoundingClientRect()
    const promptWindow = element.querySelector('.journal-manual-record-action__prompt-window')!
    const prompt = promptWindow.getBoundingClientRect()
    const quick = document.querySelector('.journal-quick-record-action')!.getBoundingClientRect()
    const buttonBox = element.getBoundingClientRect()
    return {
      fixedBeforePrompt: fixed.right <= underscore.left && underscore.right <= prompt.left,
      sameRow: Math.abs(buttonBox.top - quick.top) < 1,
      buttonHeight: buttonBox.height,
      quickWidth: quick.width,
      promptClips: getComputedStyle(promptWindow).overflow === 'hidden',
      promptMaskStartsOpaque: getComputedStyle(promptWindow).maskImage.includes('rgb(0, 0, 0) 0px'),
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(layout).toEqual({ fixedBeforePrompt: true, sameRow: true, buttonHeight: 50, quickWidth: 52, promptClips: true, promptMaskStartsOpaque: true, pageOverflows: false })
  await page.screenshot({ path: 'test-results/manual-record-typewriter-iphone-se.png' })

  await button.click()
  await expect(page.getByRole('dialog', { name: '记录新情况' })).toBeVisible()
})

test('manual record prompt is static and motionless when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prepare(page)
  const button = page.getByRole('button', { name: '手动记录', exact: true })
  await expect(button.locator('.journal-manual-record-action__prompt-window')).toHaveText('不舒服就记下来')
  await expect(button.locator('.journal-manual-record-action__caret')).toHaveCSS('display', 'none')
  await expect(button.locator('.journal-manual-record-action__prompt-track')).toHaveCSS('transform', 'none')
  await page.screenshot({ path: 'test-results/manual-record-reduced-motion-iphone-se.png' })
  await page.waitForTimeout(3_500)
  await expect(button.locator('.journal-manual-record-action__prompt-window')).toHaveText('不舒服就记下来')
})

test('manual record footer stays on one row at the required mobile widths', async ({ page }) => {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    await prepare(page)
    const layout = await page.locator('.journal-record-actions > div').evaluate((footer) => {
      const manual = footer.querySelector('.journal-manual-record-action')!.getBoundingClientRect()
      const quick = footer.querySelector('.journal-quick-record-action')!.getBoundingClientRect()
      const fixed = footer.querySelector('.journal-manual-record-action__label')!.getBoundingClientRect()
      const underscore = footer.querySelector('.journal-manual-record-action__underscore')!.getBoundingClientRect()
      return {
        oneRow: manual.top === quick.top && manual.bottom === quick.bottom,
        fixedVisible: fixed.width > 0 && underscore.width > 0,
        quickWidth: quick.width,
        pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    expect(layout).toEqual({ oneRow: true, fixedVisible: true, quickWidth: 52, pageOverflows: false })
  }
})

test('medical prep uses a continuous soft-light cycle and respects reduced motion', async ({ page }) => {
  await prepare(page)
  const button = page.getByRole('button', { name: '就医准备', exact: true })
  await expect(button).toBeEnabled()
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)
  await expect(button).not.toHaveClass(/medical-prep-button--awake/)
  await expect(button).toHaveCSS('animation-duration', '4s')
  await expect(button.locator('.medical-prep-button__soft-glow')).toHaveCSS('animation-duration', '4s')
  await expect(button.locator('.medical-prep-button__light-band')).toHaveCSS('animation-duration', '4s')
  await expect(button.locator('.medical-prep-button__label')).toHaveCSS('font-size', '12px')
  const layout = await button.evaluate((element) => {
    const icon = element.querySelector('.medical-prep-button__icon')!.getBoundingClientRect()
    const content = element.querySelector('.hoho-button__content')!
    const box = element.getBoundingClientRect()
    return {
      buttonHeight: box.height,
      iconWidth: icon.width,
      iconHeight: icon.height,
      contentGap: getComputedStyle(content).gap,
      contentTransform: getComputedStyle(content).transform,
      clipsGlow: getComputedStyle(element).overflow === 'hidden',
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(layout).toEqual({ buttonHeight: 52, iconWidth: 15, iconHeight: 15, contentGap: '5px', contentTransform: 'matrix(1, 0, 0, 1, -3, 0)', clipsGlow: true, pageOverflows: false })

  for (const [phase, delay] of [['dark', '0s'], ['transition', '-0.72s'], ['bright', '-1.68s']] as const) {
    await button.evaluate((element, delay) => {
      for (const layer of [element, ...element.querySelectorAll<HTMLElement>('.medical-prep-button__soft-glow, .medical-prep-button__light-band')]) {
        layer.style.animationDelay = delay
        layer.style.animationPlayState = 'paused'
      }
    }, delay)
    await page.screenshot({ path: `outputs/medical-prep-${phase}-iphone-se.png` })
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(button).toHaveCSS('animation-name', 'none')
  await expect(button.locator('.medical-prep-button__soft-glow')).toHaveCSS('display', 'none')
  await expect(button.locator('.medical-prep-button__light-band')).toHaveCSS('display', 'none')
})

test('medical prep keeps its established desktop dimensions and stable label', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await prepare(page)
  const button = page.getByRole('button', { name: '就医准备', exact: true })
  await expect(button).toHaveCSS('height', '52px')
  await expect(button.locator('.medical-prep-button__label')).toHaveText('就医准备')
  expect(await button.evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true)
})

test('nurse station uses the same corrected medical prep button', async ({ page }) => {
  await prepare(page)
  await page.goto('/nurse-station')
  const button = page.getByRole('button', { name: '就医准备', exact: true })
  await expect(button).toBeVisible()
  await expect(button.locator('.medical-prep-button__icon')).toHaveCSS('width', '15px')
  await expect(button.locator('.medical-prep-button__label')).toHaveCSS('font-size', '12px')
  await expect(button).toBeDisabled()
  await expect(button.locator('.medical-prep-button__light-band')).toHaveCSS('animation-name', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.screenshot({ path: 'outputs/medical-prep-nurse-station-iphone-se.png' })
})

test('single-day timeline, filters, sort order, compact subject and summary entry', async ({ page }) => {
  await prepare(page)
  await expect(page.getByText('记录发生了什么', { exact: true })).toHaveCount(0)
  await expect(page.getByText('当前记录对象', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '后一天', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '筛选健康随身记' })).toBeVisible()
  await expect(page.getByText(`${new Date().getFullYear()}年`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '昨天', exact: true })).toHaveCount(0)
  await expect(page.locator('.journal-day-picker')).toContainText('今天 ·')
  const navigationLayout = await page.locator('.journal-date-navigation').evaluate((navigation) => {
    const controls = [...navigation.querySelectorAll('label, .journal-yesterday-entry, :scope > button')].map((element) => element.getBoundingClientRect())
    const filter = document.querySelector('[aria-label="筛选健康随身记"]')!.getBoundingClientRect()
    const sort = document.querySelector('[aria-label="切换记录顺序"]')!.getBoundingClientRect()
    const box = navigation.getBoundingClientRect()
    const date = navigation.querySelector('.journal-day-picker > span')!
    return { height: box.height, sameRow: [...controls, filter, sort].every((item) => Math.abs(item.top - box.top) <= 5 && item.bottom <= box.bottom + 1), dateFits: date.scrollWidth <= date.clientWidth, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
  })
  expect(navigationLayout).toEqual({ height: 48, sameRow: true, dateFits: true, pageOverflow: false })
  await page.getByLabel('选择年月').fill('2025-12')
  await expect(page.getByText('2025年', { exact: true })).toBeVisible()
  await page.getByLabel('选择日期').fill(new Date().toISOString().slice(0, 10))
  await expect(page.locator('.journal-day-picker')).toContainText('今天 ·')
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect(page.locator('.journal-day-picker')).toContainText('昨天 ·')
  expect(await page.locator('.journal-day-picker > span').evaluate((date) => date.scrollWidth <= date.clientWidth)).toBe(true)
  await expect(page.locator('.journal-record')).toHaveCount(10)
  await expect(page.getByText('时间未明确', { exact: true })).toHaveCount(0)
  expect(await page.locator('.journal-record-content').first().evaluate((element) => ({ whiteSpace: getComputedStyle(element).whiteSpace, oneLine: element.scrollHeight <= element.clientHeight + 1 }))).toEqual({ whiteSpace: 'nowrap', oneLine: true })
  expect(await page.locator('.journal-record').first().evaluate((record) => {
    const icon = record.querySelector(':scope > svg')!.getBoundingClientRect()
    const tags = record.querySelector('.journal-record-tags')!.getBoundingClientRect()
    const summary = record.querySelector('.journal-record-summary')!.getBoundingClientRect()
    return { tagsAfterIcon: tags.left >= icon.right, summaryAfterTags: summary.left >= tags.right }
  })).toEqual({ tagsAfterIcon: true, summaryAfterTags: true })
  expect(await page.locator('.journal-record-summary').first().evaluate((element) => getComputedStyle(element).fontSize)).toBe('13px')
  const nine = page.locator('.hoho-timeline-item').filter({ has: page.locator('.hoho-timeline-item__label', { hasText: /^9时$/ }) })
  await expect(nine.locator('.journal-record')).toHaveCount(3)
  await expect(nine.locator('.journal-record-time')).toHaveText(['09:45', '09:30', '09:10'])
  await page.getByRole('button', { name: '切换记录顺序' }).click()
  await expect(page.getByRole('button', { name: '切换记录顺序' }).locator('.lucide-arrow-up-down')).toBeVisible()
  await expect(nine.locator('.journal-record-time')).toHaveText(['09:10', '09:30', '09:45'])
  await page.getByRole('button', { name: '筛选健康随身记' }).click()
  const filterDialog = page.getByRole('dialog', { name: '健康随记筛选' })
  await filterDialog.getByRole('button', { name: '饮食', exact: true }).click({ force: true })
  await filterDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.journal-record')).toHaveCount(1)
  await page.getByRole('button', { name: '筛选健康随身记' }).click()
  await filterDialog.getByRole('button', { name: '重置', exact: true }).click()
  await filterDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('隔离对象专属记录')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/time-view-iphone-se.png' })
  const subjectBox = await page.locator('.journal-subject-card').boundingBox()
  const summaryBox = await page.getByRole('button', { name: '就医准备', exact: true }).boundingBox()
  expect(subjectBox!.height).toBe(summaryBox!.height)
  const manualBox = await page.getByRole('button', { name: '手动记录', exact: true }).boundingBox()
  const quickBox = await page.getByRole('button', { name: '快捷记录', exact: true }).boundingBox()
  expect(manualBox!.width).toBeGreaterThan(quickBox!.width * 4)
  expect(quickBox!.width).toBe(52)
  await expect(page.getByRole('button', { name: '快捷记录', exact: true })).not.toContainText('快捷记录')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('button', { name: '手动记录', exact: true })).toHaveAttribute('data-variant', 'secondary')
  await expect(page.getByRole('button', { name: '快捷记录', exact: true })).toHaveAttribute('data-variant', 'secondary')
  await expect(page.getByRole('button', { name: '就医准备', exact: true })).toHaveAttribute('data-variant', 'primary')
  const subjectBackground = await page.locator('.journal-subject-card').evaluate((element) => getComputedStyle(element).backgroundColor)
  const summaryBackground = await page.getByRole('button', { name: '就医准备', exact: true }).evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(summaryBackground).not.toBe(subjectBackground)
  await page.getByRole('button', { name: '就医准备', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
})

test('journal row opens record details over the list without visiting symptom tracking', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await page.locator('.journal-record').first().click()
  const detail = page.getByRole('dialog', { name: '症状记录详情' })
  await expect(detail).toBeVisible()
  await expect(page.getByRole('heading', { name: '健康随身记', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '症状跟踪', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/health-events$/)
  await detail.getByRole('button', { name: '关闭症状记录详情' }).click()
  await expect(detail).toHaveCount(0)
  await expect(page.locator('.journal-record')).toHaveCount(10)

  await page.goto('/health-events/event-one?recordId=record-0')
  await expect(page).toHaveURL(/\/health-events\?eventId=event-one&recordId=record-0$/)
  await expect(page.getByRole('dialog', { name: '症状记录详情' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '健康随身记', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '症状跟踪', exact: true })).toHaveCount(0)
})

test('manual single selection, photo draft, review and real API save reach today', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '手动记录', exact: true }).click()
  const recorderTitle = page.getByRole('heading', { name: '记录新情况', exact: true })
  await expect(recorderTitle).toBeVisible()
  await expect(page.getByText('先记下来，不用一次性记完，想到时继续补充', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(情绪|社交|测量|生长发育|接触环境|检查报告|其他)$/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '经历与环境' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '健康事件' })).toBeVisible()
  await expect(page.getByRole('region', { name: '健康事件' }).getByRole('button', { name: '就医', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '日常生活' }).getByRole('button')).toHaveCount(4)
  await expect(page.getByRole('region', { name: '健康事件' }).getByRole('button')).toHaveCount(4)
  await expect(page.getByRole('region', { name: '照护处理' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '意外受伤', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '护理干预', exact: true })).toHaveCount(0)
  const diet = page.getByRole('button', { name: '进食', exact: true })
  await expect(diet.locator('.journal-category-icon--spoon')).toBeVisible()
  const visit = page.getByRole('button', { name: '就医', exact: true })
  await visit.click()
  await expect(visit).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
  await page.getByRole('textbox', { name: '快捷记录文字', exact: true }).fill('今天和朋友一起吃饭')
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') })
  await expect(page.getByText('1/10', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续核对', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '编辑识别原话' })).toHaveValue('今天和朋友一起吃饭')
  await page.screenshot({ path: 'test-results/time-view-manual-review.png' })
  await page.getByRole('button', { name: '确认保存', exact: true }).click()
  const saved = page.locator('.journal-record').filter({ hasText: '今天和朋友一起吃饭' })
  await expect(saved).toBeVisible()
  await expect(saved.getByText('饮食', { exact: true })).toHaveCount(0)
  await expect(saved.getByText('就医', { exact: true })).toBeVisible()
  await expect(saved.getByLabel('1 个附件')).toBeVisible()
  await saved.click()
  await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
})

test('bowel record is one continuous form, restores its member draft and saves real structured data', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '手动记录', exact: true }).click()
  const entrySheet = page.getByRole('dialog', { name: '记录新情况' })
  const entryLayout = await entrySheet.evaluate((sheet) => {
    const body = sheet.querySelector('.hoho-bottom-sheet__body') as HTMLElement
    return { sheetFits: sheet.scrollHeight <= sheet.clientHeight + 1, bodyFits: body.scrollHeight <= body.clientHeight + 1, overflowY: getComputedStyle(body).overflowY }
  })
  expect(entryLayout).toEqual({ sheetFits: true, bodyFits: true, overflowY: 'visible' })
  await entrySheet.getByRole('button', { name: '排便', exact: true }).click()
  await expect(entrySheet.getByRole('button', { name: '排便', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await entrySheet.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await expect(page.getByRole('dialog', { name: '记录新情况' }).getByRole('button', { name: '排便' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
  await expect(page.getByRole('button', { name: '光滑条状' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.bowel-photo-grid img')).toHaveCount(6)
  const form = page.getByRole('dialog', { name: '记录排便' })
  await expect(form.getByText('记录时间（默认为现在）', { exact: true })).toBeVisible()
  const order = await form.evaluate((node) => {
    const photo = node.querySelector('.bowel-photo-section')!
    const time = node.querySelector('input[type=datetime-local]')!
    const save = [...node.querySelectorAll('button')].find((button) => button.textContent?.includes('保存记录'))!
    return Boolean(photo.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(time.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
  const time = form.locator('input[type=datetime-local]')
  await time.scrollIntoViewIfNeeded()
  const timeBox = await time.boundingBox()
  const saveBox = await page.getByRole('button', { name: '保存记录', exact: true }).boundingBox()
  expect(timeBox!.y + timeBox!.height).toBeLessThanOrEqual(saveBox!.y)
  await page.screenshot({ path: 'test-results/bowel-record-iphone-se.png', fullPage: true })
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-saved-toast')).toHaveText('已记录')
  const saved = page.locator('.journal-record').filter({ hasText: '光滑条状、糊状 · 黄褐色 · 一般' })
  await expect(saved).toBeVisible()
  await expect(saved).toContainText('今天第1次')
  await expect(saved.getByLabel('6 个附件')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '时间视图', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '光滑条状、糊状 · 黄褐色 · 一般' })).toBeVisible()
})

async function openDietTypes(page: Page) {
  await page.getByRole('button', { name: '手动记录', exact: true }).click()
  await page.getByRole('button', { name: '进食', exact: true }).click()
  await expect(page.getByRole('heading', { name: '记录喂养/饮食', exact: true })).toBeVisible()
}

test('feeding and diet type sheet is complete, non-scrollable and returns with selection preserved', async ({ page }) => {
  await prepare(page)
  await openDietTypes(page)
  const dialog = page.getByRole('dialog', { name: '记录喂养/饮食' })
  await expect(dialog.getByText('先记下来，之后还可以继续补充', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/推荐/)).toHaveCount(0)
  await expect(dialog.getByText(/个月|记录对象|已按年龄优先显示/)).toHaveCount(0)
  const start = dialog.getByRole('button', { name: '开始记录', exact: true })
  await expect(start).toBeDisabled()
  const layout = await dialog.evaluate((sheet) => {
    const body = sheet.querySelector('.hoho-bottom-sheet__body') as HTMLElement
    const handle = sheet.querySelector('.hoho-bottom-sheet__handle') as HTMLElement
    return { sheetFits: sheet.scrollHeight <= sheet.clientHeight + 1, bodyFits: body.scrollHeight <= body.clientHeight + 1, overflowY: getComputedStyle(body).overflowY, handle: getComputedStyle(handle).display }
  })
  expect(layout).toEqual({ sheetFits: true, bodyFits: true, overflowY: 'visible', handle: 'none' })
  const startBox = await start.boundingBox()
  expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height)

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
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await start.click()
    await expect(page.getByRole('heading', { name: choice.heading, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回喂养/饮食类型选择' }).click()
    await expect(page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: choice.button })).toHaveAttribute('aria-pressed', 'true')
  }
})

test('five diet record kinds save through the real API and show only the concise success message', async ({ page }) => {
  await prepare(page)

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^喂养/ }).click()
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
  await page.getByLabel('左侧手填分钟').fill('3')
  await page.getByLabel('右侧手填分钟').fill('2')
  await expect(page.getByText('本次喂养总时长').locator('..').getByText('5分00秒')).toBeVisible()
  await page.getByRole('group', { name: '进食状态（可选）' }).getByRole('button', { name: '抗拒', exact: true }).click()
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-saved-toast')).toHaveText('已记录')
  const feedingRecord = page.locator('.journal-record').filter({ hasText: '母乳 · 5分钟' })
  await expect(feedingRecord).toBeVisible()
  await expect(feedingRecord.locator('.journal-record-summary')).not.toContainText('抗拒')

  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^辅食/ }).click()
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await page.getByRole('button', { name: '时间视图', exact: true }).click()
  await openDietTypes(page)
  await page.getByRole('dialog', { name: '记录喂养/饮食' }).getByRole('button', { name: /^辅食/ }).click()
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
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
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
  await page.getByRole('button', { name: '大米粥', exact: true }).click()
  await page.getByRole('group', { name: '食物形态' }).getByRole('button', { name: '小颗粒' }).click()
  await expect(page.getByRole('slider', { name: '吃了多少' })).toHaveAttribute('aria-valuetext', '尝了几口')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '大米粥 · 尝了几口' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '时间视图', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '大米粥 · 尝了几口' })).toBeVisible()
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('hoooho-app') ?? '{}')
    stored.state.currentMemberId = 'child-two'
    localStorage.setItem('hoooho-app', JSON.stringify(stored))
  })
  await page.reload()
  await page.getByRole('button', { name: '时间视图', exact: true }).click()
  await expect(page.locator('.journal-record').filter({ hasText: '大米粥 · 尝了几口' })).toHaveCount(0)
})

test('quick record button enters listening directly and saves using the existing review flow', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '快捷记录', exact: true }).click()
  await expect(page.getByText('正在听…', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '结束听写' })).toBeEnabled()
  await page.getByRole('button', { name: '结束听写' }).click()
  await expect(page.getByRole('textbox', { name: '编辑识别原话' })).toHaveValue('今天和朋友一起玩了半小时')
  await page.getByRole('button', { name: '确认保存' }).click()
  const saved = page.locator('.journal-record').filter({ hasText: '今天和朋友一起玩了半小时' })
  await expect(saved).toBeVisible()
  await expect(saved.locator('.journal-record-time')).toHaveText(/^\d{2}:\d{2}$/)
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
  await expect(page.locator('.journal-record')).toHaveCount(10)
})

test('short keyboard viewport keeps manual review actionable and closes with Escape', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '手动记录', exact: true }).click()
  await page.getByRole('button', { name: '症状', exact: true }).click()
  await page.getByRole('button', { name: '开始记录', exact: true }).click()
  await page.setViewportSize({ width: 375, height: 430 })
  await page.getByRole('textbox', { name: '快捷记录文字', exact: true }).fill('键盘布局验收')
  await page.getByRole('button', { name: '继续核对', exact: true }).click()
  const save = page.getByRole('button', { name: '确认保存', exact: true })
  await save.scrollIntoViewIfNeeded()
  const box = await save.boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(430)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const width of [390, 430, 1280]) test(`layout remains usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 })
  await prepare(page)
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect(page.locator('.journal-record')).toHaveCount(10)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const last = page.locator('.journal-record').last()
  await last.scrollIntoViewIfNeeded()
  const lastBox = await last.boundingBox()
  const footer = await page.locator('.journal-record-actions').boundingBox()
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(footer!.y + 1)
})
