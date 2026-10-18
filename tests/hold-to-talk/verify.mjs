import assert from 'node:assert/strict'
import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
await mkdir('.codex-tmp/approved-profile-local', { recursive: true })
let browser
try {
 for (const mode of ['standalone', 'composer', 'expanded']) {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-gpu', '--disable-dev-shm-usage'] })
  const composer = mode !== 'standalone', expanded = mode === 'expanded'
  const context = await browser.newContext({ ...devices['iPhone SE'], serviceWorkers: 'block' })
  await context.addInitScript(() => { window.vibrations = []; Object.defineProperty(navigator, 'vibrate', { value: n => { window.vibrations.push(n); return true } }) })
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message))
  const url = `http://127.0.0.1:4207/tests/hold-to-talk/index.html?${composer ? 'composer' : ''}${expanded ? '&expanded' : ''}`
  const counts = () => page.locator('output').textContent().then(JSON.parse)
  const hold = page.locator('.hoho-hold-to-talk')
  async function down() { const b = await hold.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); return b }
  await page.goto(url); await hold.waitFor()
  const normal = await hold.evaluate(el => getComputedStyle(el).backgroundColor)
  const b = await down()
  assert.equal(await page.locator('.hoho-hold-feedback__halo').count(), 1)
  await page.waitForFunction(normal => getComputedStyle(document.querySelector('.hoho-hold-to-talk')).backgroundColor !== normal, normal)
  await page.getByText(expanded ? '正在录音' : '正在录音 · 松开即结束', { exact: true }).waitFor()
  if (expanded) {
    await page.getByLabel('已录音0秒').waitFor(); await page.getByLabel('已录音1秒').waitFor()
    const panel = await page.locator('.hoho-hold-feedback__status').boundingBox()
    assert(panel.x >= 0 && panel.x + panel.width <= page.viewportSize().width); assert(panel.y + panel.height < b.y)
    await page.getByText('松开后显示文字', { exact: true }).waitFor()
  }
  const pos = await page.locator('.hoho-hold-feedback').evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }))
  assert(Math.abs(pos.x - (b.x + b.width / 2)) < 2); assert(Math.abs(pos.y - (b.y + b.height / 2)) < 2)
  await page.mouse.up(); assert.deepEqual(await counts(), { start: 1, stop: 1, discard: 0 }); assert.equal(await page.locator('.hoho-hold-feedback').count(), 0)
  await down(); await page.mouse.up(); await page.waitForTimeout(300)
  assert.deepEqual(await counts(), { start: 2, stop: 2, discard: 0 }); assert.equal(await hold.getAttribute('aria-pressed'), 'false')
  const slide = await down(); await page.mouse.move(slide.x + slide.width / 2, slide.y - 90)
  await page.getByText('移回继续录音', { exact: true }).waitFor(); await page.mouse.up()
  assert.deepEqual(await counts(), { start: 3, stop: 2, discard: 1 })
  await down(); await hold.dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up()
  assert.deepEqual(await counts(), { start: 4, stop: 2, discard: 2 })
  await hold.focus(); await page.keyboard.down('Space'); await page.getByText(expanded ? '正在录音' : '正在录音 · 松开即结束', { exact: true }).waitFor(); await page.keyboard.up('Space')
  assert.deepEqual(await counts(), { start: 5, stop: 3, discard: 2 })
  await down(); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up()
  assert.deepEqual(await counts(), { start: 6, stop: 3, discard: 3 })
  assert.equal((await page.evaluate(() => window.vibrations)).length, 6)
  await page.goto(url + '&denied'); await down(); await page.waitForTimeout(300); assert.equal(await page.locator('.hoho-hold-feedback').count(), 0); await page.mouse.up()
  assert.deepEqual(await counts(), { start: 1, stop: 0, discard: 0 })
  if (expanded) for (const width of [320, 390, 430]) {
    await page.setViewportSize({width,height:844}); await page.goto(url); const button = await down(); await page.getByText('正在录音', {exact:true}).waitFor()
    const panel = await page.locator('.hoho-hold-feedback__status').boundingBox(); assert(panel.x >= 0 && panel.x + panel.width <= width); assert(panel.y + panel.height < button.y)
    await page.screenshot({path:`.codex-tmp/approved-profile-local/held-${width}.png`})
    await page.mouse.up(); assert.equal(await page.locator('.hoho-hold-feedback').count(), 0)
  }
  assert.deepEqual(errors, []); await context.close(); await browser.close(); browser = undefined
  console.log(`${composer ? 'DialogueComposer' : 'Standalone'}: hold/release, early release, slide cancel, pointer cancel, keyboard, blur, denied permission, halo and haptics PASS`)
 }
} finally { await browser?.close() }
