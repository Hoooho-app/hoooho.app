import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const baseURL = process.argv[2]
if (!['http://127.0.0.1:4196', 'https://hoooho.com', 'https://staging.hoooho.com', 'https://hooohoapp-staging.up.railway.app'].includes(baseURL)) throw new Error('Explicit verified target required')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context=await browser.newContext({...devices['iPhone SE (3rd gen)'],timezoneId:'Asia/Shanghai'})
const page=await context.newPage(), failures=[]
const started=new WeakMap()
const safePath=url=>new URL(url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id')
page.on('request',r=>started.set(r,Date.now()))
page.on('requestfinished',r=>{const elapsed=Date.now()-(started.get(r)??Date.now());if(r.url().startsWith(baseURL+'/api/')&&elapsed>5000)console.log(`Slow API ${r.method()} ${safePath(r.url())}: ${elapsed}ms`)})
page.on('requestfailed',r=>{if(r.url().startsWith(baseURL+'/api/'))console.log(`API transport failure ${r.method()} ${safePath(r.url())}: ${r.failure()?.errorText??'unknown'}`)})
page.on('pageerror',()=>failures.push('pageerror'))
page.on('response',r=>{if(r.status()>=500)failures.push(`${new URL(r.url()).pathname}: ${r.status()}`)})
await mkdir('outputs/visit-sheet-v6',{recursive:true})
const prefix=`outputs/visit-sheet-v6/${new URL(baseURL).hostname}`
let memberId,eventId,recordIds=[],attachmentEvents=[],readRetries=0
async function waitForReport(){
  const heading=page.getByRole('heading',{name:'病情数据',exact:true})
  await expect(heading.or(page.getByText('情况单暂时无法打开',{exact:true}))).toBeVisible({timeout:35000})
  if(await heading.isVisible())return
  readRetries++
  console.log('Report load showed a recoverable error; testing one explicit UI retry')
  await page.screenshot({path:`${prefix}-read-retry-${readRetries}.png`})
  await page.getByRole('button',{name:'重试',exact:true}).click()
  await expect(heading).toBeVisible({timeout:35000})
}
async function api(url,body,method='POST'){
  return page.evaluate(async({url,body,method})=>{
    const session=await(await fetch('/api/auth/session')).json()
    const response=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`,'X-Hoooho-Timezone':'Asia/Shanghai'},...(body===undefined?{}:{body:JSON.stringify(body)})})
    if(!response.ok)throw new Error(`smoke ${method} ${url}: ${response.status}`)
    return response.json()
  },{url,body,method})
}
try{
  const health=await page.goto(`${baseURL}/api/health`);assert.equal(health.status(),200)
  await page.goto(`${baseURL}/login`)
  await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`情况单验收${randomUUID().slice(0,6)}`)
  await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  for(let attempt=0;attempt<3;attempt++){
    const pendingRegistration=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register'&&r.request().method()==='POST')
    await page.getByRole('button',{name:'注册并进入'}).click()
    const response=await pendingRegistration
    if(response.ok())break
    const error=(await response.json().catch(()=>({}))).error
    const retryAfter=Number(error?.retryAfter)
    assert.ok(response.status()===429&&error?.code==='REGISTER_RATE_LIMITED'&&retryAfter>0&&retryAfter<=900&&attempt<2,`Registration unavailable: HTTP ${response.status()}, code ${error?.code??'unknown'}`)
    // Respect the server's window; keep the same form/session and never alter rate-limit identity.
    let remaining=(retryAfter+2)*1000
    console.log(`Registration rate limited; respecting retryAfter=${retryAfter}s`)
    while(remaining>0){const pause=Math.min(remaining,30000);await new Promise(resolve=>setTimeout(resolve,pause));remaining-=pause;console.log(`Registration retry wait remaining=${Math.ceil(remaining/1000)}s`)}
  }
  await page.waitForURL(/nurse-station/)
  memberId=(await api('/api/members',{name:'情况单验收（合成）',relationship:'child',birthday:'2024-01-01',gender:'female'})).id
  await api('/api/auth/current-member',{memberId})
  const occurredAt=new Date(Date.now()-86400000).toISOString()
  const captured=await api(`/api/members/${memberId}/case-records`,{requestId:randomUUID(),text:'发布验收：肘窝皮肤发红',occurredAt,timeUnknown:false,identity:'parent',files:[],journal:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'发布验收：肘窝皮肤发红',locations:[],descriptors:[],impactLevel:'little'}}})
  eventId=captured.eventId
  const record={id:captured.recordId}
  recordIds.push(record.id)
  await page.goto(`${baseURL}/nurse-station`)
  await page.getByRole('link',{name:'就诊情况单，就诊前，一页理清病情',exact:true}).click()
  await waitForReport()
  const initial=await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')
  assert.equal(initial.report.complaintSourceId,`record:${record.id}`)
  assert.equal(initial.report.chapters.length,9)
  assert.equal(initial.report.schemaVersion,6)
  assert.equal(await page.locator('[data-scroll-container] > .visit-chapter').count(),9)
  assert.equal(await page.locator('.visit-chapter-details[open]').count(),0)
  await page.screenshot({path:`${prefix}-auto.png`})
  const scope=page.getByRole('dialog',{name:'本次资料范围',exact:true})
  await page.getByRole('button',{name:'资料范围',exact:true}).click()
  await scope.getByRole('radio',{name:'选择情况与时间',exact:true}).check()
  await scope.getByRole('checkbox',{name:'发布验收：肘窝皮肤发红',exact:true}).check()
  await scope.getByLabel('开始时间（选填）').fill('2026-09-20T00:00')
  await scope.getByLabel('结束时间（选填）').fill('2026-09-01T00:00')
  await expect(scope.getByRole('alert')).toContainText('开始时间不能晚于结束时间')
  await expect(scope.getByRole('button',{name:'预览范围变化',exact:true})).toBeDisabled()
  assert.equal((await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')).report.version,initial.report.version)
  await scope.getByLabel('开始时间（选填）').fill('2026-09-01T00:00')
  await scope.getByRole('button',{name:'预览范围变化',exact:true}).click()
  await expect(scope.getByRole('status')).toContainText('将纳入')
  assert.equal((await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')).report.version,initial.report.version)
  await scope.getByRole('button',{name:'确认范围并更新情况单',exact:true}).click()
  await expect(scope).toHaveCount(0)
  await page.getByRole('button',{name:'调整 / 恢复资料范围',exact:true}).click()
  await scope.getByRole('button',{name:'撤销上一次范围调整',exact:true}).click()
  await expect(scope).toHaveCount(0)
  assert.equal((await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')).report.sources.length,initial.report.sources.length)
  await page.getByRole('button',{name:'更改主诉',exact:true}).click()
  await page.getByLabel('本次主诉（家长陈述）').fill('合成验收：希望核对下一次记录')
  await page.getByRole('button',{name:'保存并更新情况单'}).click()
  await page.getByRole('heading',{name:'合成验收：希望核对下一次记录',exact:true}).waitFor()
  await page.goto(`${baseURL}/health-events`)
  await page.getByRole('button',{name:'就诊情况单，孩子情况快速整理',exact:true}).click()
  await waitForReport()
  const updated=await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')
  assert.equal(updated.report.id,initial.report.id);assert.equal(updated.report.version,initial.report.version+3);assert.equal(updated.report.focus.mode,'custom')
  for(const title of ['病程与变化','用药与处理','过敏与饮食观察','既往与相关背景','体温记录','成长与日常','就诊与检查','附件与完整依据']){
    await page.getByRole('button',{name:'章节目录',exact:true}).click()
    await page.getByRole('dialog',{name:'章节目录'}).getByRole('button',{name:new RegExp(title)}).click()
    await page.getByRole('heading',{name:title,exact:true}).waitFor()
    await expect.poll(async()=>{const box=await page.getByRole('heading',{name:title,exact:true}).boundingBox();return !!box&&box.y>=56&&box.y<180},{message:`目录定位完成：${title}`}).toBe(true)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  }
  await page.getByRole('button',{name:'编辑本次想问',exact:true}).click()
  await page.getByRole('dialog',{name:'编辑本次想问'}).getByRole('textbox').fill('本次发布验收问题（合成）')
  await page.getByRole('button',{name:'保存并更新情况单'}).click()
  await page.getByRole('dialog',{name:'编辑本次想问'}).waitFor({state:'hidden'})
  await page.reload();assert.equal((await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')).report.question,'本次发布验收问题（合成）')
  await page.getByRole('button',{name:'添加 / 调整照片',exact:true}).click()
  const buffer=await sharp({create:{width:36,height:24,channels:3,background:'#147968'}}).png().toBuffer()
  await page.getByLabel('选择要上传的照片').setInputFiles({name:'发布验收纯色几何图.png',mimeType:'image/png',buffer})
  const picker=page.getByRole('dialog',{name:'添加 / 调整照片'})
  await expect(picker.getByText(/上传完成，待保存/)).toBeVisible()
  await picker.getByRole('button',{name:'保存照片选择'}).click();await expect(picker).toHaveCount(0)
  await page.reload();await waitForReport();await expect(page.locator('.visit-photos img')).toHaveCount(1,{timeout:15000})
  const withPhoto=(await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')).report
  const photo=withPhoto.photos.find(p=>withPhoto.selectedPhotoIds.includes(p.sourceId)),photoSource=withPhoto.sources.find(s=>s.id===photo.sourceId)
  assert.equal(photo.capturedAt,null);assert.ok(!photoSource.recordId);attachmentEvents.push(photoSource.eventId)
  await page.screenshot({path:`${prefix}-photo-saved.png`})
  for(const width of [320,375,390,420,430,1280]){await page.setViewportSize({width,height:width===1280?900:667});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  await page.setViewportSize(devices['iPhone SE (3rd gen)'].viewport)
  await page.getByRole('button',{name:'导出情况单',exact:true}).click()
  const exports=page.getByRole('dialog',{name:'导出情况单',exact:true})
  await expect(exports.getByRole('radio',{name:'本次重点（默认）',exact:true})).toBeChecked()
  assert.ok((await exports.getByLabel('问诊提示词',{exact:true}).inputValue()).length<10000)
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'保存完整离线报告（HTML）'}).click();const download=await pending;const file=`${prefix}-report.html`;await download.saveAs(file)
  const html=await readFile(file,'utf8');assert.match(html,/合成验收：希望核对下一次记录/);assert.match(html,/发布验收：肘窝皮肤发红/);assert.match(html,/data:image\/webp;base64,/);assert.ok(!html.includes('Bearer'))
  await page.screenshot({path:`${prefix}-export.png`})
  assert.ok(!html.includes(record.id));assert.ok(!html.includes('<script src='))
  const offlineContext=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'block'}),offline=await offlineContext.newPage()
  await offlineContext.setOffline(true);await offline.goto(pathToFileURL(path.resolve(file)).href)
  assert.equal(await offline.locator('main > section.visit-chapter').count(),9)
  await offline.getByRole('button',{name:'编辑本次想问',exact:true}).click();await offline.getByRole('textbox',{name:'本次想问',exact:true}).fill('离线问题（合成）');await offline.getByRole('button',{name:'保存本地修改'}).click();await offline.reload()
  assert.equal(await offline.locator('#copy-question').textContent(),'离线问题（合成）');await offlineContext.close()
  assert.deepEqual(failures,[])
  console.log(JSON.stringify({target:baseURL,health:'PASS',bothEntries:'PASS',autoGenerate:'PASS',scopeInverseNoSave:'PASS',scopePreviewNoSave:'PASS',scopeUndo:'PASS',briefCopyDefault:'PASS',persistedFocus:'PASS',persistedQuestion:'PASS',realPhotoUploadSaveReload:'PASS',nineChapters:'PASS',defaultCollapsed:'PASS',offlineOpenEditReload:'PASS',widths:[320,375,390,420,430,1280],readRetries,runtimeErrors:0}))
}catch(error){await page.screenshot({path:`${prefix}-failure.png`}).catch(()=>{});throw error}
finally{
  // Only identifiers created above in this isolated synthetic account are removed.
  const cleanup=[]
  // A timeout before reading the saved photo metadata must not orphan the run's
  // upload event. This member was created above, so only its exact owned events
  // are eligible for cleanup; no other member/account is affected.
  if(memberId){const owned=await api('/api/events',undefined,'GET').catch(()=>[]);for(const e of owned.filter(e=>e.memberId===memberId))if(e.id!==eventId&&!attachmentEvents.includes(e.id))attachmentEvents.push(e.id)}
  for(const id of recordIds)await api(`/api/records/${id}`,undefined,'DELETE').catch(()=>cleanup.push('synthetic record'))
  if(eventId)await api(`/api/events/${eventId}`,undefined,'DELETE').catch(()=>cleanup.push('synthetic event'))
  for(const id of attachmentEvents)await api(`/api/events/${id}`,undefined,'DELETE').catch(()=>cleanup.push('synthetic photo event'))
  if(memberId)await api(`/api/members/${memberId}`,undefined,'DELETE').catch(()=>cleanup.push('synthetic member'))
  if(memberId)console.log(cleanup.length?`Cleanup incomplete: ${cleanup.join(', ')}`:'Removed only this smoke run\'s synthetic records, event and member; isolated account/report audit remains.')
  await context.close();await browser.close()
}
