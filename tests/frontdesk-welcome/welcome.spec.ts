import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
const intro = '.front-desk-welcome--editorial'

test.beforeEach(async ({ page, request }) => {
  await request.get('http://127.0.0.1:4198/success')
  const response = await request.post('/api/members', { headers, data: { name: '示例女儿', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(response.ok()).toBe(true)
  const memberId = (await response.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/nurse-station')
  await expect(page.locator(intro)).toBeVisible()
})

test('home keeps one fixed sprout entrance and replaces daily care with the readable recording workflow', async ({ page }, info) => {
  const welcome = page.locator(intro)
  const entry = page.getByRole('button', { name: '呵护之旅', exact: true })
  await expect(entry).toBeVisible()
  await expect(entry.locator('img')).toHaveAttribute('src', /two-leaf-sprout/)
  await expect(welcome.locator('video, canvas')).toHaveCount(0)
  const portrait = welcome.locator('.front-desk-welcome__portrait')
  await expect(portrait).toHaveAttribute('alt', '戴眼镜与口罩的黑发护士，一手拿病历夹、一手拿笔')
  await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 480)).toBe(true)
  await expect(portrait).toHaveCSS('object-fit', 'contain')
  await expect(welcome.locator('.front-desk-welcome__entry')).toHaveCount(2)
  const entries = await welcome.locator('.front-desk-welcome__entry').evaluateAll(nodes => nodes.map(el => ({ name: el.getAttribute('aria-label'), x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })))
  expect(entries[0].name).toContain('怎么用护护')
  expect(entries[1].name).toBe('怎么用护护：虚构情景示意')
  expect(entries[0].x).toBeLessThan(entries[1].x)
  expect(entries[0].y).toBe(entries[1].y)
  const flow = page.getByRole('article', { name: '怎么用护护：虚构情景示意' })
  await expect(flow.getByRole('group')).toHaveCount(1)
  await expect(flow.locator('.front-desk-workflow__header')).toHaveCount(0)
  await expect(flow.getByRole('button')).toHaveCount(0)
  await expect(flow.getByText(/^(怎么用护护|重播|演示)$/)).toHaveCount(0)
  for (const card of await welcome.locator('.front-desk-welcome__entry').all()) {
    await expect(card).toHaveCSS('box-shadow', 'none')
    expect(await card.evaluate(node => {
      const reference = document.createElement('span')
      reference.style.backgroundColor = 'rgb(var(--hoho-color-primary-soft))'
      node.append(reference)
      const matches = getComputedStyle(node).backgroundColor === getComputedStyle(reference).backgroundColor
      reference.remove()
      return matches
    })).toBe(true)
  }
  await expect(flow.locator('.front-desk-workflow__case img')).toHaveAttribute('src', /symptom-arm/)
  await expect(flow.getByText('出现症状', { exact: true })).toBeVisible()
  await expect(flow.getByRole('progressbar').locator(':scope > span')).toHaveCount(6)
  await expect(flow.getByText(/一个例子|共6步|0[1-6] \/ 06/)).toHaveCount(0)
  await expect(welcome.getByRole('button', { name: /领取/ })).toHaveCount(0)
  await expect(welcome.getByText('今日呵护', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const entryBox = (await entry.boundingBox())!
  const childBox = (await page.getByRole('button', { name: '切换记录对象', exact: true }).boundingBox())!
  const searchBox = (await page.getByRole('button', { name: '快速查找', exact: true }).boundingBox())!
  expect(entryBox.x).toBeGreaterThanOrEqual(childBox.x + childBox.width)
  expect(entryBox.x + entryBox.width).toBeLessThanOrEqual(searchBox.x)
  expect(entryBox.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: info.outputPath('welcome.png'), fullPage: true })
  await entry.click()
  await expect(page).toHaveURL(/\/care-journey$/)
  await expect(page.getByRole('heading', { name: '呵护之旅', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(flow).toBeVisible()
  await expect(entry).toBeVisible()
})

test('home guide opens help and returns without posting; unsent text, refresh and cancelled media retain the introduction', async ({ page }, info) => {
  const guide = page.getByRole('button', { name: '怎么用护护：边照顾，边记录', exact: true })
  await guide.click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByRole('heading', { name: '帮助中心', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /手动记一件发生的事/ }).click()
  await expect(page.getByRole('heading', { name: '怎么做', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByLabel('搜索教程和问题')).toBeVisible()
  await page.screenshot({ path: info.outputPath('home-help.png') })
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(guide).toBeVisible()
  await expect(page.locator('.nurse-turn')).toHaveCount(0)
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  const input = page.getByLabel('对话输入', { exact: true })
  await input.fill('这段还没发送')
  await guide.click()
  await expect(page).toHaveURL(/\/help$/)
  await page.goBack()
  await expect(input).toHaveValue('这段还没发送')
  await expect(page.locator(intro)).toBeVisible()
  await page.reload()
  await expect(input).toHaveValue('这段还没发送')
  await expect(page.locator(intro)).toBeVisible()
  await expect(page.getByRole('button', { name: '添加照片、视频或文件', exact: true })).toBeVisible()
  await page.evaluate(() => { window.hooohoNativeAttachments = async () => { throw new DOMException('已取消', 'AbortError') } })
  await page.getByRole('button', { name: '添加照片、视频或文件', exact: true }).click()
  await expect(page.locator(intro)).toBeVisible()
  await expect(input).toHaveValue('这段还没发送')
})

async function send(page: Page) {
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('今天下午开始发烧，晚饭只吃了几口。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
}

test('first bubble removes every intro area; restored history stays clear and an explicit new conversation restores it', async ({ page, request }, info) => {
  await request.get('http://127.0.0.1:4198/delay?ms=1200')
  await send(page)
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator(intro)).toHaveCount(0)
  await expect(page.locator('.front-desk-welcome video')).toHaveCount(0)
  await expect(page.locator('.nurse-turn--assistant')).not.toHaveCount(0)
  const careEntry = page.getByRole('button', { name: '呵护之旅', exact: true })
  await expect(careEntry).toBeVisible()
  await expect(careEntry.locator('img')).toHaveAttribute('src', /two-leaf-sprout/)
  const entryBox = (await careEntry.boundingBox())!
  const childBox = (await page.getByRole('button', { name: '切换记录对象', exact: true }).boundingBox())!
  const searchBox = (await page.getByRole('button', { name: '快速查找', exact: true }).boundingBox())!
  expect(entryBox.x).toBeGreaterThanOrEqual(childBox.x + childBox.width)
  expect(entryBox.x + entryBox.width).toBeLessThanOrEqual(searchBox.x)
  await careEntry.click()
  await expect(page).toHaveURL(/\/care-journey$/)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(careEntry).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeEnabled()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator(intro)).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('first-bubble-restored.png') })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true })).toBeEnabled()
  await drawer.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.locator(intro)).toBeVisible()
  await expect(page.locator('.nurse-turn')).toHaveCount(0)
  await expect(careEntry).toBeVisible()
})

test('failed first input keeps its retry bubble instead of returning the introduction', async ({ page, request }) => {
  await request.get('http://127.0.0.1:4198/failure')
  await send(page)
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator(intro)).toHaveCount(0)
  await expect(page.locator('.front-desk-failed-actions')).toBeVisible()
  await expect(page.getByRole('button', { name: '呵护之旅', exact: true })).toBeVisible()
  await expect(page.locator('.front-desk-failed-actions').getByRole('button')).toHaveText(['重试', '移除'])
})

