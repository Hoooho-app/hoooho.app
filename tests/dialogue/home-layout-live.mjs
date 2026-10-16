import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const base=process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hooohoapp-production.up.railway.app','https://hoooho.com'].includes(base))
const target=base.includes('-staging.')?'staging':'production',out=`outputs/home-layout/${target}`
await mkdir(out,{recursive:true})
const proxy=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null
const browser=await chromium.launch({args:['--no-sandbox'],...(proxy?{proxy:{server:proxy.origin,...(proxy.username?{username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password)}:{})}}:{})})
const context=await browser.newContext({baseURL:base,viewport:{width:375,height:667},timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000)
let token,memberId
const savedIds=[]
const result={target,checks:[],errors,syntheticOnly:true,physicalIPhoneSafari:'NOT_VERIFIED'}
async function api(path,method='GET',data){
 const value=await page.evaluate(async({path,method,data,token})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(45000)});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)}},{path,method,data,token})
 assert.ok(value.ok,`${method} ${path}: ${value.status} ${value.data?.error?.code??''}`);return value.data
}
try{
 await page.goto('/api/health');assert.equal((await api('/api/health')).status,'ok')
 const session=await api('/api/auth/register','POST',{nickname:`homeqa${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
 memberId=(await api('/api/members','POST',{name:'首页验收（虚构）',relationship:'child'})).id
 await api('/api/auth/current-member','POST',{memberId})
 await page.evaluate(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId,accountId:session.user.id})
 const original=await api(`/api/members/${memberId}/case-records`,'POST',{text:'头皮发痒，反复抓挠',occurredAt:new Date(Date.now()-60000).toISOString(),requestId:randomUUID(),files:[],journal:{categories:['symptom']}});savedIds.push(original.eventId)
 await page.goto('/nurse-station')
 await expect(page.getByRole('region',{name:'症状事件'})).toContainText('头皮发痒，反复抓挠')
 await expect(page.locator('.home-symptom-meta')).toContainText('最近记录')
 await expect(page.getByRole('region',{name:'症状合并建议'})).toHaveCount(0)
 for(const size of [{width:375,height:667},{width:393,height:852}]){
  await page.setViewportSize(size)
  const journal=await page.locator('.home-flow-card.nurse-home-dialogue').boundingBox()
  const metrics=await page.locator('.nurse-station-scroll').evaluate(el=>({overflow:el.scrollHeight>el.clientHeight+1,bottom:el.getBoundingClientRect().bottom,padding:parseFloat(getComputedStyle(el).paddingBottom)}))
  assert.ok(!metrics.overflow,JSON.stringify(metrics));assert.ok(metrics.bottom-journal.y-journal.height<=metrics.padding+2)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:`${out}/home-${size.width}.png`})
 }
 result.checks.push('SE and taller home responsive layout','saved symptom details','no home merge prompt')
 await page.getByRole('button',{name:'情况单',exact:true}).click();await expect(page).toHaveURL(/\/visit-summary/);result.checks.push('situation sheet route')
 await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字'}).click()
 await page.getByLabel('对话输入').fill('今天头皮发痒，反复抓挠。请记下来。')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.getByRole('button',{name:'直接记录',exact:true}).last().click()
 const prompt=page.getByRole('region',{name:'症状合并建议'})
 await expect(prompt).toBeVisible();await expect(prompt).toContainText('原文、图片和时间都会保留')
 const before=await api(`/api/members/${memberId}/cases`);for(const item of before.active)savedIds.push(item.event.id)
 await page.screenshot({path:`${out}/smart-merge.png`})
 await prompt.getByRole('button',{name:'合并到该事件',exact:true}).click();await expect(prompt).toHaveCount(0)
 const after=await api(`/api/members/${memberId}/cases`)
 assert.equal(after.active.length,1);assert.equal(after.active[0].followup.recordCount,2)
 assert.equal((await api(`/api/members/${memberId}/cases/${after.active[0].event.id}/records`)).length,2)
 result.checks.push('real smart-record save with inline merge','two originals retained after confirmed merge')
 await page.goto('/nurse-station');await expect(page.getByRole('region',{name:'症状事件'})).toContainText('1 项')
 assert.deepEqual(errors,[]);result.status='PASS'
}catch(error){result.status='FAILED';result.message=error.message;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1}
finally{
 if(token&&memberId){for(const id of new Set(savedIds))await api(`/api/events/${id}`,'DELETE').catch(()=>{});await api(`/api/members/${memberId}`,'DELETE').then(()=>{result.cleanup='synthetic member removed'}).catch(()=>{result.cleanup='needs follow-up'})}
 await writeFile(`${out}/smoke.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close()
}
