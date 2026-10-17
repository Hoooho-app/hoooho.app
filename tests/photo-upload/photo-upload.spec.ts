import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { TokenService } from '../../server/auth/token-service.mjs'

const control = 'http://127.0.0.1:4198'
const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const name = '合成测试药品'
let image: Buffer
const upload = () => ({ name: 'photo-test.png', mimeType: 'image/png', buffer: image })

async function model(category = 'medication', fields = [{ name: 'medicationName', value: name }]) {
  await fetch(`${control}/draft-data`, { method: 'POST', body: JSON.stringify({ ocrText: fields.map(f => f.value).join('\n'), items: [{ category, title: '合成测试原件', timeText: null, subject: 'current', archiveCategory: null, relationKey: null, fields: fields.map(f => ({ ...f, quote: f.value, sourceId: '@first', page: 1 })) }] }) })
}
async function openReminder(page: Page) {
  await page.goto('/medication-reminders')
  await page.getByRole('button', { name: '新增提醒', exact: true }).click()
}
async function calendar(page: Page, action: string) {
  await page.goto('/health-events')
  await page.getByRole('button', { name: action, exact: true }).click()
}
async function preview(page: Page, fileName: string) {
  await page.getByRole('button', { name: `查看图片：${fileName}`, exact: true }).click()
  const sheet = page.getByRole('dialog', { name: `图片预览：${fileName}`, exact: true })
  await expect(sheet).toBeVisible()
  await expect.poll(() => sheet.getByRole('img', { name: `原图：${fileName}`, exact: true }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await sheet.getByRole('button', { name: `关闭图片预览：${fileName}`, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  image = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: Math.floor(Math.random()*255), g: Math.floor(Math.random()*255), b: Math.floor(Math.random()*255) } } }).png().toBuffer()
  await fetch(`${control}/success`); await fetch(`${control}/delay?ms=30`); await model()
  await page.addInitScript(value => {
    sessionStorage.setItem('hoooho-auth-token', value)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: 'child-a', members: [], profile: null }, version: 5 }))
  }, token)
})

test('reminder uploads, displays and actually recognizes; adopts only on confirmation', async ({ page }, testInfo) => {
  let jobs = 0
  page.on('request', request => { if (request.method() === 'POST' && /\/recognition-jobs$/.test(request.url())) jobs++ })
  await openReminder(page)
  await page.locator('input[type=file]').setInputFiles(upload())
  await preview(page, 'photo-test.png')
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toBeVisible()
  await expect(page.getByLabel('药品名称', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '已核对，采用识别结果', exact: true }).click()
  await expect(page.getByLabel('药品名称', { exact: true })).toHaveValue(name)
  expect(jobs).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('reminder-result.png') })
})

test('recognition failure is truthful and retry reaches sourced results', async ({ page }) => {
  await fetch(`${control}/failure`)
  await openReminder(page)
  await page.locator('input[type=file]').setInputFiles(upload())
  await expect(page.getByRole('button', { name: '重试图片识别', exact: true })).toBeVisible()
  await expect(page.getByLabel('药品名称', { exact: true })).toHaveValue('')
  await fetch(`${control}/success`)
  await page.getByRole('button', { name: '重试图片识别', exact: true }).click()
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toBeVisible()
})

test('removing a photo cancels late results', async ({ page }) => {
  await fetch(`${control}/delay?ms=1000`)
  await openReminder(page)
  await page.locator('input[type=file]').setInputFiles(upload())
  await expect(page.getByRole('region', { name: '图片识别' })).toBeVisible()
  await page.getByRole('button', { name: '移除图片：photo-test.png', exact: true }).click()
  await expect(page.getByRole('region', { name: '图片识别' })).toHaveCount(0)
  await page.waitForTimeout(2200)
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('药品名称', { exact: true })).toHaveValue('')
})

