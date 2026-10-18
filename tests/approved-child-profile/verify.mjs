import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const origin = process.argv[2] ?? 'http://127.0.0.1:4194', expectedCommit = process.argv[3]
if (!['http://127.0.0.1:4194', 'https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin)) throw new Error('Unexpected verification origin')
const target = origin.startsWith('http:') ? 'local' : origin.includes('staging') ? 'staging' : 'production'
const output = `.codex-tmp/approved-profile-${target}`; await mkdir(output, { recursive: true })
const proxyUrl = target !== 'local' && process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null
const proxy = proxyUrl ? { server: `${proxyUrl.protocol}//${proxyUrl.host}`, ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : {}) } : undefined
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell', proxy, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-gpu', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
const page = await context.newPage(); page.setDefaultTimeout(20000)
const errors = [], checks = [], report = { target, expectedCommit, checks, errors, physicalIPhone: 'NOT_VERIFIED', status: 'FAILED' }
page.on('pageerror', e => errors.push(e.message))
let token = '', memberId = '', secondId = ''
async function raw(path, method = 'GET', data) { return context.request.fetch(path, { method, data, headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 35000 }) }
async function api(path, method = 'GET', data) { const r = await raw(path, method, data), body = await r.json(); if (!r.ok()) throw Error(`${method} ${path}: ${r.status()} ${body.error?.message}`); return body }
const sections = () => api('/api/auth/profile-sections')
const section = async id => (await sections()).find(s => s.memberId === memberId && s.sectionId === id) ?? { records: [], revision: 0 }
async function saveSection(id, records, revision) { return api('/api/auth/profile-sections', 'POST', { memberId, sectionId: id, records, revision }) }
const dialog = name => page.getByRole('dialog', { name, exact: true })
async function screenshot(name) { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow`); await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }) }
try {
  assert.equal((await api('/api/health')).status, 'ok')
  if (expectedCommit) assert.equal((await api('/api/ai/audio/capabilities')).runtime.commit, expectedCommit)
  const session = await api('/api/auth/register', 'POST', { nickname: `profileqa${randomUUID().replaceAll('-', '').slice(0, 8)}`, password: randomUUID(), idempotencyKey: randomUUID() }); token = session.token
  const createChild = name => api('/api/members', 'POST', { name, relationship: 'child', gender: 'female', birthday: '2024-01-01', primaryRecorderRelationship: 'mother' })
  memberId = (await createChild('档案验收孩子（虚构）')).id; secondId = (await createChild('隔离验收孩子（虚构）')).id
  await api('/api/auth/current-member', 'POST', { memberId })
  await saveSection('birth', [{ id: 'legacy-birth', gestationalWeeks: '38', legacyEvidence: 'must preserve' }, { id: 'other-birth', legacyNote: 'must preserve too' }], 0)
  await page.addInitScript(({ token, accountId, memberId }) => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 })) }, { token, accountId: session.user.id, memberId })
  await page.goto('/health-profile'); await expect(page.getByRole('navigation', { name: '档案分类' })).toBeVisible()
  assert.deepEqual(await page.locator('.health-profile-entry strong').allTextContents(), ['基本资料', '生长记录', '儿保与筛查', '过敏史', '慢性病史', '家族史', '手术史', '疫苗接种记录'])
  await expect(page.getByRole('button', { name: '上传资料' })).toBeVisible()
  assert.equal(await page.getByText('重要健康信息', { exact: true }).count(), 0)
  for (const width of [320, 390, 430]) { await page.setViewportSize({ width, height: 844 }); await screenshot(`profile-${width}`) }
  await page.getByRole('button', { name: '生长记录', exact: true }).click(); await expect(page).toHaveURL(/\/health-profile\/basic$/); await expect(page.getByRole('heading', { name: '成长数据', exact: true })).toBeVisible()
  checks.push('Existing child-profile layout and all five old categories retained; exactly three new entries; original growth page opens; 320/390/430px')

  await page.goto('/health-profile/identity'); await page.getByRole('button', { name: '编辑出生背景', exact: true }).click()
  const birth = dialog('编辑基本档案'); await expect(birth.getByLabel('出生孕周（周）')).toHaveValue('38')
  await birth.getByLabel('额外天数（天）').fill('2'); await birth.getByLabel('出生体重（kg）').fill('3.2'); await birth.getByLabel('出生身长（cm）').fill('50'); await birth.getByLabel('分娩方式').selectOption('顺产'); await birth.getByLabel('资料来源', { exact: true }).fill('合成出生证明')
  await page.evaluate(() => { const Native = window.FileReader; window.FileReader = class extends Native { readAsDataURL(file) { setTimeout(() => super.readAsDataURL(file), 500) } } })
  await birth.getByLabel('选择档案原件').setInputFiles({ name: 'synthetic-birth.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNkYPj/n4GBgQEACfYDA9dHLlcAAAAASUVORK5CYII=', 'base64') })
  await expect(birth.getByRole('button', { name: '正在读取原件…', exact: true })).toBeDisabled()
  await birth.getByRole('button', { name: '保存', exact: true }).click(); await expect(birth).toBeHidden()
  await page.reload(); await expect(page.getByRole('link', { name: 'synthetic-birth.png' })).toBeVisible()
  const savedBirth = await section('birth'); assert.equal(savedBirth.records[0].legacyEvidence, 'must preserve'); assert.equal(savedBirth.records[1].legacyNote, 'must preserve too'); assert.equal(savedBirth.records[0].birthWeight, '3.2')
  await page.getByRole('button', { name: '编辑常住地区', exact: true }).click(); await dialog('编辑基本档案').getByLabel('常住地区').fill('中国大陆 · 浙江杭州'); await dialog('编辑基本档案').getByRole('button', { name: '保存', exact: true }).click(); await expect(dialog('编辑基本档案')).toBeHidden()
  let patches = 0; page.on('request', req => { if (req.method() === 'PATCH' && new URL(req.url()).pathname === `/api/members/${memberId}`) patches++ })
  await page.getByRole('button', { name: '编辑血型', exact: true }).click(); await dialog('编辑基本档案').getByLabel('血型资料来源').fill('仅补来源，不改血型'); await dialog('编辑基本档案').getByRole('button', { name: '保存', exact: true }).click(); await expect(dialog('编辑基本档案')).toBeHidden(); assert.equal(patches, 0)
  await page.getByRole('button', { name: '编辑血型', exact: true }).click(); await dialog('编辑基本档案').getByLabel('ABO 血型').selectOption('A'); await dialog('编辑基本档案').getByLabel('RhD', { exact: true }).selectOption('positive'); await dialog('编辑基本档案').getByRole('button', { name: '保存', exact: true }).click(); await expect(dialog('编辑基本档案')).toBeHidden(); assert.equal((await api(`/api/members/${memberId}`)).bloodType, 'A')
  await page.getByRole('button', { name: '编辑', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/family/${memberId}/edit$`)); await page.getByRole('button', { name: '返回', exact: true }).click(); await expect(page).toHaveURL(/\/health-profile\/identity$/)
  await screenshot('identity'); checks.push('Birth fields and original persist after reload, legacy records/evidence retained, file-reading save lock, canonical blood type, source-only patch safety, member editor returns correctly')

  await page.goto('/health-profile/checkups'); await page.getByRole('button', { name: '添加儿保或筛查资料' }).click(); const checkup = dialog('儿保筛查记录')
  await checkup.getByLabel('资料类型').selectOption('hearing'); await checkup.getByLabel('检查名称').fill('听力筛查验收'); await checkup.getByLabel('检查日期').fill('2026-10-01'); await checkup.getByLabel('报告结论 / 查体记录').fill('通过（合成资料）'); await checkup.getByRole('button', { name: '保存', exact: true }).click(); await expect(checkup).toBeHidden()
  await page.getByRole('button', { name: '添加安排', exact: true }).click(); await checkup.getByLabel('安排名称').fill('2岁儿保验收'); await checkup.getByLabel('安排日期').fill('2027-01-01'); await checkup.getByRole('button', { name: '保存', exact: true }).click(); await expect(checkup).toBeHidden(); await page.reload(); await expect(page.getByRole('heading', { name: '听力筛查验收', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '2岁儿保验收', exact: true })).toBeVisible()
  const care = await section('checkups'); assert.equal(care.records.filter(r => r.recordType === 'record').length, 1); assert.equal(care.records.filter(r => r.recordType === 'plan').length, 1)
  const future = await raw('/api/auth/profile-sections', 'POST', { memberId, sectionId: 'checkups', revision: care.revision, records: [{ ...care.records[0], date: '2999-01-01' }] }); assert.equal(future.status(), 400)
  await page.getByRole('button', { name: '编辑听力筛查验收', exact: true }).click(); await checkup.getByLabel('报告结论 / 查体记录').fill('冲突时保留的草稿'); await saveSection('checkups', [...care.records, { id: randomUUID(), title: '另一条安排', type: 'checkup', recordType: 'plan', date: '2027-02-01' }], care.revision); await checkup.getByRole('button', { name: '保存', exact: true }).click(); await expect(checkup.getByRole('alert')).toContainText('更新'); await expect(checkup.getByLabel('报告结论 / 查体记录')).toHaveValue('冲突时保留的草稿'); assert.equal((await section('checkups')).records.length, 3)
  await checkup.getByRole('button', { name: '关闭儿保筛查记录', exact: true }).click(); await page.getByRole('button', { name: '放弃修改', exact: true }).click(); await screenshot('checkups'); checks.push('Checkup and screening records/arrangements persist separately; server rejects future completed facts; stale revision refuses overwrite and retains draft')

  await page.goto('/health-profile/vaccination'); await page.getByRole('button', { name: '手动补充', exact: true }).click(); const vaccine = dialog('接种记录编辑')
  await vaccine.getByLabel('疫苗名称').fill('合成疫苗验收'); await vaccine.getByLabel('剂次', { exact: true }).selectOption('dose_2'); await vaccine.getByRole('button', { name: '保存', exact: true }).click(); await expect(vaccine).toBeHidden(); let vaccines = await api(`/api/members/${memberId}/profile-list/vaccination`); assert.equal(vaccines.rows[0].date, ''); assert.equal(vaccines.rows[0].group, '年龄待确认'); assert.equal(vaccines.rows[0].doseSequence, 'dose_2')
  await expect(page.getByRole('heading', { name: '合成疫苗验收 · 第2剂', exact: true })).toBeVisible(); await page.getByRole('button', { name: '编辑合成疫苗验收', exact: true }).click(); await vaccine.getByLabel('接种日期（可留空待核对）').fill('2026-09-20'); await page.reload(); await expect(dialog('接种记录编辑')).toBeVisible(); await expect(dialog('接种记录编辑').getByLabel('接种日期（可留空待核对）')).toHaveValue('2026-09-20'); await dialog('接种记录编辑').getByRole('button', { name: '保存', exact: true }).click(); await expect(dialog('接种记录编辑')).toBeHidden()
  await page.getByRole('radio', { name: /后续安排/ }).click(); await page.getByRole('button', { name: '添加安排', exact: true }).click(); const arrangement = dialog('接种安排编辑'); await arrangement.getByLabel('安排名称').fill('接种门诊咨询验收'); await arrangement.getByLabel('安排日期').fill('2027-01-10'); await arrangement.getByRole('button', { name: '保存安排', exact: true }).click(); await expect(arrangement).toBeHidden(); await page.reload(); await page.getByRole('radio', { name: /后续安排/ }).click(); await expect(page.getByRole('heading', { name: '接种门诊咨询验收', exact: true })).toBeVisible(); vaccines = await api(`/api/members/${memberId}/profile-list/vaccination`); assert.equal(vaccines.rows.length, 1)
  await screenshot('vaccination-plans'); await page.getByRole('radio', { name: /已接种/ }).click(); await screenshot('vaccination-records')
  await page.getByRole('button', { name: '拍接种证', exact: true }).click(); // native camera input must exist with capture
  assert.equal(await page.locator('input[aria-label="拍摄资料照片"]').getAttribute('capture'), 'environment')
  await page.goto(`/health-profile/vaccination?memberId=${memberId}&entryId=${encodeURIComponent(vaccines.rows[0].id)}`); await expect(page.locator('[data-record-id]')).toBeFocused()
  await page.goto(`/health-profile/vaccination?memberId=${secondId}`); await expect(page.getByRole('status')).toHaveText('这条记录不属于当前孩子')
  checks.push('Vaccination dose/date/save/reload and isolated draft; blank date stays unknown; planned vaccinations never become completed facts; camera and existing targeted source links retained')
  const foreign = await raw('/api/auth/profile-sections', 'POST', { memberId: 'unowned-child', sectionId: 'checkups', revision: 0, records: [] }); assert.equal(foreign.status(), 404)
  assert.equal((await sections()).filter(s => s.memberId === secondId).length, 0); checks.push('Owned-child section isolation; foreign member writes rejected; second child has no copied archive')
  assert.deepEqual(errors, []); report.status = 'PASS'
} catch (e) { errors.push(e.message); process.exitCode = 1; await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}) }
finally {
  for (const id of [memberId, secondId].filter(Boolean)) try { await api(`/api/members/${id}`, 'DELETE') } catch (e) { errors.push(`Synthetic cleanup: ${e.message}`); report.status = 'FAILED'; process.exitCode = 1 }
  await writeFile(`${output}/acceptance.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); await browser.close()
}
