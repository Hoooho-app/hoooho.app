// Opt-in HTTPS Staging acceptance. No model substitutes, production writes,
// variable/secret loading, physical-camera claims, or automatic model retries.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices, expect } from '@playwright/test'

if (process.env.RUN_HOOOHO_CONTINUITY_STAGING !== '1') throw new Error('Staging acceptance opt-in required')
const base = 'https://hooohoapp-staging.up.railway.app', output = path.resolve('outputs/continuity-v3/staging')
await mkdir(output, { recursive:true })
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context = await browser.newContext({...devices['iPhone SE'],timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page = await context.newPage();page.setDefaultTimeout(45000)
const result = {target:base,startedAt:new Date().toISOString(),checks:{},screenshots:[],runtimeErrors:0,http5xx:0,cleanup:{},realASR:'NOT_VERIFIED',physicalIOSCamera:'NOT_VERIFIED',systemNotification:'BLOCKED_CHANNEL_UNVERIFIED'}
let token,memberId,aiDraftId
page.on('pageerror',()=>result.runtimeErrors++)
page.on('response',response=>{if(response.status()>=500 && !/ai-drafts/.test(response.url()))result.http5xx++})
async function api(url,data,method='POST') {
  const response = await context.request.fetch(base+url,{method,headers:{Authorization:`Bearer ${token}`,'X-Hoooho-Timezone':'Asia/Shanghai'},...(data===undefined?{}:{data}),timeout:45000,maxRetries:0})
  const body = await response.json().catch(()=>null)
  if (!response.ok()) throw Object.assign(new Error('Acceptance API failed'),{safe:{status:response.status(),code:body?.error?.code??null}})
  return body
}
async function screenshot(name) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const file=path.join(output,name+'.png');await page.screenshot({path:file});result.screenshots.push(file)
}
try {
  assert.equal((await context.request.get(base+'/api/health')).status(),200);result.checks.health='PASS'
  await page.goto(base+'/login');await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill('情况验收'+randomUUID().slice(0,8));await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registration=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'注册并进入',exact:true}).click();assert.ok((await registration).ok())
  const session=await(await context.request.get(base+'/api/auth/session')).json();token=session.token;assert.ok(token)
  memberId=(await api('/api/members',{name:'合成验收，非真实患者',relationship:'child',gender:'female',birthday:'2025-01-01'})).id
  await api('/api/auth/current-member',{memberId});await page.goto(base+'/nurse-station');await expect(page.getByText('还没有正在跟进的情况')).toBeVisible()
  await screenshot('home-empty-320');await page.setViewportSize({width:375,height:667});await screenshot('home-empty-375')
  await page.getByRole('link',{name:'情况收记 有情况先记下来',exact:true}).click();await page.getByRole('textbox',{name:'发生了什么（主诉）？'}).fill('合成示例，非真实患者资料：记录皮肤变化，原因未明确。')
  await screenshot('smart-record-375');await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  const eventId=page.url().split('/').at(-1);assert.equal((await api(`/api/members/${memberId}/cases`,undefined,'GET')).active.length,1);result.checks.rawSave='PASS'
  await page.getByRole('link',{name:'安排观察',exact:true}).click();await page.getByRole('textbox',{name:'观察什么',exact:true}).fill('合成皮肤变化与照片');await screenshot('observation-plan-375');await page.getByRole('button',{name:'确认安排',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  await page.getByRole('link',{name:'记录今天的变化',exact:true}).click();await page.getByRole('textbox',{name:'发生了什么（主诉）？'}).fill('合成示例：今天未观察，不补为正常。');await page.getByRole('button',{name:'未观察',exact:true}).click();await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click()
  await page.goto(base+'/nurse-station');await expect(page.getByText('今日已记录 1/1（1次未观察）')).toBeVisible();await screenshot('home-observation-375');result.checks.observationFeedback='PASS'
  await page.locator('.nurse-home-entry').last().scrollIntoViewIfNeeded();const sizes=await page.locator('.nurse-home-entry').evaluateAll(cards=>cards.map(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height})));assert.equal(sizes.length,6);assert.equal(new Set(sizes.map(s=>s.h)).size,1);assert.ok(Math.max(...sizes.map(s=>s.w))-Math.min(...sizes.map(s=>s.w))<1);await screenshot('home-six-entries-375');result.checks.sixCardsFrozen='PASS'
  for (const width of [390,430,1280]) {await page.setViewportSize({width,height:width===1280?900:800});await page.goto(base+'/nurse-station');await screenshot(`home-${width}`)}
  await page.setViewportSize({width:375,height:667});const source=await context.newPage();await source.setContent('<main style="font-family:sans-serif;padding:20px"><h1>合成示例，非真实患者资料</h1><p>问诊消息、检查报告及外部AI参考，仅供流程验收。诊断未明确。</p></main>');const png=await source.screenshot();await source.close()
  const files=[{name:'合成资料原件.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]
  for(const identity of ['medical_consultation','examination_report','external_ai']){
    const saved=await api(`/api/members/${memberId}/case-records`,{eventId,text:'合成示例，非真实患者资料：来源待核对，诊断与期限未明确。',files,identity:'pending',timeUnknown:true,occurredAt:new Date().toISOString(),requestId:randomUUID()})
    await page.goto(`${base}/cases/${eventId}/materials?recordId=${saved.recordId}`);await page.getByRole('combobox',{name:'资料来源'}).selectOption(identity);await page.getByRole('checkbox',{name:'已核对来源和原件，未知信息没有补猜'}).check();await screenshot(`return-${identity}-375`);await page.getByRole('button',{name:'确认接回这次情况',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  }
  result.checks.materialOriginalsAndManualConfirmation='PASS'
  const stored=await api(`/api/members/${memberId}/ai-drafts`,{text:'合成示例，非真实患者资料',files,deferRecognition:true,sourceIdentity:'pending',eventId,task:'record'});aiDraftId=stored.id;assert.equal(stored.pages.length,1);result.checks.originalsBeforeRecognition='PASS'
  // One attempt on the real configured provider, never a fixture key or response.
  try {const recognized=await api(`/api/members/${memberId}/ai-drafts`,{id:stored.id,version:stored.version,text:stored.inputText,sourceIdentity:'pending',task:'record'});assert.equal(recognized.state,'ready');result.checks.realOCR='PASS_ON_THIS_SYNTHETIC_IMAGE_ONLY'} catch(error) {result.checks.realOCR={status:'BLOCKED',...error.safe};const retained=await api(`/api/members/${memberId}/ai-drafts/${stored.id}`,undefined,'GET');assert.equal(retained.pages.length,1);result.checks.ocrFailureRetainsOriginal='PASS'}
  await page.goto(`${base}/visit-summary/${eventId}`);await expect(page.locator('#chapter-overview h1')).toContainText('合成示例');await screenshot('report-375');await page.getByRole('button',{name:'导出情况单',exact:true}).click();const pendingDownload=page.waitForEvent('download');await page.getByRole('button',{name:'保存完整离线报告（HTML）',exact:true}).click();await(await pendingDownload).saveAs(path.join(output,'synthetic-offline.html'));result.checks.scopedReportAndHTML='PASS'
  await api(`/api/members/${memberId}/cases/${eventId}/archive`,{archived:true});await page.goto(base+'/nurse-station');await expect(page.getByRole('link',{name:'查看已归档 1 件 ›',exact:true})).toBeVisible();await api(`/api/members/${memberId}/cases/${eventId}/archive`,{archived:false});const restored=await api(`/api/members/${memberId}/cases`,undefined,'GET');assert.equal(restored.active[0].observations[0].state,'paused');result.checks.archiveRestore='PASS'
} catch(error) {result.failure=error.safe??{name:error.name,message:String(error.message).slice(0,120)};process.exitCode=1}
finally {
  if (aiDraftId) {await api(`/api/members/${memberId}/ai-drafts/${aiDraftId}`,undefined,'DELETE').then(()=>result.cleanup.draft='REMOVED').catch(()=>result.cleanup.draft='FAILED')}
  if (memberId) {await api(`/api/members/${memberId}`,undefined,'DELETE').then(()=>result.cleanup.syntheticMember='REMOVED').catch(()=>result.cleanup.syntheticMember='FAILED')}
  result.cleanup.isolatedAcceptanceAccount='RETAINED_NO_IDENTITY_DELETION_BYPASS';result.finishedAt=new Date().toISOString()
  await writeFile(path.join(output,'verification.json'),JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result));await context.close();await browser.close()
}
