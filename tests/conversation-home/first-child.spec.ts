import { test as base, expect, chromium, type Page } from '@playwright/test'
import { answerFirstChild, createFirstChild, prepareFirstChildReview } from '../helpers/first-child'

const test = base.extend({ page: async ({ launchOptions, baseURL }, use) => {
  const browser = await chromium.launch(launchOptions)
  const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
  try { await use(page) } finally { await browser.close() }
} })
let sequence = 30
async function register(page: Page) {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${++sequence}` })
  await page.goto('/login')
  await page.locator('.hoooho-onboarding, [role="tablist"][aria-label="登录或注册"]').first().waitFor()
  const start = page.getByRole('button', { name: '开始', exact: true })
  if (await start.isVisible()) await start.click()
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`引导测试${Date.now()}${sequence}`)
  await page.getByPlaceholder('设置一个密码').fill('synthetic-child-password')
  const response = page.waitForResponse(r => r.url().includes('/api/auth/register') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '注册并进入', exact: true }).click()
  await expect(page.getByRole('region', { name: '添加孩子信息', exact: true })).toBeVisible()
  return (await (await response).json()).token as string
}
const input = { name: '小禾（虚构）', birthday: '2024-01-15', gender: 'female' as const }
const review = (page: Page) => page.getByRole('region', { name: '核对孩子信息', exact: true })

test('first-child chat validates answers, previews and edits the avatar, then saves once and keeps the second-child form', async ({ page }, info) => {
  const errors: string[] = [], media: string[] = [], images: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (/\.mp4(?:\?|$)/.test(r.url())) media.push(r.url()); if (r.url().includes('child-record-')) images.push(r.url()) })
  let attempts = 0
  await page.route('**/api/members', async route => {
    if (route.request().method() === 'POST') {
      attempts++
      if (attempts === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '添加暂时失败，请重试' } }) })
    }
    await route.continue()
  })
  await register(page)
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await page.locator('.hoho-reception').boundingBox())!.height).toBeLessThanOrEqual(136)
    await expect(page.getByRole('button', { name: '按住说话', exact: true })).toBeEnabled()
  }
  const illustration = page.getByRole('img', { name: '手机拍摄包含孩子个人信息的记录报告单', exact: true })
  await expect(illustration).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect.poll(() => illustration.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth === 384)).toBe(true)
  expect(media).toEqual([]); expect(images).toEqual([])
  await expect(page.getByRole('button', { name: '添加照片、视频或文件', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('first-question.png') })
  await answerFirstChild(page, input.name)
  await expect(page.getByLabel('对话输入', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '改用语音', exact: true })).toBeVisible()
  await answerFirstChild(page, '两岁')
  await expect(page.getByRole('alert')).toContainText('需要准确的出生年月日')
  await answerFirstChild(page, '2027-01-01')
  await expect(page.getByRole('alert')).toContainText('出生日期不能晚于今天')
  await page.getByLabel('出生日期', { exact: true }).fill(input.birthday)
  await page.getByRole('button', { name: '确认出生日期', exact: true }).click()
  await page.getByRole('button', { name: '女孩', exact: true }).click()
  await page.getByRole('button', { name: '妈妈', exact: true }).click()
  await expect(review(page)).toBeVisible()
  await expect(review(page)).toBeFocused()
  expect(attempts).toBe(0)
  await expect(review(page).getByRole('img', { name: /3D卡通头像/ })).toBeVisible()
  await review(page).getByRole('button', { name: '修改性别', exact: true }).click()
  await page.getByRole('button', { name: '男孩', exact: true }).click()
  await expect(review(page)).toBeVisible()
  await expect(review(page).locator('img')).toHaveAttribute('src', /boy-age2-east-asian/)
  await review(page).getByRole('button', { name: '换一个', exact: true }).click()
  await expect(review(page).locator('img')).toHaveAttribute('src', /boy-age2-european/)
  for (const width of [320, 375, 390, 430]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
  await page.screenshot({ path: info.outputPath('review.png') })
  await review(page).getByRole('button', { name: '确认添加，开始记录', exact: true }).click()
  await expect(review(page).getByRole('alert')).toContainText('添加暂时失败')
  await expect(review(page)).toContainText(input.name)
  const createdResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/members' && r.request().method() === 'POST')
  await review(page).getByRole('button', { name: '重试添加', exact: true }).dblclick({ delay: 10 })
  const created = await (await createdResponse).json()
  expect(attempts).toBe(2)
  expect(created).toMatchObject({ name: input.name, birthday: input.birthday, gender: 'male', relationship: 'child', primaryRecorderRelationship: 'mother', avatar: 'boy-age2-european' })
  await expect(page.locator('.front-desk-welcome video')).toBeVisible()
  await expect(page.locator('.front-desk-welcome')).toContainText('我是档案员护工。')
  await expect(page.locator('.front-desk-welcome')).not.toContainText(input.name)
  await page.reload()
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith('hoooho:first-child:v1:')))).toBe(false)
  await page.goto('/family/new')
  await expect(page.getByRole('heading', { name: '添加家庭成员', exact: true })).toBeVisible()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('')
  expect(errors).toEqual([])
})

test('first-child draft resumes after refresh and a direct add entry uses the same conversation', async ({ page }) => {
  await register(page)
  await page.goto('/family/new')
  await expect(page).toHaveURL(/nurse-station/)
  await answerFirstChild(page, input.name)
  await page.reload()
  await expect(page.getByLabel('出生日期', { exact: true })).toBeVisible()
  await page.getByLabel('出生日期', { exact: true }).fill(input.birthday)
  await page.getByRole('button', { name: '确认出生日期', exact: true }).click()
  await page.getByRole('button', { name: '女孩', exact: true }).click()
  await page.getByRole('button', { name: '爸爸', exact: true }).click()
  await expect(review(page)).toContainText(input.name)
  await page.reload()
  await expect(review(page)).toContainText('爸爸')
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await register(page)
  await expect(page.getByText('先认识一下孩子。孩子叫什么名字？姓名或小名都可以。', { exact: true })).toBeVisible()
  await expect(review(page)).toHaveCount(0)
  await expect(page.locator('.first-child-conversation')).not.toContainText(input.name)
})

test('a response lost after saving is recovered before retry without creating a duplicate child', async ({ page }) => {
  const token = await register(page)
  let attempts = 0
  await page.route('**/api/members', async route => {
    if (route.request().method() === 'POST') { attempts++; const response = await route.fetch(); expect(response.ok()).toBe(true); return route.abort('failed') }
    await route.continue()
  })
  await prepareFirstChildReview(page, input)
  await review(page).getByRole('button', { name: '确认添加，开始记录', exact: true }).click()
  await expect(review(page).getByRole('button', { name: '重试添加', exact: true })).toBeVisible()
  await review(page).getByRole('button', { name: '重试添加', exact: true }).click()
  await expect(page.locator('.front-desk-welcome video')).toBeVisible()
  expect(attempts).toBe(1)
  const members = await (await page.request.get('/api/members', { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(members).toHaveLength(1)
})

test('a legacy non-child member does not trap first-child setup in recovery', async ({ page }) => {
  const token = await register(page)
  const seed = await page.request.post('/api/members', { headers: { Authorization: `Bearer ${token}` }, data: { name: '旧资料（虚构）', relationship: 'other', birthday: '2024-01-01', gender: 'female' } })
  expect(seed.ok()).toBe(true)
  const created = await createFirstChild(page, input)
  expect(created.relationship).toBe('child')
  const members = await (await page.request.get('/api/members', { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(members).toHaveLength(2)
  expect(members.filter((m: { relationship: string }) => m.relationship === 'child')).toHaveLength(1)
})

test('hold-to-talk can collect the first answer without a child ID and microphone denial leaves text usable', async ({ page, request }) => {
  await register(page)
  await request.get('http://127.0.0.1:4198/voice?text=' + encodeURIComponent(input.name))
  const asr = page.waitForRequest(r => r.url().includes('/api/ai/audio/transcriptions') && r.method() === 'POST')
  const hold = page.getByRole('button', { name: '按住说话', exact: true })
  await hold.hover(); await page.mouse.down(); await expect(page.getByRole('button', { name: /松开/ })).toBeVisible(); await page.waitForTimeout(800); await page.mouse.up()
  expect((await asr).postDataJSON().memberId).toBe('')
  await expect(page.getByLabel('出生日期', { exact: true })).toBeVisible()
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('synthetic denial', 'NotAllowedError') } })
  await page.getByRole('button', { name: '按住说话', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('麦克风未获授权')
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await expect(page.getByLabel('对话输入', { exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '确认出生日期', exact: true })).toBeDisabled()
})
