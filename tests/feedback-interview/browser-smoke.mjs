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
// Retained at its original path so existing verification commands keep working.
let failSubmit = false, submissionAttempts = 0, interviewCalls = 0
await page.route('**/api/feedback/interview', async route => {
  interviewCalls++
  await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
})
await page.route('**/api/feedback', async route => {
  if (route.request().method() !== 'POST') return route.continue()
  submissionAttempts++
  if (failSubmit) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试提交失败，内容保留' } }) })
  return route.continue()
})
await mkdir('.codex-tmp/feedback-form', { recursive: true })
try {
  await page.goto(origin + '/feedback')
  await page.getByLabel('反馈内容', { exact: true }).waitFor()
  const submit = page.getByRole('button', { name: '确认提交反馈', exact: true })
  assert.equal(await submit.isEnabled(), false)
  for (const width of [375, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 760 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.getByRole('button', { name: '快捷反馈', exact: true }).count(), 1)
    assert.equal(await page.getByText('上传图片', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: '整理反馈，下一步' }).count(), 0)
    await page.screenshot({ path: `.codex-tmp/feedback-form/form-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.getByRole('button', { name: '页面显示', exact: true }).click()
  const text = '合成验收反馈：反馈页恢复旧版表单，希望方便直接填写'
  await page.getByLabel('反馈内容', { exact: true }).fill(text)
  assert.equal(submissionAttempts, 0, 'typing must not submit')
  assert.equal(interviewCalls, 0, 'restored form must not request AI')
  failSubmit = true
  await submit.click()
  await page.getByRole('alert').filter({ hasText: '测试提交失败' }).waitFor()
  assert.equal(await page.getByLabel('反馈内容', { exact: true }).inputValue(), text)
  assert.equal(await page.getByRole('button', { name: '页面显示', exact: true }).getAttribute('aria-pressed'), 'true')
  failSubmit = false
  await submit.click()
  await page.waitForURL('**/feedback/mine')
  await page.getByRole('status').filter({ hasText: '反馈已收到' }).waitFor()
  const response = await context.request.get(origin + '/api/feedback', { headers: { Authorization: `Bearer ${token}` } })
  const items = await response.json()
  const saved = items.find(item => item.description === text)
  assert(saved)
  assert.equal(saved.problemType, 'display_issue')
  assert.equal(submissionAttempts, 2)
  assert.equal(interviewCalls, 0)
  assert.deepEqual(failures, [])
  console.log(JSON.stringify({ status: 'PASS', widths: [375,430,1280], explicitSubmission: true, failedSubmitPreservesText: true, realFeedbackSaved: true, aiCalls: 0 }))
} finally {
  await context.close()
  await browser.close()
  server.kill('SIGTERM')
}
