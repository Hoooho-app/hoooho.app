import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {randomUUID} from 'node:crypto'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}

test('口语日期/皮肤/肉类/户外检索与手机单行结果，展开原始记录并保留位置',async({page,request},info)=>{
 const member=await request.post('/api/members',{headers,data:{name:'检索验收（虚构）',relationship:'child'}})
 expect(member.ok()).toBeTruthy();const memberId=(await member.json()).id
 const at=(days:number)=>new Date(Date.now()-days*86400000).toISOString()
 const create=async(content:string,days:number,category:string)=>{
  const response=await request.post('/api/quick-records',{headers,data:{memberId,content,title:content,rawText:content,occurredAt:at(days),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:[category],timePrecision:'exact'}}})
  expect(response.ok(),await response.text()).toBeTruthy()
 }
 await create('脸颊湿疹、发痒，晚上抓挠，涂抹保湿乳后仍需观察。',2,'symptom')
 await create('午餐吃了鸡胸和里脊',3,'diet')
 await create('晚餐牛肉粥',4,'diet')
 await create('牛奶、鸡蛋、水果果肉和肉桂面包',5,'diet')
 for(let index=0;index<10;index++)await create(`公园散步，第${index+1}次户外观察，经过草地，原始记录有更多说明。`,index+1,'activity')
 await create('旧的户外活动',25,'activity');await create('旧的湿疹观察',80,'symptom')
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 await page.goto('/quick-search')
 const input=page.getByLabel('查找记录文字'),rows=page.locator('.journal-search-result')
 await input.fill('查找最近两个月的皮肤情况');await expect(rows).toHaveCount(1);await expect(rows).toContainText('脸颊湿疹')
 await input.fill('查找最近两个月吃的所有的肉');await expect(rows).toHaveCount(2);await expect(rows.first()).toContainText('鸡胸')
 await input.fill('最近两周有没有那个，所有的户外活动都调出来');await expect(rows).toHaveCount(10)
 for(const [width,height] of [[320,568],[375,667],[390,844]]){
  await page.setViewportSize({width,height})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  for(const row of await rows.all()){
   const box=(await row.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.height).toBeLessThanOrEqual(52)
   const text=row.locator('span');expect(await text.evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap')
   const date=(await row.locator('time').boundingBox())!,summary=(await text.boundingBox())!,arrow=(await row.locator('svg').boundingBox())!
   expect(Math.abs(date.y+date.height/2-summary.y-summary.height/2)).toBeLessThan(2)
   expect(Math.abs(arrow.y+arrow.height/2-summary.y-summary.height/2)).toBeLessThan(2)
  }
  await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeInViewport()
  await page.screenshot({path:info.outputPath(`quick-search-${width}.png`)})
 }
 await page.setViewportSize({width:375,height:667})
 await page.locator('.journal-search-body').evaluate(el=>el.scrollTop=180)
 const before=await page.locator('.journal-search-body').evaluate(el=>el.scrollTop)
 await rows.nth(6).click();await expect(page.getByRole('dialog')).toContainText('原始记录有更多说明')
 await page.getByRole('button',{name:/关闭/}).last().click()
 await expect(input).toHaveValue('最近两周有没有那个，所有的户外活动都调出来')
 await expect.poll(()=>page.locator('.journal-search-body').evaluate(el=>el.scrollTop)).toBe(before)
 await input.fill('最近两周草莓');await expect(rows).toHaveCount(0);await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
})

test('语音松开后转写自动使用同一模糊检索',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'语音检索（虚构）',relationship:'child'}});const memberId=(await member.json()).id
 const record=await request.post('/api/quick-records',{headers,data:{memberId,content:'脸颊湿疹、发痒',title:'观察',rawText:'脸颊湿疹、发痒',occurredAt:new Date(Date.now()-86400000).toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:['symptom'],timePrecision:'exact'}}});expect(record.ok()).toBeTruthy()
 await request.get('http://127.0.0.1:4198/voice?text='+encodeURIComponent('查找最近两个月的皮肤情况'))
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 await page.goto('/quick-search');const hold=page.getByRole('button',{name:'按住说话',exact:true});await expect(hold).toBeEnabled()
 const box=(await hold.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1400);await page.mouse.up()
 await expect(page.getByLabel('查找记录文字')).toHaveValue('查找最近两个月的皮肤情况',{timeout:15000})
 await expect(page.locator('.journal-search-result')).toHaveCount(1)
 await expect(page.locator('.journal-search-result')).toContainText('湿疹')
})

