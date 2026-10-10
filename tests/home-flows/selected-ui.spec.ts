import {test, expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({id:'visit-test'})
const headers = {Authorization:`Bearer ${token}`}
const raw = '吃了半碗粥，脸颊有点红，没有呕吐，午睡睡了一个小时'
const items = [
  ['diet', [['food','粥'],['amount','半碗']]],
  ['symptom', [['symptom','脸颊有点红，没有呕吐'],['location','脸颊']]],
  ['sleep', [['quality','午睡睡了一个小时']]],
].map(([category,fields]) => ({category,title:category,timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:(fields as string[][]).map(([name,value]) => ({name,value,quote:value,sourceId:'input',page:1}))}))

test.beforeEach(async ({page,request}) => {
  await request.get('http://127.0.0.1:4198/success')
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items}})
  await page.addInitScript(token => {
    sessionStorage.setItem('hoooho-auth-token',token)
    localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))
  },token)
  await page.goto('/nurse-station')
})

test('新记录保留旧草稿、照片和录音，关闭后可分别恢复', async ({page},info) => {
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  const panel = page.getByRole('dialog',{name:'智能记录',exact:true})
  await expect(panel.getByRole('button',{name:'按住说话',exact:true})).toBeEnabled()
  await panel.getByRole('button',{name:'收起',exact:true}).click()
  await page.evaluate(() => new Promise<void>((resolve,reject) => {
    const r = indexedDB.open('hoooho-smart-record-drafts',1)
    r.onsuccess = () => {
      const db=r.result,t=db.transaction('drafts','readwrite')
      const voice=new File(['retained voice'],'旧录音.webm',{type:'audio/webm'})
      const photo=new File(['retained photo'],'旧照片.png',{type:'image/png'})
      t.objectStore('drafts').put({text:'上次的原话',conversationInput:'尚未发送的补充',files:[voice,photo],pendingVoice:voice,occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'old-draft'},'home-smart:visit-test:empty-child:new')
      t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)
    }
  }))
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  await expect(panel.getByRole('button',{name:'继续上次记录',exact:true})).toBeVisible()
  await page.screenshot({path:info.outputPath('issue-03-draft-choice.png')})
  await panel.getByRole('button',{name:'开始新的记录',exact:true}).click()
  await expect(panel.locator('.nurse-turn--user')).toHaveCount(0)
  await panel.getByRole('button',{name:'改用文字',exact:true}).click()
  await panel.getByLabel('对话输入').fill('新的独立记录')
  await panel.getByRole('button',{name:'收起',exact:true}).click()
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  await expect(panel.locator('.smart-record-resume-choice')).toHaveCount(2)
  await panel.getByRole('button',{name:'继续这份草稿',exact:true}).click()
  await expect(panel.locator('.nurse-turn--user').first()).toContainText('上次的原话')
  await expect(panel.locator('.dialogue-file')).toContainText('旧照片.png')
  await expect(panel.getByText('这段录音还在，要我再听一次吗？',{exact:true})).toBeVisible()
  await panel.getByRole('button',{name:'改用文字',exact:true}).click()
  await expect(panel.getByLabel('对话输入')).toHaveValue('尚未发送的补充')
  const retained = await page.evaluate(() => new Promise<any[]>((resolve,reject) => {
    const r=indexedDB.open('hoooho-smart-record-drafts',1)
    r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts'),q=t.objectStore('drafts').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);t.oncomplete=()=>db.close()}
  }))
  expect(retained.some(d=>d.conversationInput==='新的独立记录')).toBe(true)
})

