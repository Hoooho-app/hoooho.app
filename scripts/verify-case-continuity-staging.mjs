// Opt-in HTTPS acceptance. Production needs a separate explicit opt-in.
// variable/secret loading, physical-camera claims, or automatic model retries.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices, expect } from '@playwright/test'

const productionTarget = process.env.HOOOHO_CONTINUITY_TARGET === 'production'
if (productionTarget ? process.env.RUN_HOOOHO_CONTINUITY_PRODUCTION !== '1' : process.env.RUN_HOOOHO_CONTINUITY_STAGING !== '1') throw new Error('Target-specific acceptance opt-in required')
// Set only after explicit human acceptance of a degraded release. This changes
// release disposition, never the recorded AI/physical-device test outcomes.
const allowDegradedRelease = process.env.HOOOHO_CONTINUITY_ALLOW_DEGRADED_RELEASE === '1'
const knownQuotaBlock = process.env.HOOOHO_CONTINUITY_AI_BLOCKED_REASON === 'insufficient_quota'
const awaitingBailianAuthorization = process.env.HOOOHO_CONTINUITY_AI_BLOCKED_REASON === 'awaiting_bailian_staging_authorization'
const base = productionTarget ? 'https://hoooho.com' : 'https://hooohoapp-staging.up.railway.app', output = path.resolve(`outputs/continuity-v3/${productionTarget ? 'production' : 'staging'}`)
await mkdir(output, { recursive:true })
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context = await browser.newContext({...devices['iPhone SE'],timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page = await context.newPage();page.setDefaultTimeout(45000)
const result = {target:base,startedAt:new Date().toISOString(),checks:{},screenshots:[],runtimeErrors:0,http5xx:0,cleanup:{},realASR:'NOT_VERIFIED',physicalIOSCamera:'NOT_VERIFIED',systemNotification:'BLOCKED_CHANNEL_UNVERIFIED'}
let token,memberId,aiDraftId,registered=false
page.on('pageerror',()=>result.runtimeErrors++)
page.on('response',response=>{if(response.status()>=500 && !/ai-drafts/.test(response.url()))result.http5xx++})
async function api(url,data,method='POST') {
  // Chrome and Node request clients can use different system network paths.
  // Execute real same-origin HTTPS requests inside the browser used by the UI.
  const response = await page.evaluate(async ({url,data,method,token}) => {
    const r=await fetch(url,{method,credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json','X-Hoooho-Timezone':'Asia/Shanghai'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(url.includes('/ai-drafts')?130000:45000)})
    return {status:r.status,ok:r.ok,body:await r.json().catch(()=>null)}
  },{url:base+url,data,method,token})
  if (!response.ok) throw Object.assign(new Error('Acceptance API failed'),{safe:{status:response.status,code:response.body?.error?.code??null}})
  return response.body
}
async function screenshot(name) {
  if(name.startsWith('home-')) {
    await expect(page.locator('.nurse-station-hero__main')).toBeVisible()
    await expect(page.locator('.nurse-home-entry--medication')).toContainText('0 个提醒任务')
    await expect(page.locator('.nurse-home-entry--desensitization')).toHaveCount(0)
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const file=path.join(output,name+'.png');await page.screenshot({path:file});result.screenshots.push(file)
}
try {
  await page.goto(base+'/api/health');assert.equal((await api('/api/health',undefined,'GET')).status,'ok');result.checks.health='PASS'
  await page.goto(base+'/login');await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill('情况验收'+randomUUID().slice(0,8));await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  const registration=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'注册并进入',exact:true}).click();const registeredResponse=await registration
  if(!registeredResponse.ok()){const reason=await registeredResponse.json().catch(()=>null);throw Object.assign(new Error('Registration acceptance unavailable'),{safe:{status:registeredResponse.status(),code:reason?.error?.code??null,retryAfter:reason?.error?.retryAfter??reason?.error?.details?.retryAfter??null}})}
  registered=true
  const session=await api('/api/auth/session',undefined,'GET');token=session.token;assert.ok(token)
  memberId=(await api('/api/members',{name:'合成验收，非真实患者',relationship:'child',gender:'female',birthday:'2025-01-01'})).id
  await api('/api/auth/current-member',{memberId});await page.goto(base+'/nurse-station');await expect(page.getByRole('link',{name:'0件 · 查看列表 ›',exact:true})).toBeVisible()
  await screenshot('home-empty-320');await page.setViewportSize({width:375,height:667});await screenshot('home-empty-375')
  await page.getByRole('button',{name:'健康事件随时记，情况速记',exact:true}).click();await page.getByRole('textbox',{name:'发生了什么（主诉）？'}).fill('合成示例，非真实患者资料：记录皮肤变化，原因未明确。')
  await screenshot('smart-record-375');await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  const eventId=page.url().split('/').at(-1);assert.equal((await api(`/api/members/${memberId}/cases`,undefined,'GET')).active.length,1);result.checks.rawSave='PASS'
  await page.getByRole('link',{name:'安排观察',exact:true}).click();await page.getByRole('textbox',{name:'观察什么',exact:true}).fill('合成皮肤变化与照片');await screenshot('observation-plan-375');await page.getByRole('button',{name:'确认安排',exact:true}).click();await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  await page.getByRole('link',{name:'记录今天的变化',exact:true}).click();await page.getByRole('textbox',{name:'发生了什么（主诉）？'}).fill('合成示例：今天未观察，不补为正常。');await page.getByRole('button',{name:'未观察',exact:true}).click();await page.getByRole('button',{name:'先保存',exact:true}).click();await page.getByRole('button',{name:'确认保存',exact:true}).click()
  await page.goto(base+'/nurse-station');await expect(page.getByText('今日已记录 1/1（1次未观察）')).toBeVisible();await screenshot('home-observation-375');result.checks.observationFeedback='PASS'
  await page.locator('.nurse-home-entry').last().scrollIntoViewIfNeeded();const sizes=await page.locator('.nurse-home-entry').evaluateAll(cards=>cards.map(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height})));assert.equal(sizes.length,5);assert.equal(new Set(sizes.map(s=>s.h)).size,1);assert.ok(Math.max(...sizes.map(s=>s.w))-Math.min(...sizes.map(s=>s.w))<1);await screenshot('home-five-entries-375');result.checks.fiveCardsEqualSize='PASS'
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
  if(awaitingBailianAuthorization) result.checks.realOCR={state:'BLOCKED',code:'STAGING_BAILIAN_NOT_CONFIGURED',attempt:'NOT_CALLED_WITHOUT_CROSS_ENVIRONMENT_SECRET_AUTHORIZATION'}
  else if(knownQuotaBlock) result.checks.realOCR={state:'BLOCKED',code:'insufficient_quota',attempt:'NOT_RETRIED_KNOWN_BILLING_BLOCK'}
  else try {const recognized=await api(`/api/members/${memberId}/ai-drafts`,{id:stored.id,version:stored.version,text:stored.inputText,sourceIdentity:'pending',task:'record'});assert.equal(recognized.state,'ready');result.checks.realOCR='PASS_ON_THIS_SYNTHETIC_IMAGE_ONLY'} catch(error) {result.checks.realOCR={state:'BLOCKED',httpStatus:error.safe?.status,code:error.safe?.code};const retained=await api(`/api/members/${memberId}/ai-drafts/${stored.id}`,undefined,'GET');assert.equal(retained.pages.length,1);result.checks.ocrFailureRetainsOriginal='PASS'}
  await page.goto(`${base}/visit-summary/${eventId}`);await expect(page.locator('#chapter-overview h1')).toContainText('合成示例');await screenshot('report-375');const reportState=await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET');assert.deepEqual(reportState.report.selection.eventIds,[eventId]);assert.equal(reportState.report.focus.caseEventId,eventId);await page.getByRole('button',{name:'导出情况单',exact:true}).click();const pendingDownload=page.waitForEvent('download');await page.getByRole('button',{name:'保存完整离线报告（HTML）',exact:true}).click();await(await pendingDownload).saveAs(path.join(output,'synthetic-offline.html'));result.checks.scopedReportAndHTML='PASS'
  await api(`/api/members/${memberId}/cases/${eventId}/archive`,{archived:true});await page.goto(base+'/nurse-station');await expect(page.getByRole('link',{name:'查看已归档 1 件 ›',exact:true})).toBeVisible();await api(`/api/members/${memberId}/cases/${eventId}/archive`,{archived:false});const restored=await api(`/api/members/${memberId}/cases`,undefined,'GET');assert.equal(restored.active[0].observations[0].state,'paused');result.checks.archiveRestore='PASS'
  assert.equal(result.runtimeErrors,0);assert.equal(result.http5xx,0)
} catch(error) {
  result.failure=error.safe??{name:error.name,message:String(error.message).slice(0,500)}
  if(memberId) {
    await screenshot('failure-375').catch(()=>{})
    result.failure.pageHeadings=await page.locator('#chapter-overview h1').allTextContents().catch(()=>[])
    result.failure.notice=await page.locator('[role=alert]').allTextContents().catch(()=>[])
    const actual=await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET').catch(()=>null)
    result.failure.reportState=actual?{hasReport:!!actual.report,focusMode:actual.report?.focus?.mode,hasCaseFocus:!!actual.report?.focus?.caseEventId,selectedCases:actual.report?.selection?.eventIds?.length,syntheticComplaint:/合成示例/.test(actual.report?.complaint??''),sourceCount:actual.report?.sources?.length}:null
  }
  process.exitCode=1
}
finally {
  if (aiDraftId) {await api(`/api/members/${memberId}/ai-drafts/${aiDraftId}`,undefined,'DELETE').then(()=>result.cleanup.draft='REMOVED').catch(()=>result.cleanup.draft='FAILED')}
  if (memberId) {await api(`/api/members/${memberId}`,undefined,'DELETE').then(()=>result.cleanup.syntheticMember='REMOVED').catch(()=>result.cleanup.syntheticMember='FAILED')}
  result.cleanup.isolatedAcceptanceAccount=registered?'RETAINED_NO_IDENTITY_DELETION_BYPASS':'NOT_CREATED';result.finishedAt=new Date().toISOString()
  // Browser substitutes and a single OCR sample do not satisfy the explicit
  // physical-device/three-class AI release gate. Never return false-green.
  const corePassed=!result.failure&&result.runtimeErrors===0&&result.http5xx===0&&result.cleanup.draft==='REMOVED'&&result.cleanup.syntheticMember==='REMOVED'&&result.checks.archiveRestore==='PASS'
  result.releaseScope=allowDegradedRelease?'HUMAN_AUTHORIZED_AI_FAILURE_AND_PHYSICAL_ACCEPTANCE_DEFERRED':'ORIGINAL_FULL_ACCEPTANCE_REQUIRED'
  result.releaseGate=allowDegradedRelease&&corePassed?'CORE_PASS_WITH_EXPLICIT_AI_AND_PHYSICAL_LIMITATIONS':result.failure?'FAIL_CORE_ACCEPTANCE':'BLOCKED_AI_OR_PHYSICAL_DEVICE_ACCEPTANCE'
  process.exitCode=allowDegradedRelease&&corePassed?0:1
  await writeFile(path.join(output,'verification.json'),JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result));await context.close();await browser.close()
}
