import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const [origin,commit]=process.argv.slice(2)
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(origin))
assert(/^[a-f0-9]{40}$/.test(commit??''))
const target=origin.includes('staging')?'staging':'production',output=`.codex-tmp/care-release-${target}`
await mkdir(output,{recursive:true})
const proxyUrl=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null
const proxy=proxyUrl?{server:`${proxyUrl.protocol}//${proxyUrl.host}`,...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}:undefined
const browser=await chromium.launch({proxy,args:['--no-sandbox']})
const sessionFile=`/tmp/hoooho-care-release-${target}.json`
let saved;try{saved=JSON.parse(await readFile(sessionFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const context=await browser.newContext({baseURL:origin,...(saved?.storageState?{storageState:saved.storageState}:{}),viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),report={target,commit,physicalIPhone:'NOT_VERIFIED',checks:[],errors:[]},errors=[]
page.on('pageerror',e=>errors.push(e.message))
let token=saved?.token??'',memberId=''
async function api(path,method='GET',data){const res=await context.request.fetch(path,{method,data,headers:{...(token?{Authorization:`Bearer ${token}`}:{})},timeout:35000});const body=await res.json();if(!res.ok())throw new Error(`${method} ${path}: ${res.status()} ${body.error?.code??''}`);return body}
async function route(path){await page.goto(path,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await expect(page.locator('h1')).not.toHaveText('页面不存在');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${path}`)}
try{
 assert.equal((await api('/api/health')).status,'ok')
 if(!saved){const session=await api('/api/auth/register','POST',{nickname:`careqa${randomUUID().replaceAll('-','').slice(0,10)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token;saved={token,accountId:session.user.id,storageState:await context.storageState()};await writeFile(sessionFile,JSON.stringify(saved),{mode:0o600})}
 const runtime=await api('/api/ai/audio/capabilities');assert.equal(runtime.runtime.commit,commit)
 memberId=(await api('/api/members','POST',{name:'呵护验收（虚构）',relationship:'child',birthday:'2023-01-01',gender:'female'})).id
 await api('/api/auth/current-member','POST',{memberId})
 await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,accountId:saved.accountId,memberId})
 const before=await api('/api/care-journey'),first=await api('/api/care-journey/check-in','POST',{}),second=await api('/api/care-journey/check-in','POST',{})
 assert.equal(first.balance-before.balance,before.today.checkedIn?0:1);assert.equal(second.balance,first.balance)
 const material=await api('/api/care-journey/task-material?type=knowledge&memberId='+memberId)
 await page.waitForTimeout(3100)
 const done=await api('/api/care-journey/task-material/confirm','POST',{materialId:material.id})
 assert.equal(done.today.task.completed,true)
 report.checks.push('exact deployed commit','real authenticated account/member','idempotent daily check-in','server-backed knowledge task')
 for(const path of ['/nurse-station','/care-journey','/care-journey/sprouts','/care-journey/exchange','/care-journey/growth','/care-journey/achievements','/care-journey/themes','/care-tools/food-comparison','/care-tools/handoff','/care-tools/medication-templates','/care-tools/results','/family-sharing','/health-profile/vaccination/plan']){
  await route(path);await page.screenshot({path:`${output}/${path.replaceAll('/','_')}.png`});report.checks.push(path)
 }
 await route('/nurse-station');await expect(page.getByRole('button',{name:'呵护之旅',exact:true})).toBeVisible()
 const color=await page.locator('.nurse-station-care-entry').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(color,'rgb(235, 239, 230)')
 await page.getByRole('button',{name:'呵护之旅',exact:true}).click();await expect(page).toHaveURL(/care-journey/)
 await expect(page.locator('.care-journey-sprout-surface').first()).toBeVisible()
 for(const width of [320,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/journey-${width}.png`})}
 assert.equal((await api('/api/care-journey/entitlements')).commercializationReady,false)
 assert.deepEqual(errors,[]);report.checks.push('home icon and pale-green background','320/390 mobile widths','existing free capabilities not paywalled');report.status='PASS'
}catch(e){report.status='FAILED';report.errors.push(e.message);await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});process.exitCode=1}
finally{if(memberId){try{await api('/api/members/'+memberId,'DELETE');report.cleanup='synthetic member removed'}catch(e){report.errors.push(e.message);report.status='FAILED';process.exitCode=1}}report.errors.push(...errors);await writeFile(`${output}/acceptance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close()}
