// Opt-in live acceptance: isolated synthetic member only, no AI or real records.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,devices,expect} from '@playwright/test'
const target=process.env.HOOOHO_STATE_ACTION_TARGET
if(!['staging','production'].includes(target)||process.env.RUN_HOOOHO_STATE_ACTION_LIVE!=='1')throw Error('Explicit live target required')
const base=target==='production'?'https://hoooho.com':'https://hooohoapp-staging.up.railway.app'
const output=`outputs/case-state-actions/${target}`
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context=await browser.newContext({...devices['iPhone SE'],timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage();page.setDefaultTimeout(45000)
const result={url:base,startedAt:new Date().toISOString(),checks:{},cleanup:{},runtimeErrors:0,serverErrors:0,physicalIPhoneSafari:'NOT_VERIFIED'}
page.on('pageerror',()=>result.runtimeErrors++)
const assets=new Set()
page.on('response',r=>{if(r.url().startsWith(base)){if(r.status()>=500)result.serverErrors++;if(/\/assets\/.*\.(js|css)$/.test(r.url()))assets.add(r.url())}})
let token,memberId,registered=false
async function api(url,data,method='POST'){
  const response=await page.evaluate(async({url,data,method,token})=>{const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Hoooho-Timezone':'Asia/Shanghai',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(45000)});return {status:r.status,body:await r.json()}},{url:base+url,data,method,token})
  if(response.status>=400)throw Object.assign(Error('Acceptance API failed'),{safe:{status:response.status,code:response.body?.error?.code}})
  return response.body
}
try{
  await page.goto(base+'/api/health');assert.equal((await api('/api/health',undefined,'GET')).status,'ok');result.checks.health='PASS'
  await page.goto(base+'/login');await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill('布局验收'+randomUUID().slice(0,8));await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registration=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'注册并进入',exact:true}).click();const r=await registration
  if(!r.ok()){const reason=await r.json();throw Object.assign(Error('Registration unavailable'),{safe:{status:r.status(),code:reason?.error?.code,retryAfter:reason?.error?.retryAfter}})}
  registered=true;token=(await api('/api/auth/session',undefined,'GET')).token;assert.ok(token)
  memberId=(await api('/api/members',{name:'合成布局验收，非真实患者',relationship:'child',gender:'female',birthday:'2025-01-01'})).id
  await api('/api/auth/current-member',{memberId})
  const item=await api(`/api/members/${memberId}/case-records`,{text:'合成布局验收：没有标点的长症状描述用于确认完整换行且不与康复按钮重叠',files:[],occurredAt:new Date(Date.now()-86400000).toISOString(),requestId:randomUUID()})
  await page.goto(base+'/cases');const card=page.locator(`[data-case-id="${item.eventId}"]`)
  await expect(page.getByRole('heading',{name:'情况跟进',exact:true})).toBeVisible()
  async function position(name,width){
    await page.setViewportSize({width,height:667});const button=card.getByRole('button',{name,exact:true});await expect(button).toHaveCount(1)
    const title=await card.getByRole('heading',{level:2}).boundingBox(),action=await button.boundingBox(),box=await card.boundingBox()
    assert.ok(title&&action&&box);assert.ok(Math.abs(action.y-title.y)<=1);assert.ok(action.x>=title.x+title.width)
    assert.ok(Math.abs(box.x+box.width-17-action.x-action.width)<=1);assert.ok(action.height>=44)
    assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.screenshot({path:`${output}/${name==='恢复跟进'?'recovered':'active'}-${width}.png`,fullPage:true})
  }
  for(const width of [320,375,390,430])await position('标记已康复',width)
  result.checks.activeTopRightAndLongTitle='PASS_320_375_390_430'
  const before=(await api(`/api/events/${item.eventId}/records`,undefined,'GET')).map(r=>r.id).sort()
  await card.getByRole('button',{name:'标记已康复',exact:true}).click();await expect(card).toHaveCount(0)
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(card).toBeVisible()
  await card.getByRole('button',{name:'标记已康复',exact:true}).click();await expect(card).toHaveCount(0)
  await page.reload();await page.getByRole('tab',{name:/已康复/}).click();await expect(card).toContainText('用户标记康复')
  for(const width of [320,375,390,430])await position('恢复跟进',width)
  result.checks.recoveredTopRightAndLongTitle='PASS_320_375_390_430'
  await card.getByRole('button',{name:'恢复跟进',exact:true}).click();await expect(card).toHaveCount(0)
  await page.getByRole('tab',{name:/跟进中/}).click();await expect(card).toBeVisible();await page.reload();await expect(card).toBeVisible()
  assert.deepEqual((await api(`/api/events/${item.eventId}/records`,undefined,'GET')).map(r=>r.id).sort(),before)
  result.checks.recoverUndoRestorePersistenceAndRecordRetention='PASS'
  const deployed=await page.evaluate(async urls=>Promise.all(urls.map(async url=>{const r=await fetch(url);return {status:r.status,text:await r.text()}})),[...assets])
  assert.ok(deployed.length>0&&deployed.every(r=>r.status===200));assert.ok(deployed.some(r=>r.text.includes('case-followup-card-header')))
  if(process.env.HOOOHO_EXPECTED_COMMIT)assert.ok(deployed.some(r=>r.text.includes(process.env.HOOOHO_EXPECTED_COMMIT)))
  result.checks.liveAssets={state:'PASS',count:deployed.length,expectedCommit:process.env.HOOOHO_EXPECTED_COMMIT??'CLI_CANDIDATE_SOURCE_VERIFIED_SEPARATELY'}
  assert.equal(result.runtimeErrors,0);assert.equal(result.serverErrors,0)
}catch(error){result.failure=error.safe??{name:error.name,message:String(error.message).slice(0,300)};process.exitCode=1;await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{})}
finally{
  if(memberId)await api(`/api/members/${memberId}`,undefined,'DELETE').then(()=>result.cleanup.syntheticMember='REMOVED').catch(()=>result.cleanup.syntheticMember='FAILED')
  result.cleanup.syntheticAccount=registered?'RETAINED_NO_IDENTITY_DELETION_BYPASS':'NOT_CREATED'
  result.finishedAt=new Date().toISOString();result.gate=!result.failure&&result.cleanup.syntheticMember==='REMOVED'?'PASS':'FAIL'
  if(result.gate!=='PASS')process.exitCode=1
  await writeFile(`${output}/verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await context.close();await browser.close()
}
