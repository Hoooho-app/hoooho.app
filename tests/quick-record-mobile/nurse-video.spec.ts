import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { readdirSync, readFileSync } from 'node:fs'

// Online media acceptance uses real deployed JS/CSS/MP4. Business requests go
// only to the isolated local fixture, never to real users or Production writes.
test.beforeEach(async ({ page }) => {
  if (!process.env.NURSE_BASE_URL) return
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const response = await page.request.fetch(`http://127.0.0.1:4190${url.pathname}${url.search}`, {
      method: route.request().method(), headers: route.request().headers(), postData: route.request().postData() ?? undefined
    })
    await route.fulfill({ response })
  })
})

test('deployed media exactly matches the verified lightweight bytes and public health is live', async ({ request }) => {
  for (const route of ['/', '/health-events', '/api/health']) expect((await request.get(route)).status()).toBe(200)
  for (const name of readdirSync('dist/assets').filter((name) => name.includes('-mobile-') && name.endsWith('.mp4'))) {
    const response = await request.get(`/assets/${name}`)
    expect(response.status()).toBe(200)
    expect(await response.body()).toEqual(readFileSync(`dist/assets/${name}`))
  }
})

const token = new TokenService('quick-record-mobile-e2e-secret', 3600_000).create({ id: 'quick-record-e2e-account' })
const visible = '.idle-nurse-visual video[data-active="true"]'
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  console.log('media failure diagnostics', await page.locator('video').evaluateAll((nodes) => nodes.map((video) => ({
    phase: video.dataset.videoPhase, active: video.dataset.active, time: video.currentTime,
    ready: video.readyState, paused: video.paused, error: video.error?.message,
    width: video.videoWidth, height: video.videoHeight, src: video.currentSrc,
    frames: video.getVideoPlaybackQuality?.().totalVideoFrames, callback: typeof video.requestVideoFrameCallback,
    pixels: (() => { try { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const ctx = c.getContext('2d')!; ctx.drawImage(video, 0, 0, 8, 8); return Array.from(ctx.getImageData(0, 0, 8, 8).data).reduce((a, b) => a + b, 0) } catch { return -1 } })()
  }))))
})
async function open(page: Page) {
  await page.addInitScript((authToken) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: 'quick-record-e2e-account' }, currentMemberId: 'quick-record-e2e-member', members: [], profile: null
    }, version: 5 }))
  }, token)
  await page.goto('/health-events')
  await expect(page.getByRole('button', { name: '快速记录' })).toBeVisible()
}
async function playing(page: Page, phase?: string) {
  const video = page.locator(phase ? `${visible}[data-video-phase="${phase}"]` : visible)
  await expect(video).toHaveCount(1)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0 && v.videoWidth > 0 && v.videoWidth === v.videoHeight && v.currentSrc.includes('-mobile-'))).toBe(true)
  // Windows WebKit reports the scaled rendering width (209 at SE), not 576.
  // Byte-for-byte media checks independently prove the encoded asset identity.
  if (page.context().browser()!.browserType().name() !== 'webkit') {
    expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(576)
  }
}

test('real frames, sequential requests, two idle loops, cached refresh and stable mobile layouts', async ({ page }) => {
  test.setTimeout(60_000)
  const requests: string[] = []
  page.on('request', (request) => { if (request.url().endsWith('.mp4')) requests.push(request.url()) })
  const start = Date.now()
  await open(page)
  await playing(page, 'intro0')
  console.log('first moving frame ms', Date.now() - start)
  expect(requests.every((url) => url.includes('-mobile-'))).toBe(true)
  expect(requests.some((url) => url.includes('loop-2') || url.includes('save-success'))).toBe(false)
  await expect(page.locator('.idle-nurse-visual img, .idle-nurse-visual video[poster]')).toHaveCount(0)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : width === 390 ? 844 : 932 })
    const geometry = await page.locator('.nurse-triage-desk').evaluate((el) => {
      const box = el.getBoundingClientRect()
      return { width: box.width, height: box.height, center: box.x + box.width / 2, parent: el.parentElement!.clientWidth }
    })
    expect(geometry.width).toBeCloseTo(Math.min(geometry.parent * 0.608, 272), 0)
    expect(geometry.height).toBeCloseTo(geometry.width, 0)
    expect(geometry.center).toBeCloseTo(width / 2, 0)
    await page.screenshot({ path: `test-results/nurse-video-${width}.png` })
  }
  await playing(page, 'idle1')
  await playing(page, 'idle2')
  await playing(page, 'idle1')
  expect(requests.filter((url) => url.includes('save-success'))).toHaveLength(0)
  console.log('video requests after two loops', requests.map((url) => url.split('/').pop()))
  const before = await page.locator('.nurse-triage-desk').boundingBox()
  await page.reload()
  await playing(page, 'intro0')
  expect(await page.locator('.nurse-triage-desk').boundingBox()).toEqual(before)
  console.log('cached media entries', await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('-mobile-')).map((e: PerformanceResourceTiming) => ({ transfer: e.transferSize, bytes: e.decodedBodySize }))))
  if (process.env.NURSE_BASE_URL || page.context().browser()!.browserType().name() === 'webkit') return // CDP cache proof is Chromium-only, without API routing.
  const session = await page.context().newCDPSession(page)
  await session.send('Network.enable')
  const cacheHits: string[] = []
  session.on('Network.responseReceived', ({ response }) => {
    if (response.fromDiskCache && response.url.includes('-mobile-')) cacheHits.push(response.url)
  })
  await page.goto('about:blank')
  await page.goto('/health-events')
  await playing(page)
  expect(cacheHits.length).toBeGreaterThan(0)
})

