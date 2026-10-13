import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const [origin,commit]=process.argv.slice(2)
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(origin))
const environment=origin.includes('staging')?'staging':'production',output=`outputs/feedback-records/${environment}`
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})})
const context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',serviceWorkers:'block',ignoreHTTPSErrors:Boolean(process.env.HTTPS_PROXY)})
let token='',memberId='',accountId='';const timings={},errors=[]
const clientBuilds=new Set();const page=await context.newPage();page.on('request',r=>{const build=r.headers()['x-hoooho-client-build'];if(build)clientBuilds.add(build)});page.on('pageerror',error=>errors.push(error.message))
async function api(path,method='GET',data){const started=Date.now();const result=await context.request.fetch(origin+path,{method,data,timeout:90000,headers:{'Content-Type':'application/json','X-Hoooho-Timezone':'Asia/Shanghai',...(token?{Authorization:`Bearer ${token}`}:{})}});timings[path.replace(memberId||'__none__',':member')]=Date.now()-started;assert(result.ok(),`${method} ${path}: ${result.status()} ${await result.text()}`);return result.json()}
try{
 assert.equal((await api('/api/health')).status,'ok')
 const session=await api('/api/auth/register','POST',{nickname:`反馈验收${randomUUID().replaceAll('-','').slice(0,12)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token;accountId=session.user.id
 memberId=(await api('/api/members','POST',{name:'反馈线上验收（虚构）',birthday:'2025-01-01',gender:'female',relationship:'child'})).id
 await api('/api/auth/current-member','POST',{memberId})
 const raw='今天喝了配方奶，后来出现红屁股。'
 // One ordinary supplier extraction per environment, with no automatic retry.
 let draft,saved
 if(process.env.UI_ONLY==='1'){
  await api('/api/quick-records','POST',{memberId,content:raw,rawText:raw,title:'喂养',occurredAt:new Date().toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:['diet'],timePrecision:'exact'}})
  draft={generation:null};saved={result:{count:1}}
 }else{
 const draft=await api(`/api/members/${memberId}/ai-drafts`,'POST',{text:raw,task:'record',smartRecord:true,frontDeskRecord:true,selectedOccurredAt:new Date().toISOString(),timezone:'Asia/Shanghai'})
 assert.equal(draft.state,'ready');assert(draft.items.some(i=>i.fields.some(f=>/红屁股/.test(f.value))),'symptom source lost');assert(draft.items.some(i=>i.fields.some(f=>/配方奶/.test(f.value))),'feeding source lost')
 const saved=await api(`/api/members/${memberId}/ai-drafts/${draft.id}/save`,'POST',{version:draft.version,confirmed:true})
 }
 const index=await api(`/api/members/${memberId}/journal-index`)
 assert.equal(index.records.length,1);assert(index.records[0].journal.categories.includes('diet')&&index.records[0].journal.categories.includes('symptom')); assert(index.records.some(r=>r.journal.categories.includes('symptom')));assert(index.records.some(r=>r.journal.categories.includes('diet')))
 await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,accountId,memberId})
 const indexRequests=[],perEventRequests=[];page.on('request',r=>{if(r.url().includes('/journal-index'))indexRequests.push(r.url());if(/\/api\/events\/[^/]+\/(records|attachments)/.test(r.url()))perEventRequests.push(r.url())})
 await page.goto(origin+'/quick-search',{waitUntil:'domcontentloaded',timeout:60000});const button=page.getByRole('button',{name:'按住说话',exact:true});await expect(button).toBeEnabled({timeout:60000});await expect(button).toBeInViewport();assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(39, 51, 50)')
 await page.getByLabel('查找记录文字').fill('红屁股');await expect(page.locator('.journal-search-result').first()).toContainText('红屁股')
 await page.screenshot({path:`${output}/quick-search.png`})
 // Session restoration can refresh the token and repeat the scoped load.
 // Each load must be one index request, never one request per event/attachment.
 const lookupIndexRequests=indexRequests.length;assert(lookupIndexRequests>=1&&lookupIndexRequests<=2);assert.equal(perEventRequests.length,0)
 await page.goto(origin+'/health-events',{waitUntil:'domcontentloaded',timeout:60000});const day=new Date(index.records[0].occurredAt).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});await page.getByLabel('选择日期').fill(day)
 for(const category of ['feeding','symptom']){await page.getByLabel('筛选记录类型').selectOption(category);await expect(page.locator('.journal-record')).not.toHaveCount(0)}
 await page.screenshot({path:`${output}/symptom-filter.png`})
 const observedBuild=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/')).map(r=>r.name))
 assert.equal(errors.length,0);assert(clientBuilds.has(commit),'live client build differs from expected commit')
 const report={environment,commit,status:'PASS',supplierCalls:process.env.UI_ONLY==='1'?0:1,automaticRetries:0,recordCount:saved.result.count,categories:index.records.map(r=>r.journal.categories),generation:draft.generation,timings,indexRequests:lookupIndexRequests,perEventRequests:0,buttonColor:'rgb(39, 51, 50)',viewport:'375x667',errors,assetCount:observedBuild.length}
 await writeFile(`${output}/acceptance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{
 if(token&&memberId){const own=(await api('/api/members')).find(m=>m.id===memberId);if(own?.accountId===accountId&&own.name==='反馈线上验收（虚构）')await api(`/api/members/${memberId}`,'DELETE')}
 await browser.close()
}
