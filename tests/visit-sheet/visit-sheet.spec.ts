import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { readFile } from 'node:fs/promises'

test('用药剂量与体温数值写回真实结构化字段',async({page})=>{
  const headers={Authorization:`Bearer ${token}`},ids:string[]=[]
  try{
    for(const data of [
      {type:'medication',content:'结构化药物验收',occurredAt:'2026-09-01T08:00:00Z',journal:{categories:['medication'],medication:{medicationName:'合成药品',amountValue:1,amountUnit:'mL',administrationRoute:'oral'}}},
      {type:'note',sourceType:'measurement',content:'结构化体温验收 37℃',occurredAt:'2026-09-01T09:00:00Z',journal:{categories:['symptom'],symptom:{symptomCategory:'fever',narrative:'结构化体温验收',locations:[],descriptors:[],symptomSpecificData:{currentTemperature:37}}}}
    ]){const response=await page.request.post('/api/events/event-a/records',{headers,data});expect(response.ok()).toBeTruthy();ids.push((await response.json()).id)}
    await enter(page);await page.getByRole('button',{name:'重新整理已有记录'}).click();await expect(page.getByRole('status').filter({hasText:'情况单已更新'})).toBeVisible()
    await chapter(page,'附件与依据');await page.getByPlaceholder('搜索原文、日期或来源').fill('结构化药物验收');await page.locator('.visit-source-row').first().click();await page.getByRole('button',{name:'查看 / 修改原始记录'}).click()
    await page.getByRole('spinbutton',{name:'本次用量'}).fill('2');await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('dialog',{name:'记录用药',exact:true})).toHaveCount(0)
    const records=await(await page.request.get('/api/events/event-a/records',{headers})).json();expect(records.find((r:{id:string})=>r.id===ids[0]).journal.medication.amountValue).toBe(2)
    await page.getByPlaceholder('搜索原文、日期或来源').fill('结构化体温验收');await page.locator('.visit-source-row').first().click();await page.getByRole('button',{name:'查看 / 修改原始记录'}).click();await page.getByRole('button',{name:'编辑症状记录',exact:true}).click()
    await page.getByRole('spinbutton',{name:'本次体温 ℃'}).fill('36.8');await page.getByRole('dialog',{name:'编辑症状记录'}).getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog',{name:'编辑症状记录'})).toHaveCount(0)
    const changed=await(await page.request.get('/api/events/event-a/records',{headers})).json();expect(changed.find((r:{id:string})=>r.id===ids[1]).journal.symptom.symptomSpecificData.currentTemperature).toBe(36.8)
  }finally{for(const id of ids)expect((await page.request.delete(`/api/records/${id}`,{headers})).ok()).toBeTruthy()}
})
const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({
  id: 'visit-test',
})
async function enter(page: Page, member = 'child-a') {
  await page.addInitScript(
    ({ token, member }) => {
      sessionStorage.setItem('hoooho-auth-token', token)
      localStorage.setItem(
        'hoooho-app',
        JSON.stringify({
          state: {
            authUser: { id: 'visit-test' },
            currentMemberId: member,
            members: [],
            profile: null,
          },
          version: 5,
        }),
      )
    },
    { token, member },
  )
  await page.goto('/visit-summary')
  await expect(
    page.getByRole('heading', { name: '病情数据', exact: true }),
  ).toBeVisible()
}
async function chapter(page: Page, title: string) {
  await page.getByRole('button', { name: '章节目录', exact: true }).click()
  await page
    .getByRole('dialog', { name: '章节目录' })
    .getByRole('button', { name: new RegExp(title) })
    .click()
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: '章节目录' })).toHaveCount(0)
}
async function width(page: Page) {
  const value = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    content: document.querySelector('[data-scroll-container]')?.scrollWidth,
    client: document.querySelector('[data-scroll-container]')?.clientWidth,
  }))
  expect(value.document).toBeLessThanOrEqual(value.width)
  expect(value.body).toBeLessThanOrEqual(value.width)
  expect(value.content).toBeLessThanOrEqual(value.client!)
}
test('自动结果、九章目录、手机无溢出、主诉修改持久化及完整离线导出', async ({
  page,
}, info) => {
  await enter(page)
  await width(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('01-auto-report.png') })
  await page.getByRole('button', { name: '更改', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '更改主诉' })).toBeVisible()
  await width(page)
  await page.getByLabel(/肘窝皮肤发红，第1条观察/).check()
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(page.getByRole('dialog', { name: '更改主诉' })).toHaveCount(0)
  await expect(
    page.getByText('本次焦点纳入 2 条症状记录；不代表独立发作次数。'),
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('02-changed-focus.png') })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '病情数据', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '肘窝皮肤发红，第1条观察', exact: true }),
  ).toBeVisible()
  for (const title of [
    '病程',
    '体温',
    '过敏与排敏',
    '用药',
    '成长与日常',
    '既往与家族',
    '就诊检查',
    '附件与依据',
  ]) {
    await chapter(page, title)
    await width(page)
    await page.screenshot({ path: info.outputPath(`chapter-${title}.png`) })
  }
  await page.getByPlaceholder('搜索原文、日期或来源').fill('虚构图片')
  await page.getByRole('button', { name: /虚构图片/ }).click()
  await page.getByRole('button', { name: '读取附件原件' }).click()
  await expect(page.getByRole('alert')).toContainText('附件读取失败')
  await page.screenshot({ path: info.outputPath('attachment-failure.png') })
  await page
    .getByRole('dialog', { name: '原始依据' })
    .getByRole('button', { name: '关闭原始依据', exact: true })
    .click()
  await page.getByRole('button', { name: '导出情况单', exact: true }).click()
  await page.screenshot({ path: info.outputPath('export.png') })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存离线 HTML' }).click()
  const file = await download
  const path = info.outputPath('report.html')
  await file.saveAs(path)
  const html = await readFile(path, 'utf8')
  expect(html).toContain('前臂皮肤发红，第8条观察')
  expect(html).toContain('鸡蛋观察')
  expect(html).not.toContain('Bearer')
  expect(html).not.toContain('blob:')
  expect(html).not.toContain('<script')
  const offline = await page.context().newPage()
  await offline.route('**/*', (route) => route.abort())
  await offline.setContent(html)
  await expect(
    offline.getByRole('heading', { name: '体温', exact: true }),
  ).toBeVisible()
  await offline.locator('summary').first().click()
  await offline.getByRole('link', { name: '成长与日常', exact: true }).click()
  await offline.screenshot({ path: info.outputPath('offline-report.png') })
  await offline.close()
})
test('取消、失败保留输入和旧版本；复制拒绝全文回退；无症状空状态', async ({
  page,
}, info) => {
  await enter(page)
  await page.getByRole('button', { name: '更改', exact: true }).click()
  await page.getByLabel('自己填写主诉').check()
  await page.getByLabel('本次主诉（家长陈述）').fill('本次自填问题')
  await page.route('**/api/members/child-a/visit-sheet', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: '测试保存失败' } }),
        })
      : route.continue(),
  )
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(
    page.getByRole('dialog', { name: '更改主诉' }).getByRole('alert'),
  ).toContainText('测试保存失败')
  await expect(page.getByLabel('本次主诉（家长陈述）')).toHaveValue(
    '本次自填问题',
  )
  await page
    .getByRole('dialog', { name: '更改主诉' })
    .getByRole('button', { name: '关闭更改主诉', exact: true })
    .click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.unroute('**/api/members/child-a/visit-sheet')
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    }),
  )
  await page.getByRole('button', { name: '导出情况单', exact: true }).click()
  await page.getByRole('button', { name: '复制给 AI' }).click()
  await expect(page.getByLabel('可复制的完整情况单')).toContainText(
    '完整原始依据',
  )
  await page.screenshot({ path: info.outputPath('copy-fallback.png') })
  await page
    .getByRole('dialog', { name: '导出情况单' })
    .getByRole('button', { name: '关闭导出情况单', exact: true })
    .click()
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('hoooho-app')!)
    data.state.currentMemberId = 'empty-child'
    localStorage.setItem('hoooho-app', JSON.stringify(data))
  })
  // New context avoids overwriting selection through the initial fixture script.
  const empty = await page
    .context()
    .browser()!
    .newContext({ viewport: { width: 375, height: 667 } })
  const e = await empty.newPage()
  await enter(e, 'empty-child')
  await expect(e.getByRole('button', { name: '补充健康记录' })).toBeVisible()
  await width(e)
  await e.screenshot({ path: info.outputPath('empty-report.png') })
  await empty.close()
})
test('原始症状结构化写回、报告重新计算及修改追溯', async ({ page }, info) => {
  await enter(page)
  await chapter(page, '附件与依据')
  await page
    .getByPlaceholder('搜索原文、日期或来源')
    .fill('肘窝皮肤发红，第1条观察')
  await page.locator('.visit-source-row').first().click()
  await page.getByRole('button', { name: '查看 / 修改原始记录' }).click()
  await page.getByRole('button', { name: '编辑症状记录', exact: true }).click()
  await page.getByRole('combobox', { name: '影响程度' }).selectOption('clear')
  await page
    .getByRole('textbox', { name: /症状备注/ })
    .fill(`已核对 ${info.project.name}`)
  await page
    .getByRole('dialog', { name: '编辑症状记录' })
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: '编辑症状记录' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('status').filter({ hasText: '情况单已更新' }),
  ).toBeVisible()
  const response = await page.request.get('/api/events/event-a/records', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok()).toBeTruthy()
  const records = await response.json()
  const record = records.find((r: { id: string }) => r.id === 's0')
  expect(record.journal.symptom.impactLevel).toBe('clear')
  expect(record.revisions.at(-1).after.journal.symptom.shortNote).toBe(
    `已核对 ${info.project.name}`,
  )
  await page.getByText(/查看修改记录/).click()
  await expect(
    page.locator('.visit-change-history article').last(),
  ).toContainText(`已核对 ${info.project.name}`)
  await page.screenshot({ path: info.outputPath('source-edit-history.png') })
  await chapter(page, '病情数据')
  await page.getByRole('button', { name: '更改', exact: true }).click()
  await page.getByLabel('自己填写主诉').check()
  await page.getByLabel('本次主诉（家长陈述）').fill('没有匹配的新问题')
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(
    page.getByText(
      '关于此主诉暂无足够症状资料。其他已有资料仍保留在对应章节。',
    ),
  ).toBeVisible()
  await expect(page.locator('.hoho-fact-distribution')).toHaveCount(0)
  await page.getByRole('button', { name: '更改', exact: true }).click()
  await page.getByLabel('按最近症状', { exact: false }).check()
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(page.getByRole('dialog', { name: '更改主诉' })).toHaveCount(0)
})
