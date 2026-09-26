import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

test('用药剂量与体温数值写回真实结构化字段',async({page})=>{
  const headers={Authorization:`Bearer ${token}`},ids:string[]=[]
  try{
    for(const data of [
      {type:'medication',content:'结构化药物验收',occurredAt:'2026-09-01T08:00:00Z',journal:{categories:['medication'],medication:{medicationName:'合成药品',amountValue:1,amountUnit:'mL',administrationRoute:'oral'}}},
      {type:'note',sourceType:'measurement',content:'结构化体温验收 37℃',occurredAt:'2026-09-01T09:00:00Z',journal:{categories:['symptom'],symptom:{symptomCategory:'fever',narrative:'结构化体温验收',locations:[],descriptors:[],symptomSpecificData:{currentTemperature:37}}}}
    ]){const response=await page.request.post('/api/events/event-a/records',{headers,data});expect(response.ok()).toBeTruthy();ids.push((await response.json()).id)}
    await enter(page);await page.getByRole('button',{name:'重新整理已有记录'}).click();await expect(page.getByRole('status').filter({hasText:'情况单已更新'})).toBeVisible()
    await chapter(page,'附件与完整依据');await page.getByPlaceholder('搜索原文、日期或来源').fill('结构化药物验收');await page.locator('.visit-source-row').first().click();await page.getByRole('button',{name:'查看 / 修改原始记录'}).click()
    await page.getByRole('spinbutton',{name:'本次用量'}).fill('2');await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('dialog',{name:'记录用药',exact:true})).toHaveCount(0)
    const records=await(await page.request.get('/api/events/event-a/records',{headers})).json();expect(records.find((r:{id:string})=>r.id===ids[0]).journal.medication.amountValue).toBe(2)
    await page.getByRole('dialog',{name:'原始依据'}).getByRole('button',{name:'关闭原始依据',exact:true}).click()
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
    overflow:[...document.querySelectorAll('body, #root, .app-shell, .visit-report')].map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,min:getComputedStyle(e).minWidth})),
  }))
  expect(value.document,JSON.stringify(value)).toBeLessThanOrEqual(value.width)
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
  await page.getByRole('button', { name: '更改主诉', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '更改主诉' })).toBeVisible()
  await width(page)
  await page.getByLabel(/肘窝皮肤发红，第1条观察/).check()
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(page.getByRole('dialog', { name: '更改主诉' })).toHaveCount(0)
  await expect(
    page.locator('#chapter-course'),
  ).toContainText('关联 2 条症状记录')
  await page.screenshot({ path: info.outputPath('02-changed-focus.png') })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '病情数据', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '肘窝皮肤发红，第1条观察', exact: true }),
  ).toBeVisible()
  for (const title of [
    '病程与变化',
    '体温记录',
    '过敏与饮食观察',
    '用药与处理',
    '成长与日常',
    '既往与相关背景',
    '就诊与检查',
    '附件与完整依据',
  ]) {
    await chapter(page, title)
    await width(page)
    await page.screenshot({ path: info.outputPath(`chapter-${title}.png`) })
  }
  await page.getByPlaceholder('搜索原文、日期或来源').fill('虚构图片')
  await page.getByRole('button', { name: /虚构图片/ }).click()
  await page.locator('.visit-attachment').filter({hasText:'虚构图片.png'}).getByRole('button', { name: '读取附件原件' }).click()
  await expect(page.getByRole('alert')).toContainText('附件读取失败')
  await page.screenshot({ path: info.outputPath('attachment-failure.png') })
  await page
    .getByRole('dialog', { name: '原始依据' })
    .getByRole('button', { name: '关闭原始依据', exact: true })
    .click()
  await page.getByRole('button', { name: '导出情况单', exact: true }).click()
  await page.screenshot({ path: info.outputPath('export.png') })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存完整离线报告（HTML）',exact:true }).click()
  const file = await download
  const path = info.outputPath('report.html')
  await file.saveAs(path)
  const html = await readFile(path, 'utf8')
  expect(html).toContain('前臂皮肤发红，第8条观察')
  expect(html).toContain('鸡蛋观察')
  expect(html).not.toContain('Bearer')
  expect(html).not.toContain('blob:')
  expect(html).not.toMatch(/<script[^>]*src=/)
  expect(html).toContain("connect-src 'none'")
  const offline = await page.context().newPage()
  await offline.route('**/*', (route) => route.abort())
  await offline.setContent(html)
  await expect(
    offline.getByRole('heading', { name: '体温记录', exact: true }),
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
  await page.getByRole('button', { name: '更改主诉', exact: true }).click()
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
  await chapter(page, '附件与完整依据')
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
  await page.getByRole('dialog',{name:'原始依据'}).getByRole('button',{name:'关闭原始依据',exact:true}).click()
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
  await page.getByRole('button', { name: '更改主诉', exact: true }).click()
  await page.getByLabel('自己填写主诉').check()
  await page.getByLabel('本次主诉（家长陈述）').fill('没有匹配的新问题')
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(
    page.getByText(
      '关于此主诉暂无足够症状资料。其他已有资料仍保留在对应章节。',
    ),
  ).toBeVisible()
  await expect(page.locator('#chapter-overview .hoho-fact-distribution')).toHaveCount(0)
  await expect(page.locator('#chapter-course .hoho-fact-distribution')).toHaveCount(0)
  await page.getByRole('button', { name: '更改主诉', exact: true }).click()
  await page.getByLabel('按最近症状', { exact: false }).check()
  await page.getByRole('button', { name: '保存并更新情况单' }).click()
  await expect(page.getByRole('dialog', { name: '更改主诉' })).toHaveCount(0)
})

