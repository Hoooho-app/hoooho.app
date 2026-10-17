import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const origin = process.argv[2], commit = process.argv[3]
assert(['https://hoooho-calendar-verify-20261010-staging.up.railway.app', 'https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin))
const target = origin.includes('staging') ? 'staging' : 'production'
const output = `outputs/daily-records/${target}`
await mkdir(output, { recursive: true })
const proxyUrl = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null
const browser = await chromium.launch({ ...(proxyUrl ? { proxy: { server: proxyUrl.origin, ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : {}) } } : {}) })
const context = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage(), errors = [], failedResources = [], serverErrors = [], builds = new Set()
const report = { target, commit, syntheticOnly: true, physicalIPhone: 'NOT_VERIFIED', checks: [] }
let token = '', accountId = '', memberId = ''
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => {
  const path = new URL(response.url()).pathname
  if (response.status() >= 500) serverErrors.push({ path, status: response.status() })
  if (response.status() >= 400 && ['document', 'script', 'stylesheet'].includes(response.request().resourceType())) failedResources.push({ path, status: response.status() })
})
page.on('request', request => { const build = request.headers()['x-hoooho-client-build']; if (build) builds.add(build) })
async function api(path, method = 'GET', data) {
  const response = await context.request.fetch(path, { method, data, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Hoooho-Timezone': 'Asia/Shanghai' }, timeout: 30000 })
  assert(response.ok(), `${method} ${path}: ${response.status()}`)
  return response.json()
}
async function checkTemplate(category) {
  const settings = page.getByRole('region', { name: '每天自动记录设置' })
  const toggle = settings.getByRole('switch', { name: '每天自动记录', exact: true })
  await expect(toggle).toBeEnabled({ timeout: 15_000 })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(settings.locator('small')).toHaveCount(0)
  await toggle.click()
  await expect(settings.getByRole('switch')).toHaveCount(1)
  await expect(settings.getByRole('combobox', { name: /喂养方式/ })).toHaveCount(0)
  const name = settings.getByLabel('第1项名称'), time = settings.getByLabel('第1项时间')
  await name.fill('验收条目'); await time.fill('08:00')
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    const a = await name.boundingBox(), b = await time.boundingBox()
    assert(a && b && Math.abs(a.y + a.height - b.y - b.height) < 2, `${category} name/time alignment at ${width}`)
    assert(await settings.evaluate(el => el.scrollWidth <= el.clientWidth), `${category} overflow at ${width}`)
  }
  await settings.getByRole('button', { name: '添加一项', exact: true }).click()
  await settings.getByLabel('第2项名称').fill('保留条目')
  await settings.getByRole('button', { name: '删除第1项', exact: true }).click()
  await expect(settings.getByLabel('第1项名称')).toHaveValue('保留条目')
  await toggle.click()
  await expect(settings.locator('small')).toHaveCount(0)
  await expect(settings.locator('.daily-record-slot')).toHaveCount(0)
  report.checks.push(category)
}
try {
  assert.equal((await context.request.get('/')).status(), 200)
  assert.equal((await api('/api/health')).status, 'ok')
  const session = await api('/api/auth/register', 'POST', { nickname: `dailyqa${randomUUID().replaceAll('-', '').slice(0, 12)}`, password: randomUUID(), idempotencyKey: randomUUID() })
  token = session.token; accountId = session.user.id
  memberId = (await api('/api/members', 'POST', { name: '自动记录验收（虚构资料）', relationship: 'child' })).id
  await api('/api/auth/current-member', 'POST', { memberId })
  await page.addInitScript(({ token, accountId, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, accountId, memberId })
  await page.goto('/health-events?view=day')
  await page.getByRole('button', { name: '喂养/饮食', exact: true }).click()
  const form = page.getByRole('dialog', { name: '喂养/饮食', exact: true })
  await expect(form.getByLabel('本次名称（选填）')).toHaveCount(0)
  await expect(form.getByLabel('备注（选填）')).toHaveCount(0)
  await expect(form.getByRole('button', { name: '开始喂养', exact: true })).toHaveCount(0)
  await form.getByLabel('左侧手填分钟').fill('12')
  await form.getByRole('button', { name: '顺利', exact: true }).click()
  await checkTemplate('奶类')
  for (const method of ['配方奶', '瓶喂母乳', '混合喂养']) {
    await form.getByRole('radio', { name: method, exact: true }).click()
    await expect(form.getByRole('spinbutton', { name: /^喂奶量/ })).toBeVisible()
    await expect(form.getByRole('group', { name: '进食状态（可选）' })).toBeVisible()
  }
  await form.getByRole('radio', { name: '母乳', exact: true }).click()
  await expect(form.getByLabel('左侧手填分钟')).toHaveValue('12')
  await expect(form.getByRole('button', { name: '顺利', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(form.getByRole('textbox', { name: '记录时间', exact: true })).toBeVisible()
  await form.getByRole('radio', { name: '饮食', exact: true }).click()
  for (const category of ['辅食', '正餐', '零食']) { await form.getByRole('radio', { name: category, exact: true }).click(); await checkTemplate(category) }
  await form.getByRole('radio', { name: '补剂', exact: true }).click(); await checkTemplate('补剂')
  await form.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '用药', exact: true }).click(); await checkTemplate('用药')
  await page.getByRole('dialog').getByRole('button', { name: /^返回/ }).click()
  for (const category of ['睡眠', '排便', '身体涂抹']) {
    await page.getByRole('button', { name: '日常', exact: true }).click()
    await page.getByRole('group', { name: '记录日常选项' }).getByRole('button', { name: category, exact: true }).click()
    await checkTemplate(category)
    await page.getByRole('dialog').getByRole('button', { name: /^返回/ }).click()
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.getByRole('button', { name: '喂养/饮食', exact: true }).click()
  await form.getByRole('radio', { name: '奶类', exact: true }).click()
  await form.getByRole('radio', { name: '配方奶', exact: true }).click()
  await form.getByRole('spinbutton', { name: /^喂奶量/ }).fill('150')
  const settings = form.getByRole('region', { name: '每天自动记录设置' })
  await settings.getByRole('switch', { name: '每天自动记录', exact: true }).click()
  await settings.getByLabel('第1项名称').fill('验收早奶'); await settings.getByLabel('第1项时间').fill('08:00')
  await expect(settings.getByLabel('第1项喂养方式')).toHaveCount(0); await settings.getByLabel('第1项奶量（mL）').fill('150')
  // Use the deployed server's clock for this synthetic past record. A local
  // workstation clock ahead of Railway must not trip the real future-time gate.
  const serverTime = Date.parse((await context.request.get('/api/health')).headers().date)
  assert(Number.isFinite(serverTime), 'Health response must provide a server Date header')
  const occurredAt = new Date(serverTime - 5 * 60_000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16).replace(' ', 'T')
  await form.getByRole('textbox', { name: '记录时间', exact: true }).fill(occurredAt)
  await settings.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/template-375.png` })
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/quick-records' && response.request().method() === 'POST')
  await form.locator('header').getByRole('button', { name: '保存记录', exact: true }).click()
  const savedResponse = await saved
  if (savedResponse.status() !== 201) { const body = await savedResponse.json(); throw new Error(JSON.stringify({ status: savedResponse.status(), error: body.error })) }
  await expect(form).toHaveCount(0)
  const rules = await api(`/api/routines/${memberId}/daily`)
  assert.equal(rules.length, 1); assert.equal(rules[0].slots[0].name, '验收早奶'); assert.equal(rules[0].slots[0].time, '08:00')
  assert.equal(rules[0].slots[0].fields.feedingMethod, 'formula'); assert.equal(rules[0].slots[0].enabled, true)
  await page.reload(); await page.getByRole('button', { name: '喂养/饮食', exact: true }).click()
  await expect(page.getByLabel('第1项名称')).toHaveValue('验收早奶')
  report.checks.push('original feeding fields preserved', 'header save and rule reload', '320/375/390/430px alignment')
  assert.deepEqual(errors, [])
  assert.deepEqual(serverErrors, []); assert.deepEqual(failedResources, [])
  if (commit) assert([...builds].some(value => value.includes(commit)), `Expected client build ${commit}; got ${[...builds]}`)
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAILED'; report.error = error.message
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  throw error
} finally {
  if (token && memberId) {
    const member = (await api('/api/members')).find(value => value.id === memberId)
    if (member?.accountId === accountId && member.name === '自动记录验收（虚构资料）') { await api(`/api/members/${memberId}`, 'DELETE'); report.cleanup = 'synthetic member removed' }
  }
  report.builds = [...builds]; report.errors = errors; report.serverErrors = serverErrors; report.failedResources = failedResources
  await writeFile(`${output}/acceptance.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report)); await browser.close()
}
