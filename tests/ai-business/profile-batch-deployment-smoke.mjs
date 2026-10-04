import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'
import sharp from 'sharp'

const baseURL=process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(baseURL))
const environment=baseURL.includes('-staging.')?'staging':'production',output=`outputs/profile-batch-20261005/${environment}`
await mkdir(output,{recursive:true})
const context=await chromium.launchPersistentContext(`.codex-tmp/health-profile-qa-${environment}`,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',...devices['iPhone SE'],viewport:{width:375,height:667},baseURL,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[],created=[]
let token,result={environment,syntheticOnly:true}
page.on('pageerror',()=>errors.push('pageerror'));page.on('response',r=>{if(r.status()>=500&&!r.url().includes('ai-drafts'))errors.push(`5xx ${new URL(r.url()).pathname}`)})
const response=(path,method='GET',data)=>page.evaluate(async({path,method,data,token})=>{const r=await fetch(path,{method,credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(180000)});return {status:r.status,text:await r.text()}},{path,method,data,token})
async function api(path,method='GET',data){const r=await response(path,method,data);assert.ok(r.status<400,`HTTP ${r.status} ${method} ${path.replace(/[0-9a-f-]{30,}/g,':id')}`);return JSON.parse(r.text)}
try{
  await page.goto(baseURL+'/api/health');assert.equal((await response('/api/health')).status,200);assert.equal((await response('/')).status,200)
  let session=await api('/api/auth/session');if(!session.token)session=await api('/api/auth/register','POST',{nickname:`hpqa${randomBytes(5).toString('hex')}`,password:randomBytes(24).toString('base64url'),idempotencyKey:randomUUID()});token=session.token
  const member=await api('/api/members','POST',{name:'上传验收（合成）',birthday:'2024-12-20',gender:'female',relationship:'child',avatar:''});created.push(member.id)
  const other=await api('/api/members','POST',{name:'隔离验收（合成）',birthday:'2024-12-20',gender:'female',relationship:'child',avatar:''});created.push(other.id)
  await api('/api/auth/current-member','POST',{memberId:member.id})
  const manual=await api('/api/quick-records','POST',{memberId:member.id,content:'手动保留内容（合成验收）',occurredAt:'2026-09-29T02:00:00Z',inputChannel:'text',idempotencyKey:randomUUID(),title:'疫苗接种记录',journal:{categories:['vaccination'],vaccination:{items:[{id:randomUUID(),vaccineName:'乙肝疫苗',doseSequence:'dose_2',manufacturerName:'手动企业（合成）'}],institutionName:'手动机构（合成）',recognitionStatus:'not_used'}}})
  await page.goto(baseURL+'/health-profile');const smart=page.locator('.health-profile-smart-record');await expect(smart.locator('strong')).toHaveText('上传资料');await expect(smart.locator('small')).toHaveText('报告、病历、接种回执，自动整理到各项档案')
  for(const width of [375,320,390,430]){await page.setViewportSize({width,height:667});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/home-${width}.png`})}
  await page.setViewportSize({width:375,height:667})
  let picker=page.waitForEvent('filechooser');await smart.focus();await page.keyboard.press('Enter');await(await picker).setFiles([]);await expect(page).toHaveURL(/health-profile$/);await expect(page.getByRole('dialog')).toHaveCount(0)
  const image=async(lines)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="white"/><g fill="black" font-family="Microsoft YaHei" font-size="36">${['合成接种凭证，无真实医疗数据',...lines].map((line,i)=>`<text x="30" y="${65+i*70}">${line}</text>`).join('')}</g></svg>`)).png().toBuffer()
  const file1={name:'合成回执第1页.png',mimeType:'image/png',buffer:await image(['接种日期：2026-09-29','疫苗名称：乙肝疫苗','剂次：第2剂'])}
  const file2={name:'合成回执第2页.png',mimeType:'image/png',buffer:await image(['接种日期：2026-09-29','疫苗名称：乙肝疫苗','剂次：第2剂','批号：SYNTHETIC2026'])}
  picker=page.waitForEvent('filechooser');await smart.click();await(await picker).setFiles(file1);const gather=page.getByRole('dialog',{name:'上传资料'});await expect(gather.locator('li')).toHaveCount(1)
  picker=page.waitForEvent('filechooser');await gather.getByRole('button',{name:'继续添加',exact:true}).click();await(await picker).setFiles(file2);await expect(gather.locator('li')).toHaveCount(2)
  await api('/api/auth/current-member','POST',{memberId:other.id});await expect(gather.getByText('资料归属：上传验收（合成）',{exact:true})).toBeVisible();await page.screenshot({path:`${output}/gather.png`})
  await gather.getByRole('button',{name:'开始整理',exact:true}).click();const review=page.getByRole('dialog',{name:'整理结果'})
  await expect(review.or(gather.getByRole('alert'))).toBeVisible({timeout:180000})
  const draft=await api(`/api/members/${member.id}/ai-drafts`);assert.equal((await response(`/api/members/${other.id}/ai-drafts/${draft.id}`)).status,404)
  await writeFile(`${output}/synthetic-result.json`,JSON.stringify({state:draft.state,items:draft.items,sources:draft.sources},null,2)) // This script only creates synthetic children/materials.
  if(draft.state==='ready'){
    assert.equal(draft.items.filter(i=>i.category==='vaccination').length,1,'Multi-page receipt must be one vaccination')
    await expect(review.getByRole('heading',{name:'疫苗接种记录',exact:true})).toBeVisible();await page.screenshot({path:`${output}/review.png`})
    await review.getByRole('button',{name:'保存到档案',exact:true}).click();await expect(page.getByText('资料已整理到档案',{exact:true})).toBeVisible({timeout:30000})
    const saved=await api(`/api/members/${member.id}/ai-drafts/${draft.id}`);assert.equal(saved.result.records[0].recordId,manual.recordId)
    assert.deepEqual((await api(`/api/members/${member.id}/ai-drafts/${draft.id}/save`,'POST',{version:draft.version,confirmed:true})).result,saved.result)
    const records=await api(`/api/events/${manual.eventId}/records`),files=await api(`/api/events/${manual.eventId}/attachments`);assert.equal(records.length,1);assert.equal(records[0].content,'手动保留内容（合成验收）');assert.equal(files.length,2);assert.equal((await response(`/api/events/${manual.eventId}/attachments/${files[0].id}/content`)).status,200)
    result={...result,liveRecognition:'PASS',batchContext:'PASS',memberIsolation:'PASS',matchedVaccineAttachment:'PASS',idempotency:'PASS',originalRead:'PASS'}
  }else{
    assert.equal(draft.state,'failed');assert.equal(draft.pages.length,2);await expect(gather.locator('li')).toHaveCount(2);await expect(page.getByRole('button',{name:'保存到档案',exact:true})).toHaveCount(0);await page.screenshot({path:`${output}/recognition-failed.png`})
    result={...result,liveRecognition:'UNAVAILABLE',retainedOriginals:'PASS',noFalseSuccess:'PASS',memberIsolation:'PASS'}
    await gather.getByRole('button',{name:'关闭上传资料',exact:true}).click()
  }
  await api('/api/auth/current-member','POST',{memberId:member.id});await page.goto(baseURL+'/health-profile/vaccination');await page.getByRole('button',{name:/乙肝疫苗/}).click();await expect(page.getByLabel('疫苗名称',{exact:true})).toHaveValue('乙肝疫苗')
  await page.goto(baseURL+'/health-profile');await expect(smart).toBeVisible();await page.addStyleTag({content:'html{font-size:24px}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(errors,[]);result={...result,health:'PASS',nativeEntry:'PASS',append:'PASS',routes:'PASS',mobileWidths:[375,320,390,430],largeText:'PASS',errors};await writeFile(`${output}/smoke.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(e){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw e}
finally{for(const id of created){try{await api(`/api/members/${id}`,'DELETE')}catch{console.log('Exact synthetic member cleanup failed')}}await context.close()}
