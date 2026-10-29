import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { prepareFirstChildReview } from '../helpers/first-child'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: 'Bearer ' + token }
async function existingChild(page: Page) {
  await page.addInitScript(token => {
    sessionStorage.setItem('hoooho-auth-token', token)
    if (!sessionStorage.getItem('help-tutorial-initialized')) {
      localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: 'empty-child', members: [], profile: null }, version: 5 }))
      sessionStorage.setItem('help-tutorial-initialized', 'true')
    }
  }, token)
}
async function begin(page: Page, lesson: 'symptom' | 'sleep') {
  await page.goto('/help?article=' + lesson)
  await page.getByRole('button', { name: lesson === 'sleep' ? '跟着记一次睡眠' : '跟着记一条', exact: true }).click()
  const form = page.getByRole('dialog', { name: lesson === 'sleep' ? '记录睡眠' : '记录症状', exact: true })
  await expect(form.getByLabel('记录教程提示')).toBeVisible()
  return form
}

test('manual tutorial preserves failed input, retries once and opens the exact saved record', async ({ page, request }, info) => {
  await existingChild(page)
  const form = await begin(page, 'symptom')
  const narrative = '教程实际填写：昨晚开始咳嗽' + Date.now()
  await form.getByLabel('哪里不舒服').fill(narrative)
  const keys: string[] = []
  await page.route('**/api/quick-records', async route => {
    keys.push(route.request().postDataJSON().idempotencyKey)
    if (keys.length === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '教程合成保存中断' } }) })
    else await route.continue()
  })
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(form.getByText('教程合成保存中断', { exact: true })).toBeVisible()
  await expect(form.getByLabel('哪里不舒服')).toHaveValue(narrative)
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('hoooho-help-record:') && !key.endsWith(':draft')).map(key => sessionStorage.getItem(key)))).not.toContainEqual(expect.stringContaining('recordId'))
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/quick-records' && r.request().method() === 'POST')
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  const savedResponse = await response
  expect(savedResponse.status()).toBe(201)
  const saved = await savedResponse.json()
  await expect(page).toHaveURL(/\/help\?article=symptom$/)
  await expect(page.getByText('这次记录已保存', { exact: true })).toBeVisible()
  expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0])
  await page.getByRole('button', { name: '查看刚才的记录', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('recordId=' + saved.recordId))
  await expect(page.getByRole('dialog').getByText(narrative, { exact: true }).first()).toBeVisible()
  const records = await (await request.get('/api/events/' + saved.eventId + '/records', { headers })).json()
  expect(records.filter((record: any) => record.id === saved.recordId)).toHaveLength(1)
  const event = await (await request.get('/api/events/' + saved.eventId, { headers })).json()
  expect(event.memberId).toBe('empty-child')
  await page.screenshot({ path: info.outputPath('manual-saved-detail.png') })
})

test('sleep tutorial restores edited cross-night times after refresh and returns a real receipt', async ({ page, request }, info) => {
  await existingChild(page)
  let form = await begin(page, 'sleep')
  const setTime = async (name: string, date: string, time: string) => {
    const card = form.locator('.sleep-editor-card').filter({ hasText: name })
    await card.click()
    await form.getByLabel(name + '日期', { exact: true }).fill(date)
    await form.getByLabel(name + '时间', { exact: true }).fill(time)
    await card.click()
  }
  await setTime('入睡', '2026-10-25', '21:30')
  await setTime('醒来', '2026-10-26', '07:00')
  await expect(form.locator('.sleep-ring-duration')).toHaveText('9小时30分钟')
  await page.reload()
  form = page.getByRole('dialog', { name: '记录睡眠', exact: true })
  await expect(form.locator('.sleep-ring-duration')).toHaveText('9小时30分钟')
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/quick-records' && r.request().method() === 'POST')
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  const saved = await (await response).json()
  await expect(page).toHaveURL(/\/help\?article=sleep$/)
  await expect(page.getByText('这次记录已保存', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看刚才的记录', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('recordId=' + saved.recordId))
  const records = await (await request.get('/api/events/' + saved.eventId + '/records', { headers })).json()
  const record = records.find((record: any) => record.id === saved.recordId)
  expect(record.journal.sleep.durationMinutes).toBe(570)
  expect(record.journal.sleep.sleepAt).toBe('2026-10-25T13:30:00.000Z')
  expect(record.journal.sleep.wakeAt).toBe('2026-10-25T23:00:00.000Z')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: info.outputPath('sleep-saved-detail.png') })
})

test('previewing tutorials and withdrawn links never creates records or exposes old features', async ({ page }) => {
  await existingChild(page)
  let writes = 0
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/(quick-records|events)(?:\/|$)/.test(new URL(request.url()).pathname)) writes++ })
  await page.goto('/help?article=symptom')
  await expect(page.getByRole('button', { name: '跟着记一条', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '产品说明', exact: true }).click()
  await expect(page.getByRole('button', { name: /慢慢记，长期回看/ })).toBeVisible()
  for (const url of ['/help?article=followup', '/help?tab=manual&manual=collect', '/help?module=follow']) {
    await page.goto(url)
    await expect(page.getByText('这篇旧说明已更新，请从当前教程查找操作方法。', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /正在跟进|看护交接|任务/ })).toHaveCount(0)
  }
  expect(writes).toBe(0)
})

test('late save after browser Back does not take over the page the user moved to', async ({ page, request }) => {
  await existingChild(page)
  const form = await begin(page, 'symptom')
  await form.getByLabel('哪里不舒服').fill('迟到回执教程' + Date.now())
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let entered = false
  await page.route('**/api/quick-records', async route => { entered = true; await gate; await route.continue() })
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect.poll(() => entered).toBe(true)
  await page.goBack()
  await expect(page).toHaveURL(/\/help\?article=symptom$/)
  await page.getByRole('radio', { name: '产品说明', exact: true }).click()
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/quick-records' && r.request().method() === 'POST')
  release()
  const result = await (await response).json()
  await expect(page.getByRole('radio', { name: '产品说明', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: /慢慢记，长期回看/ })).toBeVisible()
  const records = await (await request.get('/api/events/' + result.eventId + '/records', { headers })).json()
  expect(records.filter((record: any) => record.id === result.recordId)).toHaveLength(1)
})

test('a new account adds the first child and resumes the requested tutorial', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '198.51.100.86' })
  await page.goto('/help?article=sleep')
  await page.getByRole('button', { name: '跟着记一次睡眠', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  const start = page.getByRole('button', { name: '开始', exact: true })
  if (await start.isVisible()) await start.click()
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  await page.getByPlaceholder('给自己起个昵称').fill('教程注册' + Date.now())
  await page.getByPlaceholder('设置一个密码').fill('synthetic-tutorial-password')
  await page.getByRole('button', { name: '注册并进入', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station\?helpTutorial=sleep$/)
  await prepareFirstChildReview(page, { name: '教程宝宝', birthday: '2024-01-15', gender: 'female' })
  await page.getByRole('button', { name: '确认添加，开始记录', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '记录睡眠', exact: true }).getByLabel('记录教程提示')).toBeVisible()
  await expect(page).toHaveURL(/helpTutorial=sleep/)
})
