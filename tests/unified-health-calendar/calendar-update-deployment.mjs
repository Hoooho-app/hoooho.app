import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
const [origin,commit]=process.argv.slice(2)
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com','https://hooohoapp-production.up.railway.app'].includes(origin))
const environment=origin.includes('staging')?'staging':'production', output=`outputs/calendar-update/${environment}`
await mkdir(output,{recursive:true})
const proxyUrl=process.env.PLAYWRIGHT_PROXY_SERVER ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY
const proxyParsed=proxyUrl ? new URL(proxyUrl) : null
const proxy=proxyParsed ? {server:proxyParsed.origin,...(proxyParsed.username ? {username:decodeURIComponent(proxyParsed.username),password:decodeURIComponent(proxyParsed.password)} : {})} : undefined
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true,...(proxy?{proxy}:{})})
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage();let token='',accountId='',memberId='',reminderId='';const errors=[],healthWrites=[],builds=new Set()
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const build=r.headers()['x-hoooho-client-build'];if(build)builds.add(build);if(!['GET','HEAD','OPTIONS'].includes(r.method())&&/\/api\/(quick-records|events|records|daily-record)/.test(new URL(r.url()).pathname))healthWrites.push(new URL(r.url()).pathname)})
async function api(path,method='GET',data){const r=await context.request.fetch(origin+path,{method,data,headers:{'X-Hoooho-Timezone':'Asia/Shanghai',...(token?{Authorization:`Bearer ${token}`}:{})}});assert(r.ok(),`${method} ${path}: ${r.status()}`);return r}
try{
 await api('/api/health')
 const session=await(await api('/api/auth/register','POST',{nickname:`日历验收${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()})).json();token=session.token;accountId=session.user.id
 memberId=(await(await api('/api/members','POST',{name:'日历改版合成验收',birthday:'2025-01-01',gender:'female',relationship:'child'})).json()).id
 await api('/api/auth/current-member','POST',{memberId})
 const now=new Date(),future=new Date(now.getTime()+3*86400000),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(future)
 const reminder=await(await api('/api/medication-reminders','POST',{memberId,plan:{medicationName:'合成验收药品',medicationType:'syrup',amount:0.5,unit:'mL',route:'oral',mode:'daily',times:['08:00','20:00'],startDate:day,durationDays:5,reminderTargets:['我'],timezone:'Asia/Shanghai'}})).json();reminderId=reminder.id
 await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('calendar-release-ready')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}));sessionStorage.setItem('calendar-release-ready','true')}},{token,accountId,memberId})
 await page.goto(origin+`/health-events?verify=${commit}`)
 await expect(page.getByRole('heading',{name:'健康日历',exact:true})).toBeVisible();await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','month')
 await page.getByLabel('选择月份',{exact:true}).fill(day.slice(0,7))
 const cell=page.getByRole('button',{name:new RegExp(`^${day}，`)})
 await expect(cell).toHaveAccessibleName(/0条记录，2项待办/);await expect(cell).toBeEnabled()
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await expect(page.locator('.calendar-toolbar').getByRole('button',{name:'今天',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'切换日历视图'})).toHaveText('')
  await expect(page.locator('.health-calendar__day').last()).toBeInViewport()
  await page.screenshot({path:`${output}/month-${width}.png`})
 }
 await cell.click();await expect(page.locator('.calendar-reminder-row')).toHaveCount(2);await expect(page.getByRole('dialog')).toContainText('待执行');await page.screenshot({path:`${output}/pending-sheet.png`});await page.keyboard.press('Escape')
 const select=page.getByLabel('筛选记录类型');await select.selectOption('daily');await expect(cell.locator('.health-calendar__reminders')).toHaveCount(0)
 await page.getByRole('button',{name:'切换日历视图'}).click();await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','day')
 await page.getByRole('button',{name:'搜索健康日历'}).click();await page.getByRole('button',{name:'返回健康日历'}).click();await expect(select).toHaveValue('daily')
 await page.reload();await expect(select).toHaveValue('');await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','day')
 await page.getByRole('button',{name:'切换日历视图'}).click();await page.getByLabel('选择月份',{exact:true}).fill(day.slice(0,7));await select.selectOption('medication');await cell.click();await page.locator('.calendar-reminder-row').first().click();await expect(page).toHaveURL(new RegExp(`/medication-reminders\\?reminderId=${reminderId}`));await expect(page.locator(`[data-reminder-id="${reminderId}"]`)).toBeVisible()
 await page.goto(origin+'/health-events');await expect(select).toHaveValue('');await expect(page.locator('.unified-health-calendar')).toHaveAttribute('data-calendar-view','month')
 await page.getByLabel('选择月份',{exact:true}).click();const picker=page.getByRole('dialog',{name:'日历日期选择'});await expect(picker.getByRole('button',{name:'今天',exact:true})).toBeVisible();await picker.getByRole('button',{name:'今天',exact:true}).click()
 await api(`/api/medication-reminders/${reminderId}/archive`,'POST');await page.evaluate(()=>window.dispatchEvent(new Event('hoooho-data-changed')));await expect(page.locator('.health-calendar__reminders')).toHaveCount(0)
 assert.deepEqual(errors,[]);assert.deepEqual(healthWrites,[]);assert(builds.has(commit),'Expected client build was not loaded')
 const report={environment,origin,commit,status:'PASS',widths:[320,375,390,430],actualMedicationReminder:'PASS',pendingVsFacts:'PASS',categoryReset:'PASS',viewPreference:'PASS',todayInsidePicker:'PASS',errors,healthWrites}
 await writeFile(`${output}/verification.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}catch(e){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw e}
finally{if(reminderId)await api(`/api/medication-reminders/${reminderId}`,'DELETE').catch(()=>{});if(memberId)await api(`/api/members/${memberId}`,'DELETE').catch(()=>{});await browser.close()}
