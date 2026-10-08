import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:4191'
const server = spawn(process.execPath, ['tests/design-quality/serve.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((resolve, reject) => { server.stdout.on('data', chunk => { if (String(chunk).includes('listening')) resolve() }); server.on('exit', code => reject(new Error(`server exited ${code}`))) })
const token = new TokenService('design-quality-e2e-secret', 60 * 60_000).create({ id: 'design-quality-account' })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 375, height: 667 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage()
const failures = []
page.on('pageerror', error => failures.push(error.message))
await page.addInitScript(({ token }) => {
  sessionStorage.setItem('hoooho-auth-token', token)
  localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'design-quality-account' }, currentMemberId: 'design-quality-member', members: [], profile: null }, version: 5 }))
}, { token })
let failInterview = false, failSubmit = false, submissionAttempts = 0, interviewCalls = 0
const description = '涉及页面或功能：\n配料表\n\n问题或改进建议：\n图片加载慢\n\n希望如何改进：\n整张显示\n\n使用影响：\n未补充\n\n发生经过与频率：\n未补充'
await page.route('**/api/feedback/interview', async route => {
  interviewCalls++
  const body = route.request().postDataJSON()
  assert.equal(body.turns.filter(turn => turn.role === 'user').length, 1, 'retry must not duplicate user input')
  await route.fulfill({ status: failInterview ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failInterview ? { error: { message: 'fixture timeout' } } : { reply: '图片加载慢时，还能继续操作吗？', problemType: 'performance_issue', description, fields: {} }) })
})
await page.route('**/api/feedback', async route => {
  if (route.request().method() !== 'POST') return route.continue()
  submissionAttempts++
  if (failSubmit) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试提交失败，内容保留' } }) })
  return route.continue()
})
await mkdir('.codex-tmp/feedback-interview', { recursive: true })
try {
  await page.goto(origin + '/feedback')
  await page.getByLabel('你的回答', { exact: true }).waitFor()
  for (const width of [375, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 760 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `.codex-tmp/feedback-interview/chat-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.getByLabel('你的回答', { exact: true }).fill('配料表图片加载慢，希望整张显示')
  failInterview = true
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await page.getByRole('button', { name: '重试', exact: true }).waitFor()
  assert.equal(submissionAttempts, 0)
  failInterview = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.getByText('图片加载慢时，还能继续操作吗？', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-role="user"]').count(), 1)
  await page.getByRole('button', { name: '整理反馈，下一步' }).click()
  await page.getByRole('button', { name: '确认并提交' }).waitFor()
  assert.equal(submissionAttempts, 0, 'organization must never submit')
  await page.getByLabel('反馈意见', { exact: true }).fill(description + '\n人工核对补充：希望更流畅')
  await page.reload()
  assert.match(await page.getByLabel('反馈意见', { exact: true }).inputValue(), /人工核对补充/)
  await page.screenshot({ path: '.codex-tmp/feedback-interview/review-375.png', fullPage: true })
  failSubmit = true
  await page.getByRole('button', { name: '确认并提交' }).click()
  await page.getByRole('alert').filter({ hasText: '测试提交失败' }).waitFor()
  assert.match(await page.getByLabel('反馈意见', { exact: true }).inputValue(), /人工核对补充/)
  failSubmit = false
  await page.getByRole('button', { name: '确认并提交' }).click()
  await page.waitForURL('**/feedback/mine')
  const records = await context.request.get(origin + '/api/feedback', { headers: { Authorization: `Bearer ${token}` } })
  const items = await records.json()
  const saved = items.find(item => item.description?.includes('人工核对补充'))
  assert(saved); assert.equal(saved.summary, '图片加载慢'); assert.equal(saved.problemType, 'performance_issue')
  assert.equal(submissionAttempts, 2)
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hoooho-feedback-interview:design-quality-account')), null)
  await page.goto(origin + '/feedback')
  failInterview = true
  await page.getByLabel('你的回答', { exact: true }).fill('希望添加一个查找反馈的入口')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await page.getByRole('button', { name: '手动整理' }).click()
  assert.match(await page.getByLabel('反馈意见', { exact: true }).inputValue(), /希望添加一个查找反馈的入口/)
  assert.equal(submissionAttempts, 2, 'manual review must not submit')
  assert.deepEqual(failures, [])
  console.log(JSON.stringify({ status: 'PASS', widths: [375, 430, 1280], interviewCalls, verified: ['no automatic submission', 'retry without duplicate turns', 'editable review', 'reload retention', 'failed save retention', 'real persistence and meaningful list summary', 'manual fallback', 'no horizontal overflow', 'no page errors'] }))
} finally { await browser.close(); server.kill('SIGTERM') }