test('cancelling a recording keeps the intro; releasing a voice message removes it during transcription', async ({ page, request }) => {
  await page.route('**/api/ai/audio/live**', route => route.abort())
  await request.get('http://127.0.0.1:4198/delay?ms=1600')
  await page.getByRole('button', { name: '按住记录症状', exact: true }).focus()
  await page.keyboard.down('Space')
  await expect(page.getByRole('button', { name: '正在录音，松开即结束', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.up('Space')
  await expect(page.locator(intro)).toBeVisible()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await page.getByRole('button', { name: '按住记录症状', exact: true }).focus()
  await page.keyboard.down('Space')
  await expect(page.getByRole('button', { name: '正在录音，松开即结束', exact: true })).toBeVisible()
  await page.waitForTimeout(800)
  await page.keyboard.up('Space')
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator(intro)).toHaveCount(0)
  await expect(page.locator('.nurse-turn--user [role="status"]')).toBeVisible()
})


test('six-scene workflow maps the case page, shows export handoffs and loops without business writes', async ({ page }, info) => {
  await page.clock.install()
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/(?:care-journey|ai\/front-desk|events)/.test(request.url())) writes.push(request.url()) })
  await page.reload()
  const flow = page.locator('.front-desk-workflow')
  await expect(flow).toHaveAttribute('data-playing', 'true')
  await page.locator('.front-desk-welcome__hero').click()
  await expect(page.getByRole('dialog', { name: '认识你的记录员' })).toBeVisible()
  await expect(flow).toHaveAttribute('data-playing', 'false')
  const underDialog = await flow.getAttribute('data-step')
  await page.clock.runFor(10000)
  await expect(flow).toHaveAttribute('data-step', underDialog!)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect(flow).toHaveAttribute('data-playing', 'true')
  await flow.hover()
  await expect(flow).toHaveAttribute('data-playing', 'false')
  await flow.focus()
  await page.mouse.move(0, 0)
  await expect(flow).toHaveAttribute('data-playing', 'false')
  const held = await flow.getAttribute('data-step')
  await page.clock.runFor(10000)
  await expect(flow).toHaveAttribute('data-step', held!)
  await flow.evaluate(node => (node as HTMLElement).blur())
  await page.mouse.move(0, 0)
  const nextScene = async (expected: string) => {
    for (let i = 0; i < 260 && await flow.getAttribute('data-step') !== expected; i++) await page.clock.runFor(100)
    await expect(flow).toHaveAttribute('data-step', expected)
    await expect(flow.getByRole('group')).toHaveCount(1)
  }
  await nextScene('1')
  await expect(flow.getByRole('group')).toHaveAttribute('aria-label', '说出孩子的情况')
  await page.clock.runFor(3000)
  await flow.screenshot({ animations: 'disabled', path: info.outputPath('workflow-voice.png') })
  await nextScene('2')
  await page.clock.runFor(2400)
  await flow.screenshot({ animations: 'disabled', path: info.outputPath('workflow-question.png') })
  await nextScene('3')
  await page.clock.runFor(2000)
  await expect(flow.getByText('待核对', { exact: true })).toBeVisible()
  await page.clock.runFor(2100)
  await expect(flow.locator('.front-desk-workflow__record-head')).toContainText('已保存')
  await flow.screenshot({ animations: 'disabled', path: info.outputPath('workflow-record.png') })
  await nextScene('4')
  await expect(flow.getByLabel('情况单页面结构')).toBeVisible()
  await expect(flow.getByText('孩子信息', { exact: true })).toBeVisible()
  await expect(flow.getByRole('list', { name: '情况单栏目' }).getByRole('listitem')).toHaveText(['主诉', '现病史', '体格情况', '本次想问'])
  await page.clock.runFor(3000)
  await flow.screenshot({ animations: 'disabled', path: info.outputPath('workflow-summary.png') })
  await nextScene('5')
  await expect(flow.getByText('保存 · 导出', { exact: true })).toBeVisible()
  await expect(flow.getByText('保存情况单', { exact: true })).toBeVisible()
  await expect(flow.getByText('给家人、医生看', { exact: true })).toBeVisible()
  await expect(flow.getByText('复制给 AI', { exact: true })).toBeVisible()
  await expect(flow.getByText('带着资料提问', { exact: true })).toBeVisible()
  await page.clock.runFor(2800)
  await flow.screenshot({ animations: 'disabled', path: info.outputPath('workflow-handoff.png') })
  await nextScene('0')
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('还未发送的内容')
  await expect(flow).toHaveAttribute('data-playing', 'false')
  const editing = await flow.getAttribute('data-step')
  await page.clock.runFor(10000)
  await expect(flow).toHaveAttribute('data-step', editing!)
  await expect(page.getByLabel('对话输入', { exact: true })).toHaveValue('还未发送的内容')
  expect(writes).toEqual([])
  await expect(page.locator('.nurse-turn')).toHaveCount(0)
})

