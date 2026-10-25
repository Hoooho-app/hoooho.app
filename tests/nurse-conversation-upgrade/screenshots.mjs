import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import path from 'node:path'

// Restore only identities of an existing real server job. The page must fetch
// its actual messages, candidates and save receipt; no success UI is injected.
export function recoveryCheckpoint(job,now=Date.now()){
 const context=job.frontDesk?.context
 assert(job.id&&context?.id&&context.version&&job.operationReceipt?.state==='saved','NO_REAL_JOB_FOR_BROWSER_RECOVERY')
 return {metadata:{text:'',occurredAt:new Date(now+8*3600000).toISOString().slice(0,16),timeUnknown:false,requestId:context.id,updatedAt:now,recognitionJobId:job.id,frontContextId:context.id,frontContextVersion:context.version},files:[],pendingVoice:null}
}
export async function captureSavedFlow({base,output,kind,job,guides,token,user,member,cookies=[],browserTestDouble}){
 const origin=new URL(base).origin;assert(new URL(base).hostname==='127.0.0.1','Only isolated loopback app screenshots accepted')
 // run-flow never supplies browserTestDouble; dependency injection is only for
 // unit assertions and cannot be selected with a CLI flag or environment value.
 const {chromium,devices}=browserTestDouble??await import('@playwright/test'),preset=devices['iPhone SE'];assert(preset,'Missing exact iPhone SE preset')
 const launch={headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'})}
 let browser,page
 const result={status:'RUNNING',emulatedDevice:'iPhone SE',browser:'background headless Chrome',physicalDevice:'NOT_RUN',screenshots:[],checks:[],pageErrors:[],failedResponses:[],unexpectedInferenceRequests:[],blockedExternalHosts:[]}
 try{
  browser=await chromium.launch(launch)
  const context=await browser.newContext({...preset,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
  if(cookies.length)await context.addCookies(cookies.map(([name,value])=>({name,value,url:origin,httpOnly:true,sameSite:'Lax'})))
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(!['data:','blob:'].includes(url.protocol)&&url.origin!==origin){result.blockedExternalHosts.push(url.hostname);await route.abort();return}
   if(request.method()==='POST'&&/\/recognition-jobs$|\/front-desk-record$|\/ai-drafts$|\/ai\/audio\//u.test(url.pathname)){result.unexpectedInferenceRequests.push({method:request.method(),path:url.pathname});await route.abort();return}
   await route.continue()
  })
  await context.addInitScript(({token,user,member,checkpoint})=>{
   sessionStorage.setItem('hoooho-auth-token',token)
   localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,authStatus:'authenticated',currentMemberId:member.id,members:[member],profile:null},version:5}))
   const marker=`hoooho-eval-flow-recovered:${user.id}:${member.id}:${checkpoint.metadata.recognitionJobId}`
   if(!sessionStorage.getItem(marker)){sessionStorage.setItem(`hoooho-capture-checkpoint:home-smart:${user.id}:${member.id}:new`,JSON.stringify(checkpoint));sessionStorage.setItem(marker,'1')}
  },{token,user,member,checkpoint:recoveryCheckpoint(job)})
  page=await context.newPage();page.setDefaultTimeout(30000)
  page.on('pageerror',error=>result.pageErrors.push(error.name))
  page.on('response',response=>{if(response.status()>=500)result.failedResponses.push({status:response.status(),path:new URL(response.url()).pathname})})
  const html=await (await context.request.get(origin+'/')).body();result.entryHtmlSha256=createHash('sha256').update(html).digest('hex')
  await page.goto(origin+'/nurse-station',{waitUntil:'domcontentloaded'})
  const guide=guides[0],bubble=page.locator(`.smart-record-saved[data-save-id=${JSON.stringify(guide.id)}]`)
  await bubble.waitFor({state:'visible'})
  assert.equal(await bubble.locator('p').innerText(),guide.text)
  await bubble.getByRole('button',{name:'查看记录',exact:true}).waitFor({state:'visible'})
  await bubble.getByRole('button',{name:'知道了',exact:true}).waitFor({state:'visible'})
  await bubble.scrollIntoViewIfNeeded()
  result.viewport=await page.evaluate(()=>({width:window.innerWidth,height:window.innerHeight,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??1}))
  assert(result.viewport.scrollWidth<=result.viewport.width,'HORIZONTAL_OVERFLOW')
  for(const name of ['查看记录','知道了']){const box=await bubble.getByRole('button',{name,exact:true}).boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=result.viewport.width&&box.y+box.height<=result.viewport.height,'SAVED_BUTTON_OUTSIDE_SCREENSHOT')}
  const file=path.join(output,`${kind}-saved-iphone-se.png`);await page.screenshot({path:file,fullPage:false});result.screenshots.push(file);result.checks.push('real server receipt restored by page','exact saved guide and two unified buttons','iPhone SE preset without horizontal overflow')
  let input=page.getByLabel('对话输入')
  if(!await input.count()){const mode=page.getByRole('button',{name:'改用文字',exact:true});if(await mode.count())await mode.click()}
  input=page.getByLabel('对话输入');const unsent='未提交输入：返回后保留。';await input.fill(unsent)
  await bubble.getByRole('button',{name:'查看记录',exact:true}).click()
  const expected=new URL(guide.url,origin)
  await page.waitForURL(url=>url.pathname===expected.pathname&&[...expected.searchParams].every(([key,value])=>url.searchParams.get(key)===value))
  result.openedUrl=page.url();result.checks.push('view opened exact original record/profile ID')
  await page.goBack();await page.getByLabel('对话输入').waitFor({state:'visible'});assert.equal(await page.getByLabel('对话输入').inputValue(),unsent)
  const restored=page.locator(`.smart-record-saved[data-save-id=${JSON.stringify(guide.id)}]`);await restored.waitFor({state:'visible'})
  const before=page.url();await restored.getByRole('button',{name:'知道了',exact:true}).click();assert.equal(page.url(),before)
  assert.equal(await restored.getByRole('button',{name:'知道了',exact:true}).count(),0);assert.equal(await page.getByLabel('对话输入').inputValue(),unsent)
  result.checks.push('return preserved unsent input','dismiss stayed in chat and preserved input')
  assert.equal(result.pageErrors.length,0,'BROWSER_PAGE_ERROR');assert.equal(result.failedResponses.length,0,'BROWSER_SERVER_ERROR');assert.equal(result.unexpectedInferenceRequests.length,0,'BROWSER_TRIED_NEW_INFERENCE')
  result.status='PASS'
 }catch(error){result.status='FAIL';result.errorCode=error.code??error.message;if(page){const file=path.join(output,`${kind}-browser-failure-iphone-se.png`);try{await page.screenshot({path:file,fullPage:false});result.screenshots.push(file)}catch{}}}
 finally{await browser?.close()}
 return result
}
