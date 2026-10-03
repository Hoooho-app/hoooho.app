import { test,expect,type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { readFile } from 'node:fs/promises'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
async function initialize(page:Page,member='empty-child') {
  await page.addInitScript(({token,member})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:member,members:[],profile:null},version:5}))},{token,member})
}
async function capture(request:any,text:string,eventId?:string,identity='parent',files:any[]=[]){const response=await request.post('/api/members/empty-child/case-records',{headers,data:{text,files,eventId,identity,requestId:crypto.randomUUID(),occurredAt:new Date().toISOString(),timeUnknown:false}});expect(response.status()).toBe(200);return response.json()}

test('首页输入框式速记入口是单一按钮，鼠标键盘进入原记录流程',async({page})=>{
  await initialize(page);await page.goto('/nurse-station')
  const button=page.getByRole('button',{name:'健康事件随时记，情况速记',exact:true})
  await expect(button).toBeVisible();await expect(button.locator('button,a,input,textarea')).toHaveCount(0)
  expect(await button.evaluate(el=>el.closest('a')===null)).toBe(true)
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await button.click();await expect(page).toHaveURL(/\/smart-record$/);await expect(page.getByRole('textbox',{name:'哪里不舒服'})).toBeVisible()
  await expect(page.getByRole('textbox',{name:'哪里不舒服'})).toHaveValue('')
  await page.goBack();const title=(await page.locator('.continuity-record-entry strong').boundingBox())!;await page.mouse.click(title.x+title.width/2,title.y+title.height/2);await expect(page).toHaveURL(/\/smart-record$/)
  await page.goBack();await button.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/smart-record$/)
})

