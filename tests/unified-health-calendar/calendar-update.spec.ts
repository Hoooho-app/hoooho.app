import { test, expect, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
const accountId='time-view-test-account', token=new TokenService('time-view-e2e-local-only-secret',3600_000).create({id:accountId}), headers={Authorization:`Bearer ${token}`}
async function prepare(page:Page, url='/health-events') {
 await page.addInitScript(({token,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('calendar-update-ready')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:'child-one',members:[],profile:null},version:5}));sessionStorage.setItem('calendar-update-ready','true')}},{token,accountId})
 await page.goto(url);await expect(page.getByRole('heading',{name:'健康日历',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'日常',exact:true})).toBeEnabled()
}
const toggle=(page:Page)=>page.getByRole('button',{name:'切换日历视图',exact:true})
test('labelled neutral toolbar, today within date picker, view preference and fresh filter reset',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await prepare(page)
 await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','month')
 await expect(toggle(page)).toHaveText('月历');await expect(toggle(page).locator('svg')).toHaveCount(1)
 await expect(page.locator('.calendar-toolbar').getByRole('button',{name:'今天',exact:true})).toHaveCount(0)
 const options=page.getByLabel('筛选记录类型');await expect(options.locator('option')).toHaveText(['查看全部','查看喂养','查看日常','查看用药','查看症状','查看就诊资料'])
 for(const mode of ['month','day'] as const){
  if(mode==='day')await toggle(page).click()
  await expect(toggle(page)).toHaveText(mode==='month'?'月历':'日历')
  for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]){
   await page.setViewportSize({width,height})
   const layout=await page.locator('.calendar-toolbar').evaluate(el=>{
    const rect=el.getBoundingClientRect(), nodes=Array.from(el.children) as HTMLElement[]
    return {right:rect.right, groups:nodes.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,top:n.getBoundingClientRect().top,overflow:n.scrollWidth>n.clientWidth,background:getComputedStyle(n).backgroundColor})),primary:`rgb(${getComputedStyle(document.documentElement).getPropertyValue('--hoho-color-primary').trim().replaceAll(/\s+/g,', ')})`}
   })
   expect(layout.groups).toHaveLength(3)
   expect(Math.max(...layout.groups.map(b=>b.top))-Math.min(...layout.groups.map(b=>b.top))).toBeLessThanOrEqual(1)
   expect(layout.groups[0].right).toBeLessThan(layout.groups[1].left)
   expect(layout.groups[1].right).toBeLessThan(layout.groups[2].left)
   expect(layout.groups[2].right).toBeCloseTo(layout.right,0)
   expect(layout.groups.every(group=>!group.overflow&&group.background!==layout.primary)).toBe(true)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
   if(mode==='month')await expect(page.locator('.health-calendar__day').last()).toBeInViewport()
   await page.screenshot({path:`outputs/calendar-header/${mode}-${width}.png`})
  }
 }
 await toggle(page).click()
 await options.selectOption('daily');await expect(options).toHaveValue('daily');await toggle(page).click()
 await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','day')
 await expect(toggle(page)).toHaveText('日历')
 await page.getByRole('button',{name:'搜索健康日历'}).click();await page.getByRole('button',{name:'返回健康日历'}).click();await expect(options).toHaveValue('daily')
 await page.reload();await expect(options).toHaveValue('');await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','day')
 await page.goto('/health-profile');await page.goto('/health-events');await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','day');await expect(options).toHaveValue('')
 await toggle(page).click();await page.getByLabel('选择月份',{exact:true}).fill('2027-02');await expect(page.getByLabel('选择月份',{exact:true})).toHaveValue('2027-02')
 await page.getByLabel('选择月份',{exact:true}).click();const picker=page.getByRole('dialog',{name:'日历日期选择'});await expect(picker.getByRole('button',{name:'今天',exact:true})).toBeVisible();await picker.getByRole('button',{name:'今天',exact:true}).click();await expect(picker).toBeHidden()
 await expect(page.locator('[aria-current="date"]')).toHaveCount(1);expect(errors).toEqual([])
})
test('actual scheduled reminders appear in future dates, filter, update, cancellation and pending detail without health writes',async({page})=>{
 const now=new Date(),future=new Date(now.getFullYear(),now.getMonth(),now.getDate()+3,12), day=`${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`
 const plan={medicationName:'日历合成药品',medicationType:'syrup',amount:0.5,unit:'mL',route:'oral',mode:'daily',times:['08:00','20:00'],startDate:day,durationDays:5,reminderTargets:['我'],timezone:'Asia/Shanghai'}
 const response=await page.request.post('/api/medication-reminders',{headers,data:{memberId:'child-one',plan}});expect(response.ok(),await response.text()).toBe(true);const reminder=await response.json()
 await prepare(page,`/health-events?view=month&month=${day.slice(0,7)}`)
 const cell=page.getByRole('button',{name:new RegExp(`^${day}，`)})
 await expect(cell).toBeEnabled();await expect(cell).toHaveAccessibleName(/0条记录，2项待办/)
 const alpha=await cell.evaluate(el=>getComputedStyle(el).opacity);expect(alpha).toBe('1')
 await page.getByLabel('筛选记录类型').selectOption('daily');await expect(cell.locator('.health-calendar__reminders')).toHaveCount(0)
 await page.getByLabel('筛选记录类型').selectOption('medication');await expect(cell.locator('.health-calendar__reminders')).toHaveText('2')
 let writes=0;page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method())&&/\/api\/(quick-records|records|events)/.test(new URL(r.url()).pathname))writes++})
 await cell.click();const sheet=page.getByRole('dialog',{name:new RegExp(`${Number(day.slice(5,7))}月${Number(day.slice(8))}日`)})
 await expect(sheet.locator('.calendar-reminder-row')).toHaveCount(2);await expect(sheet).toContainText('日历合成药品');await expect(sheet).toContainText('待执行');await expect(sheet).toContainText('08:00');await expect(sheet).toContainText('20:00')
 await page.screenshot({path:'outputs/calendar-update/future-reminders-mobile.png'});await page.keyboard.press('Escape');expect(writes).toBe(0)
 const canceled=await page.request.post(`/api/medication-reminders/${reminder.id}/archive`,{headers});expect(canceled.ok()).toBe(true)
 await page.evaluate(()=>window.dispatchEvent(new Event('hoooho-data-changed')));await expect(cell.locator('.health-calendar__reminders')).toHaveCount(0)
 await page.getByLabel('选择月份',{exact:true}).fill('2026-03');await expect(page.locator('.health-calendar__day')).toHaveCount(42);await page.setViewportSize({width:320,height:568});await expect(page.locator('.health-calendar__day').last()).toBeInViewport();await page.screenshot({path:'outputs/calendar-update/month-six-rows-320.png'})
})
