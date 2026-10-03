import { test, expect, devices, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { quickNoteExamples } from '../../src/features/case-continuity/quickNoteExamples'

const output = 'outputs/home-combined-header-b-20261004/local'
const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
async function initialize(page: Page) {
  await page.addInitScript(token => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: 'empty-child', members: [], profile: null }, version: 5 })) }, token)
}
async function ready(page: Page) {
  await page.goto('/nurse-station')
  await expect(page.locator('.nurse-station-hero__main')).toBeVisible()
}
async function metrics(page: Page) {
  return page.locator('.nurse-station-overview').evaluate(el => {
    const box = (selector: string) => { const r = el.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } }
    return { hero: box('.nurse-station-hero'), mint: box('.continuity-home'), entry: box('.continuity-record-entry'), input: box('.continuity-record-entry__record'), actions: box('.continuity-record-entry__actions'), left: box('.continuity-record-entry__list-action'), right: box('.continuity-record-entry__action'), nextY: document.querySelector('.nurse-home-entries')!.getBoundingClientRect().y }
  })
}

test('合并外框、36/64底部按钮；十条例句逐字循环，各手机宽度布局稳定', async ({ page }) => {
  test.setTimeout(120000)
  await initialize(page)
  await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page)
  const time = new Date(); await page.clock.install({ time }); await page.clock.pauseAt(time)
  for (const width of [375, 393, 430, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 667 })
    await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const entry = page.locator('.continuity-record-entry'), example = entry.locator('.continuity-record-entry__example'), visible = example.locator('span')
    await expect(visible).toHaveText('')
    const baseline = await metrics(page)
    expect(baseline.hero.bottom).toBe(baseline.mint.y)
    expect(baseline.hero.x).toBe(baseline.mint.x); expect(baseline.hero.width).toBe(baseline.mint.width)
    expect(baseline.input.width).toBe(baseline.entry.width)
    expect(baseline.input.height).toBeGreaterThanOrEqual(56)
    expect(baseline.actions.y - baseline.input.bottom).toBe(12)
    expect(baseline.right.x - baseline.left.x - baseline.left.width).toBe(12)
    expect(baseline.left.width / (baseline.left.width + baseline.right.width)).toBeCloseTo(.36, 2)
    expect(baseline.left.height).toBe(48); expect(baseline.right.height).toBe(48)
    const style = await entry.evaluate(el => { const title = el.querySelector('strong')!, hero = document.querySelector('.nurse-station-hero')!, outer = document.querySelector('.nurse-station-overview')!, mint = el.parentElement!, right = el.querySelector('.continuity-record-entry__action')!; return { size: getComputedStyle(title).fontSize, weight: getComputedStyle(title).fontWeight, color: getComputedStyle(title).color, primary: getComputedStyle(right).backgroundColor, heroBorder: getComputedStyle(hero).borderTopWidth, heroShadow: getComputedStyle(hero).boxShadow, outerBorder: getComputedStyle(outer).borderTopWidth, whiteBottomRadius: getComputedStyle(hero).borderBottomLeftRadius, mintTopRadius: getComputedStyle(mint).borderTopLeftRadius } })
    expect(style).toMatchObject({ size: '14px', weight: '700', heroBorder: '0px', heroShadow: 'none', outerBorder: '1px', mintTopRadius: '0px' })
    expect(style.whiteBottomRadius).toBe('18px'); expect(style.color).toBe(style.primary)
    await expect(entry.locator('input,textarea,[contenteditable=true],button button,button a')).toHaveCount(0)
    for (let index = 0; index < quickNoteExamples.length; index++) {
      const text = quickNoteExamples[index]; await expect(example).toHaveAttribute('data-typewriter-index', String(index))
      for (let length = 1; length <= text.length; length++) { await page.clock.runFor(90); await expect(visible).toHaveText(text.slice(0, length)) }
      expect(await metrics(page)).toEqual(baseline)
      expect(await example.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (index === 3) await page.screenshot({ path: output + '/home-' + width + '.png', fullPage: true })
      await page.clock.runFor(2199); await expect(visible).toHaveText(text)
      await page.clock.runFor(1); await expect(visible).toHaveText(text)
      for (let length = text.length - 1; length >= 0; length--) { await page.clock.runFor(45); await expect(visible).toHaveText(text.slice(0, length)) }
      expect(await metrics(page)).toEqual(baseline)
      await page.clock.runFor(299); await expect(example).toHaveAttribute('data-typewriter-index', String(index)); await expect(visible).toHaveText('')
      await page.clock.runFor(1); await expect(example).toHaveAttribute('data-typewriter-index', String((index + 1) % 10))
    }
  }
})

