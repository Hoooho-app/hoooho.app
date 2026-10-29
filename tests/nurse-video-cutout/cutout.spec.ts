import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }

async function openHome(page: Page, memberId: string) {
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test', nickname: '测试家长' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/nurse-station')
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeEnabled()
}

test.beforeEach(async ({ request }) => {
  await request.get('http://127.0.0.1:4198/success')
})

async function member(request: import('@playwright/test').APIRequestContext) {
  const result = await request.post('/api/members', { headers, data: { name: '素材测试', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(result.ok()).toBe(true)
  return (await result.json()).id as string
}

const visual = '.front-desk-welcome .idle-nurse-visual'

test('animated foreground is transparent, retains white costume and loops without a white frame', async ({ page, request }, info) => {
  await openHome(page, await member(request))
  const root = page.locator(visual)
  await expect(root).toHaveAttribute('data-cutout-ready', 'true')
  const canvas = root.locator('canvas')
  const alpha = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d')!
    return [[0,0],[359,0],[0,359],[359,359],[180,240],[120,77]].map(([x,y]) => Array.from(context.getImageData(x,y,1,1).data))
  })
  expect(alpha.slice(0,4).map(pixel => pixel[3])).toEqual([0,0,0,0])
  expect(alpha[4][3]).toBe(255)
  expect(alpha[5][3]).toBeGreaterThan(245)
  expect(Math.min(...alpha[5].slice(0,3))).toBeGreaterThan(200)
  await expect(root).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(root).toHaveCSS('mix-blend-mode', 'normal')
  await expect(root.locator('video')).toHaveCSS('opacity', '0')
  await expect(root.locator('img')).toHaveCSS('opacity', '0')
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(80,90,100,110).data
    let total = 0
    for (let i=0; i<data.length; i+=4) total += data[i]
    return total
  })
  const before = await pixels()
  await expect.poll(pixels).not.toBe(before)
  await root.locator('video').evaluate((element: HTMLVideoElement) => { element.currentTime = element.duration - .2 })
  await expect.poll(() => root.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime)).toBeLessThan(2)
  await expect.poll(() => root.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('transparent-home.png'), fullPage: true })
  // Purple makes any studio-background rectangle or tinted white uniform obvious.
  await page.locator('.front-desk-welcome__media').evaluate(element => { (element as HTMLElement).style.backgroundColor = '#e3daf4' })
  await page.screenshot({ path: info.outputPath('transparent-on-purple.png') })
})

test('reduced motion uses the transparent poster and returns to animation', async ({ page, request }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openHome(page, await member(request))
  const root = page.locator(visual)
  await expect(root).toHaveAttribute('data-reduced-motion', 'true')
  await expect.poll(() => root.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
  await expect(root.locator('img')).toHaveCSS('opacity', '1')
  await expect(root.locator('canvas')).toHaveCSS('opacity', '0')
  await page.screenshot({ path: info.outputPath('reduced-motion.png') })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(root).toHaveAttribute('data-cutout-ready', 'true')
  await expect.poll(() => root.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
})

test('failed media keeps the transparent poster and recording controls usable', async ({ page, request }, info) => {
  await page.route(/nurse-station-cutout-packed-.*\.(mp4|webm)/, route => route.abort())
  await openHome(page, await member(request))
  const root = page.locator(visual)
  await expect.poll(() => root.locator('video').evaluate((element: HTMLVideoElement) => element.networkState)).toBe(3)
  await expect(root).toHaveAttribute('data-cutout-ready', 'false')
  await expect(root.locator('img')).toHaveCSS('opacity', '1')
  expect(await root.locator('img').evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 360)).toBe(true)
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await expect(page.locator('.record-entry-actions--conversation .record-entry-grid button')).toHaveCount(4)
  await page.screenshot({ path: info.outputPath('media-fallback.png') })
})

test('leaving and reopening the page restores playback', async ({ page, request }) => {
  await openHome(page, await member(request))
  await expect(page.locator(visual)).toHaveAttribute('data-cutout-ready', 'true')
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '健康日历', exact: true }).click()
  await expect(page.locator(visual)).toHaveCount(0)
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '症状记录', exact: true }).click()
  await expect(page.locator(visual)).toHaveAttribute('data-cutout-ready', 'true')
  await expect.poll(() => page.locator(`${visual} video`).evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
})