test('识别等待只呈现放大镜；失败不显示恢复操作且可以重新说话；结果自然接入',async({page,request},info)=>{
 const member=await request.post('/api/members',{headers,data:{name:'等待态验收（虚构）',relationship:'child'}});const memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 let release:()=>void=()=>{},calls=0
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/ai/audio/transcriptions',async route=>{
  calls++
  if(calls===1){await gate;await route.fulfill({status:503,json:{error:'ASR_UPSTREAM_UNAVAILABLE',message:'识别暂不可用'}})}
  else await route.fulfill({json:{transcript:'查找最近两周草莓'}})
 })
 await page.goto('/quick-search')
 const input=page.getByLabel('查找记录文字');await input.fill('草莓')
 await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
 const hold=page.getByRole('button',{name:'按住说话',exact:true}),box=(await hold.boundingBox())!
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()
 await expect.poll(()=>calls).toBe(1)
 await expect(page.locator('.quick-search-progress')).toContainText('正在识别你说的话')
 await expect(page.getByText('没有找到相关记录',{exact:true})).toHaveCount(0)
 await expect(page.getByText('录音已保留',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'重试识别',exact:true})).toHaveCount(0)
 const lens=page.locator('.quick-search-progress__lens'),before=await lens.evaluate(el=>getComputedStyle(el).transform)
 await page.waitForTimeout(150)
 expect(await lens.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before)
 await expect(page.locator('.quick-search-progress__hint')).toContainText('识别比平时久',{timeout:10000})
 for(const [width,height] of [[320,568],[375,667],[390,844]]){
  await page.setViewportSize({width,height})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await expect(page.locator('.quick-search-progress__label')).toBeInViewport()
  await page.screenshot({path:info.outputPath(`recognizing-${width}.png`)})
 }
 await page.emulateMedia({reducedMotion:'reduce'})
 expect(await lens.evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
 release()
 await expect(page.getByRole('alert')).toHaveText('没能识别这段语音，请重新按住说话')
 await expect(page.getByText('录音已保留',{exact:true})).toHaveCount(0)
 await expect(page.getByText('继续查找',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:/重试识别|重新识别|改用文字|改变文字/})).toHaveCount(0)
 await expect(hold).toBeEnabled();await expect(input).toBeEnabled()
 await input.fill('最近两周草莓');await expect(page.getByRole('alert')).toHaveCount(0)
 const nextBox=(await hold.boundingBox())!
 await page.mouse.move(nextBox.x+nextBox.width/2,nextBox.y+nextBox.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()
 await expect(input).toHaveValue('查找最近两周草莓')
 await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
 expect(calls).toBe(2)
 await expect(page.locator('.quick-search-progress')).toHaveCount(0)
})

test('旧查找文字和录音不恢复；新查找不落草稿，刷新及重新进入均为空',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'清空检索（虚构）',relationship:'child'}});expect(member.ok()).toBeTruthy();const memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 await page.goto('/nurse-station')
 const key=`lookup:visit-test:${memberId}`,otherKey=`visit-test:${memberId}:front-desk`
 await page.evaluate(async({key,otherKey})=>{
  const draft={text:'上次的皮肤查找',files:[],occurredAt:'',timeUnknown:true,requestId:crypto.randomUUID(),pendingVoice:new File(['legacy audio'],'previous.webm',{type:'audio/webm'})}
  sessionStorage.setItem(`hoooho-capture-checkpoint:${key}`,JSON.stringify({metadata:{...draft,pendingVoice:undefined},files:[],pendingVoice:'legacy'}))
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');store.put(draft,key);store.put({...draft,text:'保留其他记录草稿'},otherKey);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}finally{db.close()}
 },{key,otherKey})
 await page.getByRole('button',{name:'快速查找',exact:true}).click()
 const input=page.getByLabel('查找记录文字'),hold=page.getByRole('button',{name:'按住说话',exact:true})
 const clean=async()=>{await expect(input).toBeEnabled();await expect(input).toHaveValue('');await expect(hold).toBeEnabled();await expect(page.locator('.journal-search-result')).toHaveCount(0);await expect(page.getByRole('button',{name:/重试识别|重新识别|改用文字|改变文字/})).toHaveCount(0);await expect(page.getByText('继续查找',{exact:true})).toHaveCount(0)}
 const saved=()=>page.evaluate(async key=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  try{return await new Promise<boolean>((resolve,reject)=>{const r=db.transaction('drafts','readonly').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result!==undefined);r.onerror=()=>reject(r.error)})}finally{db.close()}
 },key)
 await clean();await expect(input).toHaveAttribute('autocomplete','off')
 await expect.poll(saved).toBe(false)
 expect(await page.evaluate(key=>sessionStorage.getItem(`hoooho-capture-checkpoint:${key}`),key)).toBeNull()
 await input.fill('刷新前的皮肤查找');await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible();expect(await saved()).toBe(false)
 await page.reload();await clean()
 await input.fill('退出前的户外查找');await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page).toHaveURL(/\/nurse-station$/)
 await page.getByRole('button',{name:'快速查找',exact:true}).click();await clean()
 expect(await page.evaluate(async key=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  try{return await new Promise<string>((resolve,reject)=>{const r=db.transaction('drafts','readonly').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result?.text);r.onerror=()=>reject(r.error)})}finally{db.close()}
 },otherKey)).toBe('保留其他记录草稿')
})

