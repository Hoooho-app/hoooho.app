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

test('识别等待只呈现放大镜；失败可用同一录音重试；结果自然接入',async({page,request},info)=>{
 const member=await request.post('/api/members',{headers,data:{name:'等待态验收（虚构）',relationship:'child'}});const memberId=(await member.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 let release:()=>void=()=>{},calls=0;const bodies:string[]=[]
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/ai/audio/transcriptions',async route=>{
  calls++;bodies.push(route.request().postData()!)
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
 await expect(page.getByRole('button',{name:'重试识别',exact:true})).toBeEnabled()
 await expect(page.getByText('录音已保留',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'重试识别',exact:true}).click()
 await expect(input).toHaveValue('查找最近两周草莓')
 await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
 expect(calls).toBe(2);expect(bodies[1]).toBe(bodies[0])
 await expect(page.locator('.quick-search-progress')).toHaveCount(0)
})
