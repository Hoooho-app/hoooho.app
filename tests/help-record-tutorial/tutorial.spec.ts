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
  await expect(page.getByLabel('操作引导', { exact: true })).toBeVisible()
  return form
}
async function finishSymptomSteps(page: Page) {
  await page.getByRole('button', { name: '写好了，核对时间', exact: true }).click()
  await page.getByRole('button', { name: '时间已核对', exact: true }).click()
}


test('manual tutorial preserves failed input, retries once and opens the exact saved record', async ({ page, request }, info) => {
  await existingChild(page)
  const form = await begin(page, 'symptom')
  const narrative = '教程实际填写：昨晚开始咳嗽' + Date.now()
  await form.getByLabel('哪里不舒服').fill(narrative)
  await finishSymptomSteps(page)
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
  }
  await setTime('入睡', '2026-10-25', '21:30')
  await page.getByRole('button', { name: '入睡时间已核对', exact: true }).click()
  await setTime('醒来', '2026-10-26', '07:00')
  await page.getByRole('button', { name: '醒来时间已核对', exact: true }).click()
  await expect(form.locator('.sleep-ring-duration')).toHaveText('9小时30分钟')
  await page.reload()
  form = page.getByRole('dialog', { name: '记录睡眠', exact: true })
  await expect(form.locator('.sleep-ring-duration')).toHaveText('9小时30分钟')
  await expect(page.getByLabel('操作引导', { exact: true })).toContainText('看一眼睡眠时长')
  await page.getByRole('button', { name: '时长已核对', exact: true }).click()
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
  await page.goto('/help?tab=manual&manual=symptom')
  await expect(page.getByRole('button', { name: '跟着记一条', exact: true })).toBeVisible()
  expect(writes).toBe(0)
})

