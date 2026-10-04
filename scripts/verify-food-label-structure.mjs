// Opt-in real API acceptance. No OCR/photo/profile content is logged or saved.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium,devices,expect} from '@playwright/test'
if(process.env.RUN_FOOD_LABEL_ACCEPTANCE!=='1')throw new Error('Explicit acceptance opt-in required')
assert.ok(process.env.FOOD_LABEL_USER_IMAGE,'Original user image is required')
const target=process.env.FOOD_LABEL_TARGET??'staging'
// A focused language scenario can be run without re-reading completed cases.
const languageOnly=process.env.FOOD_LABEL_LANGUAGE_ONLY==='1'
const englishOnly=process.env.FOOD_LABEL_ENGLISH_ONLY==='1'
assert.ok(['staging','production'].includes(target))
const base=target==='production'?'https://hoooho.com':'https://hooohoapp-staging.up.railway.app'
const output=path.resolve(`.codex-tmp/food-label-structure/${target}`);await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',...(process.env.FOOD_LABEL_PROXY?{proxy:{server:process.env.FOOD_LABEL_PROXY}}:{})})
const context=await browser.newContext({...devices['iPhone SE'],viewport:{width:375,height:667},serviceWorkers:'block'})
const page=await context.newPage();let token,memberId,calls=0,successful=0,requests=0
const errors=[],runtimeErrors=[]
page.on('pageerror',e=>runtimeErrors.push(e.name))
async function api(url,data,method='POST'){
  const response=await context.request.fetch(base+url,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{data}),timeout:130000,maxRetries:0})
  const body=await response.json();assert.ok(response.ok(),`API ${url}: ${response.status()} ${body.error?.code??''}`);return body
}
async function profile(records){
  const sections=await api('/api/auth/profile-sections',undefined,'GET')
  const revision=sections.find(s=>s.memberId===memberId&&s.sectionId==='allergy')?.revision??0
  return api('/api/auth/profile-sections',{memberId,sectionId:'allergy',revision,records:records.map(r=>({...r,memberId,category:'food'}))})
}
async function scan(filename,supplement=false){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/food-label/check'&&r.request().method()==='POST',{timeout:360000})
  pending.catch(()=>undefined) // Selector failures must not hide behind a closed-page rejection.
  await page.locator(supplement?'input[capture=environment]':'input[multiple]').setInputFiles(filename)
  requests++
  const response=await pending,body=await response.json()
  if(!response.ok()){calls+=body.diagnostics?.calls??0;successful+=body.diagnostics?.successfulCalls??0;errors.push(body.error?.code??`HTTP_${response.status()}`);throw new Error(`Food API ${response.status()} ${body.error?.code??''}`)}
  calls+=body.diagnostics.calls;successful+=body.diagnostics.successfulCalls;errors.push(...body.diagnostics.errorCodes)
  assert.match(response.headers()['cache-control'],/no-store/)
  assert.equal(body.assessmentComplete,true)
  const roots=body.displayIngredients;assert.ok(Array.isArray(roots))
  assert.equal(body.conflictCount,roots.filter(r=>r.status==='known').length)
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(roots.length)
  await page.screenshot({path:path.join(output,`request-${requests}-evidence.png`),fullPage:true})
  await page.locator('.food-label-ingredients li').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`request-${requests}-bottom-evidence.png`)});await page.locator('.food-label-summary').scrollIntoViewIfNeeded()
  if(englishOnly)await page.screenshot({path:path.join(output,'english-diagnostic-full.png'),fullPage:true})
  await expect(page.getByText(/标签未读完整|本次未完整核对|项待确认|暂不能排除遗漏|放心食用/)).toHaveCount(0)
  console.log(JSON.stringify({target,request:requests,supplement,roots:roots.length,known:body.conflictCount,common:roots.filter(r=>r.status==='common').length,possible:roots.filter(r=>r.status==='possible').length,diagnostics:body.diagnostics}))
  return body
}
const compact=s=>s.normalize('NFKC').replace(/\s+/g,'').replace(/[′’']/g,'′')
function originalEvidence(body){
  // Assertions compare in memory; never print the source on assertion failure.
  const expected=['大米(≥60%)','白砂糖','植物油(含特丁基对苯二酚)','米粉','淀粉','食用盐','食品添加剂(明胶、5′-呈味核苷酸二钠)','味精']
  const roots=body.displayIngredients
  assert.equal(roots.length,8,'Original image top-level count')
  const mismatches=roots.flatMap((r,i)=>compact(r.original)===compact(expected[i])?[]:[{index:i+1,punctuationOnly:compact(r.original).replace(/[,，、]/g,',')===compact(expected[i]).replace(/[,，、]/g,',')}])
  if(mismatches.length)console.log(JSON.stringify({target,evidenceMismatch:mismatches}))
  assert.ok(roots.every((r,i)=>compact(r.original)===compact(expected[i])),'Original image complete parent names match')
  assert.equal(roots[6].children.length,2,'Both additive children are retained')
}
async function shot(name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,`${name}.png`)})}
try{
  assert.equal((await context.request.get(base+'/api/health')).status(),200)
  await page.goto(base+'/login');await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill('结构验收'+randomUUID().slice(0,8));await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'注册并进入'}).click();const registration=await registered
  if(!registration.ok()){const error=await registration.json();console.log(JSON.stringify({target,registrationStatus:registration.status(),registrationError:error.error?.code??error.code??'UNKNOWN',retryAfter:registration.headers()['retry-after']??null}))}
  assert.ok(registration.ok(),'Acceptance registration available')
  const session=await api('/api/auth/session',undefined,'GET');token=session.token
  memberId=(await api('/api/members',{name:'合成结构验收非真实儿童',relationship:'child',birthday:'2025-01-01',gender:'female'})).id
  await api('/api/auth/current-member',{memberId});await profile([])
  await page.goto(base+'/nurse-station');await page.locator('a[href="/food-label"]').click()
  await expect(page.getByRole('heading',{name:'配料表扫描',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'返回',exact:true}).tap();await expect(page.locator('.nurse-station-page')).toBeVisible()
  await page.locator('a[href="/food-label"]').click()
  await expect(page.getByRole('heading',{name:'配料表扫描',exact:true})).toBeVisible()
  if(!languageOnly&&!englishOnly){
  const original=await scan(process.env.FOOD_LABEL_USER_IMAGE);originalEvidence(original)
  assert.ok(original.displayIngredients.every(r=>r.status==='clear'),'Ordinary additives do not invent risk')
  await shot('original-top');await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded();await shot('original-bottom')
  const supplemented=await scan(process.env.FOOD_LABEL_USER_IMAGE,true);originalEvidence(supplemented)
  await expect(page.locator('.food-label-photos img')).toHaveCount(2)
  await profile([{id:'synthetic-fish',name:'鱼类',currentStatus:'confirmed'}])
  await page.getByRole('button',{name:'返回',exact:true}).click()
  const fish=await scan(process.env.FOOD_LABEL_USER_IMAGE);originalEvidence(fish)
  assert.equal(fish.displayIngredients[6].status,'possible');assert.equal(fish.conflictCount,0)
  assert.ok(fish.displayIngredients[6].reason.includes('鱼类'),'Gelatin has specific personal source evidence')
  await shot('gelatin-possible')
  await profile([{id:'synthetic-wheat',name:'小麦',currentStatus:'confirmed'},{id:'synthetic-milk',name:'牛奶',currentStatus:'confirmed'},{id:'synthetic-egg',name:'鸡蛋',currentStatus:'suspected'}])
  await page.getByRole('button',{name:'返回',exact:true}).click()
  const english=await scan(path.resolve('.codex-tmp/food-label-evidence/english-oreo.jpg'))
  assert.ok(english.ingredients.length>=16,'Real English label checks at least 16 ingredients including compound children')
  assert.equal(english.displayIngredients.length,11,'English compound label has eleven top-level entries, not eighteen flat entries')
  assert.ok(english.conflictCount>0,'Real wheat ingredient matches fictional confirmed wheat record')
  assert.ok(english.displayIngredients.some(r=>r.status==='common'),'Other explicitly listed allergens are not personal diagnoses')
  await shot('english-top');await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded();await expect(page.locator('.food-label-ingredients li').last()).toBeVisible();await shot('english-bottom')
  for(const width of [375,393,430]){await page.setViewportSize({width,height:667});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(`english-bottom-${width}`)}
  }
  await page.evaluate(accountId=>{const settings=JSON.parse(localStorage.getItem('hoooho-settings')??'{"state":{"accounts":{}},"version":1}');settings.state.accounts??={};settings.state.accounts[accountId]={interfaceLanguage:'en-US'};localStorage.setItem('hoooho-settings',JSON.stringify(settings))},session.user.id)
  await page.setViewportSize({width:375,height:667});await page.reload();await expect(page.getByRole('button',{name:'Photograph ingredients',exact:true})).toBeVisible()
  if(!languageOnly||englishOnly){
  const sameLanguage=await scan(path.resolve('.codex-tmp/food-label-evidence/english-oreo.jpg'))
  await shot('english-ui-english-label');await page.getByRole('button',{name:'Retake',exact:true}).scrollIntoViewIfNeeded();await shot('english-ui-english-bottom')
  assert.equal(sameLanguage.displayIngredients.length,11)
  await expect(page.locator('.food-label-translation')).toHaveCount(0)
  await shot('english-ui-english-label')
  await page.locator('.hoho-page-header button').click()
  }
  if(!englishOnly){
  const translated=await scan(process.env.FOOD_LABEL_USER_IMAGE);originalEvidence(translated)
  await expect(page.locator('.food-label-translation')).toHaveCount(8)
  await shot('english-ui-chinese-label')
  }
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert.ok(!stored.includes('data:image')&&!stored.includes('特丁基'))
  await page.reload();await expect(page.getByRole('button',{name:'Photograph ingredients',exact:true})).toBeVisible();await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
  assert.equal(runtimeErrors.length,0)
  console.log(JSON.stringify({target,status:'PASS',requests,calls,successful,errors,originalImageEightRoots:!englishOnly,originalAdditiveChildren:!englishOnly,screenshots:output,physicalCamera:'manual verification pending'}))
}finally{
  if(memberId){await profile([]).catch(()=>errors.push('SYNTHETIC_SECTION_CLEANUP_FAILED'));await api(`/api/members/${memberId}`,undefined,'DELETE').catch(()=>errors.push('SYNTHETIC_MEMBER_CLEANUP_FAILED'))}
  console.log(JSON.stringify({target,requests,calls,successful,errors,cleanup:errors.filter(e=>e.includes('CLEANUP')),retainedAccount:'isolated synthetic account; normal identity verification required for deletion'}))
  await context.close();await browser.close()
}