test('reduced motion presents the static final handoff without replay controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const flow = page.getByRole('article', { name: '怎么用护护：虚构情景示意' })
  await expect(flow).toHaveAttribute('data-step', '5')
  await expect(flow).toHaveAttribute('data-playing', 'false')
  await expect(flow.getByRole('group')).toHaveCount(1)
  await expect(flow.getByText('情况单已整理', { exact: true })).toBeVisible()
  await expect(flow.getByText('保存情况单', { exact: true })).toBeVisible()
  await expect(flow.getByText('复制给 AI', { exact: true })).toBeVisible()
  await expect(flow.getByRole('button')).toHaveCount(0)
  expect(await flow.locator('.front-desk-workflow__scene[data-state="current"], .front-desk-workflow__scene[data-state="current"] *').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none'))).toBe(true)
})


test('live scene panels remain inside the card throughout the real animation', async ({ page }, info) => {
  test.setTimeout(180000)
  test.skip(!['mobile-320', 'mobile-390'].includes(info.project.name), 'Live narrow and normal widths; other projects cover responsive state and navigation')
  const flow = page.getByRole('article', { name: '怎么用护护：虚构情景示意' })
  await page.mouse.move(0, 0)
  for (const step of [0, 1, 2, 3, 4, 5]) {
    await expect(flow).toHaveAttribute('data-step', String(step), { timeout: 30000 })
    const scene = flow.locator('.front-desk-workflow__scene[data-state="current"]')
    await expect(scene).toHaveCSS('opacity', '1')
    const frames = scene.locator('.front-desk-workflow__panel, .front-desk-workflow__origin, .front-desk-workflow__reply, .front-desk-workflow__identity, .front-desk-workflow__outline li, .front-desk-workflow__handoff, .front-desk-workflow__save')
    for (const frame of await frames.all()) await expect(frame).toHaveCSS('opacity', '1')
    // Hold the real UI once its arrival finishes; screenshots must not race the next entity.
    await flow.hover()
    await expect(flow).toHaveAttribute('data-playing', 'false')
    const bounds = (await flow.boundingBox())!
    const stage = (await flow.locator('.front-desk-workflow__stage').boundingBox())!
    const progress = (await flow.getByRole('progressbar').boundingBox())!
    const current = (await scene.boundingBox())!
    expect(current.y + current.height / 2).toBeCloseTo(stage.y + stage.height / 2, 0)
    if (step > 0) {
      const previous = flow.locator('.front-desk-workflow__scene[data-state="previous"]')
      await expect(previous).toHaveCSS('opacity', '0.28')
      expect((await previous.boundingBox())!.y + (await previous.boundingBox())!.height).toBeLessThan(current.y)
    }
    for (const frame of await frames.all()) {
      const content = (await frame.boundingBox())!
      expect(content.x).toBeGreaterThanOrEqual(bounds.x)
      expect(content.x + content.width).toBeLessThanOrEqual(bounds.x + bounds.width)
      expect(content.y).toBeGreaterThanOrEqual(stage.y)
      expect(content.y + content.height).toBeLessThanOrEqual(progress.y)
      expect(content.y + content.height).toBeLessThanOrEqual(bounds.y + bounds.height)
      expect(await frame.evaluate(node => getComputedStyle(node).boxShadow.split(/, (?![^()]*\))/).every(shadow => shadow.includes('inset')))).toBe(true)
    }
    await flow.screenshot({ animations: 'disabled', path: info.outputPath(`live-scene-${step}.png`) })
    await page.mouse.move(0, 0)
  }
  await expect(flow).toHaveAttribute('data-step', '0')
  const first = flow.locator('.front-desk-workflow__scene[data-state="current"]')
  await expect(first).toHaveCSS('opacity', '1')
  const previous = flow.locator('.front-desk-workflow__scene[data-state="previous"]')
  await expect(previous).toHaveAttribute('aria-label', '保存导出，交给他人或AI')
  expect((await previous.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y)
})