test('v5 连续阅读、原图缩放、主题选图真实保存、独立导出范围与离线副本',async({page,browser,browserName},info)=>{
  const headers={Authorization:`Bearer ${token}`}
  let current=await(await page.request.get('/api/members/child-a/visit-sheet',{headers})).json()
  await page.request.put('/api/members/child-a/visit-sheet',{headers,data:{expectedVersion:current.report?.version??current.expectedVersion??0,requestId:`v5-${info.project.name}`,focus:{mode:'source',sourceId:'record:s7'},notes:{sources:'第九章导出核对标记'},selectedPhotoIds:['attachment:v5-image-0','attachment:v5-image-1']}})
  await enter(page)
  await expect(page.locator('[data-scroll-container] > .visit-chapter')).toHaveCount(9)
  const order=await page.evaluate(()=>{const complaint=document.querySelector('.visit-report-focus')!,photos=document.querySelector('.visit-photos')!;return {adjacent:complaint.nextElementSibling===photos,complaint:complaint.getBoundingClientRect().top,photos:photos.getBoundingClientRect().top}})
  expect(order.adjacent).toBeTruthy();expect(order.photos).toBeGreaterThan(order.complaint)
  await expect(page.locator('.visit-photos img')).toHaveCount(2)
  await expect(page.locator('.visit-photos')).toContainText('拍摄时间未提供')
  await page.screenshot({path:info.outputPath('v5-phone-first.png')})
  const trigger=page.getByRole('button',{name:'查看原图：测试原图-0.png',exact:true})
  await trigger.click()
  const viewer=page.getByRole('dialog',{name:'照片原图'})
  await viewer.getByRole('button',{name:'放大',exact:true}).click()
  const size=await page.locator('.visit-image-viewport').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}))
  expect(size.scroll).toBeGreaterThan(size.client)
  await page.screenshot({path:info.outputPath('v5-photo-viewer.png')})
  await viewer.getByRole('button',{name:'还原完整比例'}).click()
  await viewer.getByRole('button',{name:'关闭照片原图',exact:true}).click()
  await expect(trigger).toBeFocused()
  await page.getByRole('button',{name:'调整照片',exact:true}).click()
  await page.getByRole('checkbox',{name:'测试原图-1.png',exact:true}).uncheck()
  await page.getByRole('button',{name:'保存展示选择'}).click()
  await expect(page.getByRole('dialog',{name:'调整照片'})).toHaveCount(0)
  await page.reload();await expect(page.locator('.visit-photos img')).toHaveCount(1)
  await page.getByRole('button',{name:'查看原图：测试原图-0.png',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'照片原图'}).getByRole('button',{name:'下一张照片'})).toBeDisabled()
  await page.getByRole('dialog',{name:'照片原图'}).getByRole('button',{name:'关闭照片原图',exact:true}).click()
  for(const title of ['病程与变化','用药与处理','过敏与饮食观察','既往与相关背景','附件与完整依据']){
    await chapter(page,title)
    const heading=page.getByRole('heading',{name:title,exact:true});const bounds=await heading.boundingBox();expect(bounds!.y).toBeLessThan(180)
    await page.screenshot({path:info.outputPath(`v5-${title}.png`)})
  }
  await page.getByPlaceholder('搜索原文、日期或来源').fill('前臂皮肤发红，第8条观察')
  await page.getByRole('button',{name:'导出情况单',exact:true}).click()
  const exports=page.getByRole('dialog',{name:'导出情况单'})
  await exports.getByText(/核对导出照片/).click()
  for(const checkbox of await exports.getByRole('checkbox').all())await checkbox.uncheck()
  await exports.getByRole('checkbox',{name:/测试原图-0.png/}).check()
  await exports.getByRole('checkbox',{name:/测试原图-2.png/}).check()
  await page.screenshot({path:info.outputPath('v5-export-scope.png')})
  const downloadPromise=page.waitForEvent('download');await exports.getByRole('button',{name:'保存完整离线报告（HTML）',exact:true}).click()
  const file=await downloadPromise,path=info.outputPath('v5-offline.html');await file.saveAs(path)
  const html=await readFile(path,'utf8')
  const excluded=await(await page.request.get('/api/events/event-a/attachments/v5-image-1/content',{headers})).body()
  expect(html).not.toContain(excluded.toString('base64'))
  const included=await(await page.request.get('/api/events/event-a/attachments/v5-image-0/content',{headers})).body()
  expect(html).toContain(included.toString('base64'))
  expect(html).not.toContain('Bearer');expect(html).not.toContain('record:s7');expect(html).not.toContain('event-a');expect(html).toContain('鸡蛋观察');expect(html).toContain('完整依据附录')
  const textDownload=page.waitForEvent('download');await exports.getByRole('button',{name:'保存重点摘要（文本）',exact:true}).click()
  const summaryFile=info.outputPath('v5-summary.txt');await(await textDownload).saveAs(summaryFile)
  expect(await readFile(summaryFile,'utf8')).toContain('第九章导出核对标记')
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('test denied')}}}))
  await exports.getByRole('button',{name:'复制给 AI',exact:true}).click()
  const ai=await exports.getByRole('textbox',{name:'可复制的完整情况单'}).inputValue()
  expect(ai).toContain('第九章导出核对标记');expect(ai.indexOf('重点摘要')).toBeLessThan(ai.indexOf('完整原始依据'))
  if(browserName==='chromium'&&info.project.name==='desktop'){
    await exports.getByRole('button',{name:'打印 / 另存 PDF',exact:true}).click()
    await expect(page.locator('iframe[title="打印当前情况单"]')).toHaveCount(1)
    const printHtml=await page.locator('iframe[title="打印当前情况单"]').getAttribute('srcdoc')
    const printPage=await browser.newPage();await printPage.setContent(printHtml!);await printPage.emulateMedia({media:'print'})
    await expect(printPage.getByText('第九章导出核对标记',{exact:true})).toBeVisible()
    await expect(printPage.getByRole('heading',{name:'集中核对资料缺口',exact:true})).toBeVisible()
    await printPage.pdf({path:info.outputPath('v5-full-report.pdf'),format:'A4',printBackground:true});await printPage.close()
  }
  const offlineContext=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'block'})
  const offline=await offlineContext.newPage()
  // Windows WebKit treats file:// itself as a network failure with offline=true.
  // Block every HTTP(S) request instead; the same real file and persistence checks remain.
  const networkAttempts:string[]=[]
  if(browserName==='webkit'){
    info.annotations.push({type:'environment',description:'Windows WebKit file:// requires transport offline=false; all HTTP(S) is blocked and audited. Not a real iOS file-opening result.'})
    await offlineContext.route(/^https?:/,route=>{networkAttempts.push(route.request().url());return route.abort()})
  }else await offlineContext.setOffline(true)
  const errors:string[]=[];offline.on('pageerror',e=>errors.push(e.message))
  await offline.goto(pathToFileURL(path).href)
  await expect(offline.locator('#copy-revision')).toContainText('本地修订')
  await expect(offline.locator('[data-copy-photo]:visible')).toHaveCount(1)
  await expect(offline.locator('[data-copy-original]')).toHaveCount(2)
  await expect(offline.getByRole('heading',{name:'集中核对资料缺口',exact:true})).toBeVisible()
  await expect(offline.getByText('第九章导出核对标记',{exact:true})).toBeVisible()
  await offline.getByRole('button',{name:'编辑本次想问',exact:true}).click()
  await offline.getByRole('textbox',{name:'本次想问',exact:true}).fill('本地问题 </script><img src=x onerror=alert(1)>')
  await offline.getByRole('button',{name:'保存本地修改'}).click()
  await offline.reload();await expect(offline.locator('#copy-question')).toContainText('本地问题 </script>')
  await expect(offline.locator('#copy-question-sources a')).toHaveCount(0)
  await offline.locator('[data-copy-photo]:visible a').first().click()
  await expect(offline.getByRole('dialog')).toContainText('完整原图')
  await offline.getByRole('button',{name:'放大',exact:true}).click();await offline.getByRole('button',{name:'关闭原图',exact:true}).click()
  await offline.getByRole('button',{name:'更改主诉',exact:true}).click()
  await offline.getByRole('combobox',{name:'主诉来源'}).selectOption('custom')
  await offline.getByRole('textbox',{name:'自填主诉'}).fill('无匹配的本地问题')
  await offline.getByRole('button',{name:'保存本地修改'}).click()
  await expect(offline.locator('#copy-course')).toContainText('此主诉尚无相关经过')
  await expect(offline.locator('[data-copy-photo]:visible')).toHaveCount(0)
  await offline.screenshot({path:info.outputPath('v5-offline-edited.png')})
  expect(errors).toEqual([])
  await offline.locator('[data-copy-original] a').last().click();await expect(offline.getByRole('dialog')).toContainText('完整原图');await offline.getByRole('button',{name:'关闭原图',exact:true}).click()
  const updatedCopy=offline.waitForEvent('download');await offline.getByRole('button',{name:'下载更新副本',exact:true}).click()
  const updatedPath=info.outputPath('v5-offline-updated.html');await(await updatedCopy).saveAs(updatedPath)
  await offline.goto(pathToFileURL(updatedPath).href);await expect(offline.locator('#copy-complaint')).toHaveText('无匹配的本地问题')
  await expect(offline.locator('#copy-question')).toContainText('本地问题 </script>')
  expect(networkAttempts).toEqual([])
  await offlineContext.close()
})

