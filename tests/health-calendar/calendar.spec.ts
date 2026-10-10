import { test, expect, type Page } from '@playwright/test'
const day='2026-10-08', accountId='calendar-fixture', child='calendar-child'
const event=(id:string,memberId=child)=>({id,accountId,memberId,title:id==='case'?'皮肤观察':'日常记录',category:'other',status:'ongoing',startTime:`${day}T01:00:00Z`,createdAt:`${day}T01:00:00Z`,updatedAt:`${day}T01:00:00Z`})
const row=(id:string,category:string,time:string,other:any={})=>({id,accountId,eventId:'case',type:category,content:id,occurredAt:`${day}T${time}:00Z`,createdAt:`${day}T01:00:00Z`,updatedAt:`${day}T01:00:00Z`,journal:{categories:[category],timePrecision:'exact'},...other})
const rows=[row('早餐吃了米粥','diet','00:00'),row('上午出现红疹','symptom','02:00'),row('用了医生开的药','medication','03:00',{journal:{categories:['medication'],timePrecision:'exact',medication:{medicationName:'医嘱药',amountValue:2,amountUnit:'mL',administrationRoute:'oral'}}}),row('夜间睡眠','sleep','14:00',{journal:{categories:['sleep'],timePrecision:'exact',sleep:{sleepAt:`${day}T14:00:00Z`,wakeAt:'2026-10-09T00:00:00Z',kind:'night',durationMinutes:600,status:'completed'}}}),row('不确定哪天痒','symptom','01:00',{journal:{categories:['symptom'],timePrecision:'unknown'}}),row('当天哭闹','symptom','00:00',{journal:{categories:['symptom'],timePrecision:'day'}})]
async function prepare(page:Page, fail=false) {
 const records=[...rows,...Array.from({length:8},(_,i)=>row(`六行月份记录${i}`,'other','01:00',{occurredAt:'2026-03-08T01:00:00Z'}))]; const writes:any[]=[]; let saveFailures=0; let duplicate=false
 await page.addInitScript(({child,accountId})=>{localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:child,members:[],profile:null},version:5}));sessionStorage.setItem('hoooho-auth-token','fixture-token')},{child,accountId})
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname
  let data:any=[]
  if(p==='/api/auth/session')data={token:'fixture-token',user:{id:accountId,createdAt:`${day}T01:00:00Z`,currentMemberId:child}}
  else if(p==='/api/members')data=[{id:child,accountId,name:'日历验收宝宝',relationship:'child',birthday:'2025-01-01',gender:'female'},{id:'sibling',accountId,name:'另一位孩子',relationship:'child',birthday:'2024-01-01',gender:'male'}]
  else if(p==='/api/events')data=[event('case'),event('daily'),event('sibling-event','sibling')]
  else if(p==='/api/events/case')data=event('case')
  else if(p==='/api/events/case/records'){if(fail)return route.fulfill({status:503,json:{error:{message:'fixture failure'}}});data=records}
  else if(p==='/api/quick-records/duplicate-check')data={duplicate:duplicate?{eventId:'case',recordId:'上午出现红疹',occurredAt:`${day}T02:00:00Z`,summary:'上午出现红疹',hasClearChange:false,changeSummary:''}:null}
  else if(p==='/api/quick-records'){const body=route.request().postDataJSON();writes.push(body);if(saveFailures-->0)return route.fulfill({status:503,json:{error:{message:'保存失败，请重试'}}});records.push({...row(body.content,body.journal.categories[0],'01:00'),occurredAt:body.occurredAt,journal:body.journal});data={eventId:'case',recordId:body.content,idempotent:false}}
  else if(p==='/api/events/daily/records')data=[row('无关的零食','diet','01:00',{eventId:'daily'})]
  else if(p==='/api/events/sibling-event/records')data=[row('其他孩子私密记录','symptom','01:00',{eventId:'sibling-event'})]
  else if(p.endsWith('/cases'))data={active:[{event:event('case'),followup:{title:'皮肤观察',recordCount:6,firstOccurredAt:null,latestOccurredAt:null,hasUnknownTime:true},latest:null,observations:[],changedAt:`${day}T01:00:00Z`}],archived:[],timezone:'Asia/Shanghai',today:day}
  else if(p==='/api/account/entry-state')data={familyMemberCount:2,hasValidHealthRecord:true}
  return route.fulfill({json:data})
 })
 await page.goto(`/health-calendar?day=${day}`)
 await expect(page.getByRole('heading',{name:'健康月历',exact:true})).toBeVisible()
 await expect(page.locator('.health-calendar__status')).toHaveCount(fail?1:0)
 return {errors,writes,failSave:()=>saveFailures=1,duplicate:()=>duplicate=true}
}
test('one-screen month fits SE, six-week months and larger phones with four-character entries',async({page},testInfo)=>{
 const {errors}=await prepare(page)
 await expect(page.getByRole('button',{name:'刷新健康月历'})).toHaveCount(0)
 await expect(page.getByText('日历验收宝宝',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'带去看医生'})).toHaveCount(0)
 await expect(page.locator('.health-calendar__recall')).toHaveCount(0)
 await expect(page.getByText(/时间上的关联|日期 \/ 时间不详|这一天暂无符合/)).toHaveCount(0)
 for(const [width,height] of [[320,568],[375,667],[375,500],[320,480],[430,932],[1280,800]]){
  await page.setViewportSize({width,height})
  await expect(page.locator('.health-calendar__day')).toHaveCount(31)
  const layout=await page.locator('.health-calendar').evaluate(main=>{
   const grid=main.querySelector('.health-calendar__grid')!,day=main.querySelector('.health-calendar__day')!,preview=main.querySelector('.health-calendar__preview')!,add=main.querySelector('.health-calendar__add')!,toolbar=main.querySelector('.health-calendar__toolbar')!
   return {scroll:main.scrollHeight-main.clientHeight,overflow:document.documentElement.scrollWidth-window.innerWidth,bottom:grid.getBoundingClientRect().bottom,addTop:add.getBoundingClientRect().top,previewWidth:preview.getBoundingClientRect().width,cellWidth:preview.closest('.health-calendar__day')!.getBoundingClientRect().width,characters:preview.clientWidth/parseFloat(getComputedStyle(preview).fontSize),rowHeight:day.getBoundingClientRect().height,selectY:main.querySelector('select')!.getBoundingClientRect().top,toolbarY:toolbar.getBoundingClientRect().top,viewport:window.innerHeight}
  })
  expect(layout.scroll).toBeLessThanOrEqual(1);expect(layout.overflow).toBeLessThanOrEqual(0)
  expect(layout.bottom).toBeLessThanOrEqual(layout.addTop);expect(layout.bottom).toBeLessThan(layout.viewport)
  expect(layout.previewWidth).toBeLessThanOrEqual(layout.cellWidth);expect(layout.characters).toBeGreaterThanOrEqual(4);expect(Math.abs(layout.selectY-layout.toolbarY)).toBeLessThanOrEqual(2)
  await page.getByLabel('选择日历日期').fill('2026-03-08')
  await expect(page.locator('.health-calendar__grid > .health-calendar__day, .health-calendar__grid > .health-calendar__blank')).toHaveCount(42)
  expect(await page.locator('.health-calendar').evaluate(main=>main.scrollHeight<=main.clientHeight+1)).toBe(true)
  const dense=page.getByRole('button',{name:/2026-03-08，/})
  expect(await dense.evaluate(cell=>Array.from(cell.querySelectorAll('.health-calendar__preview,.health-calendar__more')).every(item=>item.getBoundingClientRect().bottom<=cell.getBoundingClientRect().bottom))).toBe(true)
  expect(await dense.evaluate(cell=>{const more=cell.querySelector('.health-calendar__more'),items=cell.querySelectorAll('.health-calendar__preview');return !more||!items.length||items[items.length-1].getBoundingClientRect().bottom<=more.getBoundingClientRect().top})).toBe(true)
  const last=await page.getByRole('button',{name:/2026-03-31，/}).boundingBox();expect(last!.y+last!.height).toBeLessThanOrEqual(height)
  await page.getByLabel('选择日历日期').fill(day)
 }
 await page.setViewportSize({width:375,height:667})
 await page.getByRole('heading',{name:'健康月历',exact:true}).click()
 await page.screenshot({path:testInfo.outputPath('calendar-iphone-se.png')})
 await page.setViewportSize({width:430,height:932})
 await page.screenshot({path:testInfo.outputPath('calendar-large-phone.png')})
 expect(errors).toEqual([])
})
test('dropdown filters the month and date opens records only on demand',async({page})=>{
 const {errors}=await prepare(page)
 await page.getByLabel('筛选记录类型').selectOption('symptom')
 await expect(page.locator('.health-calendar__grid')).not.toContainText('早餐吃了米粥')
 await expect(page.locator('.health-calendar__grid')).toContainText('上午出现红疹')
 await page.getByRole('button',{name:/2026-10-08，/}).click()
 await expect(page.getByRole('dialog',{name:'当天记录'})).toBeVisible()
 await expect(page.locator('.health-calendar__records')).toContainText('当天哭闹')
 await expect(page.locator('.health-calendar__records')).not.toContainText('不确定哪天痒')
 await page.locator('.health-calendar__records').getByRole('button',{name:/上午出现红疹/}).click()
 await expect(page.getByRole('dialog')).toBeVisible()
 await page.getByRole('button',{name:/关闭.*详情/}).first().click()
 await page.getByRole('button',{name:'关闭当天记录'}).last().click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.getByText('其他孩子私密记录',{exact:true})).toHaveCount(0)
 expect(errors).toEqual([])
})
test('plus adds a categorized record for the selected date and preserves input on retry',async({page})=>{
 const fixture=await prepare(page);fixture.failSave()
 await page.getByLabel('筛选记录类型').selectOption('vaccination')
 await page.getByRole('button',{name:'新增记录',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'新增记录',exact:true})).toBeVisible()
 await expect(page.getByLabel('记录类型',{exact:true})).toHaveValue('vaccination')
 await expect(page.locator('input[aria-label="发生时间"]')).toHaveValue(/2026-10-08T/)
 await page.getByLabel('记录内容').fill('已接种疫苗')
 await page.getByRole('button',{name:'保存记录',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('保存失败')
 await expect(page.getByLabel('记录内容')).toHaveValue('已接种疫苗')
 await page.getByRole('button',{name:'保存记录',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.locator('.health-calendar__grid')).toContainText('已接种疫苗')
 expect(fixture.writes).toHaveLength(2);expect(fixture.writes[0].idempotencyKey).toBe(fixture.writes[1].idempotencyKey)
 expect(fixture.writes[1].memberId).toBe(child);expect(fixture.writes[1].journal.categories).toEqual(['vaccination'])
 expect(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fixture.writes[1].occurredAt))).toBe(day)
 expect(fixture.errors).toEqual([])
})
test('duplicate confirmation uses the existing record write contract',async({page})=>{
 const fixture=await prepare(page);fixture.duplicate()
 await page.getByRole('button',{name:'新增记录',exact:true}).click()
 await page.getByLabel('记录内容').fill('上午出现红疹')
 await page.getByRole('button',{name:'保存记录',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'这个情况刚刚记录过'})).toBeVisible()
 expect(fixture.writes).toHaveLength(0)
 await page.getByRole('button',{name:'仍然新增一条'}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 expect(fixture.writes).toHaveLength(1);expect(fixture.writes[0].duplicateAction).toBe('create')
})
test('load failure remains actionable without showing incomplete records',async({page})=>{
 await prepare(page,true)
 await expect(page.getByText(/记录加载未完成/)).toBeVisible()
 await expect(page.locator('.health-calendar__preview')).toHaveCount(0)
 await page.route('**/api/events/case/records*',route=>route.fulfill({json:rows}))
 await page.getByRole('button',{name:'重试',exact:true}).click()
 await expect(page.locator('.health-calendar__status')).toHaveCount(0)
 await expect(page.locator('.health-calendar__preview').first()).toBeVisible()
})

