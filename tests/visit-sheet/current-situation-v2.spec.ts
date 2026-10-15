import {expect,test} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {situationRaw,situationOutput} from './current-situation-v2.fixture.mjs'
import {readFile} from 'node:fs/promises'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`},endpoint='/api/members/child-a/visit-sheet'
let focusId:string
test.beforeEach(async({page})=>{
 const created=await page.request.post('/api/events/event-a/records',{headers,data:{type:'symptom',content:situationRaw,sourceText:situationRaw,occurredAt:new Date(Date.now()-3600000).toISOString()}});expect(created.ok()).toBeTruthy();focusId=(await created.json()).id
 await page.request.post('http://127.0.0.1:4198/draft-data',{data:{summaryOutput:situationOutput(`record:${focusId}`)}});await page.request.get('http://127.0.0.1:4198/success')
 const state=await(await page.request.get(endpoint,{headers})).json();expect((await page.request.put(endpoint,{headers,data:{expectedVersion:state.report?.version??state.expectedVersion??0,requestId:crypto.randomUUID(),focus:{mode:'source',sourceId:`record:${focusId}`},selectedPhotoIds:[]}})).ok()).toBeTruthy()
 await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:sessionStorage.getItem('v2-member')??'child-a',members:[],profile:null},version:5}))},token)
})
test('附件紧接饮食，保留后续变化与处理，继续添加可打开管理',async({page})=>{
 await page.route('**/api/members/child-a/visit-sheet',async route=>{
  const response=await route.fetch(),body=await response.json()
  if(body.report?.currentSituation){
   body.report.currentSituation.changes=[{text:'观察到后续变化',sourceIds:[]}]
   body.report.currentSituation.treatment=[{text:'已记录处理经过',sourceIds:[]}]
  }
  await route.fulfill({response,json:body})
 })
 await page.goto('/visit-summary');const card=page.locator('#chapter-overview')
 await expect(card.getByRole('region',{name:'近期饮食'})).toBeVisible()
 await expect(card.locator('.visit-situation-block h3')).toHaveText(['情况描述本次重点','症状表现','近期饮食','附件','发生与变化','已做处理'])
 await expect(card.getByText('观察到后续变化',{exact:true})).toBeVisible()
 await expect(card.getByText('已记录处理经过',{exact:true})).toBeVisible()
 await card.getByRole('button',{name:'继续添加',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'添加 / 管理附件'})).toBeVisible()
})

test('旧原话经过真实摘要API与保存链路成为三块，六个界面按稿验收' ,async({page},info)=>{
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}))
 const before=(await(await page.request.get('http://127.0.0.1:4198/success')).json()).calls
 await page.goto('/visit-summary');const card=page.locator('#chapter-overview')
 await expect(card.getByRole('region',{name:'症状表现'})).toBeVisible();await expect(card.getByRole('region',{name:'近期饮食'})).toBeVisible()
 await expect(card.locator('.visit-reading-case>p')).toHaveText(situationOutput().currentSituation.description[0].text)
 await expect(card.getByRole('button',{name:'体温曲线',exact:true})).toHaveCount(0);await expect(card.getByRole('button',{name:'编辑附件'})).toHaveCount(0)
 await expect(card.getByText('家属怀疑是痱子、热疹或湿疹。',{exact:true})).toBeVisible();await expect(card.locator('.visit-reading-case strong')).toHaveText(['无头痛','体温正常'])
 const saved=await(await page.request.get(endpoint,{headers})).json();expect(saved.report.currentSituationResults[saved.report.photoKey].value.symptoms.length).toBe(3)
 const after=(await(await page.request.get('http://127.0.0.1:4198/success')).json()).calls;expect(after-before).toBe(1)
 await page.reload();await expect(card.getByRole('region',{name:'近期饮食'})).toBeVisible();expect((await(await page.request.get('http://127.0.0.1:4198/success')).json()).calls).toBe(after)
 const width=page.viewportSize()!.width;await page.setViewportSize({width,height:1300});await card.screenshot({path:info.outputPath('main.png')})
 const dimensions=await card.evaluate(e=>{const button=e.querySelector('.visit-situation-primary')!,p=e.querySelector('.visit-reading-case>p')!,head=e.querySelector('.visit-situation-heading h3')!,edit=e.querySelector('.visit-situation-edit>span')!;return {card:{x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height},x:p.getBoundingClientRect().x,button:{x:button.getBoundingClientRect().x,height:button.getBoundingClientRect().height},body:{size:getComputedStyle(p).fontSize,line:getComputedStyle(p).lineHeight},heading:{x:head.getBoundingClientRect().x,size:getComputedStyle(head).fontSize},edit:edit.getBoundingClientRect().height}})
 expect(dimensions.card.x).toBeCloseTo(16,0);expect(dimensions.x).toBeCloseTo(37,0);expect(dimensions.button.x).toBeCloseTo(dimensions.x,0);expect(dimensions.heading.x).toBeCloseTo(dimensions.x,0);expect(dimensions.edit).toBe(26);expect(dimensions.button.height).toBe(40);expect(dimensions.body).toEqual({size:'16px',line:'27px'});await info.attach('geometry',{body:JSON.stringify(dimensions),contentType:'application/json'})
 await card.getByText('查看原话',{exact:true}).click();await expect(card.getByText(situationRaw,{exact:true})).toBeVisible();await card.screenshot({path:info.outputPath('original-expanded.png')});await card.getByText('收起原话',{exact:true}).click()
 await page.setViewportSize({width,height:844});await card.getByRole('button',{name:'编辑情况描述'}).click();const d=page.getByRole('dialog',{name:'编辑情况描述'});await expect(d.getByRole('textbox')).toHaveCount(1);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('edit-description.png')});console.log(await d.evaluate(e=>{const rect=(el:Element)=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:b.x,y:b.y,w:b.width,h:b.height,font:s.fontSize,line:s.lineHeight,mt:s.marginTop,mb:s.marginBottom}};return JSON.stringify({sheet:rect(e),header:rect(e.querySelector('header')!),label:rect(e.querySelector('label')!),textarea:rect(e.querySelector('textarea')!),footer:rect(e.querySelector('footer')!)})}));await d.getByRole('button',{name:'取消',exact:true}).click();await expect(d).toHaveCount(0)
 await expect(card.getByRole('button',{name:'编辑情况描述'})).toBeFocused()
 await card.getByRole('button',{name:'更改主诉',exact:true}).click();const choice=page.getByRole('dialog',{name:'更改主诉'});await expect(choice.getByRole('radio',{checked:true})).toHaveCount(1);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('switch-complaint.png')});await choice.getByRole('button',{name:'取消',exact:true}).click()
 await card.getByRole('button',{name:'继续添加',exact:true}).click();await expect(page.getByRole('dialog',{name:'添加 / 管理附件'})).toBeVisible();await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('attachments-empty.png')});await page.getByRole('dialog',{name:'添加 / 管理附件'}).getByRole('button',{name:'关闭添加 / 管理附件'}).click()
 const points=[{sourceId:'record:t1',at:'2026-10-12T00:00:00Z',value:36.5},{sourceId:'record:t2',at:'2026-10-12T06:00:00Z',value:36.8},{sourceId:'record:t3',at:'2026-10-12T12:00:00Z',value:36.6}]
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points}}));await page.reload();const trigger=card.getByRole('button',{name:'体温曲线',exact:true});await trigger.click();const chart=page.getByRole('dialog',{name:'体温曲线',exact:true});await expect(chart.locator('polyline')).toHaveCount(1);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('temperature-sheet.png')});expect(await chart.evaluate(e=>Math.abs(e.getBoundingClientRect().bottom-innerHeight))).toBeLessThanOrEqual(1);await chart.getByRole('button',{name:/36.8 °C/}).click();await expect(chart.getByRole('status')).toContainText('36.8');await page.keyboard.press('Escape');await expect(chart).toHaveCount(0);await expect(trigger).toBeFocused()
})
test('局部行编辑、取消、失败重试、手动版本和原话隔离',async({page},info)=>{
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}));await page.goto('/visit-summary');const card=page.locator('#chapter-overview');await expect(card.getByRole('button',{name:'编辑症状表现'})).toBeVisible()
 await card.getByRole('button',{name:/编辑症状：颈部/}).click();const s=page.getByRole('dialog',{name:'编辑症状表现'});await expect(s.getByRole('textbox',{name:'症状表现：皮肤',exact:true})).toBeFocused();await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('edit-symptom-rows.png')});await s.getByRole('textbox',{name:'症状表现：皮肤',exact:true}).fill('用户编辑皮肤细节');await s.getByRole('button',{name:'保存',exact:true}).click();await expect(s).toHaveCount(0);await expect(card).toContainText('用户编辑皮肤细节');await expect(card).toContainText('家属怀疑是痱子、热疹或湿疹。')
 await card.getByRole('button',{name:'编辑情况描述'}).click();const d=page.getByRole('dialog',{name:'编辑情况描述'});await d.getByRole('textbox').fill('用户手动重点：无头痛。');await d.getByRole('button',{name:'取消',exact:true}).click();await d.getByRole('button',{name:'放弃修改'}).click();await expect(card.locator('.visit-reading-case>p')).not.toContainText('用户手动重点')
 await card.getByRole('button',{name:'编辑情况描述'}).click();await d.getByRole('textbox').fill('用户手动重点：无头痛。');let failed=false
 await page.route('**/api/members/child-a/visit-sheet',async route=>{if(route.request().method()==='PUT'&&!failed){failed=true;return route.fulfill({status:503,json:{error:{message:'合成保存失败'}}})}await route.continue()});await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d.getByRole('textbox')).toHaveValue('用户手动重点：无头痛。');await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0);await page.reload();await expect(card.locator('.visit-reading-case>p')).toHaveText('用户手动重点：无头痛。');await expect(card).toContainText('用户编辑皮肤细节')
 await card.getByText('查看原话',{exact:true}).click();await expect(card.getByText(situationRaw,{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
})

test('附件真实上传、长名称、管理预览与确认移除不删原件',async({page},info)=>{
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}));await page.goto('/visit-summary');const card=page.locator('#chapter-overview');await expect(card.getByRole('button',{name:'编辑症状表现'})).toBeVisible()
 await card.getByRole('button',{name:'继续添加',exact:true}).click();const manager=page.getByRole('dialog',{name:'添加 / 管理附件'});const image=await page.request.get('/api/events/event-a/attachments/v5-image-0/content',{headers});expect(image.ok()).toBeTruthy();const filename='隔离测试很长的皮肤观察附件名称'.repeat(5)+'-'+info.project.name+'.png';await manager.locator('input[type=file]').setInputFiles({name:filename,mimeType:'image/png',buffer:await image.body()});await expect(manager.getByText(/上传完成，待保存/)).toBeVisible();await manager.getByRole('button',{name:'保存附件选择'}).click();await expect(manager).toHaveCount(0);await expect(card.getByRole('button',{name:'编辑附件'})).toBeVisible();await expect(card.locator('.visit-situation-file')).toHaveCount(1)
 await page.setViewportSize({width:page.viewportSize()!.width,height:1500});await card.screenshot({path:info.outputPath('attachments-nonempty.png')});expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();await page.setViewportSize({width:page.viewportSize()!.width,height:844})
 await card.getByRole('button',{name:'编辑附件'}).click();await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('manage-attachments.png')});await manager.getByRole('button',{name:'选择已有记录'}).click();const preview=manager.getByRole('button',{name:`预览附件：${filename.replace(/\.png$/,'.webp')}`,exact:true});await preview.scrollIntoViewIfNeeded();const managerScroll=await manager.locator('.hoho-bottom-sheet__body').evaluate(e=>e.scrollTop);await preview.click();const original=page.getByRole('dialog',{name:'照片原图'});await expect(original.locator('img')).toBeVisible();await original.getByRole('button',{name:'关闭照片原图'}).click();await expect(manager).toBeVisible();await expect(preview).toBeFocused();await expect.poll(()=>manager.locator('.hoho-bottom-sheet__body').evaluate(e=>e.scrollTop)).toBeCloseTo(managerScroll,0);await manager.getByRole('button',{name:'选择已有记录'}).click()
 await manager.getByRole('button',{name:'移除',exact:true}).click();await expect(manager.getByRole('button',{name:'确认移除'})).toBeVisible();await manager.getByRole('button',{name:'取消移除'}).click();await expect(manager.getByRole('checkbox',{checked:true})).toHaveCount(1);await manager.getByRole('button',{name:'移除',exact:true}).click();await manager.getByRole('button',{name:'确认移除'}).click();await manager.getByRole('button',{name:'保存附件选择'}).click();await expect(manager).toHaveCount(0);await expect(card.locator('.visit-situation-file')).toHaveCount(0);await expect(card.getByRole('button',{name:'编辑附件'})).toHaveCount(0)
 await card.getByRole('button',{name:'继续添加',exact:true}).click();await manager.getByRole('button',{name:'选择已有记录'}).click();await expect(manager.getByRole('checkbox',{name:`选中附件：${filename.replace(/\.png$/,'.webp')}`,exact:true})).toBeVisible();await manager.getByRole('button',{name:'关闭添加 / 管理附件'}).click()
})

test('无饮食、无主诉和较大字体长正文是实际兼容状态',async({page},info)=>{
 const raw='今早起床后有点头晕，没有头痛。',response=await page.request.post('/api/events/event-a/records',{headers,data:{type:'symptom',content:raw,sourceText:raw,occurredAt:new Date().toISOString()}}),id=(await response.json()).id,sourceId=`record:${id}`
 const data={currentSituation:{description:[{text:raw,quote:raw,sourceId,emphasis:['没有头痛']}],symptoms:[{text:raw,quote:raw,sourceId,emphasis:['没有头痛'],label:'头晕',kind:'symptom',note:'',noteQuote:''}],diet:[],changes:[],treatment:[],keywords:[]}}
 await page.request.post('http://127.0.0.1:4198/draft-data',{data:{summaryOutput:data}});let state=await(await page.request.get(endpoint,{headers})).json();expect((await page.request.put(endpoint,{headers,data:{expectedVersion:state.report?.version??state.expectedVersion,requestId:crypto.randomUUID(),focus:{mode:'source',sourceId},selectedPhotoIds:[]}})).ok()).toBeTruthy()
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}));await page.goto('/visit-summary');const card=page.locator('#chapter-overview');await expect(card.getByRole('region',{name:'症状表现'})).toBeVisible();await expect(card.getByRole('region',{name:'近期饮食'})).toHaveCount(0);await expect(card.locator('.visit-reading-keywords')).toHaveCount(0);await card.screenshot({path:info.outputPath('no-diet.png')})
 await card.getByRole('button',{name:'编辑情况描述'}).click();const d=page.getByRole('dialog',{name:'编辑情况描述'});const long='有点头晕。没有头痛。用户输入的长细节。\n'.repeat(75);await d.getByRole('textbox').fill(long);await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0);await expect(card.locator('.visit-reading-case>p')).toHaveText(long.trim());await page.addStyleTag({content:'.visit-current-situation p{font-size:20px;line-height:34px}.visit-situation-heading h3{font-size:18px}.visit-symptom-line{font-size:19px;line-height:31px}'})
 expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:info.outputPath('larger-text-long.png')})
 await page.evaluate(()=>sessionStorage.setItem('v2-member','empty-child'));await page.reload();await expect(page.locator('.visit-reading-person')).toContainText('空资料');await expect(card.getByRole('button',{name:'选择主诉',exact:true})).toBeVisible();await expect(card.locator('.visit-situation-block')).toHaveCount(0);await card.screenshot({path:info.outputPath('empty-complaint.png')})
})

test('文字编辑的键盘视口、饮食保存和离线导出保持当前版本',async({page},info)=>{
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points:[]}}));await page.goto('/visit-summary');const card=page.locator('#chapter-overview');await expect(card.getByRole('button',{name:'编辑近期饮食'})).toBeVisible();await card.getByRole('button',{name:'编辑近期饮食'}).click();const d=page.getByRole('dialog',{name:'编辑近期饮食'});await d.getByRole('textbox').fill('昨日平时食物。\n新添加了牛肉。')
 await page.evaluate(()=>{Object.defineProperty(window.visualViewport!,'height',{configurable:true,get:()=>400});window.visualViewport!.dispatchEvent(new Event('resize'))});await expect.poll(()=>d.getByRole('button',{name:'保存',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(400);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:info.outputPath('keyboard-viewport.png')});await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0);await page.reload();await expect(card.getByRole('region',{name:'近期饮食'})).toContainText('昨日平时食物。');await expect(card).toContainText('家属怀疑是痱子、热疹或湿疹。')
 await page.getByRole('button',{name:'导出情况单',exact:true}).click();const exports=page.getByRole('dialog',{name:'导出情况单',exact:true}),download=page.waitForEvent('download');await exports.getByRole('button',{name:'保存情况单，带去就诊',exact:true}).click();const file=info.outputPath('current-edited-offline.html');await(await download).saveAs(file);const html=await readFile(file,'utf8');expect(html).toContain('昨日平时食物。');expect(html).toContain('新添加了牛肉。');expect(html).toContain('家属怀疑是痱子、热疹或湿疹。');expect(html).toContain('无头痛');expect(html).not.toContain(`record:${focusId}`);expect(html).not.toContain('Bearer ')
})

test('整理失败可重试，曲线刷新失败清除旧图与入口',async({page})=>{
 await page.request.get('http://127.0.0.1:4198/failure');let points=[{sourceId:'record:a',at:'2026-10-12T00:00:00Z',value:37},{sourceId:'record:b',at:'2026-10-12T01:00:00Z',value:37}],failed=false
 await page.route('**/visit-sheet/temperature',r=>failed?r.fulfill({status:503,json:{error:{message:'isolated failure'}}}):r.fulfill({json:{points}}));await page.goto('/visit-summary');const card=page.locator('#chapter-overview');await expect(card.getByRole('button',{name:'重试整理'})).toBeVisible();await card.getByText('查看原话',{exact:true}).click();await expect(card.getByText(situationRaw,{exact:true})).toBeVisible();await page.request.get('http://127.0.0.1:4198/success');await card.getByRole('button',{name:'重试整理'}).click();await expect(card.getByRole('region',{name:'近期饮食'})).toBeVisible()
 const trigger=card.getByRole('button',{name:'体温曲线',exact:true});await trigger.click();const chart=page.getByRole('dialog',{name:'体温曲线',exact:true});await expect(chart).toBeVisible();failed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(chart).toHaveCount(0);await expect(trigger).toHaveCount(0);await expect(card.getByRole('region',{name:'症状表现'})).toContainText('正常。')
})
test('同时间同数值的不同测量均可触摸选择，键盘亦可选择指定记录',async({page})=>{
 const at='2026-10-12T06:00:00Z',points=[{sourceId:'record:overlap-a',at,value:36.8},{sourceId:'record:overlap-b',at,value:36.8},{sourceId:'record:later',at:'2026-10-12T12:00:00Z',value:36.6}]
 await page.route('**/visit-sheet/temperature',r=>r.fulfill({json:{points}}));await page.goto('/visit-summary');await page.getByRole('button',{name:'体温曲线',exact:true}).click()
 const chart=page.getByRole('dialog',{name:'体温曲线',exact:true}),same=chart.getByRole('button',{name:/36.8 °C/})
 await same.last().click();await expect(same.first()).toHaveAttribute('aria-pressed','true')
 await same.last().click();await expect(same.last()).toHaveAttribute('aria-pressed','true')
 await same.first().focus();await page.keyboard.press('Enter');await expect(same.first()).toHaveAttribute('aria-pressed','true')
 await expect(chart.getByRole('status')).toContainText('10/12 14:00');await page.keyboard.press('Escape')
})
