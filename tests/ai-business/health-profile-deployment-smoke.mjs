import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'
import sharp from 'sharp'

const baseURL=process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(baseURL),'Verified deployment URL required')
const environment=baseURL.includes('-staging.')?'staging':'production'
const context=await chromium.launchPersistentContext(`.codex-tmp/health-profile-qa-${environment}`,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',...devices['iPhone SE'],baseURL,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[]
page.on('pageerror',()=>errors.push('pageerror'))
page.on('response',response=>{if(response.status()>=500&&!response.url().includes('/ai-drafts'))errors.push(`5xx ${new URL(response.url()).pathname}`)})
const output=`outputs/health-profile/${environment}`
await mkdir(output,{recursive:true})
let token,memberId,aiStatus='not-tested'
async function api(path,method='GET',data){const response=await context.request.fetch(baseURL+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(data===undefined?{}:{data}),timeout:120000});if(!response.ok())throw new Error(`Synthetic QA ${method} ${path.replace(/[0-9a-f-]{30,}/gi,':id')}: HTTP ${response.status()}`);return response.json()}
try {
  await page.goto(baseURL+'/api/health')
  assert.equal((await context.request.get(baseURL+'/')).status(),200)
  assert.equal((await context.request.get(baseURL+'/api/health')).status(),200)
  let session=await api('/api/auth/session')
  if(!session.token)session=await api('/api/auth/register','POST',{nickname:`hpqa${randomBytes(5).toString('hex')}`,password:randomBytes(24).toString('base64url'),idempotencyKey:randomUUID()})
  token=session.token;assert.ok(token)
  const member=await api('/api/members','POST',{name:'档案验收（合成）',birthday:'2024-12-20',gender:'female',relationship:'child',avatar:''});memberId=member.id
  await api('/api/auth/current-member','POST',{memberId})
  await page.goto(baseURL+'/health-profile')
  await expect(page.getByText('待排查 0 · 已明确 0')).toBeVisible({timeout:30000})
  const labels=['过敏史','慢性病史','家族史','手术史','疫苗接种记录']
  assert.deepEqual(await page.locator('.health-profile-entry strong').allTextContents(),labels)
  assert.equal(await page.getByRole('heading',{name:'健康档案',exact:true}).count(),0)
  for(const width of [375,320,390,430]){await page.setViewportSize({width,height:667});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/home-${width}.png`})}
  await page.setViewportSize({width:375,height:667})
  for(const [index,id] of ['allergy','chronic','family-history','surgery','vaccination'].entries()){
    await page.goto(baseURL+'/health-profile');await page.getByRole('button',{name:new RegExp(labels[index])}).click();await expect(page).toHaveURL(new RegExp(`/health-profile/${id}$`));await expect(page.getByRole('heading',{name:labels[index],exact:true}).first()).toBeVisible()
  }
  await page.getByRole('button',{name:'补充接种记录'}).click();await page.getByLabel('疫苗名称',{exact:true}).fill('合成验收疫苗');await page.getByRole('button',{name:'第1剂',exact:true}).click();await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('button',{name:/合成验收疫苗/})).toBeVisible({timeout:30000})
  await page.goto(baseURL+'/health-profile/smart-record');await page.getByRole('button',{name:'上传与智能识别'}).click()
  const sheet=page.getByRole('dialog',{name:'智能整理记录'})
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="600"><rect width="1100" height="600" fill="white"/><g fill="black" font-family="Microsoft YaHei" font-size="34"><text x="40" y="65">测试凭证（合成，无真实医疗数据）</text><text x="40" y="130">接种日期：2026-09-29</text><text x="40" y="195">疫苗名称：乙肝疫苗</text><text x="40" y="260">剂次：第2剂</text><text x="40" y="325">过敏原：牛奶；状态：待排查</text><text x="40" y="390">家族史：父亲有疑似哮喘</text></g></svg>'
  const buffer=await sharp(Buffer.from(svg)).png().toBuffer()
  await sheet.getByLabel('上传资料',{exact:true}).setInputFiles({name:'HP合成发布验收.png',mimeType:'image/png',buffer})
  await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click()
  const save=sheet.getByRole('button',{name:/已核对，一次保存/}),manual=sheet.getByRole('button',{name:'保留原件，手动补充'})
  await expect(save.or(manual)).toBeVisible({timeout:150000})
  if(await manual.isVisible()){aiStatus='unavailable-or-failed-manual-fallback';await manual.click()}else aiStatus='live-recognition'
  const draft=await api(`/api/members/${memberId}/ai-drafts`)
  if(aiStatus==='live-recognition'){assert.ok(draft.items.length>0);assert.ok(draft.sources.some(s=>s.text.includes('乙肝')));assert.ok(draft.items.every(i=>i.fields.every(f=>f.editedBy==='user'||f.sources.length>0)))}
  await save.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/review.png`})
  await save.click();await expect(sheet.getByText(/已保存 \d+ 条记录/,{exact:true})).toBeVisible({timeout:30000})
  const saved=await api(`/api/members/${memberId}/ai-drafts/${draft.id}`),repeated=await api(`/api/members/${memberId}/ai-drafts/${draft.id}/save`,'POST',{version:draft.version,confirmed:true});assert.deepEqual(repeated.result,saved.result)
  const first=saved.result.records[0],files=await api(`/api/events/${first.eventId}/attachments`);assert.ok(files.length>0)
  assert.equal((await context.request.get(`${baseURL}/api/events/${first.eventId}/attachments/${files[0].id}/content`,{headers:{Authorization:`Bearer ${token}`}})).status(),200)
  await sheet.getByRole('button',{name:'完成',exact:true}).click();await page.screenshot({path:`${output}/saved.png`})
  await page.goto(baseURL+'/health-profile');await expect(page.locator('.health-profile-entry')).toHaveCount(5);await expect(page.getByText(/待排查 \d+ · 已明确 \d+/)).toBeVisible();await page.screenshot({path:`${output}/home-after-save.png`})
  await page.getByRole('button',{name:'就诊情况单，孩子情况快速整理'}).click();await expect(page).toHaveURL(/visit-summary/)
  assert.deepEqual(errors,[])
  const result={environment,health:'PASS',routes:'PASS',manualVaccination:'PASS',aiStatus,confirmedSave:'PASS',idempotency:'PASS',originalRead:'PASS',memberSummary:'PASS',widths:[375,320,390,430],errors,syntheticDataOnly:true}
  await writeFile(`${output}/smoke.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(error){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error}
finally{
  // Remove only the exact synthetic member created by this run, never pre-existing data.
  if(memberId){await api(`/api/members/${memberId}`,'DELETE');console.log('Synthetic QA member and its source records cleaned up')}
  await context.close()
}