test('资料原件加载前禁用来源编辑，迟到响应不能覆盖人工选择',async({page,request})=>{
 const saved=await capture(request,'合成来源加载时序验收',undefined,'pending')
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route(url=>url.pathname===`/api/events/${saved.eventId}/records`,async route=>{await gate;await route.continue().catch(()=>{})})
 try {
  await initialize(page);await page.goto(`/cases/${saved.eventId}/materials?recordId=${saved.recordId}`)
  const source=page.getByRole('combobox',{name:'资料来源'})
  await expect(source).toBeVisible();await expect(source).toBeDisabled();release()
  await expect(source).toBeEnabled();await source.selectOption('external_ai')
  await page.getByRole('checkbox',{name:'已核对来源和原件，未知信息没有补猜'}).check()
  await expect(source).toHaveValue('external_ai');await expect(page.getByRole('button',{name:'确认接回这次情况',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'确认接回这次情况',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/health-events/${saved.eventId}$`))
  const records=await(await request.get(`/api/events/${saved.eventId}/records`,{headers})).json();expect(records.find((r:any)=>r.id===saved.recordId).caseContext.identity).toBe('external_ai')
 } finally {release();await request.delete(`/api/records/${saved.recordId}`,{headers});await request.delete(`/api/events/${saved.eventId}`,{headers})}
})
test('首页不预览0/1/3/4件，原跟进列表保留全部记录、归档及成员隔离',async({page,request})=>{
  await initialize(page);await page.goto('/nurse-station');await expect(page.getByRole('link',{name:'跟进列表',exact:true})).toBeVisible();await expect(page.locator('.continuity-home h2')).toHaveCount(0);await expect(page.getByText('还没有正在跟进的情况',{exact:true})).toHaveCount(0);await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  const ids=[];for(let n=1;n<=4;n++){ids.push((await capture(request,`合成示例，非真实患者资料：第${n}次皮肤变化`)).eventId);await page.reload();await expect(page.locator('.continuity-home .continuity-card')).toHaveCount(0);await page.getByRole('link',{name:'跟进列表',exact:true}).click();await expect(page.locator('.continuity-card')).toHaveCount(n);await page.goBack()}
  await expect(page.getByRole('link',{name:'跟进列表',exact:true})).toBeVisible();await expect(page.locator('.continuity-home')).not.toContainText('4件');await expect(page.locator('.nurse-home-entry strong')).toHaveText(['就诊情况单','忌口出示卡','健康随记','健康档案','用药提醒'])
  for(const width of [320,375,390,430,1280]){await page.setViewportSize({width,height:width===320?568:667});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const sizes=await page.locator('.nurse-home-entry').evaluateAll(cards=>cards.map(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height})));expect(sizes).toHaveLength(5);expect(new Set(sizes.map(s=>s.h)).size).toBe(1);expect(Math.max(...sizes.map(s=>s.w))-Math.min(...sizes.map(s=>s.w))).toBeLessThan(1)}
  await page.setViewportSize({width:375,height:667});await page.screenshot({path:'outputs/continuity-v3/home-375.png',fullPage:true});await page.locator('.nurse-home-entry').last().scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/continuity-v3/home-five-entries-375.png'})
  await request.post(`/api/members/empty-child/cases/${ids[0]}/archive`,{headers,data:{archived:true}});await page.reload();await expect(page.locator('.continuity-home .continuity-card')).toHaveCount(0);await page.getByRole('link',{name:'跟进列表',exact:true}).click();await expect(page.locator('.continuity-card')).toHaveCount(3);await page.getByRole('button',{name:'已归档 1'}).click();await expect(page.getByRole('button',{name:'已归档 1'})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.continuity-card')).toHaveCount(1)
  const other=await request.get('/api/members/child-a/cases',{headers});expect(other.status()).toBe(200);expect((await other.json()).active.some((c:any)=>ids.includes(c.event.id))).toBe(false)
  await page.goto('/food-allergy-status-index');await expect(page.getByText('指数功能已停止。原有记录仍然保留。')).toBeVisible()
})
test('三类合成原件→待确认→人工来源核对；不强制观察；实际存储与原件可读',async({page,request})=>{
  await initialize(page);await page.setViewportSize({width:375,height:667})
  const sources=[['medical_consultation','医生消息（合成）','2026-10-01：记录皮肤变化、前后照片。诊断未明确。'],['examination_report','检查报告（合成）','第1页，共1页。2026-10-01：Hb 112 g/L。参考范围未提供。'],['external_ai','外部AI答复（合成）','可以整理出现时间、使用产品和前后照片。这不是医生判断。']]
  for(const [identity,title,content] of sources){
    await page.setContent(`<main style="font-family:sans-serif;padding:25px;background:#fff;color:#143d34"><p>合成示例，非真实患者资料</p><h1>${title}</h1><p>${content}</p></main>`);const png=await page.screenshot({path:`outputs/continuity-v3/source-${identity}.png`});const saved=await capture(request,`合成示例，非真实患者资料：${content}`,undefined,'pending',[{name:`${title}.png`,mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]);await page.goto(`/cases/${saved.eventId}/materials?recordId=${saved.recordId}`);await page.getByRole('combobox',{name:'资料来源'}).selectOption(identity);await page.getByRole('checkbox',{name:'已核对来源和原件，未知信息没有补猜'}).check();await page.screenshot({path:`outputs/continuity-v3/return-${identity}-375.png`});await page.getByRole('button',{name:'确认接回这次情况',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/health-events/${saved.eventId}$`));const records=await(await request.get(`/api/events/${saved.eventId}/records`,{headers})).json();const record=records.find((r:any)=>r.id===saved.recordId);expect(record.caseContext.identity).toBe(identity);expect(record.caseContext.confirmed).toBe(true);expect((await request.get(`/api/events/${saved.eventId}/attachments/${saved.attachmentIds[0]}/content`,{headers})).status()).toBe(200)
  }
})

test('既有智能整理草稿在资料核对入口仍可恢复；模型为测试替身',async({page,request})=>{
  await initialize(page);await page.setViewportSize({width:375,height:667})
  await page.setContent('<p>合成示例，非真实患者资料：包装或照片</p>');const original=await page.screenshot()
  const prepared=await request.post('/api/members/empty-child/ai-drafts',{headers,data:{text:'合成待核对原话',deferRecognition:true,sourceIdentity:'pending',files:[{name:'合成包装.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${original.toString('base64')}`}]}})
  expect(prepared.ok()).toBe(true);const initialDraft=await prepared.json()
  const recognized=await request.post('/api/members/empty-child/ai-drafts',{headers,data:{id:initialDraft.id,version:initialDraft.version,text:'合成待核对原话',task:'record',sourceIdentity:'pending'}})
  expect(recognized.ok()).toBe(true);const draft=await recognized.json();expect(draft.items).toHaveLength(1)
  const captured=await request.post('/api/members/empty-child/case-records',{headers,data:{text:'合成待核对原话',files:[],aiDraftId:draft.id,identity:'pending',requestId:crypto.randomUUID(),occurredAt:new Date().toISOString()}})
  expect(captured.ok()).toBe(true);const saved=await captured.json()
  await page.goto(`/cases/${saved.eventId}/materials?recordId=${saved.recordId}`);await page.getByRole('combobox',{name:'资料来源'}).selectOption('parent');await page.getByRole('button',{name:'智能整理原件',exact:true}).click();await expect(page.getByText('已恢复同一份识别草稿，核对后才保存')).toBeVisible();await expect(page.locator('.ai-business-item')).toHaveCount(1)
})

test('当前情况报告显式选择范围、保留时间、原件离线且无内部ID；移动与桌面真实运行',async({page,request},info)=>{
  await initialize(page);await page.setViewportSize({width:375,height:667})
  await page.setContent('<p>合成示例，非真实患者资料：范围原件</p>');const png=await page.screenshot()
  const a=await capture(request,'合成范围A：本次皮肤观察',undefined,'parent',[{name:'合成范围原件.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]),b=await capture(request,'合成范围B：此前睡眠变化')
  await page.goto(`/visit-summary/${a.eventId}`);await expect(page.locator('#chapter-overview h1')).toHaveText('合成范围A：本次皮肤观察')
  let state=await(await request.get('/api/members/empty-child/visit-sheet',{headers})).json();expect(state.report.selection.eventIds).toEqual([a.eventId]);expect(state.report.sources.some((s:any)=>s.eventId===b.eventId)).toBe(false)
  await page.getByRole('button',{name:'资料范围',exact:true}).click();const scope=page.getByRole('dialog',{name:'选择本次资料范围'});await scope.getByRole('checkbox',{name:'合成范围B：此前睡眠变化',exact:true}).check();const from=new Date(Date.now()-86400000).toISOString().slice(0,16);await scope.getByLabel('从（选填）').fill(from);await scope.getByRole('button',{name:'确认范围并更新情况单'}).click();await expect(scope).toHaveCount(0)
  state=await(await request.get('/api/members/empty-child/visit-sheet',{headers})).json();expect(state.report.selection.eventIds).toEqual([a.eventId,b.eventId]);expect(state.report.selection.includeBackground).toBe(false)
  await page.getByRole('button',{name:'资料范围',exact:true}).click();await expect(scope.getByLabel('从（选填）')).toHaveValue(from);await scope.getByRole('button',{name:'关闭选择本次资料范围',exact:true}).click()
  await page.screenshot({path:'outputs/continuity-v3/report-scoped-375.png'});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'outputs/continuity-v3/report-scoped-desktop.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  const updated=await request.put('/api/members/empty-child/visit-sheet',{headers,data:{expectedVersion:state.report.version,requestId:crypto.randomUUID(),selectedPhotoIds:state.report.photos.map((p:any)=>p.sourceId)}});expect(updated.ok()).toBe(true);await page.reload()
  await page.getByRole('button',{name:'导出情况单',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存完整离线报告（HTML）',exact:true}).click();const path=info.outputPath('scoped-offline.html');await(await download).saveAs(path);const html=await readFile(path,'utf8');expect(html).toContain(png.toString('base64'));expect(html).not.toContain(a.eventId);expect(html).not.toContain(b.eventId);expect(html).not.toContain('Bearer');expect(html).toContain('合成范围A');expect(html).toContain('合成范围B')
})

test('首页不请求情况预览，列表加载失败仍提示并支持重试',async({page,request})=>{
  await initialize(page);let listFailure=true,listRequests=0;await page.route('**/api/members/empty-child/cases?*',route=>{listRequests++;return listFailure?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成加载故障'}})}):route.continue()})
  await page.goto('/nurse-station');await expect(page.getByRole('link',{name:'跟进列表',exact:true})).toBeVisible();expect(listRequests).toBe(0);await page.getByRole('link',{name:'跟进列表',exact:true}).click();await expect(page.getByText('列表未加载',{exact:true})).toBeVisible();await expect(page.getByText('还没有正在跟进的情况')).toHaveCount(0);listFailure=false;await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.continuity-card').first()).toBeVisible()

})

test('旧智能收记草稿保留，不静默转换为新症状事实',async({page})=>{
  await initialize(page);await page.goto('/nurse-station')
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('hoooho-smart-record-drafts',1);open.onupgradeneeded=()=>open.result.createObjectStore('drafts');open.onerror=()=>reject(open.error)
    open.onsuccess=()=>{const db=open.result,transaction=db.transaction('drafts','readwrite'),store=transaction.objectStore('drafts');for(const member of ['empty-child','child-a'])store.put({text:`合成游客草稿 ${member}`,files:[],occurredAt:'2026-10-01T08:00',timeUnknown:true,requestId:`guest-local-${member}`},`guest:synthetic:${member}:new:`);transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>reject(transaction.error)}
  }))
  await page.goto('/smart-record');await expect(page.getByRole('textbox',{name:'哪里不舒服'})).toHaveValue('')
  const keys=await page.evaluate(()=>new Promise<IDBValidKey[]>((resolve,reject)=>{const open=indexedDB.open('hoooho-smart-record-drafts',1);open.onsuccess=()=>{const db=open.result,request=db.transaction('drafts','readonly').objectStore('drafts').getAllKeys();request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>reject(request.error)}}));expect(keys).not.toContain('visit-test:empty-child:new:');expect(keys).toContain('guest:synthetic:child-a:new:');expect(keys).toContain('guest:synthetic:empty-child:new:')
})
