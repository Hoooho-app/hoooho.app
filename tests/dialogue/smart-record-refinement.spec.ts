import {test,expect,type Page} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())
test.beforeEach(async({page,request})=>{
  memberId=(await(await request.post('/api/members',{headers,data:{name:'记录精修（虚构）',relationship:'child'}})).json()).id
  await request.get('http://127.0.0.1:4198/success')
  await request.get('http://127.0.0.1:4198/delay?ms=1200')
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}})
  await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
})
test.afterEach(async({request})=>{await request.get('http://127.0.0.1:4198/delay?ms=400');await request.delete(`/api/members/${memberId}`,{headers})})
async function notices(page:Page,rows:Record<string,unknown>[]){
  await page.evaluate(({memberId,rows})=>localStorage.setItem('hoooho-record-updates-v1',JSON.stringify({state:{items:rows.map(row=>({accountId:'visit-test',memberId,label:'新记录',at:Date.now(),...row}))},version:0})),{memberId,rows})
}
test('oral narration is one saved occurrence with compact progress, text edits and a single-line calendar row',async({page,request},info)=>{
  const text='上嘴唇的那个地方有点那个一个线有点断裂，有出血。上传资料。然后去医院，医生说没事，但是那个牙齿是需要观察的。'
  const fragments=[['symptom','symptom','上嘴唇的那个地方有点那个一个线有点断裂，有出血'],['activity','activity','上传资料'],['examination','result','医生说没事'],['other','doctorStatement','牙齿是需要观察的']]
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:fragments.map(([category,name,value])=>({category,title:value,timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name,value,quote:value,sourceId:'@first',page:1}]}))}})
  await page.goto('/smart-record?source=front-desk')
  await page.getByRole('button',{name:'改用文字'}).click()
  await page.getByLabel('对话输入').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click()
  const progress=page.getByTestId('recognition-progress')
  await expect(progress).toBeVisible()
  expect((await progress.boundingBox())!.height).toBeLessThan(140)
  expect(await page.locator('.nurse-turn-content').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('14px')
  await page.screenshot({path:info.outputPath('compact-progress.png')})
  await page.getByRole('button',{name:'核对记录',exact:true}).click()
  const cards=page.locator('.smart-review-card');await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('医生说没事');await expect(cards).toContainText('牙齿是需要观察的')
  await expect(cards.getByRole('button',{name:/删除/})).toHaveCount(0)
  for(const button of await cards.getByRole('button').all())expect(await button.innerText()).toBe('编辑')
  const saving=page.waitForResponse(r=>/\/ai-drafts\/[^/]+\/save$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST')
  await page.getByRole('button',{name:'保存',exact:true}).click();const saved=await(await saving).json()
  expect(saved.result.count).toBe(1)
  const record=(await(await request.get(`/api/events/${saved.result.records[0].eventId}/records`,{headers})).json())[0]
  expect(record.journal.timePrecision).toBe('exact');expect(Date.now()-Date.parse(record.occurredAt)).toBeLessThan(60000)
  expect(record.sourceText).toBe(text)
  await page.goto(`/health-events?view=month&day=${today()}`)
  await page.locator('.health-calendar__day[aria-current="date"]').click()
  const sheet=page.locator('.calendar-day-sheet')
  await expect(sheet.locator('[data-day-record]')).toHaveCount(1)
  await expect(sheet).not.toContainText('个附件')
  await expect(sheet.locator('time')).not.toHaveText('00:00')
  for(const width of [320,375,390]){
    await page.setViewportSize({width,height:667})
    const summary=sheet.locator('.calendar-day-summary strong')
    expect(await summary.evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
  await page.screenshot({path:info.outputPath('one-incident-calendar.png')})
})
test('month dots clear by date without opening a record and leave other dates and profiles unread',async({page,request})=>{
  const earlier=new Date(Date.now()-86400000),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(earlier)
  const rows=[]
  for(const [id,at] of [['today',new Date()],['earlier',earlier]] as const){
    const response=await request.post('/api/quick-records',{headers,data:{memberId,content:`医生说${id}需要观察`,title:`观察${id}`,occurredAt:at.toISOString(),inputChannel:'text',idempotencyKey:crypto.randomUUID().replaceAll('-',''),journal:{categories:['other'],timePrecision:'period'}}})
    expect(response.ok()).toBe(true);const saved=await response.json();rows.push({id,destination:'calendar',recordId:saved.recordId,eventId:saved.eventId,occurredAt:at.toISOString()})
  }
  await page.goto('/health-events?view=month')
  await notices(page,[...rows,{id:'profile',destination:'profile',sectionId:'allergy',entryId:'a'}]);await page.reload()
  const current=page.locator('.health-calendar__day[aria-current="date"]'),previous=page.locator(`.health-calendar__day[aria-label^="${day}"]`)
  await expect(current.getByRole('img',{name:'有新内容'})).toBeVisible();await expect(previous.getByRole('img',{name:'有新内容'})).toBeVisible()
  await expect(page.getByRole('navigation',{name:'新记录'})).toHaveCount(0)
  await previous.click();await expect(previous.getByRole('img',{name:'有新内容'})).toHaveCount(0)
  await expect(page.locator('.calendar-day-sheet').locator('time')).toHaveCount(0)
  await page.locator('.calendar-day-sheet').getByRole('button',{name:'关闭当天记录',exact:true}).click()
  await expect(current.getByRole('img',{name:'有新内容'})).toBeVisible();await current.click()
  await expect(current.getByRole('img',{name:'有新内容'})).toHaveCount(0)
  const remaining=await page.evaluate(()=>JSON.parse(localStorage.getItem('hoooho-record-updates-v1')!).state.items)
  expect(remaining.map((i:{id:string})=>i.id)).toEqual(['profile'])
})
test('day view clears calendar notices on open; section open clears all entries in that profile section',async({page})=>{
  await page.goto('/health-events?view=month')
  await notices(page,[{id:'calendar',destination:'calendar',recordId:'new'},{id:'surgery1',destination:'profile',sectionId:'surgery',entryId:'s1'},{id:'surgery2',destination:'profile',sectionId:'surgery',entryId:'s2'},{id:'allergy',destination:'profile',sectionId:'allergy',entryId:'a1'}])
  await page.goto('/health-events?view=day')
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hoooho-record-updates-v1')!).state.items.some((i:{id:string})=>i.id==='calendar'))).toBe(false)
  await page.goto('/health-profile/surgery')
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hoooho-record-updates-v1')!).state.items.map((i:{id:string})=>i.id))).toEqual(['allergy'])
  await expect(page.getByRole('navigation',{name:'新记录'})).toHaveCount(0)
  await expect(page.getByText('新更新',{exact:true})).toHaveCount(0)
})
