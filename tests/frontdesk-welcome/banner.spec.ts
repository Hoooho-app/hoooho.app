import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const hero = '.front-desk-welcome__hero'

test.beforeEach(async ({ page, request }) => {
  await page.clock.install()
  await request.get('http://127.0.0.1:4198/success')
  const response = await request.post('/api/members', { headers: { Authorization: `Bearer ${token}` }, data: { name: '轮播示例', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(response.ok()).toBe(true)
  const memberId = (await response.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/nurse-station')
  await expect(page.locator(hero)).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.front-desk-banner__controls, .front-desk-banner__dot, .front-desk-banner__pause')).toHaveCount(0)
})

test('all three banners fill the same space with clear copy, intact art and a single-line guide', async ({ page }, info) => {
  const initial = await page.locator(hero).boundingBox()
  for (let index = 0; index < 3; index++) {
    if (index) {
      await page.mouse.move(0, 0)
      await page.clock.runFor(7200)
      await expect(page.locator(hero)).toHaveAttribute('data-slide', String(index))
      await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
    }
    expect(await page.locator(hero).boundingBox()).toEqual(initial)
    const geometry = await page.locator(hero).evaluate(el => {
      const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect()
      const body = el.closest('.smart-record-page__body')!, bounds = body.getBoundingClientRect(), cards = body.querySelector('.front-desk-welcome__entries')!.getBoundingClientRect()
      const copy = rect('.front-desk-welcome__copy')
      const paragraph = rect('.front-desk-welcome__copy p'), art = rect('.front-desk-welcome__media'), title = rect('.front-desk-welcome__copy h2')
      const guide = body.querySelector('.front-desk-welcome__guide strong')!, style = getComputedStyle(guide)
      return { stacked: getComputedStyle(el).gridTemplateColumns.split(' ').length === 1, copyTop: copy.top, copyBottom: copy.bottom, titleRight: title.right, artTop: art.top, artBottom: art.bottom, heroBottom: el.getBoundingClientRect().bottom, centerDistance: Math.abs((copy.top + copy.bottom - art.top - art.bottom) / 2), paragraphRight: paragraph.right, paragraphLeft: paragraph.left, artLeft: art.left, artRight: art.right, paragraphTop: paragraph.top, titleBottom: title.bottom, heroTop: el.getBoundingClientRect().top, heroHeight: el.getBoundingClientRect().height,
        cardBottom: cards.bottom, bodyBottom: bounds.bottom, gap: bounds.bottom - parseFloat(getComputedStyle(body).paddingBottom) - cards.bottom, scroll: body.scrollHeight > body.clientHeight,
        guideHeight: guide.getBoundingClientRect().height, guideLine: parseFloat(style.lineHeight), guideOverflow: guide.scrollWidth > guide.clientWidth,
        copyShift: getComputedStyle(el.querySelector('.front-desk-welcome__copy')!).transform }
    })
    if (index === 0) expect(geometry.paragraphRight).toBeLessThanOrEqual(geometry.artLeft)
    else {
      if (index === 1 && geometry.stacked) {
        expect(geometry.copyBottom).toBeLessThanOrEqual(geometry.artTop)
      } else if (index === 1) {
        expect(geometry.paragraphLeft).toBeGreaterThanOrEqual(geometry.artRight)
      } else {
        expect(geometry.paragraphRight).toBeLessThanOrEqual(geometry.artLeft)
        expect(geometry.titleRight).toBeLessThanOrEqual(geometry.artLeft)
      }
      expect(geometry.titleBottom).toBeLessThanOrEqual(geometry.paragraphTop)
      if (index !== 1 || !geometry.stacked) expect(geometry.centerDistance).toBeLessThanOrEqual(1)
      expect(geometry.copyTop).toBeGreaterThanOrEqual(geometry.heroTop)
      expect(geometry.copyBottom).toBeLessThanOrEqual(geometry.heroBottom)
      expect(geometry.artTop).toBeGreaterThanOrEqual(geometry.heroTop)
      expect(geometry.artBottom).toBeLessThanOrEqual(geometry.heroBottom)
    }
    expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.bodyBottom)
    expect(geometry.gap).toBeGreaterThanOrEqual(0)
    expect(geometry.gap).toBeLessThanOrEqual(12)
    expect(geometry.scroll).toBe(false)
    expect(geometry.guideHeight).toBeLessThanOrEqual(geometry.guideLine + 1)
    expect(geometry.guideOverflow).toBe(false)
    await expect(page.locator('.front-desk-welcome__portrait')).toHaveCSS('object-fit', 'contain')
    await info.attach(`banner-${index}-geometry`, { body: JSON.stringify(geometry), contentType: 'application/json' })
    await page.screenshot({ path: info.outputPath(`banner-${index}.png`) })
  }
})

test('six-second dwell dissolves without controls and focus or input pauses rotation', async ({ page }, info) => {
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.locator(hero).focus()
  await page.getByRole('button', { name: '打开菜单', exact: true }).focus()
  await page.mouse.move(0, 0)
  const before = await page.locator(hero).boundingBox()
  await page.clock.runFor(5990)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
  await page.clock.runFor(20)
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'out')
  await expect(page.locator('.front-desk-banner__mosaic span')).toHaveCount(80)
  await page.clock.runFor(250)
  // Timer logic uses the controlled clock; CSS animation frames use the browser's compositor.
  await expect.poll(async () => page.locator('.front-desk-banner__mosaic span').evaluateAll(nodes => {
    const opacity = nodes.map(n => Number(getComputedStyle(n).opacity))
    return opacity.some(v => v > 0 && v < 1) && opacity.some(v => v === 0)
  })).toBe(true)
  await page.screenshot({ path: info.outputPath('mosaic-out.png') })
  await page.clock.runFor(320)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '1')
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'in')
  await page.clock.runFor(250)
  await page.screenshot({ path: info.outputPath('mosaic-in.png') })
  await page.clock.runFor(310)
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
  expect(await page.locator(hero).boundingBox()).toEqual(before)
  await page.locator(hero).focus()
  await page.mouse.move(0, 0)
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '1')
  await page.getByRole('button', { name: '打开菜单', exact: true }).focus()
  await page.mouse.move(0, 0)
  await page.clock.runFor(7200)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '2')
  await expect(page.getByRole('heading', { name: '记忆很长， 不会忘。' })).toBeVisible()
  await page.clock.runFor(7200)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('还没发送')
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await expect(page.getByLabel('对话输入', { exact: true })).toHaveValue('还没发送')
})