test('v5 大字连续重排、章节补充真实持久化且不冒充问题来源',async({page},info)=>{
  await enter(page)
  const headers={Authorization:`Bearer ${token}`},before=await(await page.request.get('/api/members/child-a/visit-sheet',{headers})).json()
  await chapter(page,'病程与变化')
  await page.getByRole('button',{name:'补充 / 校订 · 病程与变化',exact:true}).click()
  await page.getByRole('dialog',{name:'补充报告说明'}).getByRole('textbox').fill(`本章补充 ${info.project.name}`)
  await page.getByRole('button',{name:'保存并更新情况单'}).click()
  await expect(page.getByRole('dialog',{name:'补充报告说明'})).toHaveCount(0)
  await page.reload();await chapter(page,'病程与变化');await expect(page.locator('#chapter-course')).toContainText(`本章补充 ${info.project.name}`)
  const after=await(await page.request.get('/api/members/child-a/visit-sheet',{headers})).json();expect(after.report.questionOrigin).toBe(before.report.questionOrigin);expect(after.report.questionEdited).toBe(before.report.questionEdited)
  await page.evaluate(()=>document.documentElement.style.fontSize='200%')
  await width(page)
  await page.screenshot({path:info.outputPath('v5-200-percent-text.png')})
  await page.getByRole('button',{name:'章节目录',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'章节目录'}).locator('[aria-current="page"]')).toContainText('病程与变化')
  await page.getByRole('dialog',{name:'章节目录'}).getByRole('button',{name:'关闭章节目录',exact:true}).click()
  await expect(page.getByRole('button',{name:'章节目录',exact:true})).toBeFocused()
})