test('weekends, holiday names and compensatory workdays are visible without reducing the month',async({page})=>{
 await prepare(page)
 await expect(page.locator('.health-calendar__weekday[data-weekend=true]')).toHaveText(['六','日'])
 const national=page.getByRole('button',{name:/2026-10-01，/})
 await expect(national.locator('.health-calendar__festival')).toHaveText('国庆')
 await expect(national).toHaveAttribute('data-rest','true')
 const work=page.getByRole('button',{name:/2026-10-10，/})
 await expect(work.locator('.health-calendar__holiday-marker')).toHaveText('班')
 await expect(work).toHaveAttribute('data-weekend','true')
 await expect(work).toHaveAccessibleName(/周六，调休上班/)
 await expect(page.getByRole('button',{name:/2026-10-04，/}).locator('.health-calendar__holiday-marker')).toHaveText('休')
 await page.getByLabel('选择日历日期').fill('2026-09-25')
 await expect(page.getByRole('button',{name:/2026-09-25，/}).locator('.health-calendar__festival')).toHaveText('中秋')
})
test('short categories and record colors agree across filtering and simple addition; legacy records survive',async({page})=>{
 await prepare(page)
 const filter=page.getByLabel('筛选记录类型')
 const expected=['全部类型','症状','用药','睡眠','喂养','排便','涂抹','疫苗','就医','检查','成长','受伤','活动','情绪','其他']
 await expect(filter.locator('option')).toHaveText(expected)
 await filter.selectOption('symptom')
 const symptom=page.locator('.health-calendar__preview').first()
 await expect(symptom).toHaveAttribute('data-tone','red')
 expect(await symptom.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(174, 62, 67)')
 await filter.selectOption('sleep')
 const sleep=page.locator('.health-calendar__preview').first()
 await expect(sleep).toHaveAttribute('data-tone','blue')
 expect(await sleep.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(48, 103, 152)')
 await filter.selectOption('vaccination')
 await page.getByRole('button',{name:'新增记录',exact:true}).click()
 await expect(page.getByLabel('记录类型',{exact:true}).locator('option')).toHaveText(expected.slice(1))
 await page.getByLabel('记录内容').fill('疫苗记录')
 await page.getByRole('button',{name:'保存记录',exact:true}).click()
 const vaccine=page.locator('.health-calendar__preview').first()
 await expect(vaccine).toHaveAttribute('data-tone','orange')
 expect(await vaccine.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(166, 105, 34)')
 await page.route('**/api/events/case/records*',route=>route.fulfill({json:[...rows,...['measurement','environment','social'].map(c=>row(`历史${c}`,c,'01:00'))]}))
 await filter.selectOption('')
 await page.evaluate(()=>window.dispatchEvent(new Event('hoooho-data-changed')))
 await expect(page.getByRole('button',{name:/2026-10-08，/})).toHaveAccessibleName(/9条记录/)
 await page.getByRole('button',{name:/2026-10-08，/}).click()
 for(const c of ['measurement','environment','social']) await expect(page.locator('.health-calendar__records')).toContainText(`历史${c}`)
})