test('late save after browser Back does not take over the page the user moved to', async ({ page, request }) => {
  await existingChild(page)
  const form = await begin(page, 'symptom')
  await form.getByLabel('哪里不舒服').fill('迟到回执教程' + Date.now())
  await finishSymptomSteps(page)
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
  await page.locator('.hoooho-onboarding, [role="tablist"][aria-label="登录或注册"]').first().waitFor()
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

test('spotlight follows real controls, blocks outside clicks and can pause without losing input', async ({ page }, info) => {
  await existingChild(page)
  await page.setViewportSize({ width:375, height:812 })
  const form = await begin(page, 'symptom')
  const next = page.getByRole('button', { name:'写好了，核对时间', exact:true })
  await expect(next).toBeDisabled()
  const back = await form.getByRole('button', { name:'返回', exact:true }).boundingBox()
  expect(back).not.toBeNull()
  await page.mouse.click(back!.x + back!.width/2, back!.y + back!.height/2)
  await expect(form).toBeVisible()
  await form.getByLabel('哪里不舒服').fill('未保存的实际描述，退出引导仍应保留')
  await expect(next).toBeEnabled()
  await page.screenshot({ path:info.outputPath('manual-spotlight.png') })
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-hoho-spotlight]')) || document.activeElement?.getAttribute('data-help-target') === 'symptom-narrative')).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('操作引导', { exact:true })).toHaveCount(0)
  await expect(form).toBeVisible()
  await expect(form.getByLabel('哪里不舒服')).toHaveValue('未保存的实际描述，退出引导仍应保留')
  await form.getByRole('button', { name:'继续引导', exact:true }).click()
  await next.click()
  await expect(page.getByLabel('操作引导', { exact:true })).toContainText('核对这件事发生的时间')
  await page.getByRole('button', { name:'上一步', exact:true }).click()
  await expect(form.getByLabel('哪里不舒服')).toHaveValue('未保存的实际描述，退出引导仍应保留')
  await page.keyboard.press('Escape')
})

test('missing targets leave an exit and restored targets realign at narrow widths', async ({ page }, info) => {
  await existingChild(page)
  const form = await begin(page, 'symptom')
  for (const width of [320,375,390,430]) {
    await page.setViewportSize({ width, height:844 })
    const hole = page.locator('.hoho-spotlight-ring').first()
    await expect(hole).toBeVisible()
    const target = await form.getByLabel('哪里不舒服').boundingBox(), ring = await hole.boundingBox()
    expect(target).not.toBeNull(); expect(ring).not.toBeNull()
    expect(Math.abs(ring!.x - target!.x)).toBeLessThanOrEqual(8)
    expect(Math.abs(ring!.y - target!.y)).toBeLessThanOrEqual(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await form.getByLabel('哪里不舒服').evaluate(node => node.removeAttribute('data-help-target'))
  await expect(page.getByLabel('操作引导', { exact:true })).toContainText('正在找到这一步的位置')
  await expect(page.locator('.hoho-spotlight-mask')).toHaveCount(0)
  await form.getByLabel('哪里不舒服').evaluate(node => node.setAttribute('data-help-target','symptom-narrative'))
  await expect(page.locator('.hoho-spotlight-ring')).toBeVisible()
  await page.screenshot({ path:info.outputPath('narrow-spotlight.png') })
  await page.getByRole('button', { name:'退出引导', exact:true }).click()
})

test('sidebar help keeps its source through tabs, article navigation, refresh and a real tutorial return', async ({ page }, info) => {
  await existingChild(page)
  let healthWrites = 0
  page.on('request', r => { if (r.method() === 'POST' && /\/api\/(quick-records|events)(?:\/|$)/.test(new URL(r.url()).pathname)) healthWrites++ })
  for (const url of ['/nurse-station','/health-events?day=2026-10-25','/health-profile']) {
    await page.goto(url)
    if (url === '/nurse-station') {
      await page.getByRole('button', { name:'改用文字', exact:true }).click()
      await page.getByLabel('对话输入', { exact:true }).fill('来源页面尚未发送的内容')
    }
    await page.getByRole('button', { name:'打开菜单', exact:true }).click()
    const source = new URL(page.url()).pathname + new URL(page.url()).search
    await page.getByRole('dialog', { name:'侧边栏菜单' }).getByRole('button', { name:'帮助中心', exact:true }).click()
    await expect(page.getByRole('heading', { name:'先记好一件小事', exact:true })).toBeVisible()
    await page.getByRole('radio', { name:'产品说明', exact:true }).click()
    await page.getByRole('radio', { name:'使用教程', exact:true }).click()
    await page.getByLabel('搜索教程和问题').fill('手动')
    await page.getByRole('button', { name:'手动记一件发生的事', exact:true }).click()
    await page.reload()
    await expect(page.getByRole('figure', { name:'手动记一件发生的事操作示意' })).toBeVisible()
    if (url === '/health-events?day=2026-10-25') {
      await page.getByRole('button', { name:'跟着记一条', exact:true }).click()
      await page.getByRole('button', { name:'退出引导', exact:true }).click()
      await page.getByRole('button', { name:'返回', exact:true }).click()
      await expect(page).toHaveURL(/\/help\?article=symptom$/)
    }
    await page.getByRole('button', { name:'返回', exact:true }).click()
    await page.getByRole('button', { name:'返回', exact:true }).click()
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(source)
    if (url === '/nurse-station') await expect(page.getByLabel('对话输入', { exact:true })).toHaveValue('来源页面尚未发送的内容')
  }
  expect(healthWrites).toBe(0)
  await page.screenshot({ path:info.outputPath('help-source-return.png') })
})

test('find guide opens the real search and ends without claiming a saved record', async ({ page }, info) => {
  await existingChild(page)
  await page.goto('/help?article=find')
  await page.getByRole('button', { name:'打开页面，跟着操作', exact:true }).click()
  await expect(page.getByLabel('操作引导', { exact:true })).toContainText('点放大镜')
  await page.getByRole('button', { name:'搜索健康日历', exact:true }).click()
  await expect(page.getByLabel('操作引导', { exact:true })).toContainText('输入你记得的关键词')
  await page.getByLabel('查找记录文字', { exact:true }).fill('不存在的查找词')
  await page.getByRole('button', { name:'继续', exact:true }).click()
  await expect(page.getByLabel('操作引导', { exact:true })).toContainText('实际查找结果')
  await page.screenshot({ path:info.outputPath('find-spotlight.png') })
  await page.getByRole('button', { name:'我已了解，继续操作', exact:true }).click()
  await expect(page.getByLabel('操作引导', { exact:true })).toHaveCount(0)
  await expect(page.getByLabel('查找记录文字', { exact:true })).toHaveValue('不存在的查找词')
})
