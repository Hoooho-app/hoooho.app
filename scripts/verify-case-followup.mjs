// Live acceptance with isolated, synthetic data only. Never imports secrets.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium,devices,expect} from '@playwright/test'

const target=process.env.HOOOHO_FOLLOWUP_TARGET
if(!['staging','production'].includes(target)||process.env.RUN_HOOOHO_FOLLOWUP_LIVE!=='1')throw new Error('Explicit live acceptance target required')
const base=target==='production'?'https://hoooho.com':'https://hooohoapp-staging.up.railway.app'
const output=path.resolve(`outputs/case-followup/${target}`)
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context=await browser.newContext({...devices['iPhone SE'],timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage();page.setDefaultTimeout(45000)
const result={target:base,startedAt:new Date().toISOString(),checks:{},cleanup:{},runtimeErrors:0,physicalIPhoneSafari:'NOT_VERIFIED',realMicrophoneCamera:'NOT_VERIFIED'}
page.on('pageerror',()=>result.runtimeErrors++)
let token,registered=false,memberId,otherId,draftId
const instant=new Date(Date.now()-2*86400000).toISOString()
const localInput=iso=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
async function raw(url,data,method='POST'){
  return page.evaluate(async({url,data,method,token})=>{
    const r=await fetch(url,{method,credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json','X-Hoooho-Timezone':'Asia/Shanghai'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(url.includes('ai-drafts')?180000:45000)})
    return {ok:r.ok,status:r.status,body:await r.json().catch(()=>null)}
  },{url:base+url,data,method,token})
}
async function api(url,data,method='POST'){
  const r=await raw(url,data,method)
  if(!r.ok)throw Object.assign(new Error('Live API acceptance failed'),{safe:{status:r.status,code:r.body?.error?.code??null}})
  return r.body
}
const card=id=>page.locator(`[data-case-id="${id}"]`)
async function screenshot(name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true})}
try{
  await page.goto(base+'/api/health');assert.equal((await api('/api/health',undefined,'GET')).status,'ok');result.checks.health='PASS'
  await page.goto(base+'/login');await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill('跟进验收'+randomUUID().slice(0,8));await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registration=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'注册并进入',exact:true}).click()
  const registeredResponse=await registration
  if(!registeredResponse.ok()){const reason=await registeredResponse.json().catch(()=>null);throw Object.assign(new Error('Registration unavailable'),{safe:{status:registeredResponse.status(),code:reason?.error?.code??null,retryAfter:reason?.error?.retryAfter??null}})}
  registered=true;token=(await api('/api/auth/session',undefined,'GET')).token;assert.ok(token)
  memberId=(await api('/api/members',{name:'合成流程验收，非真实患者',relationship:'child',gender:'female',birthday:'2025-01-01'})).id
  otherId=(await api('/api/members',{name:'合成隔离验收，非真实患者',relationship:'child',gender:'male',birthday:'2025-01-01'})).id
  await api('/api/auth/current-member',{memberId})
  const seed=text=>api(`/api/members/${memberId}/case-records`,{text,files:[],occurredAt:instant,requestId:randomUUID()})
  const a=await seed('合成流程验收：夜间鼻塞，睡觉时张口呼吸'),b=await seed('合成流程验收：左肘窝发痒'),legacy=await seed('合成历史验收：曾有咳嗽')
  await api(`/api/members/${memberId}/cases/${legacy.eventId}/archive`,{archived:true})
  await page.goto(base+'/cases')
  await expect(page.getByRole('heading',{name:'情况跟进',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:/情况收记|对比两次情况/})).toHaveCount(0)
  await expect(page.getByRole('tab',{name:'跟进中 2',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'已康复 1',exact:true})).toBeVisible()
  const ca=card(a.eventId),cb=card(b.eventId)
  await expect(ca.getByRole('button',{name:'展开',exact:true})).toHaveAttribute('aria-expanded','false')
  await ca.getByRole('button',{name:'展开',exact:true}).click();await cb.getByRole('button',{name:'展开',exact:true}).click()
  await expect(ca.locator('li')).toHaveCount(1);await expect(cb.locator('li')).toHaveCount(1);result.checks.pageAndIndependentTimeline='PASS'
  await ca.getByRole('button',{name:'继续记录',exact:true}).click()
  const form=ca.getByRole('region',{name:'继续记录这次情况'})
  await form.getByLabel('哪里不舒服').fill('合成补录验收：昨晚鼻塞，没有发烧')
  await form.getByRole('textbox',{name:'发生时间',exact:true}).fill(localInput(new Date(Date.parse(instant)-86400000).toISOString()))
  await ca.getByRole('button',{name:'收起',exact:true}).click();await expect(form.getByLabel('哪里不舒服')).toHaveValue('合成补录验收：昨晚鼻塞，没有发烧')
  await form.getByRole('button',{name:'保存到这次情况',exact:true}).click();await expect(form).toHaveCount(0);await expect(ca.locator('li')).toHaveCount(2)
  await expect(ca.locator('li').first()).toContainText('合成补录验收')
  await page.reload();await ca.getByRole('button',{name:'展开',exact:true}).click();await expect(ca.locator('li')).toHaveCount(2)
  assert.equal((await api(`/api/members/${memberId}/cases`,undefined,'GET')).active.length,2);result.checks.inlineSavePersistenceAndBackfill='PASS'
  await ca.getByRole('button',{name:'继续记录',exact:true}).click();await form.getByLabel('哪里不舒服').fill('合成未保存草稿')
  page.once('dialog',d=>d.accept());await form.getByRole('button',{name:'取消',exact:true}).click()
  await ca.getByRole('button',{name:'继续记录',exact:true}).click();await expect(form.getByLabel('哪里不舒服')).toHaveValue('合成未保存草稿')
  page.once('dialog',d=>d.accept());await form.getByRole('button',{name:'取消',exact:true}).click();result.checks.cancelRetainsDraftNoRecord='PASS'
  const source=await context.newPage();await source.setContent('<main style="font-family:sans-serif;padding:20px"><h1>合成资料，非真实患者</h1><p>就诊资料流程验收：医生建议观察皮肤变化。诊断未明确。</p></main>');const png=await source.screenshot();await source.close()
  await ca.getByRole('button',{name:'带回问诊资料',exact:true}).click();const material=ca.locator('.continuity-form')
  await material.getByLabel('资料来源',{exact:true}).selectOption('medical_consultation')
  await material.getByLabel('资料原话或补充（选填）').fill('合成资料流程验收：医生建议观察皮肤变化，诊断未明确。')
  await material.getByLabel('就诊时间',{exact:true}).fill(localInput(instant))
  await material.getByLabel('上传就诊资料').setInputFiles({name:'合成就诊资料.png',mimeType:'image/png',buffer:png})
  await material.getByRole('button',{name:'保存到这次情况',exact:true}).click()
  await expect(material.getByText('原件已保存到这次情况；内容尚未识别或核对')).toBeVisible();await expect(ca.locator('li')).toHaveCount(3)
  let records=await api(`/api/events/${a.eventId}/records`,undefined,'GET');const original=records.find(r=>r.caseContext?.identity==='medical_consultation');assert.ok(original)
  const attachments=await api(`/api/events/${a.eventId}/attachments`,undefined,'GET');assert.equal(attachments.length,1)
  const readable=await page.evaluate(async({url,token})=>{const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});return {status:r.status,size:(await r.arrayBuffer()).byteLength}},{url:`${base}/api/events/${a.eventId}/attachments/${attachments[0].id}/content`,token});assert.equal(readable.status,200);assert.equal(readable.size,png.length)
  result.checks.inlineMaterialsOriginals='PASS'
  await material.getByRole('button',{name:'智能整理原件',exact:true}).click();const review=ca.getByRole('region',{name:'智能整理记录'})
  const recognized=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/members/${memberId}/ai-drafts`&&r.request().method()==='POST',{timeout:180000})
  await review.getByRole('button',{name:'整理成待确认记录',exact:true}).click();const response=await recognized,body=await response.json()
  if(!response.ok())throw Object.assign(new Error('Real configured OCR unavailable'),{safe:{status:response.status(),code:body.error?.code??null,gate:'realOCR'}})
  draftId=body.id;assert.equal(body.state,'ready');assert.equal(body.sourceRecordId,original.id);assert.equal(body.targetEventId,a.eventId)
  assert.ok(body.sources.some(s=>['readable','uncertain'].includes(s.status)&&s.text));result.checks.realOCR='PASS_ON_THIS_SYNTHETIC_IMAGE_ONLY'
  const confirm=review.getByRole('button',{name:/已核对，一次保存/})
  await expect(confirm).toBeEnabled({timeout:45000});await confirm.click();await expect(review.getByText(/已保存 \d+ 条记录/, {exact:true})).toBeVisible()
  records=await api(`/api/events/${a.eventId}/records`,undefined,'GET');assert.ok(records.some(r=>r.id===original.id&&r.caseContext?.confirmed))
  assert.equal((await api(`/api/events/${a.eventId}/attachments`,undefined,'GET')).length,1);result.checks.realReviewSameOriginal='PASS'
  await review.getByRole('button',{name:'完成',exact:true}).click();await material.getByRole('button',{name:'关闭资料区域',exact:true}).click()
  const before=records.map(r=>r.id).sort()
  await ca.getByRole('button',{name:'标记已康复',exact:true}).click();await expect(ca).toHaveCount(0);await expect(page.getByRole('tab',{name:/跟进中/})).toHaveAttribute('aria-selected','true')
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(ca).toBeVisible()
  await ca.getByRole('button',{name:'标记已康复',exact:true}).click();await expect(ca).toHaveCount(0);await page.getByRole('tab',{name:/已康复/}).click()
  await expect(ca).toContainText('用户标记康复');await expect(ca.getByRole('button',{name:'继续记录',exact:true})).toHaveCount(0)
  await expect(card(legacy.eventId)).toContainText('历史归档');await expect(card(legacy.eventId)).not.toContainText('用户标记康复')
  await ca.getByRole('button',{name:'展开',exact:true}).click();await expect(ca.locator('li')).toHaveCount(before.length)
  await screenshot('recovered-375');await ca.getByRole('button',{name:'恢复跟进',exact:true}).click();await expect(ca).toHaveCount(0);await page.getByRole('tab',{name:/跟进中/}).click();await expect(ca).toBeVisible()
  assert.deepEqual((await api(`/api/events/${a.eventId}/records`,undefined,'GET')).map(r=>r.id).sort(),before);result.checks.recoveryUndoRestoreLegacyRetention='PASS'
  assert.equal((await api(`/api/members/${otherId}/cases`,undefined,'GET')).active.length,0)
  assert.equal((await raw(`/api/members/${otherId}/case-records`,{eventId:a.eventId,text:'合成跨成员拒绝验收',files:[],occurredAt:instant,requestId:randomUUID()})).status,404);result.checks.memberIsolation='PASS'
  for(const width of [320,375,390,430]){await page.setViewportSize({width,height:667});await ca.getByRole('button',{name:'继续记录',exact:true}).click();await expect(form.getByLabel('哪里不舒服')).toBeVisible();await screenshot(`inline-${width}`);page.once('dialog',d=>d.accept());await form.getByRole('button',{name:'取消',exact:true}).click()}
  result.checks.mobileWidths='PASS';assert.equal(result.runtimeErrors,0)
}catch(error){result.failure=error.safe??{name:error.name,message:String(error.message).slice(0,400)};await screenshot('failure').catch(()=>{});process.exitCode=1}
finally{
  if(draftId)await api(`/api/members/${memberId}/ai-drafts/${draftId}`,undefined,'DELETE').then(()=>result.cleanup.draft='REMOVED').catch(()=>result.cleanup.draft='FAILED')
  for(const id of [memberId,otherId].filter(Boolean))await api(`/api/members/${id}`,undefined,'DELETE').then(()=>result.cleanup[id===memberId?'syntheticMember':'isolationMember']='REMOVED').catch(()=>result.cleanup[id===memberId?'syntheticMember':'isolationMember']='FAILED')
  result.cleanup.syntheticAccount=registered?'RETAINED_NO_IDENTITY_DELETION_BYPASS':'NOT_CREATED';result.finishedAt=new Date().toISOString()
  result.automatedGate=!result.failure&&result.runtimeErrors===0&&result.cleanup.syntheticMember==='REMOVED'&&result.cleanup.isolationMember==='REMOVED'?'PASS':'FAIL'
  if(result.automatedGate!=='PASS')process.exitCode=1
  await writeFile(path.join(output,'verification.json'),JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result));await context.close();await browser.close()
}
