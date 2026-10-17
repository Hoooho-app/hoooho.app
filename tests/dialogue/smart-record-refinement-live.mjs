import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const base=process.argv[2],expectedCommit=process.argv[3]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(base))
const target=base.includes('-staging.')?'staging':'production',out=`outputs/smart-record-refinement/${target}`
await mkdir(out,{recursive:true})
const retained=process.env.HOOOHO_TEST_SESSION_FILE?JSON.parse(await readFile(process.env.HOOOHO_TEST_SESSION_FILE,'utf8')):null
if(retained)assert.equal(retained.origin,base,'reused synthetic session must belong to the selected deployment')
const proxy=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox'],...(proxy?{proxy:{server:proxy.origin,...(proxy.username?{username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password)}:{})}}:{})})
const context=await browser.newContext({viewport:{width:375,height:667},timezoneId:'Asia/Shanghai',serviceWorkers:'block',...(retained?.storageState?{storageState:retained.storageState}:{})})
const page=await context.newPage(),errors=[]
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(25000)
let token=retained?.token,memberId
const result={target,expectedCommit,syntheticOnly:true,checks:[],physicalIPhone:'NOT_VERIFIED'}
async function api(path,method='GET',data){
  const response=await page.evaluate(async({path,method,data,token})=>{
    const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(30000)})
    return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)}
  },{path,method,data,token})
  assert.ok(response.ok,`${method} ${path}: HTTP ${response.status} ${response.data?.error?.code??''}`)
  return response.data
}
try{
  await page.goto(base+'/api/health');assert.equal((await api('/api/health')).status,'ok');result.checks.push('health')
  const html=await page.evaluate(()=>fetch('/').then(r=>r.text()))
  const script=html.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1]
  assert.ok(script,'deployed entry script must exist')
  const bundle=await page.evaluate(script=>fetch(script).then(r=>r.text()),script)
  if(expectedCommit)assert.ok(bundle.includes(expectedCommit),'deployed entry must identify the expected commit')
  result.checks.push('deployed commit')
  const session=retained?await api('/api/auth/session'):await api('/api/auth/register','POST',{nickname:`记录验收${randomUUID().replaceAll('-','').slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()})
  assert.ok(session.token&&session.user,'synthetic session must still be authenticated')
  if(retained)assert.equal(session.user.id,retained.accountId,'test account identity must not change')
  token=session.token
  memberId=(await api('/api/members','POST',{name:'口腔观察验收（虚构）',relationship:'child'})).id
  await api('/api/auth/current-member','POST',{memberId})
  await page.addInitScript(({token,user,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,currentMemberId:memberId,members:[],profile:null},version:5}))},{token,user:session.user,memberId})
  await page.goto(base+'/smart-record?source=front-desk')
  await page.getByRole('button',{name:'改用文字'}).click()
  const raw='孩子上嘴唇有一条线断裂，有出血，去了医院，医生说没事，但牙齿需要观察。'
  await page.getByLabel('对话输入').fill(raw);await page.getByRole('button',{name:'发送',exact:true}).click()
  const started=Date.now()
  const readiness=await Promise.race([
    page.getByRole('button',{name:'核对记录',exact:true}).waitFor({state:'visible',timeout:100000}).then(()=>'ready'),
    page.getByText('这次没有整理成功',{exact:true}).waitFor({state:'visible',timeout:100000}).then(()=>'failed'),
  ])
  if(readiness==='failed'){
    const job=await api(`/api/members/${memberId}/recognition-jobs`)
    result.modelFailure={code:job.error?.code??'UNKNOWN',message:job.error?.message??'',rawRetained:await page.locator('.nurse-turn--user').last().locator('.nurse-turn-content').innerText()===raw}
    throw new Error(`Real recognition unavailable: ${result.modelFailure.code}`)
  }
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
  result.recognitionMs=Date.now()-started
  assert.equal(await page.locator('.smart-record-page audio').count(),0)
  await page.getByRole('button',{name:'核对记录',exact:true}).click()
  await expect(page.locator('.smart-review-card')).toHaveCount(1)
  await expect(page.locator('.smart-review-card')).toContainText('没事')
  await expect(page.locator('.smart-review-card')).toContainText('观察')
  assert.equal(await page.locator('.smart-review-card').getByRole('button',{name:/删除/}).count(),0)
  await page.screenshot({path:`${out}/review.png`})
  const saving=page.waitForResponse(r=>/\/ai-drafts\/[^/]+\/save$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  const response=await saving;assert.ok(response.ok());const saved=await response.json()
  assert.equal(saved.result.count,1)
  result.provider=saved.generation?.provider;result.model=saved.generation?.model
  const records=await api(`/api/events/${saved.result.records[0].eventId}/records`)
  assert.equal(records.length,1);const record=records[0]
  assert.equal(record.journal.timePrecision,'exact');assert.equal(record.sourceText,raw)
  assert.ok(Date.now()-Date.parse(record.occurredAt)<180000)
  assert.match(record.content,/没事/);assert.match(record.content,/观察/)
  result.checks.push('real model single incident','doctor and followup preserved','live recording clock','text edit controls')
  await page.goto(base+'/health-events?view=month')
  const date=page.locator('.health-calendar__day[aria-current="date"]')
  await expect(date.getByRole('img',{name:'有新内容'})).toBeVisible()
  assert.equal(await page.getByRole('navigation',{name:'新记录'}).count(),0)
  await date.click()
  const sheet=page.locator('.calendar-day-sheet')
  await expect(sheet.locator('[data-day-record]')).toHaveCount(1)
  await expect(sheet).not.toContainText('个附件')
  const clock=new Date(record.occurredAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false})
  await expect(sheet.locator('time')).toHaveText(clock)
  for(const width of [320,375,390]){await page.setViewportSize({width,height:667});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await sheet.locator('strong').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap')}
  await page.screenshot({path:`${out}/calendar.png`})
  await sheet.getByRole('button',{name:'关闭当天记录',exact:true}).click()
  await expect(date.getByRole('img',{name:'有新内容'})).toHaveCount(0)
  result.checks.push('month day dot cleared on date open','single line calendar row','three mobile widths')
  assert.deepEqual(errors,[]);result.status='PASS'
}catch(error){result.status='FAILED';result.message=error.message;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1}
finally{
  if(memberId)await api(`/api/members/${memberId}`,'DELETE').then(()=>{result.cleanup='synthetic member removed'}).catch(()=>{result.cleanup='requires follow-up'})
  await writeFile(`${out}/acceptance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close()
}
