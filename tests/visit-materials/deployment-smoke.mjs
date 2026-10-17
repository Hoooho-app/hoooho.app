import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
const origin = process.argv[2]
assert(['https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin))
const target = origin.includes('staging') ? 'staging' : 'production'
const output = 'outputs/visit-materials/' + target
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] })
const context = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage(), errors = [], report = { target, syntheticOnly: true, physicalIPhone: 'NOT_VERIFIED', checks: [] }
let token = '', memberId = '', accountId = ''
page.on('pageerror', error => errors.push(error.message))
async function api(path, method = 'GET', data) {
  const response = await context.request.fetch(path, { method, data, headers: token ? { Authorization: 'Bearer ' + token } : {}, timeout: 45000 })
  assert(response.ok(), method + ' ' + path + ': ' + response.status())
  return response.json()
}
async function settled(root) {
  await expect(root.locator('.vm-file-status[data-status="ready"],.vm-file-status[data-status="failed"]')).toHaveCount(1, { timeout: 185000 })
  if (await root.locator('.vm-file-status[data-status="failed"]').count()) throw new Error('Live recognition failed: ' + await root.locator('.vm-file-error').innerText())
}
try {
  assert.equal((await api('/api/health')).status, 'ok')
  const session = await api('/api/auth/register', 'POST', { nickname: 'vmqa' + randomUUID().replaceAll('-', '').slice(0, 12), password: randomUUID(), idempotencyKey: randomUUID() })
  token = session.token; accountId = session.user.id
  memberId = (await api('/api/members', 'POST', { name: '就诊资料上线验收（虚构）', relationship: 'child' })).id
  await api('/api/auth/current-member', 'POST', { memberId })
  await page.addInitScript(({ token, accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, accountId, memberId })
  const imagePage = await context.newPage()
  await imagePage.setContent('<div style="width:520px;padding:30px;background:white;color:#111;font:22px/1.8 Arial"><h2>SYNTHETIC VISIT DOCUMENT</h2><p>Patient: Synthetic child for release QA only.</p><p>Institution: Synthetic Pediatric Clinic.</p><p>Parent reports: mild red skin on the neck.</p><p>Doctor note: Keep the original skin photos and bring the report to the next visit.</p><p>Visit date: not provided.</p></div>')
  const image = await imagePage.locator('div').screenshot()
  await imagePage.close()
  await page.goto('/health-events', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('button', { name: '就诊资料', exact: true }).click()
  const root = page.locator('.visit-materials-page')
  await expect(root.getByRole('button', { name: '从相册选择', exact: true })).toBeVisible()
  for (const [width, height] of [[320,568],[375,667],[390,844]]) {
    await page.setViewportSize({ width, height })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await expect(root.getByRole('button', { name: '从相册选择', exact: true })).toBeInViewport()
  }
  report.checks.push('entry at 320/375/390px')
  await root.getByLabel('上传照片或问诊截图').setInputFiles({ name: 'synthetic-visit-release.png', mimeType: 'image/png', buffer: image })
  await settled(root)
  report.checks.push('real original upload and live model image recognition')
  await root.getByRole('button', { name: '核对整理结果', exact: true }).click()
  await root.getByRole('button', { name: /对照原件/ }).first().click()
  const original = page.getByRole('dialog', { name: '原件：synthetic-visit-release.png' })
  await expect(original.locator('img')).toBeVisible()
  assert(await original.locator('img').evaluate(image => image.naturalWidth > 0))
  await original.getByRole('button', { name: '关闭原件：synthetic-visit-release.png' }).click()
  await root.getByRole('button', { name: '确认保存资料', exact: true }).click()
  await expect(root).toContainText('已保存到健康日历', { timeout: 60000 })
  let index = await api('/api/members/' + memberId + '/journal-index')
  assert.equal(index.records.length, 1); assert.equal(index.attachments.length, 1)
  assert.equal(index.records[0].journal.visit.materials.source, 'hospital')
  assert.equal(index.records[0].journal.timePrecision, 'unknown')
  const first = index.records[0], attachment = index.attachments[0]
  const originalResponse = await context.request.get('/api/events/' + first.eventId + '/attachments/' + attachment.id + '/content', { headers: { Authorization: 'Bearer ' + token } })
  assert(originalResponse.ok()); assert((await originalResponse.body()).equals(image))
  report.checks.push('raw image byte equality, provenance and unknown visit date')
  await root.getByRole('button', { name: '查看健康日历', exact: true }).click()
  await expect(root).toContainText('已保存到健康日历')
  await expect(root.locator('.vm-original-grid img')).toHaveCount(1)
  await page.screenshot({ path: output + '/saved-image.png' })
  await root.getByRole('button', { name: '继续补充资料', exact: true }).click()
  await root.getByRole('button', { name: 'AI 问诊', exact: true }).click()
  await root.getByRole('button', { name: '粘贴对话', exact: true }).click()
  await page.getByLabel('粘贴对话内容').fill('家长：孩子颈部皮肤有点红，去医院前要整理什么？\nAI：保留皮肤变化照片和原始检查报告，供接诊医生查看。')
  await page.getByRole('button', { name: '添加这段资料', exact: true }).click()
  await settled(root)
  await root.getByRole('button', { name: '核对整理结果', exact: true }).click()
  await expect(root).toContainText('AI 参考，尚未经医生确认')
  await root.getByRole('button', { name: '确认保存资料', exact: true }).click()
  await expect(root).toContainText('已补充到原就诊', { timeout: 60000 })
  index = await api('/api/members/' + memberId + '/journal-index')
  assert.equal(index.events.length, 1); assert.equal(index.records.length, 2); assert.equal(index.attachments.length, 1)
  const ai = index.records.find(record => record.id !== first.id)
  assert.equal(ai.caseContext.identity, 'external_ai')
  assert.equal(ai.journal.visit.linkedVisitRecordId, first.id)
  assert.equal(ai.journal.medication, undefined)
  assert(ai.journal.visit.materials.documents[0].originalText.includes('家长：'))
  assert(index.records.find(record => record.id === first.id).journal.visit.materials.documents[0].attachmentId === attachment.id)
  report.checks.push('calendar reopen with preview, append to same visit, AI source retained, no medication record')
  await page.screenshot({ path: output + '/ai-source.png' })
  assert.deepEqual(errors, []); report.errors = errors; report.status = 'PASS'
} catch (error) {
  report.status = 'FAILED'; report.error = error.message
  await page.screenshot({ path: output + '/failure.png' }).catch(() => undefined)
  process.exitCode = 1
} finally {
  if (token && memberId) {
    const member = (await api('/api/members')).find(item => item.id === memberId)
    if (member?.accountId === accountId && member.name === '就诊资料上线验收（虚构）') { await api('/api/members/' + memberId, 'DELETE'); report.cleanup = 'only owned synthetic member removed' }
  }
  await writeFile(output + '/acceptance.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  await browser.close()
}
