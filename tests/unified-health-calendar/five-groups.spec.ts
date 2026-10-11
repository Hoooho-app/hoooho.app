import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { TokenService } from '../../server/auth/token-service.mjs'
import sharp from 'sharp'
const accountId = 'time-view-test-account', token = new TokenService('time-view-e2e-local-only-secret', 3600_000).create({ id: accountId }), headers = { Authorization: `Bearer ${token}` }
async function prepare(page: Page, memberId: string) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ token, accountId, memberId }) => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 })) }, { token, accountId, memberId })
  await page.goto('/health-events?view=day&day=2026-03-08&month=2026-03&sort=asc')
  await expect(page.getByRole('button', { name: '记录日常', exact: true })).toBeEnabled()
  await expect(page.getByText('正在加载时间轴…', { exact: true })).toHaveCount(0)
  return errors
}
test('all five groups share factual counts, semantics, stable day sheet and original details without writes', async ({ page }) => {
  const member = await page.request.post('/api/members', { headers, data: { name: '五类合成测试对象', birthday: '2025-01-01', gender: 'female', relationship: 'child' } }); expect(member.ok()).toBe(true); const memberId = (await member.json()).id
  const cases = [
    { categories: ['diet'], diet: { kind: 'feeding', bottleMl: 120.5 } },
    { categories: ['diet'], diet: { kind: 'supplement', supplementNames: ['维生素D'], supplementAmount: '0.5', supplementUnit: '滴' } },
    { categories: ['diet'], diet: { kind: 'complementary', foods: ['蛋黄'], amount: '半个' } },
    ...['无呕吐', '疑似皮疹', '待确认', '湿疹加重'].map(narrative => ({ categories: ['symptom'], symptom: { symptomCategory: 'other', narrative, locations: [], descriptors: [] } })),
    { categories: ['medication'], medication: { medicationName: '非常长的合成药品名称不应猜测简称', administrationRoute: 'oral', amountValue: 0.125, amountUnit: '毫克', note: '尚未观察效果' } },
    { categories: ['medication'], medication: { medicationName: 'AD', administrationRoute: 'oral', amountValue: 1, amountUnit: '粒' } },
    { categories: ['sleep'], sleep: { kind: 'night', sleepAt: '2026-03-07T22:00:00+08:00', wakeAt: '2026-03-08T07:00:00+08:00', durationMinutes: 540, status: 'completed' } },
    { categories: ['elimination'], bowel: { shapes: ['糊状'], observations: [] } },
    { categories: ['visit'], visit: { visitType: 'outpatient', examinationTypes: ['血常规'], documentTypes: ['prescription'] } },
    { categories: ['vaccination'], vaccination: { items: [{ id: 'vaccine-one', vaccineName: '乙肝疫苗', doseSequence: 'dose_1' }] } },
    { categories: ['other'] },
  ]
  const facts: { id: string; occurredAt: string; createdAt: string; journal?: { sleep?: { wakeAt: string } } }[] = []
  for (const [index, journal] of cases.entries()) {
    const photoDraftId = `calendar_${memberId}`, photoIds: string[] = []
    if (index === 11) {
      const buffer = await sharp({ create: { width: 18, height: 14, channels: 3, background: '#ffffff' } }).webp().toBuffer()
      const photo = await page.request.post(`/api/quick-records/${photoDraftId}/photos`, { headers, data: { memberId, name: '合成就医附件.webp', mimeType: 'image/webp', dataUrl: `data:image/webp;base64,${buffer.toString('base64')}`, sortOrder: 0 } })
      expect(photo.status(), await photo.text()).toBe(201); photoIds.push((await photo.json()).id)
    }
    const data = { memberId, title: '五类合成记录', content: `完整合成原文${index}，保留来源、剂量与备注`, occurredAt: '2026-03-08T10:00:00+08:00', inputChannel: 'text', idempotencyKey: `five-groups-${memberId}-${index}`, journal, ...(photoIds.length ? { photoDraftId, photoIds } : {}) }
    const duplicate = await (await page.request.post('/api/quick-records/duplicate-check', { headers, data })).json()
    const response = await page.request.post('/api/quick-records', { headers, data: { ...data, ...(duplicate.duplicate ? { duplicateAction: 'create', duplicateEventId: duplicate.duplicate.eventId } : {}) } }); expect(response.status(), await response.text()).toBe(201)
    const ids = await response.json(), rows = await (await page.request.get(`/api/events/${ids.eventId}/records?view=time`, { headers })).json()
    facts.push(rows.find((row: { id: string }) => row.id === ids.recordId))
  }
  const errors = await prepare(page, memberId)
  let writes = 0; page.on('request', r => { if (!['GET','HEAD','OPTIONS'].includes(r.method()) && /\/api\/(records|quick-records|events|routines|daily-record)/.test(new URL(r.url()).pathname)) writes++ })
  const select = page.getByLabel('筛选记录类型')
  await expect(select.locator('option')).toHaveText(['全部类型','喂养','日常','用药','症状','就诊资料'])
  await expect(page.locator('.journal-record')).toHaveCount(14)
  expect((await page.locator('.journal-record-summary').allTextContents()).sort()).toEqual(['喂养 · 120.5mL','维生素D · 0.5滴','蛋黄半个','无呕吐','疑似皮疹','待确认','湿疹加重','用药记录','AD','睡眠 · 已醒 · 约9小时','排便记录','血常规','乙肝疫苗','未分类'].sort())
  const rowGeometry = await page.locator('.journal-record-main').first().evaluate(el => ({ height: el.getBoundingClientRect().height, font: getComputedStyle(el.querySelector('.journal-record-summary')!).fontSize, icon: el.querySelector('svg')!.getBoundingClientRect().width }))
  expect(rowGeometry).toEqual({ height: 46, font: '13px', icon: 16 })
  await mkdir('outputs/calendar-five-groups', { recursive: true }); await page.screenshot({ path: 'outputs/calendar-five-groups/day-dense-320.png' })
  await page.getByRole('button', { name: '切换日历视图' }).click()
  const url = page.url(), cell = page.getByRole('button', { name: /^2026-03-08，/ })
  await expect(cell).toHaveAccessibleName(/14条记录/)
  const count = await cell.evaluate(el => el.querySelectorAll('.health-calendar__preview').length + Number(el.querySelector('.health-calendar__more')?.textContent?.slice(1) ?? 0)); expect(count).toBe(14)
  await cell.locator('.health-calendar__more').click()
  const sheet = page.getByRole('dialog', { name: '2026-03-08 · 14条记录' })
  await expect(sheet).toBeVisible(); expect(page.url()).toBe(url)
  const ordered = facts.sort((a,b) => Date.parse(b.journal?.sleep?.wakeAt ?? b.occurredAt) - Date.parse(a.journal?.sleep?.wakeAt ?? a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(e => e.id)
  expect(await sheet.locator('[data-day-record]').evaluateAll(nodes => nodes.map(el => el.getAttribute('data-day-record')))).toEqual(ordered)
  expect(await page.locator('.calendar-background').evaluate(el => (el as HTMLElement).inert)).toBe(true)
  await sheet.locator('summary').first().click(); await expect(sheet.locator('.calendar-day-original').first()).toContainText('完整合成原文')
  await page.screenshot({ path: 'outputs/calendar-five-groups/day-sheet-320.png' })
  await sheet.locator('[data-day-record]').first().click(); await expect(sheet).toHaveCount(0)
  const detail = page.getByRole('dialog').last(); await expect(detail).toBeVisible(); await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible(); await expect(sheet.locator('[data-day-record]').first()).toBeFocused()
  const focusables = sheet.locator('button,summary'); await focusables.last().focus(); await page.keyboard.press('Tab'); await expect(sheet.getByRole('button', { name: '关闭当天记录', exact: true })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0); await expect(cell).toBeFocused(); expect(page.url()).toBe(url)
  for (const [group, count] of [['feeding',3], ['daily',2], ['medication',2], ['symptom',4], ['materials',2]] as const) {
    await select.selectOption(group); await expect(cell).toHaveAccessibleName(new RegExp(`${count}条记录`)); await cell.click()
    await expect(page.locator('[data-day-record]')).toHaveCount(count); await page.keyboard.press('Escape')
    if (group === 'materials') {
      await cell.click(); await page.locator('[data-day-record]').filter({ hasText: '血常规' }).click()
      const original = page.getByRole('button', { name: '读取原件 1', exact: true })
      await expect(original).toBeVisible(); await original.click(); await expect(page.getByRole('link', { name: '查看原件 1', exact: true })).toHaveAttribute('href', /^blob:/)
      await page.keyboard.press('Escape'); await expect(page.locator('[data-day-record]')).toHaveCount(2); await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: '切换日历视图' }).click(); await expect(page.locator('.journal-record')).toHaveCount(count)
    await page.getByRole('button', { name: '切换日历视图' }).click()
  }
  expect(writes).toBe(0); expect(errors).toEqual([])
})
test('three peer feeding tabs keep separate drafts and supplement time; landscape and keyboard are contained', async ({ page }) => {
  await prepare(page, 'child-one'); await page.getByRole('button', { name: '喂养/饮食', exact: true }).click()
  const form = page.getByRole('dialog', { name: '喂养/饮食', exact: true })
  await expect(form.getByRole('radiogroup', { name: '喂养/饮食分类' }).getByRole('radio')).toHaveText(['奶类','饮食','补剂'])
  await form.getByRole('radio', { name: '配方奶', exact: true }).click(); await form.getByLabel('喂奶量').fill('120')
  await form.getByRole('radio', { name: '补剂', exact: true }).click(); await form.getByLabel('输入补剂名称').fill('维生素D'); await form.getByRole('button', { name: '添加补剂' }).click(); await form.getByLabel('用量', { exact: true }).fill('0.5')
  await form.locator('input[aria-label="记录时间"]').fill('2026-03-08T09:10')
  await form.getByRole('radio', { name: '奶类', exact: true }).click(); await expect(form.getByLabel('喂奶量')).toHaveValue('120')
  await form.getByRole('radio', { name: '补剂', exact: true }).click(); await expect(form.getByLabel('用量', { exact: true })).toHaveValue('0.5'); await expect(form.locator('input[aria-label="记录时间"]')).toHaveValue('2026-03-08T09:10')
  await form.getByRole('button', { name: '返回', exact: true }).click(); await page.getByRole('button', { name: '喂养/饮食', exact: true }).click(); await expect(form.getByRole('radio', { name: '补剂', exact: true })).toHaveAttribute('aria-checked', 'true'); await expect(form.getByLabel('用量', { exact: true })).toHaveValue('0.5')
  await mkdir('outputs/calendar-five-groups', { recursive: true }); await page.screenshot({ path: 'outputs/calendar-five-groups/feeding-tabs-320.png' })
  await form.getByRole('button', { name: '返回', exact: true }).click(); await page.getByRole('button', { name: '切换日历视图' }).click()
  for (const [width,height] of [[568,320],[320,350],[375,667],[390,844]]) {
    await page.setViewportSize({ width,height }); await page.getByLabel('选择月份').fill('2026-03')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await expect(page.locator('.health-calendar__day').last()).toBeInViewport(); await expect(page.getByRole('button', { name: '记录症状', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: /^2026-03-08，/ }).click(); await expect(page.getByRole('dialog')).toBeInViewport(); await page.keyboard.press('Escape')
  }
})
