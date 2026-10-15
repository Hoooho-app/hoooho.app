// Release smoke uses only its own synthetic member. It makes no model calls.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const target = process.argv[2]
assert.ok(['https://staging.hoooho.com', 'https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(target), 'Explicit release target required')
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
const proxy = proxyUrl ? (() => {
  const url = new URL(proxyUrl)
  return { server: `${url.protocol}//${url.host}`, ...(url.username ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}) }
})() : undefined
const browser = await chromium.launch({ executablePath: process.env.VISIT_E2E_CHROMIUM_PATH })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', proxy })
const page = await context.newPage(), errors = []
page.on('pageerror', error => errors.push(error.message))
const output = `outputs/visit-current-situation-release/${new URL(target).hostname}`
await mkdir(output, { recursive: true })
let memberId, token
async function api(path, data, method = data === undefined ? 'GET' : 'POST') {
  const response = await context.request.fetch(target + path, {
    method, headers: { Origin: target, 'X-Hoooho-Timezone': 'Asia/Shanghai', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data === undefined ? {} : { data }), timeout: 35000,
  })
  assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()}`)
  return response.json()
}
try {
  await api('/api/health')
  const session = await api('/api/auth/register', { nickname: `情况单验收${randomUUID().slice(0, 8)}`, password: randomUUID(), idempotencyKey: randomUUID() })
  token = session.token
  assert.ok(token)
  memberId = (await api('/api/members', { name: '情况单发布验收（合成）', relationship: 'child', birthday: '2024-01-01', gender: 'female' })).id
  await api('/api/auth/current-member', { memberId })
  const endpoint = `/api/members/${memberId}/visit-sheet`
  let state = await api(endpoint)
  const save = async change => {
    state = await api(endpoint, { expectedVersion: state.report?.version ?? state.expectedVersion ?? 0, requestId: randomUUID(), ...change }, 'PUT')
  }
  await save({ focus: { mode: 'custom', text: '情况单界面验收（合成，无临床含义）' } })
  await save({ currentSituation: { scopeKey: state.report.photoKey, block: 'description', text: '合成验收：情况描述保存后可再次编辑。' } })
  await save({ currentSituation: { scopeKey: state.report.photoKey, block: 'diet', text: '合成验收：饮食模块及附件排列。' } })
  assert.equal(state.report.currentSituation.needsOrganization, false)
  await page.goto(target + '/visit-summary')
  const card = page.locator('#chapter-overview')
  await expect(card.getByRole('region', { name: '近期饮食' })).toBeVisible({ timeout: 35000 })
  await expect(card.getByRole('region', { name: '近期饮食' }).locator('+ section')).toHaveAttribute('aria-label', '附件')
  const primary = card.getByRole('button', { name: '更改主诉', exact: true })
  await expect(primary).toBeVisible()
  assert.equal(await primary.evaluate(e => getComputedStyle(e).color), 'rgb(255, 255, 255)')
  await card.getByRole('button', { name: '编辑情况描述' }).click()
  const editor = page.getByRole('dialog', { name: '编辑情况描述' })
  await editor.getByRole('textbox').fill('合成验收：局部修改已保存。')
  const resumed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/session')
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await resumed
  await expect(editor.getByRole('textbox')).toHaveValue('合成验收：局部修改已保存。')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await page.reload()
  await expect(card.locator('.visit-reading-case > p')).toHaveText('合成验收：局部修改已保存。', { timeout: 35000 })
  await expect(card.getByRole('region', { name: '近期饮食' })).toContainText('合成验收：饮食模块及附件排列。')
  const add = card.getByRole('button', { name: '继续添加', exact: true })
  await add.click()
  const manager = page.getByRole('dialog', { name: '添加 / 管理附件' })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: '关闭添加 / 管理附件' }).click()
  await expect(manager).toHaveCount(0)
  await expect(add).toBeFocused()
  await expect(card.getByRole('button', { name: '体温曲线', exact: true })).toHaveCount(0)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await card.screenshot({ path: `${output}/current-${width}.png` })
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ target, status: 'PASS', realSaveReload: true, sessionRecoveryDraft: true, attachmentOrderAndOpen: true, widths: [375, 390, 430], modelCalls: 0 }))
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  throw error
} finally {
  if (memberId) await api(`/api/members/${memberId}`, undefined, 'DELETE')
  await context.close()
  await browser.close()
}
