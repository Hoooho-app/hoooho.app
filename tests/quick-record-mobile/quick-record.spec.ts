import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'quick-record-e2e-account'
const memberId = 'quick-record-e2e-member'
const token = new TokenService('quick-record-mobile-e2e-secret', 60 * 60_000).create({ id: accountId })
const photo = { name: '体温.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }

async function preparePage(page: Page, microphone: 'allow' | 'deny' = 'allow') {
  await page.addInitScript(({ authToken, account, member, permission }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: account }, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 5 }))
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => {
        window.__getUserMediaCalls = (window.__getUserMediaCalls ?? 0) + 1
        if (permission === 'deny') throw new DOMException('denied', 'NotAllowedError')
        return { getTracks: () => [{ stop: () => { window.__trackStops = (window.__trackStops ?? 0) + 1 } }] }
      }
    } })
    class FakeRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onend: null | (() => void) = null
      onerror: null | ((event: { error?: string }) => void) = null
      onresult: null | ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) = null
      start() {
        window.__recognitionStarts = (window.__recognitionStarts ?? 0) + 1
        window.setTimeout(() => this.onresult?.({ results: [{ 0: { transcript: '头有点疼' } }] }), 40)
      }
      stop() { window.__recognitionStops = (window.__recognitionStops ?? 0) + 1; this.onend?.() }
      abort() { window.__recognitionAborts = (window.__recognitionAborts ?? 0) + 1 }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeRecognition })
  }, { authToken: token, account: accountId, member: memberId, permission: microphone })
  await page.goto('/health-events')
  await expect(page.getByRole('button', { name: '快速记录' })).toBeVisible()
}

async function coordinateClick(page: Page, role: 'button' | 'textbox', name: string | RegExp) {
  const locator = page.getByRole(role, { name })
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    const control = element?.closest('button,textarea,input')
    return {
      tag: control?.tagName,
      text: (control?.getAttribute('aria-label') || control?.textContent || '').trim(),
      stack: document.elementsFromPoint(x, y).slice(0, 5).map((item) => `${item.tagName}.${item.className}`)
    }
  }, point)
  expect(hit.tag, `elementFromPoint(${point.x}, ${point.y}): ${hit.stack.join(' > ')}`).toBe(role === 'textbox' ? 'TEXTAREA' : 'BUTTON')
  await page.mouse.click(point.x, point.y)
  return locator
}

async function doubleActivate(page: Page, name: string) {
  const locator = page.getByRole('button', { name })
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') || document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim(), point)).toContain(name)
  await locator.evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
}

test('iPhone SE 默认文字草稿的控件命中、照片失败重试、预览删除和键盘布局', async ({ page }) => {
  await preparePage(page)
  await coordinateClick(page, 'button', '快速记录')
  await expect(page.getByRole('textbox', { name: '快捷记录文字' })).toBeVisible()
  await expect(page.getByText('上传照片', { exact: true })).toBeVisible()
  await expect(page.getByText('0/10', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开当前健康随记的下一步' })).toBeHidden()
  expect(await page.locator('input[type=file]').evaluate((el) => { const rect = el.getBoundingClientRect(); return rect.width * rect.height })).toBe(0)

  const input = await coordinateClick(page, 'textbox', '快捷记录文字')
  await expect(input).toBeFocused()
  await input.fill('头有点疼')

  let uploadAttempt = 0
  await page.route('**/api/quick-records/*/photos', async (route) => {
    if (route.request().method() === 'POST' && uploadAttempt++ === 0) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '上传失败，请重试' } }) })
    } else await route.continue()
  })
  const chooserPromise = page.waitForEvent('filechooser')
  await coordinateClick(page, 'button', '上传照片')
  const chooser = await chooserPromise
  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles(photo)
  const retry = page.getByRole('button', { name: /重试上传/ })
  await expect(retry).toBeVisible()
  await coordinateClick(page, 'button', /重试上传/)
  await expect(page.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '查看照片 1' })).toBeVisible()
  await coordinateClick(page, 'button', '查看照片 1')
  await expect(page.getByRole('dialog', { name: '照片预览' })).toBeVisible()
  await coordinateClick(page, 'button', '关闭大图预览')
  await expect(page.getByRole('textbox', { name: '快捷记录文字' })).toHaveValue('头有点疼')
  await coordinateClick(page, 'button', '删除照片 1')
  await expect(page.getByText('0/10', { exact: true })).toBeVisible()

  const chooserAgain = page.waitForEvent('filechooser')
  await coordinateClick(page, 'button', '上传照片')
  await (await chooserAgain).setFiles(photo)
  await expect(page.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(1)
  await expect(page.getByText('1/10', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 430 })
  const panel = page.getByRole('region', { name: '快捷记录', exact: true })
  const panelBox = await panel.boundingBox()
  const actionBox = await page.getByRole('button', { name: '继续核对' }).boundingBox()
  expect(panelBox!.x).toBeGreaterThanOrEqual(0)
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(375)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(430)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await coordinateClick(page, 'button', '继续核对')
  await expect(page.getByRole('region', { name: '核对原话' })).toBeVisible()
  await expect(page.getByText('1/10', { exact: true })).toBeVisible()
  await coordinateClick(page, 'button', '重新说')
  await expect(page.getByRole('region', { name: '快捷记录听写' })).toBeVisible()
  await expect(page.getByText('1/10', { exact: true })).toBeVisible()
})