test('识别未返回时离开，再次进入不会被旧语音结果回填',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'退出检索（虚构）',relationship:'child'}});expect(member.ok()).toBeTruthy();const memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 let release:()=>void=()=>{},started=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/ai/audio/transcriptions',async route=>{started=true;await gate;await route.fulfill({json:{transcript:'上一次尚未返回的语音'}}).catch(()=>{})})
 await page.goto('/quick-search')
 const hold=page.getByRole('button',{name:'按住说话',exact:true});await expect(hold).toBeEnabled();const box=(await hold.boundingBox())!
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()
 await expect.poll(()=>started).toBe(true)
 await page.getByRole('button',{name:'返回',exact:true}).click()
 await page.getByRole('button',{name:'快速查找',exact:true}).click();release()
 const input=page.getByLabel('查找记录文字');await expect(input).toHaveValue('');await expect(hold).toBeEnabled()
 await input.fill('新的查找');await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible();await expect(input).toHaveValue('新的查找')
 await expect(page.getByRole('alert')).toHaveCount(0)
})

test('日历入口共用首页语音与规则，压缩WebM直传且转写不重复读取索引，返回保留日历位置',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'统一查找（虚构）',relationship:'child'}}),memberId=(await member.json()).id
 const day=new Date(Date.now()-2*86400000).toISOString().slice(0,10)
 const record=await request.post('/api/quick-records',{headers,data:{memberId,content:'脸颊湿疹和发痒',title:'皮肤观察',occurredAt:new Date(Date.now()-86400000).toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:['symptom'],timePrecision:'exact'}}});expect(record.ok()).toBeTruthy()
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 await page.goto(`/health-events?view=day&day=${day}&sort=asc`)
 await expect(page.getByRole('button',{name:'搜索健康日历'})).toBeVisible()
 const before=new URL(page.url()).search
 let indexes=0,payload:any
 page.on('request',r=>{if(r.url().includes('/journal-index'))indexes++})
 await page.route('**/api/ai/audio/transcriptions',async route=>{payload=route.request().postDataJSON();await route.fulfill({json:{transcript:'最近两个月皮肤情况'}})})
 await page.getByRole('button',{name:'搜索健康日历'}).click()
 const input=page.getByLabel('查找记录文字'),hold=page.getByRole('button',{name:'按住说话',exact:true})
 await expect(input).toHaveValue('');await expect(hold).toBeInViewport()
 await expect(page.locator('.quick-search-progress')).toHaveCount(0)
 const indexCount=indexes
 const box=(await hold.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()
 await expect(input).toHaveValue('最近两个月皮肤情况')
 await expect(page.locator('.journal-search-result')).toHaveCount(1)
 expect(payload.mimeType).toBe('audio/webm');expect(payload.name).toBe('recording.webm')
 const bytes=Buffer.from(payload.dataUrl.split(',')[1],'base64')
 expect(bytes.subarray(0,4).toString('hex')).toBe('1a45dfa3');expect(bytes.length).toBeLessThan(24000)
 expect(indexes).toBe(indexCount)
 await page.getByRole('button',{name:'返回',exact:true}).click()
 expect(new URL(page.url()).search).toBe(before)
 await page.getByRole('button',{name:'搜索健康日历'}).click();await expect(input).toHaveValue('');await expect(hold).toBeEnabled()
})

