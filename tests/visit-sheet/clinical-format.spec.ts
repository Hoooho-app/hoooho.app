import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
const dayAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString()

test('门诊情况单从整理入口打开，点选后回读并按同一结构导出', async ({ page, request }, info) => {
  const child = await request.post('/api/members', { headers, data: { name: '门诊合成宝宝', relationship: 'child', gender: 'female', birthday: '2023-10-01', heightCm: 90, weightKg: 12.5 } })
  expect(child.ok(), await child.text()).toBe(true)
  const memberId = (await child.json()).id
  const event = await request.post('/api/events', { headers, data: { memberId, title: '合成鼻部观察', category: 'other', startTime: dayAgo(12) } })
  expect(event.ok(), await event.text()).toBe(true)
  const eventId = (await event.json()).id
  for (const record of [
    { type: 'symptom', content: '耳鸣', occurredAt: dayAgo(10) },
    { type: 'symptom', content: '一周前开始打喷嚏流鼻涕，无咳嗽咳痰。', occurredAt: dayAgo(2) },
    { type: 'examination', sourceType: 'doctor_confirmation', content: '查体：神志清，双侧下鼻甲肿大，未见清涕。', occurredAt: dayAgo(1) },
  ]) {
    const response = await request.post(`/api/events/${eventId}/records`, { headers, data: record })
    expect(response.ok(), await response.text()).toBe(true)
  }
  for (const [field, value] of [['heightCm', 90], ['weightKg', 12.5]]) {
    const response = await request.post('/api/growth-measurements', { headers, data: {
      memberId, measuredAt: dayAgo(field === 'heightCm' ? 3 : 2).slice(0, 10), [field]: value, measurementType: 'height', dataStatus: 'confirmed', standardId: 'who-2006',
    } })
    expect(response.ok(), await response.text()).toBe(true)
  }
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/health-profile')
  await expect(page.getByRole('region', { name: '门诊合成宝宝', exact: true }).getByText('BMI', { exact: true }).locator('..').locator('dd')).toHaveText('15.4')
  await page.getByRole('button', { name: '一键整理', exact: true }).click()
  await page.getByRole('button', { name: /^就诊情况单/ }).click()
  const identity = page.getByLabel('孩子基本信息')
  await expect(identity).toContainText('门诊合成宝宝')
  await expect(identity).toContainText('2023-10-01')
  await expect(identity).toContainText('BMI15.4')
  await expect(identity.locator('img')).toHaveCount(0)
  const chief = page.locator('#chapter-overview')
  await expect(chief).toContainText('一周前开始打喷嚏流鼻涕')
  await expect(chief.getByRole('button', { name: '更改主诉' })).toBeVisible()
  await expect(chief.getByText('主诉附件', { exact: true })).toBeVisible()
  await expect(chief.getByText(/查看原话|重复整理|重试整理/)).toHaveCount(0)
  expect((await page.locator('[data-reading-card] [role=heading]').allTextContents()).slice(0, 4)).toEqual(['主诉', '现病史', '体格情况', '本次想问'])
  const history = page.locator('#chapter-sources')
  const exam = page.locator('#chapter-visits')
  await expect(history.getByRole('group', { name: '咳痰', exact: true }).getByRole('button', { name: '无' })).toHaveAttribute('aria-pressed', 'true')
  await expect(history.getByRole('group', { name: '耳鸣' }).getByRole('button', { name: '有' })).toHaveAttribute('aria-pressed', 'false')
  const nausea = history.getByRole('group', { name: '恶心' })
  await expect(nausea.getByRole('button', { name: '无' })).toHaveAttribute('aria-pressed', 'false')

  const endpoint = `**/api/members/${memberId}/visit-sheet`
  await page.route(endpoint, route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { error: { message: '合成保存失败' } } })
    : route.continue())
  await nausea.getByRole('button', { name: '无' }).click()
  await expect(history.getByRole('alert')).toContainText('恶心的选择尚未保存')
  await page.unroute(endpoint)
  await history.getByRole('button', { name: '重试保存' }).click()
  await expect(nausea.getByRole('button', { name: '无' })).toHaveAttribute('aria-pressed', 'true')
  await expect(exam.getByRole('group', { name: '神志清' }).getByRole('button', { name: '是' })).toHaveAttribute('aria-pressed', 'true')
  const energy = exam.getByRole('group', { name: '精神可' })
  await expect(energy.getByRole('button', { name: '是' })).toHaveAttribute('aria-pressed', 'false')
  await energy.getByRole('button', { name: '是' }).click()
  await expect(energy.getByRole('button', { name: '是' })).toHaveAttribute('aria-pressed', 'true')
  await exam.getByRole('button', { name: '添加体格项目' }).click()
  await exam.getByLabel('体格项目名称').fill('走路平稳')
  await exam.locator('.visit-clinical-add').getByRole('button', { name: '是', exact: true }).click()
  await expect(exam.getByRole('group', { name: '走路平稳' }).getByRole('button', { name: '是' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(nausea.getByRole('button', { name: '无' })).toHaveAttribute('aria-pressed', 'true')
  await expect(energy.getByRole('button', { name: '是' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  await page.screenshot({ path: info.outputPath('clinical-report.png') })

  await page.getByRole('button', { name: '导出情况单' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存情况单，带去就诊' }).click()
  const html = await readFile((await (await download).path())!, 'utf8')
  expect(html).toMatch(/<h2>主诉<\/h2>.*<h2>现病史<\/h2>.*<h2>体格情况<\/h2>.*<h2>本次想问<\/h2>/s)
  expect(html).toContain('BMI 15.4')
  expect(html).toContain('恶心：无')
  expect(html).toContain('精神可：是')
  expect(html).toContain('走路平稳：是')
  expect(html).not.toContain('耳鸣：')
  expect(html).not.toContain('生命体征平稳：')
})