test('medication photo runs real recognition without silently changing dose or name', async ({ page }, testInfo) => {
  await calendar(page, '用药')
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(upload())
  await expect(page.locator('[data-status=uploaded]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toBeVisible()
  await expect(page.getByLabel('药品名称', { exact: true })).toHaveValue('')
  const dose = await page.getByLabel('本次用量', { exact: true }).inputValue()
  await page.getByRole('button', { name: '已核对，采用识别结果', exact: true }).click()
  await expect(page.getByLabel('药品名称', { exact: true })).toHaveValue(name)
  await expect(page.getByLabel('本次用量', { exact: true })).toHaveValue(dose)
  await page.reload()
  await page.getByRole('button', { name: '用药', exact: true }).click()
  await expect(page.locator('[data-status=uploaded]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toBeVisible()
  await page.getByLabel('药品名称', { exact: true }).fill(`${name}-${testInfo.project.name}`)
  await page.getByLabel('本次用量', { exact: true }).fill('1')
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/quick-records' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(201)
  const body = response.request().postDataJSON()
  expect(body.photoIds).toHaveLength(1)
  expect(body.journal.medication.medications[0].photoIds).toEqual(body.photoIds)
  const result = await response.json()
  await expect(page.getByRole('dialog', { name: '记录用药', exact: true })).toHaveCount(0)
  await page.goto(`/health-events?eventId=${result.eventId}&recordId=${result.recordId}`)
  const detail = page.getByRole('dialog', { name: '用药记录详情', exact: true })
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: '读取原件 1', exact: true }).click()
  const popupReady = page.waitForEvent('popup')
  await detail.getByRole('link', { name: '查看原件 1', exact: true }).click()
  const original = await popupReady
  await expect.poll(() => original.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await original.close()
})

test('visit photo adopts institution, free-form department and original statement', async ({ page }) => {
  await model('visit', [{ name: 'institution', value: '合成测试机构' }, { name: 'department', value: '合成专科' }, { name: 'doctorStatement', value: '按原文记录合成测试' }])
  await calendar(page, '就诊资料')
  await page.getByRole('button', { name: /就医结果与资料/ }).click()
  await page.locator('input[type=file][capture]').setInputFiles(upload())
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('按病历原文或家长记得的内容填写')).toHaveValue('')
  await page.getByRole('button', { name: '已核对，采用识别结果', exact: true }).click()
  await expect(page.getByLabel('实际科室', { exact: true })).toHaveValue('合成专科')
  await expect(page.getByPlaceholder('按病历原文或家长记得的内容填写')).toHaveValue('按原文记录合成测试')
})

test('legacy vaccination form uses sourced recognition in StrictMode', async ({ page }) => {
  await model('vaccination', [{ name: 'vaccineName', value: '合成测试疫苗' }, { name: 'batchNumber', value: 'TEST2026' }])
  await page.goto('http://127.0.0.1:4197/tests/photo-upload/legacy.html')
  await page.locator('input[type=file]:not([capture])').setInputFiles(upload())
  await expect(page.getByRole('button', { name: '已核对，采用识别结果', exact: true })).toBeVisible()
  await expect(page.getByLabel('疫苗名称', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '已核对，采用识别结果', exact: true }).click()
  await expect(page.getByLabel('疫苗名称', { exact: true })).toHaveValue('合成测试疫苗')
  await expect(page.getByRole('button', { name: '不清楚', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('long medication rejects corrupt bytes and permits recovery with valid image', async ({ page }) => {
  await page.goto('/health-profile/medication')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await expect(page.getByText('图片无法读取，请重新选择', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存档案', exact: true })).toBeDisabled()
  await page.locator('input[type=file]').first().setInputFiles(upload())
  await preview(page, 'photo-test.webp')
  await page.getByRole('button', { name: '保存档案', exact: true }).click()
  await expect(page.getByText('长期用药档案已保存', { exact: true })).toBeVisible()
  await page.reload()
  await preview(page, 'photo-test.webp')
  await page.getByRole('button', { name: '移除图片：photo-test.webp', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看图片：photo-test.webp', exact: true })).toHaveCount(0)
})

test('a slow old photo cannot overwrite a newer medication photo', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window)
    let calls = 0
    window.createImageBitmap = (async (...args: any[]) => {
      if (++calls === 1) await new Promise(resolve => setTimeout(resolve, 900))
      return (original as any)(...args)
    }) as typeof window.createImageBitmap
  })
  await page.goto('/health-profile/medication')
  await page.locator('input[type=file]').first().setInputFiles({ ...upload(), name: 'old.png' })
  await expect(page.getByRole('button', { name: '保存档案', exact: true })).toBeDisabled()
  await page.locator('input[type=file]').first().setInputFiles({ ...upload(), name: 'new.png' })
  await expect(page.getByRole('button', { name: '查看图片：new.webp', exact: true })).toBeVisible()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('button', { name: '查看图片：new.webp', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看图片：old.webp', exact: true })).toHaveCount(0)
})

test('structured composer previews individual originals before recognition', async ({ page }) => {
  await page.goto('/health-profile/smart-record')
  await page.getByRole('button', { name: '上传与智能识别', exact: true }).click()
  await page.locator('input[type=file][multiple]').setInputFiles(upload())
  await preview(page, 'photo-test.png')
  await page.getByRole('button', { name: '移除图片：photo-test.png', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看图片：photo-test.png', exact: true })).toHaveCount(0)
})

test('material return previews before saving and reads saved original', async ({ page }) => {
  await page.goto('/cases/event-a/materials')
  await page.locator('input[type=file]').setInputFiles(upload())
  await preview(page, 'photo-test.png')
  await page.getByRole('button', { name: '先保留原件', exact: true }).click()
  await expect(page).toHaveURL(/recordId=/)
  await page.getByRole('button', { name: '读取原件 1', exact: true }).click()
  await expect(page.getByRole('link', { name: '查看原件 1', exact: true })).toBeVisible()
})

test('bowel photo opens full original', async ({ page }) => {
  await calendar(page, '日常')
  await page.getByRole('button', { name: '排便', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles(upload())
  await preview(page, '照片 1')
})

test('help clears sent image and next text does not attach it again', async ({ page }) => {
  const turns: any[] = []
  page.on('request', request => { if (request.method() === 'POST' && /\/turns$/.test(request.url())) turns.push(request.postDataJSON()) })
  await page.goto('/help?view=chat')
  await page.locator('input[type=file]:not([capture])').setInputFiles(upload())
  await page.getByRole('button', { name: '发送图片', exact: true }).click()
  await expect(page.getByRole('img', { name: '本次截图', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '改用文字', exact: true }).click()
  await page.getByLabel('对话输入', { exact: true }).fill('如何上传文件')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect.poll(() => turns.length).toBe(2)
  expect(turns[0].image).toBeTruthy()
  expect(turns[1].image).toBeFalsy()
})