test('独立核对页保留编辑和原话，发生时间确认后保存三条实际记录', async ({page},info) => {
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  const panel=page.getByRole('dialog',{name:'智能记录',exact:true})
  await panel.getByRole('button',{name:'改用文字',exact:true}).click()
  await panel.getByLabel('对话输入').fill(raw)
  await panel.getByRole('button',{name:'发送',exact:true}).click()
  await expect(panel.getByRole('heading',{name:'核对记录',exact:true})).toBeVisible()
  await expect(panel.locator('.dialogue-review-item')).toHaveCount(3)
  const save=panel.getByRole('button',{name:'确认保存 3 条',exact:true})
  await expect(save).toBeDisabled()
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:667})
    await expect(save).toBeInViewport()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
  await page.setViewportSize({width:375,height:667})
  await page.screenshot({path:info.outputPath('issue-04-review.png')})
  const rows=panel.locator('.dialogue-review-item')
  await rows.first().getByText('编辑这条记录',{exact:true}).click()
  await panel.getByLabel('数量',{exact:true}).fill('小半碗')
  for(const row of await rows.all()){
    if(!(await row.locator('details').getAttribute('open')!==null))await row.getByText('编辑这条记录',{exact:true}).click()
    await row.getByRole('button',{name:'就是刚才',exact:true}).click()
  }
  await panel.getByRole('button',{name:'返回对话继续补充',exact:true}).click()
  await expect(panel.locator('.nurse-turn--user')).toContainText(raw)
  await panel.getByRole('button',{name:'核对 3 条记录',exact:true}).click()
  await panel.getByRole('button',{name:'收起',exact:true}).click()
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  await panel.getByRole('button',{name:'继续上次记录',exact:true}).click()
  await expect(rows.first()).toContainText('小半碗')
  await expect(save).toBeEnabled()
  const response=page.waitForResponse(r=>r.url().endsWith('/save')&&r.request().method()==='POST')
  await save.click()
  const result=await(await response).json()
  expect(result.result.records).toHaveLength(3)
  await expect(panel.getByText('已经记好了。',{exact:false})).toBeVisible()
  const record=await(await page.request.get(`/api/events/${result.result.records[0].eventId}/records`,{headers})).json()
  expect(JSON.stringify(record)).toContain('小半碗')
  expect(JSON.stringify(record)).toContain(raw)
})

test('两项跟进可分别进入，查看进度打开完整列表；搜索在桌面维持首页宽度',async({page,request},info)=>{
  for(const text of ['测试跟进一：夜间有咳嗽','测试跟进二：白天皮肤发红','测试跟进三：护理后的情况']){
    const response=await request.post('/api/members/empty-child/case-records',{headers,data:{requestId:crypto.randomUUID(),text,occurredAt:'2026-01-01T02:00:00Z',timeUnknown:false,files:[]}})
    expect(response.ok()).toBe(true)
  }
  await page.reload()
  const card=page.getByRole('region',{name:'首页服务入口'}).getByLabel('正在跟进',{exact:true})
  await expect(card.locator('.home-followup-preview')).toHaveCount(2)
  await card.screenshot({path:info.outputPath('issue-02-followups.png')})
  const title=await card.locator('.home-followup-preview strong').first().textContent()
  await card.locator('.home-followup-preview').first().click()
  await expect(page).toHaveURL(/\/cases\?eventId=/)
  await expect(page.locator('.case-followup-card').first()).toContainText(title!)
  await page.goto('/nurse-station')
  await page.getByRole('button',{name:'查看进度',exact:true}).click()
  await expect(page).toHaveURL(/\/cases$/)
  await expect(page.locator('.case-followup-card')).toHaveCount(3)
  await page.goto('/quick-search')
  await page.setViewportSize({width:1280,height:900})
  await expect(page.getByRole('heading',{name:'快速查找',exact:true})).toBeVisible()
  expect((await page.locator('main.app-shell').boundingBox())!.width).toBeLessThanOrEqual(620)
  const input=page.getByRole('searchbox',{name:'查找记录文字',exact:true})
  await expect(page.locator('.journal-search-result')).toHaveCount(0)
  await input.fill('护理');await input.press('Enter')
  await expect(page.locator('.journal-search-result').first()).toContainText('护理')
  await page.setViewportSize({width:375,height:667})
  await page.screenshot({path:info.outputPath('issue-09-search.png')})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
