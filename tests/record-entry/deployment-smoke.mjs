import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, devices } from '@playwright/test'

const baseURL=process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(baseURL),'Explicit deployment URL required')
const environment=baseURL.includes('-staging.')?'staging':'production'
// Keep only this task's synthetic session in an ignored, separate browser profile.
// Retries reuse its cookies instead of creating more accounts or using personal profiles.
const context=await chromium.launchPersistentContext(`.codex-tmp/record-entry-qa-${environment}`,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',...devices['iPhone SE'],viewport:{width:375,height:667},baseURL,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[],verified=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',r=>{if(r.status()>=500)errors.push(`5xx ${new URL(r.url()).pathname}`)})
async function request(path,method='GET',data,token){return page.evaluate(async({path,method,data,token})=>{const r=await fetch(path,{method,credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});return {status:r.status,body:await r.text()}},{path,method,data,token})}
const output=`outputs/record-entry/${environment}`
await mkdir(output,{recursive:true})
try {
  await page.goto(baseURL+'/api/health')
  for(const path of ['/','/api/health','/health-events'])assert.equal((await request(path)).status,200,path)
  // Explicitly authorized synthetic QA account, no user's browser profile or credentials.
  let session=JSON.parse((await request('/api/auth/session')).body)
  if(!session.token){
    const registration=await request('/api/auth/register','POST',{nickname:`entryqa${randomBytes(5).toString('hex')}`,password:randomBytes(24).toString('base64url'),idempotencyKey:randomUUID()})
    assert.equal(registration.status,200,registration.status===429?`QA registration rate limited; retry after ${JSON.parse(registration.body).error?.retryAfter??'server window'} seconds`:'Dedicated QA registration')
    session=JSON.parse(registration.body)
  }
  const token=session.token
  assert.ok(token)
  const members=JSON.parse((await request('/api/members','GET',undefined,token)).body)
  let memberId=members.find(m=>m.name==='记录入口发布验收')?.id
  if(!memberId){const child=await request('/api/members','POST',{name:'记录入口发布验收',birthday:'2024-12-20',gender:'female',relationship:'child',avatar:''},token);assert.equal(child.status,201,'QA child');memberId=JSON.parse(child.body).id}
  assert.equal((await request('/api/auth/current-member','POST',{memberId},token)).status,200)
  await page.goto(baseURL+'/health-events')
  await page.getByRole('button',{name:'记录日常',exact:true}).waitFor()
  await page.waitForFunction(()=>[...document.querySelectorAll('.record-entry-actions img')].every(img=>img.complete&&img.naturalWidth>0))
  await page.getByText('正在加载时间轴...', {exact:true}).waitFor({state:'hidden'})
  assert.deepEqual(await page.locator('.record-entry-grid button').allTextContents(),['记录症状','记录日常','记录补剂','记录用药'])
  assert.equal(await page.locator('.record-smart-action svg').count(),1)
  await page.screenshot({path:`${output}/home-375.png`})
  const daily=page.getByRole('button',{name:'记录日常',exact:true})
  await daily.click()
  assert.deepEqual(await page.locator('.daily-record-options button').allTextContents(),['喂养/饮食','睡眠','排便','户外活动'])
  assert.equal(await page.getByRole('dialog').count(),0)
  await page.waitForFunction(()=>[...document.querySelectorAll('.daily-record-options img')].every(img=>img.complete&&img.naturalWidth>0))
  await page.screenshot({path:`${output}/daily-open-375.png`})
  await daily.click()
  for(const [button,title] of [['记录症状','记录症状'],['记录补剂','记录补剂'],['记录用药','记录用药']]){
    await page.getByRole('button',{name:button,exact:true}).click()
    const form=page.getByRole('dialog',{name:title,exact:true});await form.waitFor()
    await form.getByRole('button',{name:title==='记录症状'?'关闭':/^返回/,exact:title==='记录症状'}).click()
  }
  for(const [method,label] of [['breast','母乳'],['formula','配方奶'],['expressed','瓶喂母乳'],['mixed','混合喂养'],['complementary','辅食'],['meal','正餐'],['snack','零食']]){
    await daily.click();await page.getByRole('group',{name:'记录日常选项'}).getByRole('button',{name:'喂养/饮食'}).click()
    const form=page.getByRole('dialog',{name:'喂养/饮食',exact:true});await form.waitFor()
    const milk=['breast','formula','expressed','mixed'].includes(method)
    await form.getByRole('radio',{name:milk?'奶类喂养':'食物饮食',exact:true}).click()
    await form.getByRole('radio',{name:label,exact:true}).click()
    assert.equal(await form.locator('.diet-category-switches').evaluate(el=>el.scrollWidth<=el.clientWidth),true)
    if(method==='breast'||method==='mixed')await form.getByLabel('左侧手填分钟').fill('2')
    if(milk&&method!=='breast')await form.getByLabel('喂奶量').fill('105')
    if(!milk){await form.getByLabel('输入食物名称').fill(`发布验收食物${method}`);await form.getByRole('button',{name:'添加食物'}).click()}
    if(method==='complementary')await form.getByRole('button',{name:'编辑',exact:true}).waitFor()
    if(method==='breast'||method==='complementary')await page.screenshot({path:`${output}/${milk?'milk':'food'}-375.png`})
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quick-records'&&r.request().method()==='POST')
    await form.getByRole('button',{name:'保存记录',exact:true}).click()
    const duplicate=page.getByRole('button',{name:'仍然新增一条'})
    await Promise.race([duplicate.waitFor({timeout:5000}).then(()=>duplicate.click()),saved]).catch(()=>{})
    const response=await saved;assert.equal(response.status(),201)
    const ids=await response.json()
    const records=await request(`/api/events/${ids.eventId}/records?view=time`,'GET',undefined,token)
    assert.equal(records.status,200)
    const dto=JSON.parse(records.body).find(r=>r.id===ids.recordId)
    assert.equal(dto.accountId,session.user.id)
    const event=await request(`/api/events/${ids.eventId}`,'GET',undefined,token)
    assert.equal(event.status,200)
    assert.equal(JSON.parse(event.body).memberId,memberId)
    assert.equal(dto.journal.diet.kind,milk?'feeding':method)
    assert.equal(dto.journal.diet.feedingMethod,milk?method:undefined)
    assert.equal(dto.journal.diet.bottleMl,milk&&method!=='breast'?105:undefined)
    assert.equal(dto.journal.diet.foods?.[0],milk?undefined:`发布验收食物${method}`)
    await form.waitFor({state:'detached'})
    await page.locator(`[data-record-id="${ids.recordId}"]`).click()
    await page.getByRole('button',{name:'编辑喂养/饮食'}).click()
    assert.equal(await form.getByRole('radio',{name:label,exact:true}).getAttribute('aria-checked'),'true')
    await form.getByRole('button',{name:'返回',exact:true}).click()
    await page.getByRole('dialog',{name:/记录详情/}).getByRole('button',{name:/^关闭/}).click()
    verified.push(method)
  }
  await page.getByRole('button',{name:'智能记录',exact:true}).click();await page.getByRole('dialog',{name:/整理/}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(errors,[])
  const summary={environment,verified,health:'PASS',entry:'PASS',smart:'PASS',history:'PASS',errors,syntheticAccount:true,checkedAt:new Date().toISOString()}
  await writeFile(`${output}/smoke.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary))
}catch(error){await page.screenshot({path:`${output}/failure.png`});throw error}finally{await context.close()}
