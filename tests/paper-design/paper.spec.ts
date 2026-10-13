import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'design-quality-account'
const memberId = 'design-quality-member'
const token = new TokenService('design-quality-e2e-secret', 60 * 60_000).create({ id: accountId })
const phase = 'paper'
const evidenceRoot = path.resolve(`.codex-tmp/paper-evidence/${phase}`)
let eventId = ''

async function preparePage(page: Page) {
  await page.addInitScript(({ authToken, account, member }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: account }, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 5 }))
  }, { authToken: token, account: accountId, member: memberId })
}

test.beforeAll(async ({ request }) => {
  const created = await request.post('/api/events', {
    headers: { Authorization: `Bearer ${token}` },
    data: { memberId, title: '连续发热观察', category: 'fever', startTime: '2026-08-29T09:20:00+08:00' }
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  eventId = (await created.json()).id
  const record = await request.post(`/api/events/${eventId}/records`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'symptom', content: '上午腋温 38.2℃，有轻微头痛，喝水后精神尚可。', occurredAt: '2026-08-29T10:10:00+08:00' }
  })
  expect(record.ok(), await record.text()).toBeTruthy()
  await mkdir(evidenceRoot, { recursive: true })
})

const routes = [
  { slug: 'home', path: '/nurse-station' },
  { slug: 'cases', path: '/cases' },
  { slug: 'smart-record', path: '/smart-record' },
  { slug: 'visit-summary', path: '/visit-summary' },
  { slug: 'dietary-card', path: '/dietary-card' },
  { slug: 'food-label', path: '/food-label' },
  { slug: 'medication-reminders', path: '/medication-reminders' },
  { slug: 'desensitization-tests', path: '/desensitization-tests' },
  { slug: 'quick-search', path: '/quick-search' },
  { slug: 'help', path: '/help' },
  { slug: 'about', path: '/about' },
  { slug: 'health-events', path: '/health-events' },
  { slug: 'health-event-detail', path: () => `/health-events/${eventId}` },
  { slug: 'health-profile', path: '/health-profile' },
  { slug: 'guide', path: '/guide' },
  { slug: 'feedback', path: '/feedback' },
  { slug: 'settings', path: '/settings' }
] as const

for (const route of routes) {
  test(`${route.slug} renders without overflow and records evidence`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()))
    await preparePage(page)
    const target = typeof route.path === 'function' ? route.path() : route.path
    await page.goto(target)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    for (const header of await page.locator('.hoho-page-header, .hoho-legacy-header, .dietary-page-header, .visit-report-header').all()) {
      await expect(header).toHaveCSS('background-color', 'rgb(244, 242, 237)')
      await expect(header).toHaveCSS('backdrop-filter', 'none')
    }
    const primary = page.locator('.hoho-button[data-variant="primary"]').first()
    if (await primary.count()) {
      await expect(primary).toHaveCSS('background-color', 'rgb(89, 185, 154)')
      await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)')
      for (const icon of await primary.locator('svg').all()) await expect(icon).toHaveCSS('color', 'rgb(255, 255, 255)')
    }
    if (route.slug === 'visit-summary') await expect(page.locator('.visit-reading')).toBeVisible()
    for (const wrapper of await page.locator('.dietary-card, .visit-report, .visit-reading-card').all()) {
      await expect(wrapper).toHaveCSS('background-color', 'rgb(244, 242, 237)')
    }
    expect(new URL(page.url()).pathname).toBe(route.slug === "guide" ? "/help" : target)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
    await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-${route.slug}.png`), fullPage: true })
    const unexpected = runtimeErrors.filter(message => !(route.slug === 'visit-summary' && message.includes('status of 503')))
    expect(unexpected, unexpected.join('\n')).toEqual([])
  })
}


test('sidebar retains side drawer and expandable groups', async ({ page }) => {
  await preparePage(page)
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.hoho-drawer')).toHaveCSS('background-color', 'rgb(252, 251, 247)')
  const group = drawer.locator('button[aria-expanded]').first()
  const before = await group.getAttribute('aria-expanded')
  await group.click()
  await expect(group).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true')
  await page.screenshot({path: path.join(evidenceRoot, 'sidebar.png')})
  await drawer.getByRole('button', { name: '关闭菜单', exact: true }).click()
  await expect(drawer).toBeHidden()
})

test('recording feedback follows real stream amplitude and releases microphone', async ({ page }) => {
  await preparePage(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination()
      gain.gain.value = 0
      oscillator.connect(gain); gain.connect(output); oscillator.start(); await context.resume()
      ;(window as any).paperAudio = { context, gain, stream: output.stream }
      return output.stream
    } })
  })
  await page.goto('/smart-record')
  const hold = page.getByRole('button', { name: '按住说话' })
  await expect(hold).toBeEnabled()
  const box = (await hold.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.locator('.hoho-dialogue-recording')).toBeVisible()
  await expect.poll(() => page.locator('.hoho-dialogue-recording-wave span').nth(2).evaluate(node => parseFloat((node as HTMLElement).style.height))).toBeLessThan(5)
  await page.evaluate(() => (window as any).paperAudio.gain.gain.value = .2)
  await expect.poll(() => page.locator('.hoho-dialogue-recording-wave span').nth(2).evaluate(node => parseFloat((node as HTMLElement).style.height))).toBeGreaterThan(10)
  await page.evaluate(() => (window as any).paperAudio.gain.gain.value = 0)
  await expect.poll(() => page.locator('.hoho-dialogue-recording-wave span').nth(2).evaluate(node => parseFloat((node as HTMLElement).style.height))).toBeLessThan(5)
  await page.mouse.up()
  await expect(page.locator('.hoho-dialogue-recording')).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).paperAudio.stream.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBeTruthy()
  await page.evaluate(() => (window as any).paperAudio.context.close())
})

test('medication editor keeps paper material and existing close behavior', async ({ page }, info) => {
  await preparePage(page)
  await page.goto('/medication-reminders')
  await page.getByRole('button', {name:'新增提醒',exact:true}).click()
  const editor = page.getByRole('dialog',{name:'新增用药提醒'})
  await expect(editor).toBeVisible()
  await expect(editor).toHaveCSS('background-color','rgb(244, 242, 237)')
  await expect(editor.locator('header')).toHaveCSS('background-color','rgb(244, 242, 237)')
  await page.screenshot({path:path.join(evidenceRoot, `${info.project.name}-medication-editor.png`)})
  await editor.getByRole('button',{name:'返回',exact:true}).click()
  await expect(editor).toBeHidden()
})
