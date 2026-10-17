import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const base=process.argv[2],expectedCommit=process.argv[3]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(base))
const session=JSON.parse(await readFile(process.env.HOOOHO_TEST_SESSION_FILE,'utf8'))
assert.equal(session.origin,base)
const target=base.includes('-staging.')?'staging':'production',out=`outputs/smart-record-refinement/${target}`
await mkdir(out,{recursive:true})
const proxy=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox'],...(proxy?{proxy:{server:proxy.origin,...(proxy.username?{username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password)}:{})}}:{})})
const context=await browser.newContext({storageState:session.storageState,viewport:{width:375,height:667},timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message))
let token=session.token,memberId
const result={target,expectedCommit,syntheticOnly:true,modelCalls:0,checks:[],physicalIPhone:'NOT_VERIFIED'}
async function api(path,method='GET',data){const r=await page.evaluate(async({path,method,data,token})=>{const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(30000)});return {ok:response.ok,status:response.status,data:await response.json().catch(()=>null)}},{path,method,data,token});assert.ok(r.ok,`${method} ${path}: ${r.status} ${r.data?.error?.code??''}`);return r.data}
async function notices(rows){await page.evaluate(({rows,accountId,memberId})=>localStorage.setItem('hoooho-record-updates-v1',JSON.stringify({state:{items:rows.map(r=>({accountId,memberId,at:Date.now(),label:'测试更新',...r}))},version:0})),{rows,accountId:session.accountId,memberId})}
async function remaining(){return page.evaluate(()=>JSON.parse(localStorage.getItem('hoooho-record-updates-v1')).state.items.map(i=>i.id))}
try{
  await page.goto(base+'/api/health');assert.equal((await api('/api/health')).status,'ok')
  const html=await page.evaluate(()=>fetch('/').then(r=>r.text())),script=html.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1]
  assert.ok(script)
  assert.ok((await page.evaluate(script=>fetch(script).then(r=>r.text()),script)).includes(expectedCommit),'deployed entry must contain the expected commit')
  const restored=await api('/api/auth/session');assert.equal(restored.user?.id,session.accountId);token=restored.token
  memberId=(await api('/api/members','POST',{name:'日历读写验收（虚构）',relationship:'child'})).id
  await api('/api/auth/current-member','POST',{memberId})
  await page.addInitScript(({token,user,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,currentMemberId:memberId,members:[],profile:null},version:5}))},{token,user:restored.user,memberId})
  const now=new Date(Date.now()-1000),yesterday=new Date(now.getTime()-86400000),rows=[]
  for(const [id,at,precision] of [['now',now,'exact'],['previous',yesterday,'period']]){
    const saved=await api('/api/quick-records','POST',{memberId,title:'牙齿观察',content:'医生原话：牙齿是需要观察的',occurredAt:at.toISOString(),inputChannel:'text',idempotencyKey:randomUUID().replaceAll('-',''),journal:{categories:['other'],timePrecision:precision}})
    rows.push({id,destination:'calendar',recordId:saved.recordId,eventId:saved.eventId,occurredAt:at.toISOString()})
  }
  const profile=await api(`/api/members/${memberId}/profile-list/surgery`,'POST',{action:'add',name:'验收手术资料（虚构）',group:'',key:randomUUID()})
  const profileNotice={id:'profile',destination:'profile',sectionId:'surgery',entryId:profile.rows[0].id}
  await page.goto(base+'/health-events?view=month')
  await notices([...rows,profileNotice]);await page.reload()
  const day=await page.evaluate(()=>new Intl.DateTimeFormat('sv-SE').format(new Date(Date.now()-86400000)))
  const previous=page.locator(`.health-calendar__day[aria-label^="${day}"]`),today=page.locator('.health-calendar__day[aria-current="date"]')
  await expect(today.getByRole('img',{name:'有新内容'})).toBeVisible();await expect(previous.getByRole('img',{name:'有新内容'})).toBeVisible()
  await expect(page.getByRole('navigation',{name:'新记录'})).toHaveCount(0)
  await previous.click();const sheet=page.locator('.calendar-day-sheet')
  await expect(sheet.locator('[data-day-record]')).toHaveCount(1);await expect(sheet.locator('time')).toHaveCount(0)
  await expect(sheet.locator('.calendar-day-summary strong')).toHaveText('牙齿是需要观察')
  await expect.poll(remaining).toEqual(['now','profile'])
  await sheet.getByRole('button',{name:'关闭当天记录',exact:true}).click()
  await today.click();await expect(sheet.locator('[data-day-record]')).toHaveCount(1)
  const clock=now.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false})
  await expect(sheet.locator('time')).toHaveText(clock);await expect(sheet).not.toContainText('个附件')
  for(const width of [320,375,390]){await page.setViewportSize({width,height:667});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await sheet.locator('.calendar-day-summary strong').evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap')}
  await page.screenshot({path:`${out}/calendar-crud.png`})
  result.checks.push('real CRUD and period readback','month dots follow actual dates','opening date clears without record click','single-line phrase without attachment count','320/375/390 px')
  await sheet.getByRole('button',{name:'关闭当天记录',exact:true}).click()
  await notices([{...rows[0],id:'day-notice'},profileNotice]);await page.goto(base+'/health-events?view=day')
  await expect.poll(remaining).toEqual(['profile'])
  await page.goto(base+'/health-profile/surgery');await expect(page.locator('.inline-profile-item')).toContainText('验收手术资料（虚构）')
  await expect.poll(remaining).toEqual([]);await expect(page.getByRole('navigation',{name:'新记录'})).toHaveCount(0)
  result.checks.push('day entry clears notices','profile section entry clears notices')
  assert.deepEqual(errors,[]);result.status='PASS'
}catch(error){result.status='FAILED';result.message=error.message;await page.screenshot({path:`${out}/calendar-failure.png`}).catch(()=>{});process.exitCode=1}
finally{if(memberId)await api(`/api/members/${memberId}`,'DELETE').then(()=>{result.cleanup='synthetic member removed'}).catch(()=>{result.cleanup='requires follow-up'});await writeFile(`${out}/calendar-acceptance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close()}