test('v5 导出期间来源变化或主动取消，不生成过期文件',async({page},info)=>{
  const headers={Authorization:`Bearer ${token}`}
  const current=await(await page.request.get('/api/members/child-a/visit-sheet',{headers})).json()
  await page.request.put('/api/members/child-a/visit-sheet',{headers,data:{expectedVersion:current.report?.version??current.expectedVersion??0,requestId:`race-${info.project.name}`,focus:{mode:'source',sourceId:'record:s7'},selectedPhotoIds:['attachment:v5-image-0']}})
  await enter(page);await page.getByRole('button',{name:'导出情况单',exact:true}).click()
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve)
  let requested!:()=>void;const started=new Promise<void>(resolve=>requested=resolve)
  const url='**/api/events/event-a/attachments/v5-image-0/content'
  await page.route(url,async route=>{requested();await gate;await route.continue().catch(()=>{})})
  const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()))
  await page.getByRole('button',{name:'保存完整离线报告（HTML）',exact:true}).click();await started
  const created=await(await page.request.post('/api/events/event-a/records',{headers,data:{type:'note',content:'导出竞态合成记录',occurredAt:'2026-09-01T10:00:00Z'}})).json()
  try{release();await expect(page.getByRole('dialog',{name:'导出情况单'}).getByRole('status')).toContainText('资料或版本已变化');expect(downloads).toEqual([])}finally{await page.request.delete(`/api/records/${created.id}`,{headers});await page.unroute(url)}
  await page.getByRole('dialog',{name:'导出情况单'}).getByRole('button',{name:'关闭导出情况单',exact:true}).click()
  await page.getByRole('button',{name:'重新整理已有记录'}).click();await expect(page.getByRole('status').filter({hasText:'情况单已更新'})).toBeVisible()
  await page.getByRole('button',{name:'导出情况单',exact:true}).click()
  let finish!:()=>void;const wait=new Promise<void>(resolve=>finish=resolve);let signal!:()=>void;const waiting=new Promise<void>(resolve=>signal=resolve)
  await page.route(url,async route=>{signal();await wait;await route.abort().catch(()=>{})})
  await page.getByRole('button',{name:'保存完整离线报告（HTML）',exact:true}).click();await waiting
  await page.getByRole('dialog',{name:'导出情况单'}).getByRole('button',{name:'关闭导出情况单',exact:true}).click();finish()
  await expect(page.getByRole('dialog',{name:'导出情况单'})).toHaveCount(0);expect(downloads).toEqual([])
})

