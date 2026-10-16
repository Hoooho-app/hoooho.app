import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import sharp from 'sharp'
const match=/^verify (staging|production) ([a-f0-9]{40})$/.exec(process.argv[2]??'')
assert.ok(match,'An exact release target and SHA are required')
const [,target,sha]=match,base=target==='staging'?'https://hooohoapp-staging.up.railway.app':'https://hoooho.com',out=`outputs/recognition-release/${target}`
await mkdir(out,{recursive:true})
const browser=await chromium.launch(),context=await browser.newContext({baseURL:base,viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'}),page=await context.newPage(),errors=[],result={target,sha,checks:[],status:'RUNNING',realIPhoneSafari:'NOT_VERIFIED'}
page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message.slice(0,120)))
let token,memberId
async function api(route,method='GET',data){const response=await context.request.fetch(route,{method,headers:{'Content-Type':'application/json',Origin:base,...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{data}),timeout:30000});assert.ok(response.ok(),`${method} ${route.replace(/[a-f0-9-]{30,}/g,':id')} HTTP ${response.status()}`);return response.json()}
try{
 assert.equal((await api('/api/health')).status,'ok');result.checks.push('health')
 const htmlResponse=await context.request.get('/'),html=await htmlResponse.text();assert.equal(htmlResponse.status(),200)
 const entry=/<script[^>]*\bsrc="([^"]+)"/.exec(html)?.[1];assert.ok(entry,'Built entry required')
 const bundle=await(await context.request.get(entry)).text();assert.ok(bundle.includes(sha),'Deployed UI must contain the exact release SHA');result.checks.push('exact UI build SHA')
 const unauth=await context.request.get('/api/members/release-check-no-member/recognition-jobs');assert.equal(unauth.status(),401);result.checks.push('job authorization boundary')
 if(target==='production'){
   await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'欢迎使用 Hoooho',exact:true})).toBeVisible({timeout:30000});await expect(page.getByRole('tab',{name:'登录',exact:true})).toBeVisible();await expect(page.getByText('正在恢复使用状态…',{exact:true})).toHaveCount(0);await page.screenshot({path:`${out}/public-entry.png`});result.checks.push('public login fully rendered; no production health data written')
 }else{
   const session=await api('/api/auth/register','POST',{nickname:`recqa${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
   memberId=(await api('/api/members','POST',{name:'识别发布验收（合成）',relationship:'child'})).id;await api('/api/auth/current-member','POST',{memberId})
   const capabilities=await api('/api/ai/audio/capabilities');assert.equal(capabilities.runtime.commit,sha);result.checks.push('exact API runtime SHA')
   await page.addInitScript(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId,accountId:session.user.id})
   await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByLabel('对话输入').fill('今天测到体温38.2度。')
   const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST'),started=Date.now();await page.getByRole('button',{name:'发送',exact:true}).click();const response=await accepted;assert.equal(response.status(),202);const initial=await response.json();result.acceptedMs=Date.now()-started
   await expect(page.getByTestId('recognition-progress')).toHaveCount(1);await page.screenshot({path:`${out}/live-progress.png`})
   await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.getByRole('button',{name:'保存草稿并退出',exact:true})).toBeEnabled();await page.getByRole('button',{name:'保存草稿并退出',exact:true}).click()
   await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字',exact:true}).click()
   let snapshot;for(let i=0;i<120;i++){snapshot=await api(`/api/members/${memberId}/recognition-jobs/${initial.id}`);if(['ready','needs_review','failed','paused'].includes(snapshot.state))break;await new Promise(r=>setTimeout(r,1000))}
   result.taskState=snapshot.state;result.readyMs=Date.now()-started;assert.equal(snapshot.id,initial.id);assert.ok(['ready','needs_review'].includes(snapshot.state),`Live task ended ${snapshot.state}: ${snapshot.error?.code??'unknown'}`);assert.equal(snapshot.inputRevision,snapshot.resultRevision)
   await expect(page.getByRole('button',{name:/^核对 \d+ 条记录$/})).toBeEnabled({timeout:30000});assert.ok(!/已记录|已保存/.test(await page.locator('.nurse-turn--assistant').allTextContents().then(parts=>parts.join('\n'))),'Unconfirmed acknowledgement must not claim a formal save');result.checks.push('unconfirmed acknowledgement');await page.screenshot({path:`${out}/live-ready.png`});result.checks.push('live supplier task','202 durable acceptance','leave and exact recovery','single true progress','latest review actions')
   for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}result.checks.push('320/390/430 mobile widths')
   const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer(),upload=await context.request.post(`/api/members/${memberId}/recognition-assets?name=synthetic.png`,{headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},data:bytes});assert.equal(upload.status(),201);assert.equal((await upload.json()).hash,createHash('sha256').update(bytes).digest('hex'));result.checks.push('binary private original upload')
   const cancelledId=randomUUID();await api(`/api/members/${memberId}/recognition-jobs/${cancelledId}/commands`,'POST',{id:randomUUID(),type:'discard'});const late=await context.request.post(`/api/members/${memberId}/recognition-jobs`,{headers:{Authorization:`Bearer ${token}`},data:{id:cancelledId,mode:'front',input:{id:randomUUID(),kind:'text',text:'迟到的合成上传',assetIds:[]},options:{}}});assert.equal(late.status(),409);result.checks.push('cancel-before-create fence')
 }
 assert.deepEqual(errors,[]);result.status='PASS'
}catch(error){result.status='FAILED';result.reason=String(error.message).slice(0,300);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1}
finally{
 if(token&&memberId){try{await api(`/api/members/${memberId}`,'DELETE');result.cleanup='synthetic member, task, transcript and original files removed'}catch{result.cleanup='FAILED';result.status='FAILED';process.exitCode=1}await api('/api/auth/logout','POST',{}).catch(()=>{})}
 await writeFile(`${out}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close()
}
