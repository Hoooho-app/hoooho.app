// Explicit opt-in. Public labels and a fresh fictional child, no real patient data.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium,devices,expect} from '@playwright/test'
if(process.env.RUN_FOOD_LABEL_ACCEPTANCE!=='1')throw new Error('Explicit acceptance opt-in required')
const target=process.env.FOOD_LABEL_TARGET??'staging'
assert.ok(['staging','production','local'].includes(target))
const base=target==='production'?'https://hoooho.com':target==='staging'?'https://hooohoapp-staging.up.railway.app':process.env.FOOD_LABEL_LOCAL_URL??'http://127.0.0.1:4219'
const output=path.resolve(`.codex-tmp/food-label-release/${target}`);await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',...(process.env.FOOD_LABEL_PROXY?{proxy:{server:process.env.FOOD_LABEL_PROXY}}:{})})
const context=await browser.newContext({...devices['iPhone SE'],serviceWorkers:'block'})
const page=await context.newPage();let token,memberId,revision=0
let upstreamCalls=0,successfulCalls=0;const errors=[],runtimeErrors=[]
page.on('pageerror',error=>runtimeErrors.push(error.name))
async function api(url,data,method='POST'){
  const response=await context.request.fetch(base+url,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{data}),timeout:130000,maxRetries:0})
  const body=await response.json();assert.ok(response.ok(),`API ${url}: ${response.status()} ${body.error?.code??''}`);return body
}
async function scan(filename,supplement=false){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/food-label/check'&&r.request().method()==='POST',{timeout:135000})
  await page.locator(supplement?'input[capture=environment]':'input[type=file][multiple]').setInputFiles(path.resolve(`.codex-tmp/food-label-evidence/${filename}`))
  const response=await pending,body=await response.json();if(!response.ok())errors.push(body.error?.code??`HTTP_${response.status()}`);assert.ok(response.ok(),`Food API ${response.status()} ${body.error?.code??''}`)
  assert.match(response.headers()['cache-control'],/no-store/);upstreamCalls+=body.diagnostics.calls;successfulCalls+=body.diagnostics.successfulCalls;errors.push(...body.diagnostics.errorCodes)
  assert.ok(body.ingredients.length>=16);await expect(page.locator('.food-label-ingredients li')).toHaveCount(body.ingredients.length)
  await expect(page.locator('.food-label-ingredients .hoho-health-tag')).toHaveCount(body.conflictCount)
  await expect(page.getByText(/标签未读完整|本次未完整核对|项待确认|暂不能排除遗漏|放心食用/)).toHaveCount(0)
  // Evidence is limited to public packaging and this script's fictional profile.
  console.log(JSON.stringify({target,sample:filename,supplement,publicLabelRows:body.ingredients.map(({original,chinese,english,sourceLanguage,status})=>({original,chinese,english,sourceLanguage,status})),diagnostics:body.diagnostics}))
  return body
}
async function screenshot(name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,name+'.png')})}
try{
  assert.equal((await context.request.get(base+'/api/health')).status(),200)
  await page.goto(base+'/login');await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill('标签验收'+randomUUID().slice(0,8));await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST');await page.getByRole('button',{name:'注册并进入'}).click();const registration=await registered
  if(!registration.ok()){const body=await registration.json();console.log(JSON.stringify({target,registrationStatus:registration.status(),code:body.error?.code,retryAfter:registration.headers()['retry-after']??body.error?.retryAfter??body.error?.details?.retryAfter??body.retryAfter}));errors.push(body.error?.code??'REGISTRATION_FAILED')}
  assert.ok(registration.ok(),'Acceptance registration unavailable')
  const session=await api('/api/auth/session',undefined,'GET');token=session.token;assert.ok(token)
  memberId=(await api('/api/members',{name:'合成食品验收非真实儿童',relationship:'child',birthday:'2025-01-01',gender:'female'})).id
  await api('/api/auth/current-member',{memberId})
  const section=await api('/api/auth/profile-sections',{memberId,sectionId:'allergy',revision,records:[{id:'synthetic-milk',memberId,name:'牛奶',category:'food',currentStatus:'confirmed'},{id:'synthetic-egg',memberId,name:'鸡蛋',category:'food',currentStatus:'suspected'}]});revision=section.revision
  await page.goto(base+'/nurse-station');const entry=page.locator('a[href="/food-label"]');await expect(entry).toBeVisible();await entry.scrollIntoViewIfNeeded();await screenshot('home');await entry.click();await expect(page.getByRole('heading',{name:'配料表扫描',exact:true})).toBeVisible();await page.locator('.food-label-hero').evaluate(img=>img.decode());await screenshot('entry')
  const english=await scan('english-oreo.jpg');await screenshot('english-result');await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded();await screenshot('english-bottom')
  const supplemented=await scan('english-oreo.jpg',true);assert.deepEqual(supplemented.ingredients.map(r=>r.original),english.ingredients.map(r=>r.original));await expect(page.locator('.food-label-photos img')).toHaveCount(2)
  await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.getByRole('button',{name:'拍摄配料表',exact:true})).toBeVisible()
  const chinese=await scan('chinese-label-crop.png');assert.ok(chinese.conflictCount>0);await screenshot('chinese-result');await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded();await expect(page.locator('.food-label-ingredients li').last()).toBeVisible();await screenshot('chinese-bottom')
  await expect(page.locator('.food-label-translation')).toHaveCount(0)
  await page.evaluate(accountId=>{const settings=JSON.parse(localStorage.getItem('hoooho-settings')??'{"state":{"accounts":{}},"version":1}');settings.state.accounts??={};settings.state.accounts[accountId]={interfaceLanguage:'en-US'};localStorage.setItem('hoooho-settings',JSON.stringify(settings))},session.user.id)
  await page.reload();await expect(page.getByRole('heading',{name:'Ingredient scan',exact:true})).toBeVisible()
  const englishUI=await scan('english-oreo.jpg');await expect(page.locator('.food-label-translation')).toHaveCount(0)
  await page.getByRole('button',{name:'返回',exact:true}).click()
  const chineseUI=await scan('chinese-label-crop.png');assert.ok(chineseUI.ingredients.every(r=>r.english));await expect(page.locator('.food-label-translation')).toHaveCount(chineseUI.ingredients.length);await screenshot('english-ui-chinese-result')
  const after=await api('/api/auth/profile-sections',undefined,'GET');assert.deepEqual(after.find(s=>s.memberId===memberId&&s.sectionId==='allergy'),section,'recognition must not mutate allergy history')
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert.ok(!stored.includes('data:image')&&!stored.includes('UNBLEACHED'))
  await page.reload();await expect(page.getByRole('button',{name:'Photograph ingredients',exact:true})).toBeVisible()
  assert.equal(runtimeErrors.length,0)
  console.log(JSON.stringify({target,status:'PASS',upstreamCalls,successfulCalls,errors,english:{rows:english.ingredients.length,complete:english.complete},chinese:{rows:chinese.ingredients.length,knownRows:chinese.conflictCount,complete:chinese.complete},languageChecks:{englishUI:englishUI.ingredients.length,chineseInEnglishUI:chineseUI.ingredients.length},screenshots:output}))
}finally{
  if(memberId){try{const sections=await api('/api/auth/profile-sections',undefined,'GET');const current=sections.find(s=>s.memberId===memberId&&s.sectionId==='allergy');if(current)await api('/api/auth/profile-sections',{memberId,sectionId:'allergy',revision:current.revision,records:[]})}catch{errors.push('SYNTHETIC_SECTION_CLEANUP_FAILED')}await api(`/api/members/${memberId}`,undefined,'DELETE').catch(()=>{errors.push('SYNTHETIC_MEMBER_CLEANUP_FAILED')})}
  console.log(JSON.stringify({target,upstreamCallsReported:upstreamCalls,successfulCallsReported:successfulCalls,errors,cleanup:errors.filter(code=>code.includes('CLEANUP')),retainedAccount:'isolated synthetic registration; deletion requires normal verified identity flow'}))
  await context.close();await browser.close()
}