test('后台暂停恢复、减少动态效果、离开重挂载不叠加计时器', async ({ page }) => {
  await initialize(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page)
  const time = new Date(); await page.clock.install({ time }); await page.clock.pauseAt(time); await page.emulateMedia({ reducedMotion: 'no-preference' })
  const example = page.locator('.continuity-record-entry__example'), text = example.locator('span')
  await expect(text).toHaveText(''); await page.clock.runFor(90); await expect(text).toHaveText('换')
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(5000); await expect(text).toHaveText('换')
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(90); await expect(text).toHaveText('换了')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(text).toHaveText(quickNoteExamples[0]); await page.clock.runFor(10000); await expect(text).toHaveText(quickNoteExamples[0])
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: '症状数据示例，开始记录', exact: true }).click(); await expect(page).toHaveURL(/\/smart-record$/); await page.clock.runFor(10000)
  await page.goBack(); await expect(text).toHaveText(''); await page.clock.runFor(89); await expect(text).toHaveText(''); await page.clock.runFor(1); await expect(text).toHaveText('换')
})

test('假输入框及主按钮文字图标留白整块可点，单次跳转且不预填草稿', async ({ page }) => {
  await initialize(page); await ready(page)
  await page.evaluate(() => { const push = history.pushState.bind(history); (window as any).entryPushes = 0; history.pushState = (...args) => { (window as any).entryPushes++; return push(...args) } })
  const fake = page.getByRole('button', { name: '症状数据示例，开始记录', exact: true }), primary = page.getByRole('button', { name: '症状数据', exact: true })
  for (const [control, position] of [[fake, 'left'], [fake, 'right'], [fake, 'center'], [primary, 'left'], [primary, 'right'], [primary, 'center'], [primary, 'icon'], [fake, 'keyboard'], [primary, 'keyboard']] as const) {
    await page.evaluate(() => { (window as any).entryPushes = 0 })
    await expect(page.locator('.continuity-home input,.continuity-home textarea')).toHaveCount(0)
    if (position === 'keyboard') { await control.focus(); await page.keyboard.press('Enter') }
    else if (position === 'icon') await control.locator('svg').click()
    else { const rect = (await control.boundingBox())!; await control.click({ position: { x: position === 'left' ? 5 : position === 'right' ? rect.width - 5 : rect.width / 2, y: rect.height / 2 } }) }
    await expect(page).toHaveURL(/\/smart-record$/)
    expect(await page.evaluate(() => (window as any).entryPushes)).toBe(1)
    await expect(page.getByRole('textbox', { name: '哪里不舒服' })).toHaveValue('')
    await page.goBack(); await expect(fake).toBeVisible()
  }
})

test('底部跟进列表独立且整块可点击，鼠标键盘只跳转一次', async ({ page }) => {
  await initialize(page); await ready(page)
  const link = page.getByRole('link', { name: '跟进列表', exact: true })
  await page.evaluate(() => { const push = history.pushState.bind(history); (window as any).entryPushes = 0; history.pushState = (...args) => { (window as any).entryPushes++; return push(...args) } })
  for (const area of ['left', 'right', 'keyboard']) {
    await page.evaluate(() => { (window as any).entryPushes = 0 })
    if (area === 'keyboard') { await link.focus(); await page.keyboard.press('Enter') }
    else { const rect = (await link.boundingBox())!; await link.click({ position: { x: area === 'left' ? 5 : rect.width - 5, y: rect.height / 2 } }) }
    await expect(page).toHaveURL(/\/cases$/); expect(await page.evaluate(() => (window as any).entryPushes)).toBe(1)
    await page.goBack(); await expect(link).toBeVisible()
  }
})

test('窄屏放大案例字号可自然扩展，不裁切或覆盖底部按钮', async ({ page }) => {
  await initialize(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 320, height: 568 }); await ready(page)
  const before = await metrics(page)
  await page.addStyleTag({ content: '.continuity-record-entry__example { font-size: 26px; }' })
  const after = await metrics(page)
  expect(after.input.height).toBeGreaterThan(before.input.height)
  expect(after.actions.y).toBeGreaterThanOrEqual(after.input.bottom + 12)
  expect(await page.locator('.continuity-record-entry__example').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('实际节奏短录屏：打字停留删除及原记录入口', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone SE'], baseURL: 'http://127.0.0.1:4196', recordVideo: { dir: output, size: { width: 375, height: 667 } }, serviceWorkers: 'block' })
  const page = await context.newPage(); await initialize(page); await ready(page)
  await expect(page.locator('.continuity-record-entry__example span')).toHaveText(quickNoteExamples[1], { timeout: 12000 })
  await page.getByRole('button', { name: '症状数据', exact: true }).click(); await expect(page).toHaveURL(/\/smart-record$/)
  await expect(page.getByRole('textbox', { name: '哪里不舒服' })).toHaveValue('')
  await context.close(); await page.video()!.saveAs(output + '/typewriter-and-entry.webm')
})