test('语音权限、单实例、计时、结束、重新说和保存保持视频节点', async ({ page }) => {
  await preparePage(page)
  await coordinateClick(page, 'button', '快速记录')
  const videoIdentity = await page.locator('video').first().evaluate((video) => { video.dataset.e2eIdentity = 'stable-video'; return video.currentTime })
  await doubleActivate(page, '想用语音记录？')
  await page.waitForTimeout(200)
  const voiceDiagnostic = await page.evaluate(() => ({
    media: window.__getUserMediaCalls,
    recognition: window.__recognitionStarts,
    alert: document.querySelector('[role="alert"]')?.textContent,
    mediaSource: String(navigator.mediaDevices?.getUserMedia)
  }))
  expect(page.getByRole('alert'), JSON.stringify(voiceDiagnostic)).toHaveCount(0)
  await expect(page.getByRole('region', { name: '快捷记录听写' })).toBeVisible()
  await expect(page.getByText('头有点疼', { exact: true })).toBeVisible()
  await page.waitForTimeout(1100)
  await expect(page.getByLabel('录音时长 00:01')).toBeVisible()
  expect(await page.evaluate(() => ({ media: window.__getUserMediaCalls, recognition: window.__recognitionStarts }))).toEqual({ media: 1, recognition: 1 })
  await coordinateClick(page, 'button', '结束听写')
  await expect(page.getByRole('region', { name: '核对原话' })).toBeVisible()
  await coordinateClick(page, 'button', '重新说')
  await expect(page.getByRole('region', { name: '快捷记录听写' })).toBeVisible()
  await page.waitForTimeout(1100)
  await coordinateClick(page, 'button', '结束听写')
  await coordinateClick(page, 'button', '确认保存')
  await expect(page.getByText('已记录', { exact: true }).first()).toBeVisible()
  const videoAfter = await page.locator('video[data-e2e-identity="stable-video"]').evaluate((video) => video.currentTime)
  expect(videoAfter).toBeGreaterThanOrEqual(videoIdentity)
  expect(await page.evaluate(() => window.__trackStops)).toBeGreaterThanOrEqual(2)
})

test('麦克风拒绝提供明确反馈且取消仍可点击', async ({ page }) => {
  await preparePage(page, 'deny')
  await coordinateClick(page, 'button', '快速记录')
  await coordinateClick(page, 'button', '想用语音记录？')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText(/麦克风|权限/).first()).toBeVisible()
  await coordinateClick(page, 'button', '取消')
  await expect(page.getByRole('button', { name: '快速记录' })).toBeVisible()
})

test('多选照片限制为10张并隐藏继续上传入口', async ({ page }) => {
  await preparePage(page)
  await coordinateClick(page, 'button', '快速记录')
  const chooserPromise = page.waitForEvent('filechooser')
  await coordinateClick(page, 'button', '上传照片')
  const files = Array.from({ length: 11 }, (_, index) => ({ ...photo, name: `照片-${index + 1}.png` }))
  await (await chooserPromise).setFiles(files)
  await expect(page.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(10)
  await expect(page.getByText('10/10', { exact: true })).toBeVisible()
  await expect(page.getByText('最多上传10张照片', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续上传照片' })).toHaveCount(0)
})

test('保存失败保留核对文字和已上传照片并可再次保存', async ({ page }) => {
  await preparePage(page)
  await coordinateClick(page, 'button', '快速记录')
  await page.getByRole('textbox', { name: '快捷记录文字' }).fill('头有点疼')
  const chooserPromise = page.waitForEvent('filechooser')
  await coordinateClick(page, 'button', '上传照片')
  await (await chooserPromise).setFiles(photo)
  await expect(page.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(1)
  await coordinateClick(page, 'button', '继续核对')
  await expect(page.getByRole('region', { name: '核对原话' })).toBeVisible()
  await page.route('**/api/quick-records', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '保存失败，请重试' } }) }))
  await coordinateClick(page, 'button', '确认保存')
  await expect(page.getByRole('region', { name: '核对原话' })).toBeVisible()
  await expect(page.getByText('1/10', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '编辑识别原话' })).toHaveValue('头有点疼')
  await page.unroute('**/api/quick-records')
  await coordinateClick(page, 'button', '确认保存')
  await expect(page.getByText('已记录', { exact: true }).first()).toBeVisible()
})

declare global {
  interface Window {
    __getUserMediaCalls?: number
    __recognitionStarts?: number
    __recognitionStops?: number
    __recognitionAborts?: number
    __trackStops?: number
    SpeechRecognition?: unknown
    webkitSpeechRecognition?: unknown
  }
}
