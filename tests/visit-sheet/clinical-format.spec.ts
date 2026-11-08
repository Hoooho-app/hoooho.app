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
    { type: 'visit', sourceType: 'doctor_confirmation', content: '初步诊断：合成医生记录（待复核）。', occurredAt: dayAgo(1) },
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
  const legacyQuestion = '合成旧版问题，应从新版情况单隐藏'
  const saved = await request.put(`/api/members/${memberId}/visit-sheet`, { headers, data: {
    expectedVersion: 0, requestId: crypto.randomUUID(), question: legacyQuestion,
  } })
  expect(saved.ok(), await saved.text()).toBe(true)
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/health-profile')
  await expect(page.getByRole('region', { name: '门诊合成宝宝', exact: true }).getByText('BMI', { exact: true }).locator('..').locator('dd')).toHaveText('15.4')
  const bloodType = page.getByRole('combobox', { name: '血型', exact: true })
  await bloodType.selectOption('A')
  await expect(bloodType).toHaveValue('A')
  await page.getByRole('button', { name: '一键整理', exact: true }).click()
  await page.getByRole('button', { name: /^就诊情况单/ }).click()
  const identity = page.getByLabel('孩子基本信息')
  await expect(identity).toContainText('门诊合成宝宝')
  await expect(identity).toContainText('2023-10-01')
  await expect(identity).toContainText('BMI15.4')
  await expect(identity).toContainText('血型A型')
  await expect(identity).toHaveCSS('border-top-width', '1px')
  await expect(identity.locator('img')).toHaveCount(0)
  const checkColumns = async () => {
    const columns = await identity.locator('div').evaluateAll(fields => fields.map(field => ({
      label: field.querySelector('dt')!.getBoundingClientRect().x,
      value: field.querySelector('dd')!.getBoundingClientRect().x,
      top: field.getBoundingClientRect().y,
    })))
    expect(columns).toHaveLength(8)
    for (let index = 0; index < columns.length; index++) {
      expect(columns[index].label).toBeCloseTo(columns[index % 2].label)
      expect(columns[index].value).toBeCloseTo(columns[index % 2].value)
      expect(columns[index].top).toBeCloseTo(columns[index - index % 2].top)
    }
  }
  await checkColumns()
  if (info.project.name === 'mobile-375') {
    await page.setViewportSize({ width: 320, height: 720 })
    await checkColumns()
    expect(await identity.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await identity.evaluate(element => element.clientWidth))
    await page.setViewportSize({ width: 375, height: 812 })
  }
  const chief = page.locator('#chapter-overview')
  await expect(chief.locator('.visit-chief-text')).toHaveText('一周前开始打喷嚏流鼻涕')
  await expect(chief.getByRole('button', { name: '更改主诉' })).toBeVisible()
  await expect(chief.getByText('主诉附件', { exact: true })).toBeVisible()
  await expect(chief.getByText(/查看原话|重复整理|重试整理/)).toHaveCount(0)
  expect((await page.locator('[data-reading-card] [role=heading]').allTextContents()).slice(0, 4)).toEqual(['主诉', '现病史', '体格情况（选填）', '基本判断'])
  await expect(page.locator('.visit-clinical-assessment')).toHaveText('医生记录合成医生记录（待复核）')
  await expect(page.getByText(/本次想问|未填写的项目留空/)).toHaveCount(0)
  await page.getByRole('button', { name: '章节目录', exact: true }).click()
  const directory = page.getByRole('dialog', { name: '章节目录' })
  await expect(directory.getByText('本次想问')).toHaveCount(0)
  await directory.getByRole('button', { name: /主诉/ }).click()
  const history = page.locator('#chapter-sources')
  const exam = page.locator('#chapter-visits')
  await expect(history).toContainText('一周前开始打喷嚏流鼻涕，无咳嗽咳痰。')
  await expect(history.getByRole('button', { name: '添加', exact: true })).toBeVisible()
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
  await exam.getByRole('button', { name: '添加', exact: true }).click()
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
  expect(html).toMatch(/<h2>主诉<\/h2><p>一周前开始打喷嚏流鼻涕<\/p>.*<h2>现病史<\/h2>.*<h2>体格情况<\/h2>.*<h2>基本判断<\/h2>/s)
  expect(html).toContain('<dt>BMI</dt><dd>15.4</dd>')
  expect(html).toContain('<dt>血型</dt><dd>A型</dd>')
  expect(html).toContain('合成医生记录（待复核） <small>医生记录</small>')
  expect(html).not.toContain('本次想问')
  expect(html).not.toContain(legacyQuestion)
  expect(html).toContain('恶心：无')
  expect(html).toContain('精神可：是')
  expect(html).toContain('走路平稳：是')
  expect(html).not.toContain('耳鸣：')
  expect(html).not.toContain('生命体征平稳：')
})