test('buffer threshold hides stale frames, recovery requires fresh frames, pause is blank', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLVideoElement.prototype.requestVideoFrameCallback
    if (!native) {
      const read = CanvasRenderingContext2D.prototype.getImageData
      let previous: ImageData | undefined
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        if (document.documentElement.dataset.freezeFrames === 'true' && previous) return previous
        previous = read.apply(this, args)
        return previous
      }
      return
    }
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
      return native.call(this, (now, metadata) => {
        if (document.documentElement.dataset.freezeFrames === 'true') metadata.mediaTime = 123
        callback(now, metadata)
      })
    }
  })
  await open(page)
  await playing(page)
  const box = await page.getByRole('button', { name: '快速记录' }).boundingBox()
  await page.evaluate(() => { document.documentElement.dataset.freezeFrames = 'true' })
  await page.waitForTimeout(600)
  await expect(page.locator(visible)).toHaveCount(1)
  await expect(page.locator(visible)).toHaveCount(0, { timeout: 2000 })
  expect(await page.getByRole('button', { name: '快速记录' }).boundingBox()).toEqual(box)
  await page.evaluate(() => { document.documentElement.dataset.freezeFrames = 'false' })
  await playing(page)
  await page.locator(visible).evaluate((video: HTMLVideoElement) => video.pause())
  await expect(page.locator(visible)).toHaveCount(0)
})

test('ended frame disappears while the next video is unavailable', async ({ page }) => {
  // WebKit's native media loader bypasses Playwright routing on Windows.
  // Point this clip at a real 404 so both engines exercise a failed resource.
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      ...descriptor,
      set(value: string) { descriptor.set!.call(this, value.includes('loop-1-mobile') ? '/missing-nurse-video.mp4' : value) }
    })
  })
  await open(page)
  await playing(page, 'intro0')
  await expect.poll(() => page.locator('video[data-video-phase="idle1"]').evaluate((v: HTMLVideoElement) => v.error?.code ?? 0)).toBeGreaterThan(0)
  await page.waitForTimeout(6500)
  await expect(page.locator(visible)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '快速记录' })).toBeEnabled()
})

test('blocked autoplay and failed video requests stay white without blocking input', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
  })
  await page.route('**/*.mp4', (route) => route.abort())
  await open(page)
  await page.waitForTimeout(1200)
  await expect(page.locator(visible)).toHaveCount(0)
  await page.getByRole('button', { name: '快速记录' }).click()
  await expect(page.getByRole('textbox', { name: '快捷记录文字' })).toBeVisible()
})

test('slow media starts with blank and becomes visible after decoding', async ({ page }) => {
  const session = await page.context().newCDPSession(page)
  await session.send('Network.enable')
  await page.route('**/*intro-0-mobile*.mp4', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: 200, downloadThroughput: 64_000, uploadThroughput: 32_000 })
    await route.continue()
  })
  await open(page)
  await expect(page.locator(visible)).toHaveCount(0)
  await playing(page, 'intro0')
})

test('list switch and page lifecycle retain nodes and resume idle without repeating welcome', async ({ page }) => {
  await open(page)
  await playing(page, 'intro0')
  await page.locator('.idle-nurse-visual').evaluate((el) => { el.setAttribute('data-identity', 'same') })
  await page.getByRole('button', { name: '列表视图', exact: true }).click()
  await expect(page.locator(visible)).toHaveCount(0)
  await page.getByRole('button', { name: '前台视图', exact: true }).click()
  await playing(page, 'idle1')
  await expect(page.locator('.idle-nurse-visual')).toHaveAttribute('data-identity', 'same')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect(page.locator(visible)).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')))
  await playing(page, 'idle1')
})

test('MP4 byte probes, suffix and invalid ranges use the real production server', async ({ page, request }) => {
  await open(page)
  await playing(page)
  const src = await page.locator(visible).getAttribute('src')
  const head = await request.head(src!)
  expect(head.headers()['accept-ranges']).toBe('bytes')
  expect(head.headers()['cache-control']).toContain('immutable')
  const cached = await request.get(src!, { headers: { 'If-None-Match': head.headers().etag } })
  expect(cached.status()).toBe(304)
  expect((await cached.body()).length).toBe(0)
  const range = await request.get(src!, { headers: { Range: 'bytes=0-1' } })
  expect(range.status()).toBe(206)
  expect((await range.body()).length).toBe(2)
  const suffix = await request.get(src!, { headers: { Range: 'bytes=-10' } })
  expect(suffix.status()).toBe(206)
  expect((await suffix.body()).length).toBe(10)
  expect((await request.get(src!, { headers: { Range: 'bytes=999999999-' } })).status()).toBe(416)
})