test('v5 二十五张候选与长主诉可滚动核对，放弃选择不保存',async({page},info)=>{
  await page.route('**/api/members/child-a/visit-sheet',async route=>{
    const response=await route.fetch(),state=await response.json()
    if(route.request().method()!=='GET'||!state.report){await route.fulfill({response});return}
    const r=state.report,original=r.sources.find((s:any)=>s.id==='attachment:v5-image-0'),photo=r.photos.find((p:any)=>p.sourceId===original.id)
    r.complaint='长主诉测试：'+('家长记录反复变化，需要核对实际发生时间和关联资料。'.repeat(12))
    r.photos=Array.from({length:25},(_,i)=>({...photo,sourceId:`stress:${i}`,title:`候选原图-${String(i+1).padStart(2,'0')}`}))
    r.sources.push(...r.photos.map((p:any)=>({...original,id:p.sourceId,title:p.title})))
    r.photoCandidates=r.photos.map((p:any)=>p.sourceId);r.selectedPhotoIds=r.photoCandidates.slice(0,3)
    await route.fulfill({response,json:state})
  })
  await enter(page);await width(page)
  await page.getByRole('button',{name:'调整照片',exact:true}).click()
  const picker=page.getByRole('dialog',{name:'调整照片'})
  await expect(picker.getByRole('checkbox')).toHaveCount(25)
  await picker.getByRole('checkbox',{name:'候选原图-25',exact:true}).check()
  await page.screenshot({path:info.outputPath('v5-25-photos-long-text.png')})
  expect(await picker.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy()
  await picker.getByRole('button',{name:'关闭调整照片',exact:true}).click()
  await expect(picker.getByRole('alert')).toContainText('展示选择尚未保存')
  await picker.getByRole('button',{name:'放弃修改',exact:true}).click()
  await expect(page.locator('.visit-photos img')).toHaveCount(3)
})
