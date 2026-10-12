import {expect,test} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`},endpoint='/api/members/child-a/visit-sheet'
const raw='早上起来有点头晕，但不是头疼。体温正常。颈部一个小红点，腿部有点小疹子。我估计是痱子，不知道是热疹还是湿疹。昨天只有牛肉是新添加的。<img src=x onerror=alert(1)>'
test.beforeEach(async({page})=>{
  const s=await(await page.request.get(endpoint,{headers})).json()
  await page.request.put(endpoint,{headers,data:{expectedVersion:s.report?.version??s.expectedVersion??0,requestId:crypto.randomUUID(),focus:{mode:'source',sourceId:'record:s7'},caseDetails:{},selectedPhotoIds:[]}})
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:sessionStorage.getItem('current-situation-test-member')??'child-a',members:[],profile:null},version:5}))},token)
  // Transport fixture only; no production data. Save still goes through the real scoped service.
  await page.route('**/api/members/child-a/visit-sheet',async route=>{
    const response=await route.fetch(),body=await response.json()
    if(!body.report)return route.fulfill({response,json:body})
    const r=body.report,edits=r.currentSituationEdits?.[r.photoKey]??{}
    r.currentSituation={scopeKey:r.photoKey,description:edits.description??'今早有点头晕，颈部一个小红点，腿部有点小疹子。无头痛。体温正常。昨日新添加牛肉。',symptoms:(edits.symptoms??'今早有点头晕\n无头痛\n颈部一个小红点，腿部有点小疹子；家属怀疑痱子、热疹或湿疹\n体温正常').split('\n').filter(Boolean).map((text:string,i:number)=>({text,kind:i===3?'temperature':'symptom',emphasize:i===1||i===3,sourceIds:['record:s7']})),diet:(edits.diet??'昨日新添加牛肉').split('\n').filter(Boolean).map((text:string)=>({text,sourceIds:['record:s7']})),changes:[],treatment:[],raw:[{text:raw,sourceId:'record:s7'}]}
    await route.fulfill({response,json:body})
  })
})
test('结构、否定高亮、原话、附件空态与大字长文没有溢出',async({page},info)=>{
  await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}))
  await page.goto('/visit-summary')
  const card=page.locator('#chapter-overview')
  await expect(card.getByRole('button',{name:'更改主诉',exact:true})).toBeVisible()
  const visual=await card.getByRole('button',{name:'更改主诉',exact:true}).evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundImage+getComputedStyle(e).backgroundColor}))
  expect(visual.color).toBe('rgb(255, 255, 255)');expect(visual.background).not.toContain('rgba(0, 0, 0, 0)')
  await expect(card.locator('.visit-reading-case strong').filter({hasText:'无头痛'})).toHaveText('无头痛')
  await expect(card.getByRole('button',{name:'体温曲线',exact:true})).toHaveCount(0)
  await expect(card.getByText(/过敏|未处理|尚未确认/)).toHaveCount(0)
  const edit=card.getByRole('button',{name:'编辑情况描述'})
  expect(await edit.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
  expect(await edit.locator('span').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(28)
  await card.getByText('查看原话',{exact:true}).click();await expect(card.getByText(raw,{exact:true})).toBeVisible();await expect(card.locator('.visit-situation-original img')).toHaveCount(0)
  await card.getByText('收起原话',{exact:true}).click();await expect(card.getByText(raw,{exact:true})).toBeHidden()
  await card.getByRole('button',{name:'添加附件',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'添加 / 管理附件'})).toBeVisible()
  await page.getByRole('dialog',{name:'添加 / 管理附件'}).getByRole('button',{name:'关闭添加 / 管理附件'}).click()
  await page.screenshot({path:info.outputPath('attachments-actual.png')})
  await page.locator('.visit-report-scroll').evaluate(e=>{e.scrollTop=0})
  await page.screenshot({path:info.outputPath('current-situation-actual.png')})
  await page.addStyleTag({content:'.visit-current-situation{font-size:125%}.visit-current-situation p{font-size:20px}.visit-current-situation h3{font-size:18px}'})
  await edit.click();const d=page.getByRole('dialog',{name:'编辑情况描述'});await d.getByRole('textbox',{name:'情况描述',exact:true}).fill('无头痛。长正文'.repeat(90));await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0)
  const overflow=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,card:document.querySelector('#chapter-overview')!.scrollWidth,client:document.querySelector('#chapter-overview')!.clientWidth}))
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);expect(overflow.card).toBeLessThanOrEqual(overflow.client)
})
test('描述、症状、饮食分别编辑，失败重试和取消保护原话及其他块',async({page})=>{
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}));await page.goto('/visit-summary')
 await page.getByRole('button',{name:'编辑症状：无头痛',exact:true}).click()
 const symptomInput=page.getByRole('dialog',{name:'编辑症状表现'}).getByRole('textbox')
 await expect(symptomInput).toBeFocused()
 expect(await symptomInput.evaluate((e:HTMLTextAreaElement)=>e.value.slice(e.selectionStart,e.selectionEnd))).toBe('无头痛')
 await page.getByRole('dialog',{name:'编辑症状表现'}).getByRole('button',{name:'关闭编辑症状表现'}).click()
 for(const title of ['情况描述','症状表现','近期饮食']){
   await page.getByRole('button',{name:`编辑${title}`,exact:true}).click();const d=page.getByRole('dialog',{name:`编辑${title}`,exact:true})
   await expect(d.getByRole('textbox')).toHaveCount(1)
   const before=await d.getByRole('textbox').inputValue();await d.getByRole('textbox').fill(`${title}的局部修改`)
   await d.getByRole('button',{name:`关闭编辑${title}`}).click();await d.getByRole('button',{name:'放弃修改'}).click()
   await page.getByRole('button',{name:`编辑${title}`,exact:true}).click();await expect(d.getByRole('textbox')).toHaveValue(before)
   await d.getByRole('textbox').fill(`${title}的已保存修改`)
   await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0)
 }
 await page.reload();await expect(page.locator('#chapter-overview')).toContainText('情况描述的已保存修改');await expect(page.locator('#chapter-overview')).toContainText('症状表现的已保存修改');await expect(page.locator('#chapter-overview')).toContainText('近期饮食的已保存修改')
 await page.getByRole('button',{name:'编辑情况描述'}).click();const d=page.getByRole('dialog',{name:'编辑情况描述'});await d.getByRole('textbox').fill('失败保留的输入')
 await page.route('**/api/members/child-a/visit-sheet',async r=>r.request().method()==='PUT'?r.fulfill({status:503,json:{error:{message:'隔离测试保存失败'}}}):r.fallback())
 await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d.getByRole('alert')).toContainText('隔离测试保存失败');await expect(d.getByRole('textbox')).toHaveValue('失败保留的输入')
 await page.unroute('**/api/members/child-a/visit-sheet');await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0)
})
test('0/1/2 条体温入口、实际点、底部弹层、关闭回焦和删除后关闭',async({page},info)=>{
 let points:Array<{value:number;at:string;sourceId:string}>=[]
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points}}))
 await page.goto('/visit-summary');const button=page.getByRole('button',{name:'体温曲线',exact:true})
 await expect(page.locator('.visit-reading-case')).toBeVisible();await expect(button).toHaveCount(0)
 points=[{value:37,at:'2026-10-12T00:00:00Z',sourceId:'record:a'}];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(button).toHaveCount(0)
 points.push({value:37,at:'2026-10-13T08:00:00Z',sourceId:'record:b'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(button).toBeVisible();await expect(button.locator('svg')).toHaveCount(0)
 await button.click();const sheet=page.getByRole('dialog',{name:'体温曲线',exact:true});await expect(sheet).toBeVisible()
 expect(await page.locator('.visit-report-scroll').evaluate(e=>({inert:(e as HTMLElement).inert,overflow:getComputedStyle(e).overflowY}))).toEqual({inert:true,overflow:'hidden'})
 await expect.poll(()=>sheet.evaluate(e=>{const r=e.getBoundingClientRect();return Math.abs(innerHeight-r.bottom)<2})).toBeTruthy()
 await sheet.getByRole('button',{name:/37 °C/}).first().click();await expect(sheet.getByRole('status')).toContainText('37 °C')
 await expect(sheet.getByText(/当前成员|本周|记录数|最低|最高|进展/)).toHaveCount(0)
 await page.screenshot({path:info.outputPath('temperature-sheet-actual.png')})
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await expect(button).toBeFocused()
 await button.click();await page.evaluate(()=>history.back());await expect(sheet).toHaveCount(0)
 await button.click();points=points.slice(0,1);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(sheet).toHaveCount(0);await expect(button).toHaveCount(0)
})
test('切换成员后迟到的体温查询不会复现旧曲线',async({page})=>{
 let release!:()=>void,start!:()=>void
 const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>start=resolve)
 await page.route('**/api/members/child-a/visit-sheet/temperature',async r=>{start();await gate;await r.fulfill({json:{points:[{sourceId:'record:a',at:'2026-10-12T00:00Z',value:37},{sourceId:'record:b',at:'2026-10-12T01:00Z',value:37}]}})})
 await page.goto('/visit-summary');await ready
 await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('hoooho-app')!);value.state.currentMemberId='empty-child';sessionStorage.setItem('current-situation-test-member','empty-child');localStorage.setItem('hoooho-app',JSON.stringify(value));location.reload()})
 release();await expect(page.locator('.visit-reading-person')).toContainText('空资料')
 await expect(page.getByRole('button',{name:'体温曲线',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog',{name:'体温曲线'})).toHaveCount(0)
})
