import assert from 'node:assert/strict'
import { chromium, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync, unlinkSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const origin=process.argv[2], sourceCommit=process.argv[3] ?? 'verified-runtime'
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(origin))
const environment=origin.includes('staging')?'staging':'production'
const fixturePath=resolve(`.codex-tmp/synthetic-entry-reorg-${environment}-session.json`)
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',proxy:{server:'http://127.0.0.1:7890'}})
const context=await browser.newContext({...devices['iPhone SE'],timezoneId:'Asia/Shanghai',serviceWorkers:'block',...(existsSync(fixturePath)?{storageState:fixturePath}:{})})
let token='',memberId='',passed=false
const verified=[],errors=[],output=`outputs/entry-reorg/${environment}`
await mkdir(output,{recursive:true})
async function api(path,method='GET',data){
  const r=await context.request.fetch(origin+path,{method,data,headers:{'Content-Type':'application/json','X-Hoooho-Timezone':'Asia/Shanghai',...(token?{Authorization:`Bearer ${token}`}:{})}})
  if(r.status()===429&&path==='/api/auth/register'){
    const limited=await r.json();const seconds=limited.error?.retryAfter
    console.log(JSON.stringify({status:429,retryAfter:seconds}))
    assert(Number.isFinite(seconds)&&seconds>0)
    await new Promise(resolve=>setTimeout(resolve,(seconds+2)*1000));return api(path,method,data)
  }
  assert(r.ok(),`${method} ${path}: ${r.status()}`);assert.equal(new URL(r.url()).origin,origin)
  return r.json()
}
const page=await context.newPage()
page.on('pageerror',e=>errors.push(e.message))
page.on('response',r=>{if(r.status()>=500)errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`)})
try{
  for(const route of ['/','/api/health','/health-events'])assert.equal((await context.request.get(origin+route)).status(),200)
  const session=existsSync(fixturePath)?await api('/api/auth/session'):await api('/api/auth/register','POST',{nickname:`入口验收${Date.now()}`,password:randomUUID(),idempotencyKey:randomUUID()})
  token=session.token??'';assert(token)
  await context.storageState({path:fixturePath})
  memberId=(await api('/api/members','POST',{name:'入口发布验收',birthday:'2025-01-01',gender:'female',relationship:'child'})).id
  await api('/api/auth/current-member','POST',{memberId})
  await api(`/api/routines/${memberId}`,'PATCH',{status:'declined'})
  await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,accountId:session.user.id,memberId})
  await page.goto(origin+'/health-events?verify='+sourceCommit)
  const footer=page.locator('.journal-record-actions'),daily=footer.getByRole('button',{name:'记录日常',exact:true})
  await daily.waitFor();await page.locator('.journal-grid-loading').waitFor({state:'hidden'})
  await page.waitForFunction(()=>!document.querySelector('.record-entry-grid button')?.disabled)
  let posts=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/quick-records'&&r.method()==='POST')posts++})
  for(const width of [375,390,430]){
    await page.setViewportSize({width,height:667})
    assert.deepEqual(await footer.locator('.record-entry-grid button').allTextContents(),['喂养/饮食','记录补给','记录日常','记录用药'])
    assert.equal(await footer.getByRole('button',{name:'智能记录',exact:true}).count(),0)
    const metrics=await footer.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...el.querySelectorAll('button')].map(b=>{const box=b.getBoundingClientRect();return {height:box.height,within:box.left>=0&&box.right<=innerWidth&&box.bottom<=innerHeight,fits:b.scrollWidth<=b.clientWidth}}),icons:el.querySelectorAll('.record-entry-grid img,.record-entry-grid svg,.record-symptom-action img,.record-symptom-action svg').length}))
    assert.equal(metrics.overflow,false);assert.equal(metrics.icons,0);assert(metrics.buttons.every(b=>b.height>=44&&b.within&&b.fits))
    await page.screenshot({path:`${output}/default-${width}.png`})
    await daily.click();const options=page.getByRole('group',{name:'记录日常选项'})
    assert.deepEqual(await options.getByRole('button').allTextContents(),['睡眠','排便','身体涂抹'])
    assert.equal(await options.locator('img').count(),3)
    await page.waitForFunction(()=>[...document.querySelectorAll('.daily-record-options img')].every(i=>i.complete&&i.naturalWidth))
    const optionBox=await options.boundingBox(),greenBox=await footer.getByRole('button',{name:'记录症状',exact:true}).boundingBox()
    assert(optionBox.y+optionBox.height<greenBox.y)
    await page.screenshot({path:`${output}/daily-${width}.png`})
    await page.keyboard.press('Escape');assert.equal(await daily.getAttribute('aria-pressed'),'false')
    console.log(JSON.stringify({environment,width,layout:'PASS'}))
  }
  await page.setViewportSize({width:375,height:667})
  const entries=[['喂养/饮食','喂养/饮食','diet'],['记录补给','记录补剂','diet'],['记录用药','记录用药','medication'],['记录症状','记录症状','symptom'],['睡眠','记录睡眠','sleep'],['排便','记录排便','elimination'],['身体涂抹','记录身体涂抹','care']]
  async function open(entry,title){if(['睡眠','排便','身体涂抹'].includes(entry)){await daily.click();await page.getByRole('group',{name:'记录日常选项'}).getByRole('button',{name:entry,exact:true}).click()}else await footer.getByRole('button',{name:entry,exact:true}).click();const form=page.getByRole('dialog',{name:title,exact:true});await form.waitFor();return form}
  for(const [entry,title]of entries){const form=await open(entry,title);assert.equal(await page.getByRole('group',{name:'记录日常选项'}).count(),0);await form.getByRole('button',{name:entry==='记录症状'?'关闭':/^返回/,exact:entry==='记录症状'}).click();await form.waitFor({state:'detached'})}
  assert.equal(posts,0,'navigation/cancel must not save')
  await page.getByLabel('选择日期').fill('2026-09-24')
  for(const [entry,title,category]of entries){
    const form=await open(entry,title)
    if(entry==='喂养/饮食'){await form.getByRole('radio',{name:'配方奶',exact:true}).click();await form.getByLabel('喂奶量').fill('101')}
    if(entry==='记录补给'){await form.getByLabel('输入补剂名称').fill('合成补给验收');await form.getByRole('button',{name:'添加补剂'}).click();await form.getByLabel('用量',{exact:true}).fill('1')}
    if(entry==='记录用药'){await form.getByLabel('药品名称',{exact:true}).fill('合成用药验收');await form.getByLabel('本次用量').fill('1')}
    if(entry==='身体涂抹')await form.getByLabel('产品名称（或添加包装照片）').fill('合成保湿产品')
    if(entry==='排便')await form.getByRole('button',{name:'糊状',exact:true}).click()
    if(entry==='记录症状'){
      await form.getByRole('button',{name:'选择部位',exact:true}).click();const picker=page.getByRole('dialog',{name:'身体部位定位器'});await picker.waitFor();await picker.getByRole('button',{name:'关闭身体部位定位器'}).click()
      await form.getByLabel('哪里不舒服').fill('合成入口验收手臂发痒')
      await form.getByRole('textbox',{name:'发生时间'}).fill('2026-09-24T10:15')
    }else if(entry!=='睡眠')await form.locator('input[aria-label="记录时间"]').fill('2026-09-24T10:15')
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quick-records'&&r.request().method()==='POST')
    await form.getByRole('button',{name:entry==='记录症状'?'保存':'保存记录',exact:true}).click()
    const duplicate=page.getByRole('button',{name:'仍然新增一条'})
    await Promise.race([duplicate.waitFor({timeout:4000}).then(()=>duplicate.click()),response]).catch(()=>{})
    const result=await response;assert.equal(result.status(),201)
    const body=result.request().postDataJSON();assert.equal(body.memberId,memberId);assert.deepEqual(body.journal.categories,[category])
    if(entry==='记录补给')assert.equal(body.journal.diet.kind,'supplement')
    if(entry==='喂养/饮食')assert.equal(body.journal.diet.kind,'feeding')
    const ids=await result.json();await form.waitFor({state:'detached'})
    await page.locator(`[data-record-id="${ids.recordId}"]`).first().waitFor()
    const event=await api(`/api/events/${ids.eventId}`);assert.equal(event.memberId,memberId)
    await api(`/api/records/${ids.recordId}`,'DELETE')
    verified.push(entry);console.log(JSON.stringify({environment,entry,save:'PASS'}))
  }
  await page.goto(origin+'/smart-record');await page.getByRole('heading',{name:'智能记录',exact:true}).waitFor()
  assert.equal(await page.locator('.journal-record-actions').count(),0)
  await page.goto(origin+'/health-events');await daily.waitFor()
  assert.deepEqual(errors,[])
  const summary={environment,sourceCommit,health:'PASS',widths:[375,390,430],navigation:'PASS',cancellation:'PASS',savedThroughExistingAPI:verified,sharedCapture:'PASS',errors}
  await writeFile(`${output}/smoke.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));passed=true
}catch(error){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error}
finally{if(memberId)await api(`/api/members/${memberId}`,'DELETE').catch(()=>{});if(passed&&existsSync(fixturePath))unlinkSync(fixturePath);await context.close();await browser.close()}