test('索引与识别都挂起时仍按总预算结束等待，旧结果不能覆盖下一次录音',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'超时检索（虚构）',relationship:'child'}}),memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 let release!:()=>void,calls=0
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/journal-index',async route=>{await gate;await route.fulfill({json:{events:[],records:[],attachments:[]}}).catch(()=>{})})
 await page.route('**/api/ai/audio/transcriptions',async route=>{
  calls++;if(calls===1){await gate;await route.fulfill({json:{transcript:'迟到的旧查找'}}).catch(()=>{})}
  else await route.fulfill({json:{transcript:'新的查找'}})
 })
 await page.clock.install();await page.goto('/quick-search')
 const input=page.getByLabel('查找记录文字'),hold=page.getByRole('button',{name:'按住说话',exact:true})
 const speak=async()=>{const box=(await hold.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()}
 await speak();await expect.poll(()=>calls).toBe(1)
 await page.clock.fastForward(25001)
 await expect(page.locator('.quick-search-progress')).toHaveCount(0)
 await expect(page.getByText('没能识别这段语音，请重新按住说话',{exact:true})).toBeVisible()
 await expect(input).toBeEnabled();await expect(hold).toBeEnabled()
 release();await speak();await expect(input).toHaveValue('新的查找');expect(calls).toBe(2)
})

test('共享录音逻辑在智能记录退出后仍保存迟到的最后音频字节',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'原件保护（虚构）',relationship:'child'}}),memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{
  sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))
  const descriptor=Object.getOwnPropertyDescriptor(MediaRecorder.prototype,'onstop')!
  Object.defineProperty(MediaRecorder.prototype,'onstop',{...descriptor,set(handler){descriptor.set!.call(this,handler?function(this:MediaRecorder,event:Event){setTimeout(()=>handler.call(this,event),350)}:null)}})
 },{token,memberId})
 await page.goto('/smart-record?source=front-desk')
 const hold=page.getByRole('button',{name:'按住说话',exact:true});await expect(hold).toBeEnabled()
 await hold.focus();await page.keyboard.down('Space');await page.waitForTimeout(1100)
 await page.getByRole('button',{name:'返回',exact:true}).click();await page.keyboard.up('Space')
 await page.getByRole('button',{name:'保存草稿并退出',exact:true}).click();await expect(page).toHaveURL(/nurse-station$/)
 // Resume the same legacy draft route; the current home is the conversation itself.
 await page.goto('/smart-record?source=front-desk')
 await expect.poll(()=>page.evaluate(async memberId=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  try{return await new Promise<boolean>((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(`home-smart:visit-test:${memberId}:new`);r.onsuccess=()=>resolve(Boolean(r.result?.files?.some((file:any)=>file.type.startsWith('audio/')&&file.bytes?.byteLength>300)));r.onerror=()=>reject(r.error)})}finally{db.close()}
 },memberId)).toBe(true)
})

test('录音文件读取永不结束时总时限仍恢复输入，不会进入无限准备状态',async({page,request})=>{
 const member=await request.post('/api/members',{headers,data:{name:'准备超时（虚构）',relationship:'child'}}),memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{
  sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))
  const read=Blob.prototype.arrayBuffer
  Blob.prototype.arrayBuffer=function(){return this.type.startsWith('audio/')?new Promise(()=>{}):read.call(this)}
 },{token,memberId})
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/ai/audio/transcriptions'))calls++})
 await page.clock.install();await page.goto('/quick-search')
 const input=page.getByLabel('查找记录文字'),hold=page.getByRole('button',{name:'按住说话',exact:true}),box=(await hold.boundingBox())!
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()
 await expect(page.locator('.quick-search-progress')).toBeVisible();await page.clock.fastForward(25001)
 await expect(page.locator('.quick-search-progress')).toHaveCount(0);await expect(input).toBeEnabled();await expect(hold).toBeEnabled()
 await expect(page.getByText('没能识别这段语音，请重新按住说话',{exact:true})).toBeVisible();expect(calls).toBe(0)
})
