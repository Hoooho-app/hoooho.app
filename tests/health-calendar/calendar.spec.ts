import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
const day='2026-10-08', accountId='calendar-fixture', child='calendar-child'
const event=(id:string,memberId=child)=>({id,accountId,memberId,title:id==='case'?'皮肤观察':'日常记录',category:'other',status:'ongoing',startTime:`${day}T01:00:00Z`,createdAt:`${day}T01:00:00Z`,updatedAt:`${day}T01:00:00Z`})
const row=(id:string,category:string,time:string,other:any={})=>({id,accountId,eventId:'case',type:category,content:id,occurredAt:`${day}T${time}:00Z`,createdAt:`${day}T01:00:00Z`,updatedAt:`${day}T01:00:00Z`,journal:{categories:[category],timePrecision:'exact'},...other})
const rows=[row('早餐吃了米粥','diet','00:00'),row('上午出现红疹','symptom','02:00'),row('用了医生开的药','medication','03:00',{journal:{categories:['medication'],timePrecision:'exact',medication:{medicationName:'医嘱药',amountValue:2,amountUnit:'mL',administrationRoute:'oral'}}}),row('夜间睡眠','sleep','14:00',{journal:{categories:['sleep'],timePrecision:'exact',sleep:{sleepAt:`${day}T14:00:00Z`,wakeAt:'2026-10-09T00:00:00Z',kind:'night',durationMinutes:600,status:'completed'}}}),row('不确定哪天痒','symptom','01:00',{journal:{categories:['symptom'],timePrecision:'unknown'}}),row('当天哭闹','symptom','00:00',{journal:{categories:['symptom'],timePrecision:'day'}})]
async function prepare(page:Page, fail=false) {
 await page.addInitScript(({child,accountId})=>{localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:child,members:[],profile:null},version:5}));sessionStorage.setItem('hoooho-auth-token','fixture-token')},{child,accountId})
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname
  let data:any=[]
  if(p==='/api/auth/session')data={token:'fixture-token',user:{id:accountId,createdAt:`${day}T01:00:00Z`,currentMemberId:child}}
  else if(p==='/api/members')data=[{id:child,accountId,name:'日历验收宝宝',relationship:'child',birthday:'2025-01-01',gender:'female'},{id:'sibling',accountId,name:'另一位孩子',relationship:'child',birthday:'2024-01-01',gender:'male'}]
  else if(p==='/api/events')data=[event('case'),event('daily'),event('sibling-event','sibling')]
  else if(p==='/api/events/case')data=event('case')
  else if(p==='/api/events/case/records'){if(fail)return route.fulfill({status:503,json:{error:{message:'fixture failure'}}});data=rows}
  else if(p==='/api/events/daily/records')data=[row('无关的零食','diet','01:00',{eventId:'daily'})]
  else if(p==='/api/events/sibling-event/records')data=[row('其他孩子私密记录','symptom','01:00',{eventId:'sibling-event'})]
  else if(p.endsWith('/cases'))data={active:[{event:event('case'),followup:{title:'皮肤观察',recordCount:6,firstOccurredAt:null,latestOccurredAt:null,hasUnknownTime:true},latest:null,observations:[],changedAt:`${day}T01:00:00Z`}],archived:[],timezone:'Asia/Shanghai',today:day}
  else if(p==='/api/account/entry-state')data={familyMemberCount:2,hasValidHealthRecord:true}
  return route.fulfill({json:data})
 })
 await page.goto(`/health-calendar?day=${day}`)
 await expect(page.getByRole('heading',{name:'健康月历',exact:true})).toBeVisible()
 return errors
}
test('mobile calendar recalls facts, changes date/filter/order, opens records, exports and preserves uncertainty',async({page})=>{
 const errors=await prepare(page)
 await expect(page.getByRole('button',{name:'带去看医生'})).toBeEnabled()
 await expect(page.getByText('其他孩子私密记录',{exact:true})).toHaveCount(0)
 await expect(page.getByLabel('筛选记录类型')).toBeVisible()
 await expect(page.getByLabel('筛选跟进事项')).toHaveCount(0)
 await expect(page.locator('.health-calendar__day').filter({hasText:'早餐吃了米粥'})).toHaveCount(1)
 await expect(page.locator('.health-calendar__timeline').first().locator('li').first()).toContainText('入睡')
 await page.getByRole('button',{name:/记录顺序/}).click()
 await expect(page.locator('.health-calendar__timeline').first().locator('li').first()).toContainText('早餐吃了米粥')
 await page.getByLabel('筛选记录类型').selectOption('symptom')
 await expect(page.locator('.health-calendar__grid')).not.toContainText('早餐吃了米粥')
 await expect(page.locator('.health-calendar__grid')).toContainText('上午出现红疹')
 await page.getByLabel('筛选记录类型').selectOption('')
 await page.getByRole('button',{name:/2026-10-09，/}).click()
 await expect(page.locator('.health-calendar__timeline').first()).toContainText('醒来')
 await page.getByRole('button',{name:/2026-10-08，/}).click()
 await page.getByLabel('筛选记录类型').selectOption('medication')
 await expect(page.locator('.health-calendar__timeline').first()).toContainText('医嘱药 2mL · 口服')
 await page.getByLabel('筛选记录类型').selectOption('')
 await page.locator('.health-calendar__timeline').getByRole('button',{name:/08:00.*早餐吃了米粥/}).click()
 await expect(page.getByRole('dialog')).toBeVisible()
 await page.getByRole('button',{name:/关闭.*详情/}).first().click()
 await page.getByRole('button',{name:'带去看医生'}).click()
 await expect(page.getByRole('dialog',{name:'导出健康月历'})).toBeVisible()
 await page.getByLabel('附上日期 / 时间不详的记录（单独列出）').check()
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存 HTML 回看文件'}).click()
 const exported=await download; const exportedHtml=await readFile((await exported.path())!,'utf8'); expect(exportedHtml).toContain('时间上的关联不等于过敏原因'); expect(exportedHtml).toContain('医嘱药 2mL'); expect(exportedHtml).toContain('不确定哪天痒'); expect(exportedHtml).toContain('无关的零食'); expect(exportedHtml).not.toContain('其他孩子私密记录'); expect(exported.suggestedFilename()).toBe('Hoooho-health-calendar-2026-10-08-2026-10-08.html')
 await page.getByRole('button',{name:'关闭导出健康月历',exact:true}).last().click()
 await page.getByRole('button',{name:'打开菜单'}).click();await page.getByRole('button',{name:'健康月历',exact:true}).click()
 for(const width of [320,375,430,1280]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)}
 expect(errors).toEqual([])
})
test('incomplete fetch blocks export and retry recovers without showing empty health facts',async({page})=>{
 await prepare(page,true)
 await expect(page.getByText(/记录加载未完成/)).toBeVisible()
 await expect(page.getByRole('button',{name:'带去看医生'})).toBeDisabled()
 await expect(page.locator('.health-calendar__preview')).toHaveCount(0)
 await page.route('**/api/events/case/records',route=>route.fulfill({json:rows}))
 await page.getByRole('button',{name:'重试',exact:true}).click()
 await expect(page.getByRole('button',{name:'带去看医生'})).toBeEnabled()
})
