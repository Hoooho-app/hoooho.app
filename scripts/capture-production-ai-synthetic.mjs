// One future explicitly-authorized real request. Not executed by tests/build or
// the production server. Never copy a provider key to this browser or script.
import {chromium,devices} from '@playwright/test'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {syntheticFixtureId,syntheticText} from '../server/ai/business/synthetic-contract.mjs'
if(process.env.HOOOHO_SYNTHETIC_CAPTURE!=='ONE_CALL_AUTHORIZED')throw new Error('Disabled: a new one-call authorization is required')
const directory=new URL('../outputs/bailian-ai/synthetic-capture/',import.meta.url)
await mkdir(directory,{recursive:true})
const state=JSON.parse(await readFile(new URL('../outputs/bailian-ai/.acceptance-session.json',import.meta.url),'utf8'))
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,proxy:{server:'http://127.0.0.1:7890'}})
const context=await browser.newContext({...devices['iPhone SE'],timezoneId:'Asia/Shanghai',baseURL:'https://hoooho.com',storageState:state,serviceWorkers:'block'})
let token,memberId,draftId,modelOperationStarted=false
const result={startedAt:new Date().toISOString(),budget:1,automaticRetries:0,applicationGenerationRequests:0,cleanup:[]}
const api=async(url,method='GET',data)=>{
 const response=await context.request.fetch(url,{method,...(data?{data}:{}),headers:{Origin:'https://hoooho.com',...(token?{Authorization:`Bearer ${token}`}:{})},maxRetries:0})
 const body=await response.json().catch(()=>({}));if(!response.ok())throw Object.assign(new Error('Acceptance API failed'),{status:response.status(),code:body.error?.code});return body
}
try{
 const auth=await api('/api/auth/session');token=auth.token
 const member=await api('/api/members','POST',{name:'合成取证虚构人物',relationship:'child',gender:'male',birthday:'2020-01-01'});memberId=member.id
 await api('/api/auth/current-member','POST',{memberId})
 const page=await context.newPage()
 await page.addInitScript(({user,token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,currentMemberId:memberId,members:[],profile:null},version:5}))},{user:auth.user,token,memberId})
 await page.route('**/api/members/*/ai-drafts',async route=>{
  if(route.request().method()!=='POST')return route.continue()
  if(modelOperationStarted)return route.abort()
  const data=route.request().postDataJSON()
  if(data.text!==syntheticText||data.files?.length)return route.abort()
  modelOperationStarted=true;result.applicationGenerationRequests++
  await route.continue({postData:JSON.stringify({...data,task:'record',timezone:'Asia/Shanghai',syntheticReplay:syntheticFixtureId})})
 })
 await page.goto('/health-events');await page.getByRole('button',{name:'智能记录',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'智能整理记录',exact:true});await dialog.getByLabel('原始记录内容').fill(syntheticText)
 const waiting=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/api/members/${memberId}/ai-drafts`),{timeout:150000})
 await dialog.getByRole('button',{name:'整理成待确认记录',exact:true}).click()
 const response=await waiting,body=await response.json(),capture=body.syntheticReplay??body.error?.syntheticReplay
 result.httpStatus=response.status();result.code=body.error?.code??null;draftId=body.id??null
 // Capture only the server's fixed synthetic artifact, never the entire API
 // response, auth session, request headers or a user's clinical draft.
 if(capture?.fixtureId===syntheticFixtureId&&capture.sources?.length===1&&capture.sources[0].text===syntheticText){await writeFile(new URL('captured-response.json',directory),JSON.stringify(capture,null,2),{mode:0o600});result.captureStored=true;result.requestId=capture.requestId;result.validation=capture.validation??null}
 else result.captureStored=false
 if(!response.ok())await page.getByRole('alert').first().waitFor({state:'visible',timeout:4000}).catch(()=>{})
 const alert=page.getByRole('alert').first();if(await alert.count())await alert.scrollIntoViewIfNeeded().catch(()=>{})
 await page.screenshot({path:fileURLToPath(new URL('iphone-se-result.png',directory))})
 result.status=response.ok()?'RESPONSE_RECEIVED_NOT_FULL_BUSINESS_ACCEPTANCE':'FAIL_STOPPED'
}catch(error){result.status='FAIL_STOPPED';result.code=error.code??null;result.httpStatus=error.status??null;process.exitCode=1}
finally{
 if(memberId){
  if(!draftId){const latest=await api(`/api/members/${memberId}/ai-drafts`).catch(()=>null);draftId=latest?.id}
  if(draftId)try{await api(`/api/members/${memberId}/ai-drafts/${draftId}`,'DELETE');result.cleanup.push({kind:'synthetic-draft',deleted:true})}catch{result.cleanup.push({kind:'synthetic-draft',deleted:false})}
  try{await api(`/api/members/${memberId}`,'DELETE');result.cleanup.push({kind:'fictional-member',deleted:true})}catch{result.cleanup.push({kind:'fictional-member',deleted:false})}
 }
 result.completedAt=new Date().toISOString();await writeFile(new URL('safe-result.json',directory),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await context.close();await browser.close()
}
