import {test as base,expect} from '@playwright/test'
import {spawn} from 'node:child_process'
const test=base.extend<{}, {browser:import('@playwright/test').Browser}>({browser:[async({playwright},use)=>{
 if(!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE){const browser=await playwright.chromium.launch();try{await use(browser)}finally{await browser.close()}return}
 const child=spawn(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']})
 try{const endpoint=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local test browser did not start')),15000);child.stderr.on('data',bytes=>{const match=String(bytes).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1])}});child.on('error',reject)});const browser=await playwright.chromium.connectOverCDP(endpoint);try{await use(browser)}finally{await browser.close()}}finally{child.kill()}
},{scope:'worker'}]})
import {TokenService} from '../../server/auth/token-service.mjs'
import {mkdir,readFile} from 'node:fs/promises'
import path from 'node:path'
async function open(page:any,model='girl'){
 if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE)await page.route('**/assets/**',async(route:any)=>{const name=path.basename(new URL(route.request().url()).pathname);try{const body=await readFile(path.join(process.cwd(),'dist/assets',name));await route.fulfill({body,contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.webp')?'image/webp':'application/octet-stream'})}catch{await route.continue()}})
 const token=new TokenService('body-locator-local-test-only',3600000).create({id:'body-locator-test-account'})
 await page.addInitScript(({token,model}:any)=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'body-locator-test-account'},currentMemberId:`body-${model}-iphone-se`,members:[],profile:null},version:5}))},{token,model})
 await page.goto('/nurse-station');await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByRole('button',{name:'记录症状',exact:true}).click()
 await page.getByRole('button',{name:'选择部位',exact:true}).click()
 return page.getByRole('dialog',{name:'身体部位定位器',exact:true})
}
for(const width of [320,375,390,430])test(`direct image selection, inline controls and return at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:740});const p=await open(page)
 await expect(p.locator('.locator-callout,.locator-leader,.locator-more-trigger,.locator-context,.locator-secondary')).toHaveCount(0)
 await expect(p.locator('.locator-image-controls').getByRole('button',{name:'正面',exact:true})).toBeVisible()
 const stage=await p.locator('.locator-stage').boundingBox(),controls=await p.locator('.locator-image-controls').boundingBox();expect(Math.abs(controls!.x+controls!.width/2-stage!.x-stage!.width/2)).toBeLessThan(1);expect(controls!.y).toBeGreaterThanOrEqual(stage!.y);expect(controls!.width).toBeGreaterThanOrEqual(160)
 expect(await p.locator('.locator-zone').first().evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth))).toBeLessThan(.01)

 await p.locator('[data-region-id="hand_left"]').click()
 const little=p.locator('[data-location-id="hand_left_little_whole"]');await expect(little).toBeVisible();await little.click()
 await expect(little).toHaveAttribute('data-selected','true');expect(await little.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');await expect(p.locator('.locator-selected-line')).toContainText('左小指')
 await p.getByRole('button',{name:'手背',exact:true}).click();await expect(p.locator('[data-location-id="hand_left_little_whole"]')).toHaveAttribute('data-selected','true')
 await page.keyboard.press('Escape');await expect(p.locator('[data-region-id="head"]')).toBeVisible()
 await p.locator('[data-region-id="head"]').click();await p.locator('[data-location-id="face_forehead"]').click()
 await expect(p.getByRole('button',{name:'已选 2 处',exact:true})).toBeVisible()

 await mkdir('outputs/graphical-locator',{recursive:true});await page.screenshot({path:`outputs/graphical-locator/head-${width}.png`})
 await p.getByRole('button',{name:'完成',exact:true}).click();await expect(p).toHaveCount(0)
 const form=page.getByRole('dialog',{name:'记录症状',exact:true});await expect(form.locator('.symptom-location-tags')).toContainText('左小指');await expect(form.locator('.symptom-location-tags')).toContainText('额头')
 await form.getByRole('button',{name:'修改',exact:true}).click();await expect(p.getByRole('button',{name:'已选 2 处',exact:true})).toBeVisible()
 await p.getByRole('button',{name:'返回全身',exact:true}).count().then(async n=>{if(n)await p.getByRole('button',{name:'返回全身',exact:true}).click()})
 await page.screenshot({path:`outputs/graphical-locator/full-${width}.png`})
})
test('cancel discards only uncommitted location edits',async({page})=>{
 const p=await open(page);await p.locator('[data-region-id="hand_right"]').click();await p.locator('[data-location-id="graphic_hand_right_palm"]').click()
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');const discard=page.getByRole('alertdialog',{name:'放弃本次部位修改？'});await expect(discard).toBeVisible();await discard.getByRole('button',{name:'放弃修改',exact:true}).click()
 await expect(page.locator('.symptom-location-tags')).toHaveCount(0)
})

test('image failure retries in place without losing selected locations',async({page})=>{
 const p=await open(page);await p.locator('[data-region-id="head"]').click();await p.locator('[data-location-id="face_forehead"]').click();await page.keyboard.press('Escape')
 await page.route('**/body-locator/v1/hand-left.*.webp',r=>r.abort());await p.locator('[data-region-id="hand_left"]').click();await expect(p.getByText('图片暂时无法加载')).toBeVisible();await expect(p.getByRole('button',{name:'已选 1 处',exact:true})).toBeVisible()
 await page.unroute('**/body-locator/v1/hand-left.*.webp');await p.getByRole('button',{name:'重试图片',exact:true}).click();await expect(p.locator('[data-location-id="graphic_hand_left_palm"]')).toBeVisible();await expect(p.getByRole('button',{name:'已选 1 处',exact:true})).toBeVisible()
})
for(const model of ['boy','unknown'])test(`${model} body, limb and foot use direct zones`,async({page})=>{
 const p=await open(page,model);await p.getByRole('button',{name:'背面',exact:true}).click();await expect(p.locator(`[data-asset="${model==='unknown'?'neutral-back.png':'assets/boy-back.png'}"]`)).toBeVisible()
 await p.getByRole('button',{name:'正面',exact:true}).click();await p.locator('[data-region-id="knee_left"]').click();await p.locator('[data-location-id="knee_left_whole"]').click();await expect(p.locator('.locator-selected-line')).toContainText('左膝')
 await page.screenshot({path:`outputs/graphical-locator/leg-${model}.png`});await page.keyboard.press('Escape');await p.locator('[data-region-id="foot_left"]').click();await p.locator('[data-location-id="graphic_foot_left_toe_1"]').click();await p.getByRole('button',{name:'足底',exact:true}).click();await expect(p.locator('[data-location-id="graphic_foot_left_toe_1"]')).toHaveAttribute('data-selected','true');await page.screenshot({path:`outputs/graphical-locator/foot-${model}.png`})
})
test('whole palm survives failed save, persisted readback, reopen and clear',async({page})=>{
 const p=await open(page);await p.locator('[data-region-id="hand_left"]').click();await p.locator('[data-location-id="graphic_hand_left_palm"]').click();await page.screenshot({path:'outputs/graphical-locator/hand-selected.png'});await p.getByRole('button',{name:'完成',exact:true}).click()
 const form=page.getByRole('dialog',{name:'记录症状',exact:true});await form.getByLabel('哪里不舒服',{exact:true}).fill('合成验收：左手掌发痒')
 await page.route('**/api/quick-records',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":{"message":"合成保存失败"}}'}),{times:1});await form.getByRole('button',{name:'保存记录',exact:true}).click();await expect(form.getByText('合成保存失败',{exact:true})).toBeVisible();await expect(form.locator('.symptom-location-tags')).toContainText('左手掌')
 const saving=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/quick-records');await form.getByRole('button',{name:'保存记录',exact:true}).click();const response=await saving;expect(response.status()).toBe(201);const saved=await response.json()
 const token=new TokenService('body-locator-local-test-only',3600000).create({id:'body-locator-test-account'});const url=`/api/events/${saved.eventId}/records?view=time`;const read=await page.request.get(url,{headers:{Authorization:`Bearer ${token}`}});const record=(await read.json()).find((r:any)=>r.id===saved.recordId)
 expect(record.journal.symptom.locations[0]).toMatchObject({id:'graphic_hand_left_palm',label:'左手掌',surface:'palmar',coverage:'whole',bodySide:'left',dictionaryVersion:'2.1.0'})
 await page.goto(`/health-events?eventId=${saved.eventId}&recordId=${saved.recordId}`);const detail=page.getByRole('dialog',{name:'症状记录详情',exact:true});await expect(detail).toContainText('左手掌');await detail.getByRole('button',{name:'编辑症状记录',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'编辑症状记录',exact:true});await editor.locator('.child-body-open').click();await p.getByRole('button',{name:'已选 1 处',exact:true}).click();await page.getByRole('dialog',{name:'已选 1 处',exact:true}).getByRole('button',{name:'清空全部',exact:true}).click();await page.getByRole('alertdialog',{name:'清空全部部位？'}).getByRole('button',{name:'确认清空',exact:true}).click();await page.keyboard.press('Escape');await p.getByRole('button',{name:'完成',exact:true}).click();await expect(editor.locator('.symptom-location-tags')).toHaveCount(0)
 await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0);const updated=await page.request.get(url,{headers:{Authorization:`Bearer ${token}`}});expect((await updated.json()).find((r:any)=>r.id===saved.recordId).journal.symptom.locations).toEqual([])
})



test('historical unknown locations retain their full original snapshot',async({page})=>{
 const p=await open(page,'boy');await page.keyboard.press('Escape')
 const token=new TokenService('body-locator-local-test-only',3600000).create({id:'body-locator-test-account'}),legacy={id:'unknown-legacy-point',label:'旧图原部位',locationNumber:1,locationLayer:'surface',bodyRegion:'old-region',bodySide:'left',bodyView:'front',localRegion:'旧图原坐标描述',markedArea:'旧图 x=12 y=34'}
 const response=await page.request.post('/api/quick-records',{headers:{Authorization:`Bearer ${token}`},data:{memberId:'body-boy-iphone-se',content:'合成旧部位验收',occurredAt:new Date(Date.now()-5000).toISOString(),inputChannel:'text',idempotencyKey:crypto.randomUUID(),title:'合成旧部位',journal:{categories:['symptom'],symptom:{narrative:'合成旧部位验收',symptomCategory:'skin',keywords:[],locations:[legacy],locationText:'衣领接触处',descriptors:[],linkedRecordIds:{}}}}});expect(response.status()).toBe(201);const saved=await response.json()
 await page.goto(`/health-events?eventId=${saved.eventId}&recordId=${saved.recordId}`);const detail=page.getByRole('dialog',{name:'症状记录详情',exact:true});await expect(detail).toContainText('衣领接触处');await detail.getByRole('button',{name:'编辑症状记录',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'编辑症状记录',exact:true});await editor.locator('.child-body-open').click();await p.getByRole('button',{name:'已选 1 处',exact:true}).click();await expect(page.getByRole('dialog',{name:'已选 1 处',exact:true})).toContainText('旧图原部位');await page.keyboard.press('Escape');await p.getByRole('button',{name:'完成',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0)
 const records=await page.request.get(`/api/events/${saved.eventId}/records?view=time`,{headers:{Authorization:`Bearer ${token}`}});expect((await records.json()).find((r:any)=>r.id===saved.recordId).journal.symptom.locations[0]).toEqual(legacy)
})
