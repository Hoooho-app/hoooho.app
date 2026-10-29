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
// Anatomical landmarks are fixed from the reviewed raster, not from hit-path bounds.
async function tapSource(page:any,p:any,x:number,y:number){
 await expect(p.locator('.locator-canvas > svg')).toBeVisible()
 const point=await p.locator('.locator-stage').evaluate((el:any,{x,y}:any)=>{const [bx,by,bw,bh]=el.dataset.sourceBounds.split(',').map(Number),svg=el.querySelector('.locator-canvas > svg'),point=svg.createSVGPoint();point.x=(x-bx)/bw;point.y=(y-by)/bh;const result=point.matrixTransform(svg.getScreenCTM());return {x:result.x,y:result.y}},{x,y})
 await page.touchscreen.tap(point.x,point.y)
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
 const p=await open(page,model);await p.getByRole('button',{name:'背面',exact:true}).click();await expect(p.locator('.locator-stage')).toHaveAttribute('data-asset',model==='unknown'?'neutral-back.png':/\/v3\/boy-back\./)
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

for(const model of ['girl','boy'])test(`${model} neck, eyebrow and right ear match visible source landmarks`,async({page})=>{
 await page.setViewportSize({width:375,height:740});const p=await open(page,model)
 await tapSource(page,p,.50,model==='girl'?.328:.349);await expect(p.locator('[data-detail-kind="neck"]')).toBeVisible()
 await tapSource(page,p,.26,.155);await expect(p.locator('[data-location-id="neck_anterior_lower"]')).toHaveAttribute('data-selected','true')
 await page.keyboard.press('Escape');await p.locator('[data-region-id="head"]').click()
 await tapSource(page,p,.63,model==='girl'?.365:.43);await expect(p.locator('[data-location-id="face_eyebrow_left"]')).toHaveAttribute('data-selected','true')
 await tapSource(page,p,model==='girl'?.224:.20,model==='girl'?.535:.595);await expect(p.locator('[data-location-id="ear_right_whole"]')).toHaveAttribute('data-selected','true')
 await page.screenshot({path:`outputs/graphical-locator/refined-face-${model}.png`})
})
for(const side of ['left','right'])for(const view of ['front','back'])test(`${side} ${view} elbow crease or tip and wrist use anatomical image coordinates`,async({page})=>{
 const p=await open(page);if(view==='back')await p.getByRole('button',{name:'背面',exact:true}).click()
 await p.locator(`[data-region-id="elbow_${side}"]`).click();await expect(p.locator('[data-detail-kind="arm"]')).toBeVisible()
 const offset=side==='left'?.5:0,elbow=offset+.5*(view==='front'?(side==='left'?.42:.585):side==='left'?.39:.61),wrist=offset+.5*(view==='front'?(side==='left'?.28:.73):side==='left'?.30:.696)
 await tapSource(page,p,elbow,.435);await expect(p.locator(`[data-location-id="elbow_${side}_${view==='front'?'crease':'tip'}"]`)).toHaveAttribute('data-selected','true')
 await tapSource(page,p,wrist,.71);await expect(p.locator(`[data-location-id="wrist_${side}_${view==='front'?'crease':'dorsal'}"]`)).toHaveAttribute('data-selected','true')
 await page.screenshot({path:`outputs/graphical-locator/refined-arm-${side}-${view}.png`})
})
test('chest subdivision and groin folds save, reopen and remove with the trailing cross',async({page})=>{
 await page.setViewportSize({width:375,height:740});const p=await open(page)
 await p.locator('[data-region-id="chest"]').click();await tapSource(page,p,.33,.33);await expect(p.locator('[data-location-id="chest_upper_left"]')).toHaveAttribute('data-selected','true');await page.screenshot({path:'outputs/graphical-locator/refined-chest.png'})
 await page.keyboard.press('Escape');await p.locator('[data-region-id="groin_left"]').click();await expect(p.locator('[data-detail-kind="groin"]')).toBeVisible();await tapSource(page,p,.69,.43);await expect(p.locator('[data-location-id="groin_left_fold"]')).toHaveAttribute('data-selected','true');await page.screenshot({path:'outputs/graphical-locator/refined-groin.png'})
 await p.getByRole('button',{name:'完成',exact:true}).click();const form=page.getByRole('dialog',{name:'记录症状',exact:true})
 await expect(form.locator('.body-location-tag')).toHaveCount(2);await expect(form.locator('.body-location-tag svg')).toHaveCount(2)
 const gap=await form.locator('.symptom-location-tags').evaluate(el=>{const before=el.previousElementSibling!.getBoundingClientRect(),after=el.getBoundingClientRect();return after.top-before.bottom});expect(gap).toBeGreaterThanOrEqual(7)
 await form.getByLabel('哪里不舒服',{exact:true}).fill('合成验收：左上胸与左腹股沟褶皱发红');await page.screenshot({path:'outputs/graphical-locator/refined-tags.png'})
 const saving=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/quick-records');await form.getByRole('button',{name:'保存记录',exact:true}).click();const response=await saving;expect(response.status()).toBe(201);const saved=await response.json()
 const token=new TokenService('body-locator-local-test-only',3600000).create({id:'body-locator-test-account'}),url=`/api/events/${saved.eventId}/records?view=time`
 let read=await page.request.get(url,{headers:{Authorization:`Bearer ${token}`}});let locations=(await read.json()).find((r:any)=>r.id===saved.recordId).journal.symptom.locations
 expect(locations.map((v:any)=>v.id)).toEqual(['chest_upper_left','groin_left_fold']);expect(locations[0]).toMatchObject({regionId:'chest',categoryId:'chest',precision:'region'});expect(locations.every((v:any)=>v.bodySide==='left'&&v.surface==='anterior')).toBe(true)
 await page.goto(`/health-events?eventId=${saved.eventId}&recordId=${saved.recordId}`);await page.getByRole('dialog',{name:'症状记录详情',exact:true}).getByRole('button',{name:'编辑症状记录',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'编辑症状记录',exact:true});await editor.getByRole('button',{name:'移除左上胸',exact:true}).click();await expect(editor.locator('.body-location-tag')).toHaveCount(1)
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});await page.route(`**/api/records/${saved.recordId}`,async r=>{if(r.request().method()==='PATCH')await gate;await r.continue()})
 try{await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor.getByRole('button',{name:'移除左腹股沟褶皱',exact:true})).toBeDisabled()}finally{release()}
 await expect(editor).toHaveCount(0);read=await page.request.get(url,{headers:{Authorization:`Bearer ${token}`}});locations=(await read.json()).find((r:any)=>r.id===saved.recordId).journal.symptom.locations
 expect(locations.map((v:any)=>v.id)).toEqual(['groin_left_fold']);expect(locations[0].locationNumber).toBe(1)
})
test('removing the last structured tag clears its matching text and blocks late preview restoration',async({page})=>{
 const p=await open(page);await p.locator('[data-region-id="hand_left"]').click();await p.locator('[data-location-id="graphic_hand_left_palm"]').click();await p.getByRole('button',{name:'完成',exact:true}).click()
 const form=page.getByRole('dialog',{name:'记录症状',exact:true});await form.getByLabel('手动补充症状部位').fill('左手掌');await expect(form.locator('.body-location-tag')).toHaveCount(1)
 await form.getByRole('button',{name:'移除左手掌',exact:true}).click();await expect(form.getByLabel('手动补充症状部位')).toHaveValue('');await expect(form.locator('.body-location-tag')).toHaveCount(0)
 await page.route('**/api/members/*/symptom-preview',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'success',summary:'左手掌发痒',keywords:['瘙痒'],bodyLocation:'左手掌',provider:'synthetic-test'})}))
 const preview=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/symptom-preview'));await form.getByLabel('哪里不舒服',{exact:true}).fill('左手掌发痒');await preview;await expect(form.getByText('已整理，可继续修改',{exact:true})).toBeVisible();await expect(form.getByLabel('手动补充症状部位')).toHaveValue('');await expect(form.locator('.body-location-tag')).toHaveCount(0)
 await form.getByLabel('手动补充症状部位').fill('衣袖接触处');await form.getByRole('button',{name:'移除衣袖接触处',exact:true}).click();await expect(form.getByLabel('手动补充症状部位')).toHaveValue('')
})
