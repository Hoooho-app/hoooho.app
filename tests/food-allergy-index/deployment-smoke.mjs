import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, devices } from '@playwright/test'
const baseURL = process.argv[2]
if (!['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(baseURL)) throw new Error('Explicit known deployment URL required')
const staging = baseURL.includes('-staging.')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ ...devices['iPhone SE (3rd gen)'], baseURL, serviceWorkers: 'block' })
const errors = []
const page = await context.newPage()
await page.goto(baseURL + '/api/health')
// Browser fetch uses the same network stack and cookies as the deployed page.
const send = async (path, options = {}) => {
  const result = await page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, { method: options.method ?? 'GET', credentials: 'same-origin', headers: { ...options.headers, ...(options.data ? { 'Content-Type': 'application/json' } : {}) }, ...(options.data ? { body: JSON.stringify(options.data) } : {}), signal: AbortSignal.timeout(15000) })
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
  }, { path, options })
  return { status: () => result.status, headers: () => result.headers, json: async () => JSON.parse(result.body), text: async () => result.body }
}
const request = { get: (path, options) => send(path, options), post: (path, options) => send(path, { ...options, method: 'POST' }) }
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (response.status() >= 500) errors.push('5xx ' + new URL(response.url()).pathname) })
try {
  for (const path of ['/', '/api/health', '/nurse-station', '/food-allergy-status-index']) assert.equal((await request.get(path)).status(), 200, path)
  const unauth = await request.get('/api/food-allergy-index?memberId=unowned')
  assert.equal(unauth.status(), 401)
  const sessionResponse = await request.get('/api/auth/session')
  assert.equal(sessionResponse.status(), 200)
  let session = await sessionResponse.json()
  if (!session.token) {
    // A dedicated QA account; never use the user's credentials or profile.
    const registered = await request.post('/api/auth/register', { data: { nickname: 'indexqa' + randomBytes(4).toString('hex'), password: randomBytes(24).toString('base64url'), idempotencyKey: randomUUID() } })
    assert.equal(registered.status(), 200, 'QA registration')
    session = await registered.json()
  }
  assert.ok(session.token)
  const headers = { Authorization: 'Bearer ' + session.token, Origin: baseURL }
  const membersResponse = await request.get('/api/members', { headers })
  assert.equal(membersResponse.status(), 200)
  const members = await membersResponse.json()
  let memberId = members[0]?.id
  if (!memberId) {
    const self = await request.post('/api/members/self', { headers, data: { name: '发布验收账号' } })
    assert.equal(self.status(), 201, 'QA self member')
    memberId = (await self.json()).id
    assert.equal((await request.post('/api/auth/current-member', { headers, data: { memberId } })).status(), 200)
  }
  assert.ok(memberId)
  const index = async id => {
    const response = await request.get('/api/food-allergy-index?memberId=' + encodeURIComponent(id), { headers })
    assert.equal(response.status(), 200)
    assert.equal(response.headers()['cache-control'], 'no-store')
    return response.json()
  }
  assert.equal((await index(memberId)).percentage, 0)
  assert.equal((await request.get('/api/food-allergy-index?memberId=unowned', { headers })).status(), 404)
  // The product selects children on bootstrap, so a QA self member alone is
  // insufficient for page acceptance. This child has no clinical data in Prod.
  {
    const childResponse = await request.post('/api/members', { headers, data: { name: '指数验收测试孩子', birthday: '2024-12-20', gender: 'female', avatar: '', relationship: 'child' } })
    assert.equal(childResponse.status(), 201, await childResponse.text())
    memberId = (await childResponse.json()).id
    assert.equal((await request.post('/api/auth/current-member', { headers, data: { memberId } })).status(), 200)
  }
  if (staging) {
    const full = { id: 'qa-reaction', memberId, symptoms: '中度反应，红疹', handling: '未用药', exposureAmount: '5克' }
    const records = [{ id: 'qa-egg', memberId, category: 'food', name: '鸡蛋', reactions: [full] }, { id: 'qa-milk', memberId, category: 'food', name: '牛奶', reactions: [{ id: 'qa-second', symptoms: '红疹', handling: '未治疗' }] }]
    const save = await request.post('/api/auth/profile-sections', { headers, data: { memberId, sectionId: 'allergy', records, revision: 0 } })
    assert.equal(save.status(), 200, await save.text())
    const result = await index(memberId)
    assert.equal(result.percentage, 75)
    assert.equal(result.foodCount, 2)
    assert.equal(result.recordedCount, 6)
  }
  await page.goto(baseURL + '/nurse-station')
  const home = page.locator('.nurse-station-allergy-index')
  if (staging) {
    await home.locator('strong').filter({ hasText: '75%' }).waitFor({ timeout: 20000 })
    assert.match(await home.innerText(), /75%/)
    await home.click()
  } else await page.goto(baseURL + '/food-allergy-status-index')
  await page.locator('.food-allergy-index-current strong').filter({ hasText: staging ? '75%' : '0%' }).waitFor({ timeout: 20000 })
  assert.match(await page.locator('.food-allergy-index-current').innerText(), /不代表过敏越轻/)
  const result = await index(memberId)
  assert.equal(result.formulaVersion, 'food-record-completeness-v1')
  assert.equal(result.accountId, session.user.id)
  assert.equal(result.memberId, memberId)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.deepEqual(errors, [])
  await mkdir('artifacts/food-allergy-index', { recursive: true })
  await page.screenshot({ path: 'artifacts/food-allergy-index/' + (staging ? 'staging' : 'production') + '-iphone-se.png' })
  const summary = { environment: staging ? 'staging' : 'production', formulaVersion: result.formulaVersion, percentage: result.percentage, foodCount: result.foodCount, recordedCount: result.recordedCount, expectedCount: result.expectedCount, errors, realUserAccount: false, checkedAt: new Date().toISOString() }
  await writeFile('artifacts/food-allergy-index/' + summary.environment + '-smoke.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
} finally { await context.close(); await browser.close() }
