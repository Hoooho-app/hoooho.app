import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const base=process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(base))
const target=base.includes('-staging.')?'staging':'production',out=`outputs/followup-recording/${target}`
await mkdir(out,{recursive:true})
const proxyUrl=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox'],...(proxyUrl?{proxy:{server:proxyUrl.origin,...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}}:{})})
const context=await browser.newContext({baseURL:base,viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[],created=[]
page.on('pageerror',e=>errors.push(e.message))
page.setDefaultTimeout(20000)
let token,memberId
async function api(path,method='GET',data){
 const result=await page.evaluate(async({path,method,data,token})=>{const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(30000)});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)}},{path,method,data,token})
 assert.ok(result.ok,`${method} ${path}: HTTP ${result.status}, ${result.data?.error?.code??'unknown'}`)
 return result.data
}
const result={target,checks:[],syntheticOnly:true,realIPhoneHaptics:'NOT_VERIFIED',errors}
try{
 await page.goto('/api/health');assert.equal((await api('/api/health')).status,'ok');result.checks.push('health')
 const session=await api('/api/auth/register','POST',{nickname:`followupqa${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
 const member=await api('/api/members','POST',{name:'合并验收（虚构资料）',relationship:'child'});memberId=member.id
 await api('/api/auth/current-member','POST',{memberId})
 await page.evaluate(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId,accountId:session.user.id})
 for(const text of ['颈部发痒','颈部皮疹'])created.push(await api(`/api/members/${memberId}/case-records`,'POST',{text,occurredAt:new Date(Date.now()-60000).toISOString(),requestId:randomUUID(),files:[],journal:{categories:['symptom']}}))
 await page.goto('/nurse-station');await expect(page.locator('.home-event-descriptions>li')).toHaveCount(1)
 await page.getByRole('button',{name:'合并这两项',exact:true}).click()
 const sheet=page.getByRole('dialog',{name:'合并情况'});await expect(sheet).toContainText('原文、图片和时间都会保留')
 for(const width of [320,375,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await page.screenshot({path:`${out}/merge.png`})
 await sheet.getByRole('button',{name:'确认合并',exact:true}).click();await expect(sheet).toHaveCount(0)
 await expect(page.locator('.home-event-descriptions')).toContainText('皮疹伴瘙痒')
 await expect(page.getByRole('button',{name:/^症状跟进/}).getByRole('img',{name:'有新内容'})).toBeVisible()
 await page.getByRole('button',{name:/^症状跟进/}).click();await page.getByRole('button',{name:'展开',exact:true}).click()
 await expect(page.locator('.case-followup-timeline li')).toHaveCount(2)
 const cases=await api(`/api/members/${memberId}/cases`);assert.equal(cases.active.length,1);assert.equal(cases.active[0].followup.recordCount,2)
 for(const saved of created){const records=await api(`/api/events/${saved.eventId}/records`);assert.ok(records.some(r=>r.id===saved.recordId))}
 result.checks.push('explicit merge','original records retained','group timeline','symptom unread readback')
 await page.goto('/health-profile/surgery');await page.getByRole('button',{name:'新增',exact:true}).click();await page.getByLabel('手术名称或描述',{exact:true}).fill('虚构验收资料');await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect(page.locator('.inline-profile-item')).toContainText('虚构验收资料');await page.getByRole('button',{name:'返回',exact:true}).click()
 const menu=page.getByRole('button',{name:'打开菜单',exact:true});await expect(menu.getByRole('img',{name:'有新内容'})).toBeVisible();await menu.click()
 await expect(page.getByRole('navigation',{name:'侧边栏导航'}).getByRole('button',{name:/孩子档案/}).getByRole('img',{name:'有新内容'})).toBeVisible()
 await page.screenshot({path:`${out}/drawer.png`});await page.getByRole('navigation',{name:'侧边栏导航'}).getByRole('button',{name:/孩子档案/}).click()
 await page.getByRole('button',{name:/手术史/}).click();await page.getByRole('navigation',{name:'新记录'}).getByRole('button',{name:/查看记录/}).click()
 await expect(page.getByRole('navigation',{name:'新记录'})).toHaveCount(0);result.checks.push('profile unread chain')
 await page.goto('/smart-record?source=front-desk');await expect(page.locator('.hoho-hold-to-talk')).toBeVisible()
 await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('尚未发送的虚构观察')
 await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:'保存草稿并退出',exact:true}).click()
 await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字'}).click();await expect(page.getByLabel('对话输入')).toHaveValue('尚未发送的虚构观察')
 await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:'不保存并退出',exact:true}).click()
 await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字'}).click();await expect(page.getByLabel('对话输入')).toHaveValue('')
 result.checks.push('unified voice component','save draft','discard draft')
 assert.deepEqual(errors,[]);result.status='PASS'
}catch(error){result.status='FAILED';result.message=error.message;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error}
finally{
 if(token&&memberId){for(const saved of created)await api(`/api/events/${saved.eventId}`,'DELETE').catch(()=>{});const sections=await api('/api/auth/profile-sections').catch(()=>[]);for(const section of sections.filter(s=>s.memberId===memberId))await api('/api/auth/profile-sections','POST',{memberId,sectionId:section.sectionId,revision:section.revision,records:[]}).catch(()=>{});await api(`/api/members/${memberId}`,'DELETE').then(()=>{result.cleanup='synthetic member and records removed'}).catch(()=>{result.cleanup='requires follow-up'})}
 await writeFile(`${out}/smoke.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close()
}
