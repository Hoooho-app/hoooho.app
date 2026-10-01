// Opt-in, actual Production interfaces only. Never loads a key or a test double.
// One execution: summary(1), report OCR + combined text extraction(2), ASR(1), TTS(1).
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices, expect } from '@playwright/test'

if (process.env.RUN_HOOOHO_PRODUCTION_AI_ACCEPTANCE !== '1') throw new Error('Explicit Production acceptance opt-in required')
const base = 'https://hoooho.com'
const output = path.resolve('outputs/ai-production-20261001')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const context = await browser.newContext({ ...devices['iPhone SE'], timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(130000)
const result = { target: base, startedAt: new Date().toISOString(), device: 'iPhone SE', budget: 5,
  reservedUpstreamCalls: 0, automaticRetries: 0, checks: {}, modelFailure: null, runtimeErrors: 0,
  cleanup: {}, screenshots: [], acceptanceAccount: null }
let token, memberId, draftId, modelStopped = false
const records = [], events = []
page.on('pageerror', () => result.runtimeErrors++)
await context.route('**/api/**', async route => {
  const req = route.request(), pathname = new URL(req.url()).pathname
  let weight = 0
  if (req.method() === 'PUT' && /\/visit-sheet$/.test(pathname) && req.postDataJSON()?.generateAI) weight = 1
  if (req.method() === 'POST' && /\/ai-drafts$/.test(pathname)) weight = 2
  if (req.method() === 'POST' && (pathname === '/api/ai/audio/transcriptions' || /\/speech$/.test(pathname))) weight = 1
  if (weight) {
    if (modelStopped || result.reservedUpstreamCalls + weight > 5) return route.abort('blockedbyclient')
    result.reservedUpstreamCalls += weight
  }
  await route.continue()
})
async function api(url, data, method = 'POST') {
  const response = await context.request.fetch(base + url, { method, headers: { Authorization: `Bearer ${token}`, 'X-Hoooho-Timezone': 'Asia/Shanghai' },
    ...(data === undefined ? {} : { data }), timeout: 130000, maxRetries: 0 })
  const body = await response.json().catch(() => null)
  if (!response.ok()) throw Object.assign(new Error('Acceptance API failed'), { safe: { httpStatus: response.status(), code: body?.error?.code ?? null, path: url.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id') } })
  return body
}
// APIRequestContext bypasses page routes: reserve its actual AI calls explicitly.
async function modelAPI(url, data, weight) {
  assert.ok(!modelStopped && result.reservedUpstreamCalls + weight <= 5)
  result.reservedUpstreamCalls += weight
  try { return await api(url, data) } catch (error) { modelStopped = true; result.modelFailure = error.safe ?? { code: 'ACCEPTANCE_TRANSPORT_FAILED' }; throw error }
}
async function screenshot(name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  const file = path.join(output, name + '.png')
  await page.screenshot({ path: file, fullPage: false })
  result.screenshots.push(file)
}
async function exportLocal() {
  await page.getByRole('button', { name: '导出情况单', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存完整离线报告（HTML）', exact: true }).click()
  const download = await pending, file = path.join(output, 'synthetic-offline-report.html')
  await download.saveAs(file)
  const html = await readFile(file, 'utf8')
  assert.match(html, /本地事实整理/)
  assert.match(html, /发布验收/)
  assert.ok(!html.includes('Bearer') && !html.includes(token))
  const offlineContext = await browser.newContext({ ...devices['iPhone SE'], serviceWorkers: 'block' })
  await offlineContext.setOffline(true)
  const offline = await offlineContext.newPage()
  await offline.goto('file:///' + file.replaceAll('\\', '/'))
  assert.equal(await offline.locator('main > section.visit-chapter').count(), 9)
  await offlineContext.close()
  await screenshot('production-export')
  await page.getByRole('dialog', { name: '导出情况单', exact: true }).getByRole('button', { name: '关闭导出情况单', exact: true }).click()
  result.checks.localExportOffline = 'PASS'
}
try {
  assert.equal((await context.request.get(base + '/api/health')).status(), 200)
  result.checks.health = 'PASS'
  await page.goto(base + '/login')
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  const nickname = 'AI发布验收' + randomUUID().slice(0, 8)
  await page.getByPlaceholder('给自己起个昵称').fill(nickname)
  await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registration = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/register' && r.request().method() === 'POST')
  await page.getByRole('button', { name: '注册并进入' }).click()
  const registered = await registration
  assert.ok(registered.ok(), 'Dedicated acceptance registration failed; no retry')
  const session = await (await context.request.get(base + '/api/auth/session')).json()
  token = session.token
  assert.ok(token && session.user?.id)
  result.acceptanceAccount = { id: session.user.id, nickname }
  memberId = (await api('/api/members', { name: '发布验收虚构儿童', relationship: 'child', birthday: '2024-01-01', gender: 'female' })).id
  await api('/api/auth/current-member', { memberId })
  const occurredAt = new Date(Date.now() - 86400000).toISOString()
  const event = await api('/api/events', { memberId, title: '发布验收虚构观察', category: 'other', startTime: occurredAt })
  events.push(event.id)
  const record = await api(`/api/events/${event.id}/records`, { type: 'note', sourceType: 'user_record', content: '发布验收：左肘皮肤发红，没有呕吐。', occurredAt,
    journal: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '发布验收：左肘皮肤发红，没有呕吐。', locations: [], descriptors: [], impactLevel: 'little' } } })
  records.push(record.id)
  result.checks.manualRecord = 'PASS'
  await page.goto(base + '/visit-summary')
  await expect(page.getByRole('heading', { name: '病情数据', exact: true })).toBeVisible({ timeout: 35000 })
  await expect(page.getByText(/本地事实整理 · 资料截至/)).toBeVisible()
  const original = await api(`/api/members/${memberId}/visit-sheet`, undefined, 'GET')
  assert.ok(original.report.sources.some(s => s.recordId === record.id || s.id === `record:${record.id}`))
  assert.equal(original.report.chapters.length, 9)
  assert.ok(!original.report.aiSummary)
  await screenshot('production-local-summary')
  result.checks.localSummary = 'PASS'
  await exportLocal()

  const summaryResponse = page.waitForResponse(r => /\/visit-sheet$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT' && r.request().postDataJSON()?.generateAI)
  await page.getByRole('button', { name: '生成 AI 病情摘要', exact: true }).click()
  const summary = await summaryResponse
  if (!summary.ok()) {
    modelStopped = true
    const body = await summary.json().catch(() => null)
    result.modelFailure = { httpStatus: summary.status(), code: body?.error?.code ?? null, stage: 'medical-summary' }
    result.checks.realSummary = 'FAIL'
    await expect(page.getByRole('button', { name: '重试 AI 摘要', exact: true })).toBeVisible()
    assert.deepEqual((await api(`/api/members/${memberId}/visit-sheet`, undefined, 'GET')).report, original.report)
    result.checks.failurePreservesPrevious = 'PASS'
    await page.getByRole('button', { name: '重试 AI 摘要', exact: true }).scrollIntoViewIfNeeded()
    await screenshot('production-ai-failure')
    await exportLocal()
  } else {
    const body = await summary.json()
    assert.equal(body.report.aiSummary.provider, 'openai')
    await expect(page.getByRole('region', { name: 'AI 病情摘要', exact: true })).toBeVisible()
    await page.getByRole('region', { name: 'AI 病情摘要', exact: true }).scrollIntoViewIfNeeded()
    await screenshot('production-ai-summary')
    result.checks.realSummary = 'PASS'
  }

  if (!modelStopped) {
    // Render a fictional single-page report; no real patient identity or data.
    const reportPage = await context.newPage()
    await reportPage.setContent('<html lang="zh"><body style="font:24px sans-serif;padding:25px;background:white;color:black"><h2>虚构机构 · 发布验收报告</h2><p>检查日期：2026-09-29</p><p>检查项目：白细胞计数</p><p>结果：6.2</p><p>单位：10^9/L</p><p>参考范围：4.0-10.0</p><p>原异常标记：无</p><p>第1页 共1页</p></body></html>')
    const image = await reportPage.screenshot({ fullPage: true })
    await reportPage.close()
    await page.goto(base + '/health-events')
    await page.getByRole('button', { name: '记一下', exact: true }).click()
    await page.getByRole('button', { name: '说一说 / 上传资料整理', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: '智能整理记录', exact: true })
    await sheet.getByLabel('资料类型').selectOption('report')
    await sheet.getByLabel('原始记录内容').fill('2026年9月29日下午3点，左肘皮肤发红，没有呕吐。')
    await sheet.locator('input[type=file]').setInputFiles({ name: 'synthetic-single-page.png', mimeType: 'image/png', buffer: image })
    const draftResponse = page.waitForResponse(r => /\/ai-drafts$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
    await sheet.getByRole('button', { name: '整理成待确认记录', exact: true }).click()
    const response = await draftResponse
    if (!response.ok()) { modelStopped = true; const b = await response.json().catch(() => null); throw Object.assign(new Error('report/text model failed'), { safe: { httpStatus: response.status(), code: b?.error?.code ?? null, stage: 'report-and-text' } }) }
    const d = await response.json(); draftId = d.id
    assert.equal(d.state, 'ready')
    assert.ok(d.items.some(i => i.category === 'examination'))
    assert.ok(d.items.some(i => i.category === 'symptom'))
    assert.ok(d.sources.some(s => s.id === 'input') && d.sources.some(s => s.id !== 'input' && s.page === 1))
    assert.deepEqual(d.unmappedRows, [])
    assert.deepEqual(d.documentWarnings, [])
    await sheet.getByRole('button', { name: /已核对，一次保存/ }).scrollIntoViewIfNeeded()
    await screenshot('production-text-report-draft')
    result.checks.realTextAndReport = 'PASS'
    await sheet.getByRole('button', { name: /已核对，一次保存/ }).click()
    await expect(sheet.getByRole('status')).toContainText(/已保存 \d+ 条/)
    const saved = await api(`/api/members/${memberId}/ai-drafts/${draftId}`, undefined, 'GET')
    for (const ref of saved.result.records) { records.push(ref.recordId); events.push(ref.eventId) }
    result.checks.confirmedSave = 'PASS'
    await screenshot('production-confirmed-save')
    const audio = await readFile(path.join(output, 'synthetic-voice.wav'))
    const transcription = await modelAPI('/api/ai/audio/transcriptions', { name: 'synthetic-voice.wav', mimeType: 'audio/wav', dataUrl: 'data:audio/wav;base64,' + audio.toString('base64') }, 1)
    assert.ok(typeof transcription.transcript === 'string' && transcription.transcript.length > 0)
    result.checks.realTranscription = 'PASS'
    const speech = await modelAPI(`/api/members/${memberId}/ai-drafts/${draftId}/speech`, {}, 1)
    assert.equal(speech.mimeType, 'audio/mpeg')
    assert.ok(Buffer.from(speech.data, 'base64').length > 500)
    await writeFile(path.join(output, 'synthetic-reply.mp3'), Buffer.from(speech.data, 'base64'))
    result.checks.realSpeech = 'PASS'
  }
} catch (error) {
  if (modelStopped && !result.modelFailure) result.modelFailure = error.safe ?? { code: 'ACCEPTANCE_MODEL_FAILED' }
  // Playwright exceptions may include request headers; never serialize them.
  else result.acceptanceFailure = error.safe ?? { code: 'ACCEPTANCE_ASSERTION_FAILED' }
  await screenshot('production-acceptance-stop').catch(() => {})
} finally {
  // Authenticated removal of only identifiers created by this run. Do not SSH
  // rewrite live JSON stores or bypass account-deletion identity verification.
  const failed = []
  if (token) {
    if (draftId) await api(`/api/members/${memberId}/ai-drafts/${draftId}`, undefined, 'DELETE').catch(() => failed.push('draft'))
    for (const id of new Set(records)) await api(`/api/records/${id}`, undefined, 'DELETE').catch(() => failed.push('record'))
    for (const id of new Set(events)) await api(`/api/events/${id}`, undefined, 'DELETE').catch(() => failed.push('event'))
    if (memberId) await api(`/api/members/${memberId}`, undefined, 'DELETE').catch(() => failed.push('member'))
    result.cleanup = { createdRecordsEventsMember: failed.length ? 'INCOMPLETE' : 'REMOVED', failed,
      accountAndReportHistory: 'RETAINED_ISOLATED_ACCOUNT_REQUIRES_VERIFIED_ACCOUNT_DELETION' }
    await context.request.post(base + '/api/auth/logout', { maxRetries: 0 }).catch(() => {})
  }
  result.completedAt = new Date().toISOString()
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
  await context.close(); await browser.close()
}
