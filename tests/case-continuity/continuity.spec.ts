import { test,expect,type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { readFile } from 'node:fs/promises'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
async function initialize(page:Page,member='empty-child') {
  await page.addInitScript(({token,member})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:member,members:[],profile:null},version:5}))},{token,member})
}
async function capture(request:any,text:string,eventId?:string,identity='parent',files:any[]=[]){const response=await request.post('/api/members/empty-child/case-records',{headers,data:{text,files,eventId,identity,requestId:crypto.randomUUID(),occurredAt:new Date().toISOString(),timeUnknown:false}});expect(response.status()).toBe(200);return response.json()}

test('首页速记按钮和文案入口独立可点击，鼠标键盘进入原记录流程',async({page})=>{
  await initialize(page);await page.goto('/nurse-station')
  const entry=page.locator('.continuity-record-entry'),button=entry.getByRole('button',{name:'速记',exact:true}),link=entry.getByRole('link',{name:'健康事件随时记 突发情况先记下来',exact:true})
  await expect(button).toBeVisible();await expect(link).toHaveAttribute('href','/smart-record')
  expect(await button.evaluate(el=>el.closest('a')===null)).toBe(true)
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await button.click();await expect(page).toHaveURL(/\/smart-record$/);await expect(page.getByRole('textbox',{name:'发生了什么（主诉）？'})).toBeVisible()
  await page.goBack();await link.click();await expect(page).toHaveURL(/\/smart-record$/)
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
test('首页0/1/3/4件、最多三条、五卡等尺寸、归档及成员隔离',async({page,request})=>{
  await initialize(page);await page.goto('/nurse-station');await expect(page.getByRole('link',{name:'0件 · 查看列表 ›',exact:true})).toBeVisible();await expect(page.locator('.continuity-home h2')).toHaveCount(0);await expect(page.getByText('还没有正在跟进的情况',{exact:true})).toHaveCount(0);await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  const ids=[];for(let n=1;n<=4;n++){ids.push((await capture(request,`合成示例，非真实患者资料：第${n}次皮肤变化`)).eventId);await page.reload();await expect(page.locator('.continuity-home .continuity-card')).toHaveCount(Math.min(n,3))}
  await expect(page.getByRole('link',{name:'查看全部 4 件 ›'})).toBeVisible()
  for(const width of [320,375,390,430,1280]){await page.setViewportSize({width,height:width===320?568:667});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const sizes=await page.locator('.nurse-home-entry').evaluateAll(cards=>cards.map(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height})));expect(sizes).toHaveLength(5);expect(new Set(sizes.map(s=>s.h)).size).toBe(1);expect(Math.max(...sizes.map(s=>s.w))-Math.min(...sizes.map(s=>s.w))).toBeLessThan(1)}
  await page.setViewportSize({width:375,height:667});await page.screenshot({path:'outputs/continuity-v3/home-375.png',fullPage:true});await page.locator('.nurse-home-entry').last().scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/continuity-v3/home-five-entries-375.png'})
  await request.post(`/api/members/empty-child/cases/${ids[0]}/archive`,{headers,data:{archived:true}});await page.reload();await expect(page.getByRole('link',{name:'查看已归档 1 件 ›'})).toBeVisible();await page.getByRole('link',{name:'查看已归档 1 件 ›'}).click();await expect(page.getByRole('button',{name:'已归档 1'})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.continuity-card')).toHaveCount(1)
  expect((await request.get('/api/members/child-a/cases',{headers})).status()).toBe(200)
  await page.goto('/food-allergy-status-index');await expect(page.getByText('指数功能已停止。原有记录仍然保留。')).toBeVisible()
})
test('智能记录原话、刷新草稿、归属弹层、保存幂等及观察反馈',async({page,request})=>{
  await initialize(page);await page.setViewportSize({width:375,height:667});await page.goto('/smart-record');const narrative=page.getByRole('textbox',{name:'发生了什么（主诉）？'});await expect(page.getByRole('button',{name:'先保存',exact:true})).toBeDisabled();await narrative.fill('合成示例，非真实患者资料：今天皮肤没有变化');await expect(page.locator('.case-input-tools button')).toHaveCount(2);await page.reload();await expect(narrative).toHaveValue(/今天皮肤没有变化/);await page.screenshot({path:'outputs/continuity-v3/smart-keyboard-375.png'});await page.getByRole('button',{name:'先保存',exact:true}).click();await expect(page.getByRole('dialog',{name:'这条记录放在哪里'})).toBeVisible();await page.getByRole('button',{name:'确认保存',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/);const eventId=page.url().split('/').at(-1)!
  await page.getByRole('link',{name:'安排观察',exact:true}).click();await page.getByRole('textbox',{name:'观察什么',exact:true}).fill('合成皮肤观察');await page.screenshot({path:'outputs/continuity-v3/observation-plan-375.png'});await page.getByRole('button',{name:'确认安排',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/health-events/${eventId}$`));await page.getByRole('link',{name:'记录今天的变化',exact:true}).click();await narrative.fill('合成示例：今天未观察');await page.getByRole('button',{name:'未观察',exact:true}).click();await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click();await page.goto('/nurse-station');await expect(page.getByText('今日已记录 1/1（1次未观察）')).toBeVisible();await page.screenshot({path:'outputs/continuity-v3/observation-home-375.png',fullPage:true})
  const cases=await(await request.get('/api/members/empty-child/cases',{headers})).json();expect(cases.active.find((c:any)=>c.event.id===eventId).observations[0].todayNotObserved).toBe(1)
})
test('触控按住部分转写、松手、上滑取消段和迟到回调；模拟ASR不冒充真实服务',async({page})=>{
  await initialize(page);await page.setViewportSize({width:375,height:667});await page.addInitScript(()=>{
    class SyntheticRecognition {lang='';continuous=true;interimResults=true;onresult:any=null;onerror:any=null;onend:any=null;start(){(window as any).__speech=this}stop(){this.onend?.()}abort(){} }
    ;(window as any).SpeechRecognition=SyntheticRecognition
  });await page.goto('/smart-record');await page.getByRole('textbox',{name:'发生了什么（主诉）？'}).fill('此前原话');const hold=page.getByRole('button',{name:'按住说话',exact:true}),box=await hold.boundingBox();expect(box).not.toBeNull();await page.mouse.move(box!.x+70,box!.y+25);await page.mouse.down();await expect(page.locator('.case-voice-status')).toContainText('正在');await expect.poll(()=>page.evaluate(()=>!!(window as any).__speech)).toBe(true);await page.evaluate(()=>{const recognition=(window as any).__speech;recognition.onresult({resultIndex:0,results:[{0:{transcript:'本段暂定'},isFinal:false}]})});await expect(page.getByRole('textbox',{name:'发生了什么（主诉）？'})).toHaveValue('此前原话\n本段暂定');await page.screenshot({path:'outputs/continuity-v3/partial-synthetic-375.png'});await page.mouse.move(box!.x+70,box!.y-80);await page.mouse.up();await expect(page.getByRole('textbox',{name:'发生了什么（主诉）？'})).toHaveValue('此前原话');await page.evaluate(()=>{(window as any).__speech.onresult?.({resultIndex:0,results:[{0:{transcript:'迟到结果'},isFinal:true}]})});await expect(page.getByRole('textbox',{name:'发生了什么（主诉）？'})).toHaveValue('此前原话');
  await page.mouse.move(box!.x+70,box!.y+25);await page.mouse.down();await expect.poll(()=>page.evaluate(()=>!!(window as any).__speech.onresult)).toBe(true);await page.evaluate(()=>{(window as any).__speech.onresult({resultIndex:0,results:[{0:{transcript:'保留本段'},isFinal:true}]})});await page.mouse.up();await expect(page.getByRole('textbox',{name:'发生了什么（主诉）？'})).toHaveValue('此前原话\n保留本段');await expect(page.locator('input[capture="environment"]')).toHaveCount(1)
})
test('三类合成原件→待确认→人工来源核对；不强制观察；实际存储与原件可读',async({page,request})=>{
  await initialize(page);await page.setViewportSize({width:375,height:667})
  const sources=[['medical_consultation','医生消息（合成）','2026-10-01：记录皮肤变化、前后照片。诊断未明确。'],['examination_report','检查报告（合成）','第1页，共1页。2026-10-01：Hb 112 g/L。参考范围未提供。'],['external_ai','外部AI答复（合成）','可以整理出现时间、使用产品和前后照片。这不是医生判断。']]
  for(const [identity,title,content] of sources){
    await page.setContent(`<main style="font-family:sans-serif;padding:25px;background:#fff;color:#143d34"><p>合成示例，非真实患者资料</p><h1>${title}</h1><p>${content}</p></main>`);const png=await page.screenshot({path:`outputs/continuity-v3/source-${identity}.png`});const saved=await capture(request,`合成示例，非真实患者资料：${content}`,undefined,'pending',[{name:`${title}.png`,mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]);await page.goto(`/cases/${saved.eventId}/materials?recordId=${saved.recordId}`);await page.getByRole('combobox',{name:'资料来源'}).selectOption(identity);await page.getByRole('checkbox',{name:'已核对来源和原件，未知信息没有补猜'}).check();await page.screenshot({path:`outputs/continuity-v3/return-${identity}-375.png`});await page.getByRole('button',{name:'确认接回这次情况',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/health-events/${saved.eventId}$`));const records=await(await request.get(`/api/events/${saved.eventId}/records`,{headers})).json();const record=records.find((r:any)=>r.id===saved.recordId);expect(record.caseContext.identity).toBe(identity);expect(record.caseContext.confirmed).toBe(true);expect((await request.get(`/api/events/${saved.eventId}/attachments/${saved.attachmentIds[0]}/content`,{headers})).status()).toBe(200)
  }
})

test('相机选件自动进入既有识别草稿，正式保存原话后可恢复同一草稿；模型为测试替身',async({page,request})=>{
  await initialize(page);await page.setViewportSize({width:375,height:667})
  await page.setContent('<p>合成示例，非真实患者资料：包装或照片</p>');const original=await page.screenshot()
  await page.goto('/smart-record');await page.getByRole('textbox',{name:'发生了什么（主诉）？'}).fill('合成示例，非真实患者资料：包装待核对')
  await page.locator('input[capture="environment"]').setInputFiles({name:'合成包装.png',mimeType:'image/png',buffer:original})
  await expect(page.getByText(/类型草稿待确认；/)).toBeVisible();await page.screenshot({path:'outputs/continuity-v3/photo-draft-375.png'})
  await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  const eventId=page.url().split('/').at(-1)!,records=await(await request.get(`/api/events/${eventId}/records`,{headers})).json(),record=records.find((r:any)=>r.caseContext?.aiDraftId)
  expect(record).toBeTruthy();expect(record.content).toBe('合成示例，非真实患者资料：包装待核对');expect(record.caseContext.identity).toBe('pending')
  await page.goto(`/cases/${eventId}/materials?recordId=${record.id}`);await page.getByRole('combobox',{name:'资料来源'}).selectOption('parent');await page.getByRole('button',{name:'智能整理原件',exact:true}).click();await expect(page.getByText('已恢复同一份识别草稿，核对后才保存')).toBeVisible();await expect(page.locator('.ai-business-item')).toHaveCount(1)
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

test('加载失败不假显示零，取消不写记录，保存失败可重试且不清空原话',async({page,request})=>{
  await initialize(page);let listFailure=true;await page.route('**/api/members/empty-child/cases?*',route=>listFailure?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成加载故障'}})}):route.continue())
  await page.goto('/nurse-station');await expect(page.locator('.continuity-home [role="alert"]')).toContainText('情况暂未加载');await expect(page.getByText('还没有正在跟进的情况')).toHaveCount(0);listFailure=false;await page.locator('.continuity-home').getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.continuity-card').first()).toBeVisible()
  const before=await(await request.get('/api/members/empty-child/cases',{headers})).json();await page.goto('/smart-record');const text=page.getByRole('textbox',{name:'发生了什么（主诉）？'});await text.fill('合成保存失败验收');await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('dialog',{name:'这条记录放在哪里'}).getByRole('button',{name:'关闭这条记录放在哪里',exact:true}).click();expect((await(await request.get('/api/members/empty-child/cases',{headers})).json()).active.length).toBe(before.active.length)
  let fail=true;await page.route('**/api/members/empty-child/case-records',route=>fail?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成保存故障'}})}):route.continue());await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click();await expect(page.getByRole('dialog',{name:'这条记录放在哪里'}).getByRole('alert')).toContainText('合成保存故障');await expect(text).toHaveValue('合成保存失败验收');fail=false;await page.getByRole('button',{name:'确认保存',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
})

test('正式账号仅恢复已拥有成员的同上下文游客设备草稿，不导入另一成员',async({page})=>{
  await initialize(page);await page.goto('/nurse-station')
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('hoooho-smart-record-drafts',1);open.onupgradeneeded=()=>open.result.createObjectStore('drafts');open.onerror=()=>reject(open.error)
    open.onsuccess=()=>{const db=open.result,transaction=db.transaction('drafts','readwrite'),store=transaction.objectStore('drafts');for(const member of ['empty-child','child-a'])store.put({text:`合成游客草稿 ${member}`,files:[],occurredAt:'2026-10-01T08:00',timeUnknown:true,requestId:`guest-local-${member}`},`guest:synthetic:${member}:new:`);transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>reject(transaction.error)}
  }))
  await page.goto('/smart-record');await expect(page.getByRole('textbox',{name:'发生了什么（主诉）？'})).toHaveValue('合成游客草稿 empty-child')
  const keys=await page.evaluate(()=>new Promise<IDBValidKey[]>((resolve,reject)=>{const open=indexedDB.open('hoooho-smart-record-drafts',1);open.onsuccess=()=>{const db=open.result,request=db.transaction('drafts','readonly').objectStore('drafts').getAllKeys();request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>reject(request.error)}}));expect(keys).toContain('visit-test:empty-child:new:');expect(keys).toContain('guest:synthetic:child-a:new:');expect(keys).not.toContain('guest:synthetic:empty-child:new:')
})
