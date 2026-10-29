import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
test.beforeEach(async ({ page, request }) => {
  const response = await request.post('/api/members', { headers: { Authorization: `Bearer ${token}` }, data: { name: '小屏示例', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(response.ok()).toBe(true)
  const memberId = (await response.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/nurse-station')
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeEnabled()
})

test('home fills available height with full images clear of copy and composer', async ({ page }, info) => {
  const portrait = page.locator('.front-desk-welcome__portrait')
  await expect(portrait).toBeVisible()
  const result = await page.locator('.front-desk-welcome--editorial').evaluate(welcome => {
    const rect = (selector: string) => welcome.querySelector(selector)!.getBoundingClientRect()
    const p = rect('.front-desk-welcome__copy p'), image = rect('.front-desk-welcome__media')
    const body = welcome.parentElement!, b = body.getBoundingClientRect()
    const cards = rect('.front-desk-welcome__entries'), art = rect('.front-desk-welcome__guide img')
    return { paragraphRight: p.right, portraitLeft: image.left, portraitBottom: image.bottom, heroBottom: rect('.front-desk-welcome__hero').bottom,
      cardBottom: cards.bottom, artBottom: art.bottom, bodyBottom: b.bottom, contentBottom: b.bottom - parseFloat(getComputedStyle(body).paddingBottom), bodyScroll: body.scrollHeight > body.clientHeight,
      inputTop: document.querySelector('.smart-record-page__footer')!.getBoundingClientRect().top,
      heroHeight: rect('.front-desk-welcome__hero').height, cardHeight: cards.height, bodyHeight:b.height, welcomeHeight:welcome.getBoundingClientRect().height, cqh:getComputedStyle(welcome).height, gap:getComputedStyle(welcome).gap, horizontal: document.documentElement.scrollWidth > innerWidth }
  })
  console.log(JSON.stringify(result))
  expect(result.paragraphRight).toBeLessThanOrEqual(result.portraitLeft)
  expect(result.portraitBottom).toBeLessThanOrEqual(result.heroBottom + 1)
  expect(result.artBottom).toBeLessThanOrEqual(result.cardBottom + 1)
  expect(result.horizontal).toBe(false)
  await expect(page.locator('.front-desk-welcome__guide img')).toHaveCSS('object-fit', 'contain')
  if (page.viewportSize()!.height >= 646) {
    expect(result.cardBottom).toBeLessThanOrEqual(result.inputTop)
    expect(result.cardBottom).toBeLessThanOrEqual(result.bodyBottom)
    expect(result.contentBottom - result.cardBottom).toBeGreaterThanOrEqual(0)
    expect(result.contentBottom - result.cardBottom).toBeLessThanOrEqual(12)
    expect(result.bodyScroll).toBe(false)
  } else {
    await page.locator('.front-desk-welcome__guide').scrollIntoViewIfNeeded()
    expect((await page.locator('.front-desk-welcome__guide img').boundingBox())!.y + (await page.locator('.front-desk-welcome__guide img').boundingBox())!.height).toBeLessThanOrEqual(result.inputTop)
  }
  await page.screenshot({ path: info.outputPath('mini-full-content.png') })
})

test('keyboard classifications and larger copy remain reachable without cropping content', async ({ page }, info) => {
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await expect(page.locator('.record-entry-actions--conversation .record-entry-grid button')).toHaveCount(4)
  await page.getByLabel('对话输入', { exact: true }).fill('这段还没有发送')
  await expect(page.locator('.front-desk-welcome--editorial')).toBeVisible()
  await page.addStyleTag({ content: '.front-desk-welcome__copy p {font-size:18px!important}' })
  await page.locator('.front-desk-welcome__knowledge').scrollIntoViewIfNeeded()
  await expect(page.locator('.front-desk-welcome__knowledge')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('mini-keyboard-large-copy.png') })
})

// Browser toolbar expansion/collapse and rotation change available height without a reload.
test('same home continuously adapts when the viewport changes', async ({ page }, info) => {
  test.skip(info.project.name !== 'mini-812', 'One continuous resize sequence covers this shared layout')
  for (const height of [932, 844, 724, 667, 646, 812]) {
    await page.setViewportSize({ width: 375, height })
    await expect.poll(async () => page.locator('.front-desk-welcome__entries').evaluate(cards => {
      const body = cards.closest('.smart-record-page__body')!
      return Math.round(body.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom) - cards.getBoundingClientRect().bottom)
    }), `bottom gap at ${height}`).toBeGreaterThanOrEqual(0)
    await expect.poll(async () => page.locator('.front-desk-welcome__entries').evaluate(cards => {
      const body = cards.closest('.smart-record-page__body')!
      return Math.round(body.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom) - cards.getBoundingClientRect().bottom)
    }), `bottom gap at ${height}`).toBeLessThanOrEqual(12)
    expect(await page.locator('.smart-record-page__body').evaluate(body => body.scrollHeight <= body.clientHeight + 1)).toBe(true)
  }
})
