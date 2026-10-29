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
  await expect(page.getByRole('button', { name: '查看第2张：长期记录' })).toBeVisible()
})

test('both banners fill the same space with clear copy, intact art and a single-line guide', async ({ page }, info) => {
  const initial = await page.locator(hero).boundingBox()
  for (let index = 0; index < 2; index++) {
    if (index) {
      await page.getByRole('button', { name: '查看第2张：长期记录' }).click()
      await expect(page.locator(hero)).toHaveAttribute('data-slide', '1')
      await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
    }
    expect(await page.locator(hero).boundingBox()).toEqual(initial)
    const geometry = await page.locator(hero).evaluate(el => {
      const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect()
      const body = el.closest('.smart-record-page__body')!, bounds = body.getBoundingClientRect(), cards = body.querySelector('.front-desk-welcome__entries')!.getBoundingClientRect()
      const paragraph = rect('.front-desk-welcome__copy p'), controls = rect('.front-desk-banner__controls'), art = rect('.front-desk-welcome__media')
      const guide = body.querySelector('.front-desk-welcome__guide strong')!, style = getComputedStyle(guide)
      return { paragraphRight: paragraph.right, artLeft: art.left, paragraphBottom: paragraph.bottom, controlsTop: controls.top, heroTop: el.getBoundingClientRect().top, heroHeight: el.getBoundingClientRect().height,
        cardBottom: cards.bottom, bodyBottom: bounds.bottom, gap: bounds.bottom - parseFloat(getComputedStyle(body).paddingBottom) - cards.bottom, scroll: body.scrollHeight > body.clientHeight,
        guideHeight: guide.getBoundingClientRect().height, guideLine: parseFloat(style.lineHeight), guideOverflow: guide.scrollWidth > guide.clientWidth,
        copyShift: getComputedStyle(el.querySelector('.front-desk-welcome__copy')!).transform }
    })
    expect(geometry.paragraphRight).toBeLessThanOrEqual(geometry.artLeft)
    expect(geometry.paragraphBottom).toBeLessThanOrEqual(geometry.controlsTop)
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

test('eight-second dwell dissolves in place and can pause, resume or be interrupted by input', async ({ page }, info) => {
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.getByRole('button', { name: '暂停自动切换介绍' }).click()
  await page.getByRole('button', { name: '继续自动切换介绍' }).click()
  await page.mouse.move(0, 0)
  const before = await page.locator(hero).boundingBox()
  await page.clock.runFor(7990)
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
  await page.getByRole('button', { name: '暂停自动切换介绍' }).click()
  await page.mouse.move(0, 0)
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '1')
  await page.getByRole('button', { name: '继续自动切换介绍' }).click()
  await page.mouse.move(0, 0)
  await page.clock.runFor(9200)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('还没发送')
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await expect(page.getByLabel('对话输入', { exact: true })).toHaveValue('还没发送')
})

test('reduced motion keeps the banner still and allows immediate manual selection', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('button', { name: '暂停自动切换介绍' })).toHaveCount(0)
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await page.getByRole('button', { name: '查看第2张：长期记录' }).click()
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '1')
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'idle')
  await expect(page.locator('.front-desk-banner__mosaic')).toHaveCount(0)
})

test('a failed archive image leaves the original introduction usable', async ({ page }) => {
  await page.route('**/*record-archive*', route => route.abort())
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天怎么样？', exact: true })).toBeVisible()
  await page.clock.runFor(20000)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
  await expect(page.locator('.front-desk-welcome__portrait')).toHaveAttribute('alt', /黑发护士/)
})

test('a first message during dissolution unmounts the whole banner and its timer', async ({ page }) => {
  await page.getByRole('button', { name: '查看第2张：长期记录' }).click()
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
test('simulated background visibility cancels pending rotation and rapid point selection keeps the last choice', async ({ page }) => {
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
  await page.getByRole('button', { name: '查看第2张：长期记录' }).click()
  await expect(page.locator(hero)).toHaveAttribute('data-phase', 'out')
  await page.getByRole('button', { name: '查看第1张：今天怎么样' }).click()
  await page.clock.runFor(1200)
  await expect(page.locator(hero)).toHaveAttribute('data-slide', '0')
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