test('new entities move upward, keep the previous entity and freeze their position while paused', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'One real-time motion sample; scene geometry is covered at both mobile widths')
  const flow = page.locator('.front-desk-workflow')
  await page.mouse.move(0, 0)
  const samples = await flow.evaluate(root => new Promise<{ first: number; later: number; previousFirst: number; previousLater: number }>(resolve => {
    const observer = new MutationObserver(() => {
      if (root.getAttribute('data-step') !== '1') return
      observer.disconnect()
      const current = root.querySelector('[data-state="current"]')!
      const previous = root.querySelector('[data-state="previous"]')!
      requestAnimationFrame(() => {
        const first = current.getBoundingClientRect().y
        const previousFirst = previous.getBoundingClientRect().y
        setTimeout(() => resolve({ first, previousFirst, later: current.getBoundingClientRect().y, previousLater: previous.getBoundingClientRect().y }), 200)
      })
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-step'] })
  }))
  expect(samples.later).toBeLessThan(samples.first - 5)
  expect(samples.previousLater).toBeLessThan(samples.previousFirst - 5)
  await flow.hover()
  await expect(flow).toHaveAttribute('data-playing', 'false')
  const current = flow.locator('[data-state="current"]')
  const pausedY = (await current.boundingBox())!.y
  await page.waitForTimeout(1000)
  expect((await current.boundingBox())!.y).toBeCloseTo(pausedY, 0)
  await page.mouse.move(0, 0)
  await expect(current).toHaveCSS('opacity', '1')
  const stage = (await flow.locator('.front-desk-workflow__stage').boundingBox())!
  const settled = (await current.boundingBox())!
  expect(settled.y + settled.height / 2).toBeCloseTo(stage.y + stage.height / 2, 0)
  await flow.hover()
  await page.addStyleTag({ content: '.front-desk-workflow {--hoho-font-size-caption:20px}' })
  await expect.poll(() => flow.evaluate(root => {
    const stage = root.querySelector('.front-desk-workflow__stage')!.getBoundingClientRect()
    const current = root.querySelector('[data-state="current"]')!.getBoundingClientRect()
    return current.top >= stage.top && current.bottom <= stage.bottom
  })).toBe(true)
})