test('reduced motion keeps a static welcome without hidden or visible controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.locator(hero)).toBeVisible()
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
  await expect(page.locator(hero).getByRole('button')).toHaveCount(0)
  await expect(page.locator('.front-desk-banner__mosaic')).toHaveCount(0)
})

test('failed product images leave the original introduction usable', async ({ page }) => {
  await page.route('**/*record-archive*', route => route.abort())
  await page.route('**/*visit-summary-banner*', route => route.abort())
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天怎么样？', exact: true })).toBeVisible()
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await expect(page.locator('.front-desk-welcome__portrait')).toHaveAttribute('alt', /黑发护士/)
})

test('a first message during dissolution unmounts the whole banner and its timer', async ({ page }) => {
  await page.mouse.move(0, 0)
  await page.clock.runFor(6000)
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'out')
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('今天下午发烧')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator('.front-desk-welcome--editorial')).toHaveCount(0)
  await expect(page.locator('.front-desk-banner__mosaic')).toHaveCount(0)
  await page.waitForTimeout(1200)
  await expect(page.locator('.front-desk-welcome--editorial')).toHaveCount(0)
})

// Visibility is simulated explicitly; physical app/background handling is not claimed.
test('simulated background visibility stops rotation and foreground starts a fresh dwell', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.mouse.move(0, 0)
  await page.clock.runFor(5990)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await page.clock.runFor(1150)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '1')
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
})

test('holding the keyboard record gesture pauses rotation and cancelling leaves the introduction', async ({ page }) => {
  await page.getByRole('button', { name: '按住记录症状', exact: true }).focus()
  await page.keyboard.down('Space')
  await expect(page.getByRole('button', { name: '正在录音，松开即结束', exact: true })).toBeVisible()
  await page.clock.runFor(10000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await page.keyboard.press('Escape')
  await page.keyboard.up('Space')
  await expect(page.locator(hero)).toBeVisible()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
})

for (const failed of ['visit', 'memory'] as const) {
  test(`a failed ${failed} image is skipped while the other product banner keeps rotating`, async ({ page }) => {
    await page.route(failed === 'visit' ? '**/*visit-summary-banner*' : '**/*record-archive*', route => route.abort())
    await page.reload()
    await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
    await page.mouse.move(0, 0)
    await page.clock.runFor(7200)
    await expect(page.locator(hero)).toHaveAttribute('data-kind', failed === 'visit' ? 'memory' : 'visit')
    await page.clock.runFor(7200)
    await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  })
}

test('a late visit illustration joins the next cycle without blocking the ready memory banner', async ({ page }) => {
  let release: (() => Promise<void>) | undefined
  await page.route('**/*visit-summary-banner*', route => { release = () => route.continue() })
  const memoryLoaded = page.waitForResponse(response => response.url().includes('record-archive'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await memoryLoaded
  await expect.poll(() => !!release).toBe(true)
  await page.waitForTimeout(100)
  await page.mouse.move(0, 0)
  await page.clock.runFor(7200)
  await expect(page.locator(hero)).toHaveAttribute('data-kind', 'memory')
  const visitLoaded = page.waitForResponse(response => response.url().includes('visit-summary-banner'))
  await release!()
  await visitLoaded
  await page.waitForTimeout(100)
  await page.clock.runFor(7200)
  await expect(page.locator(hero)).toHaveAttribute('data-kind', 'welcome')
  await page.clock.runFor(7200)
  await expect(page.locator(hero)).toHaveAttribute('data-kind', 'visit')
})
