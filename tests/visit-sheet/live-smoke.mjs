import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import sharp from 'sharp'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'

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
await mkdir('outputs/visit-four-cards',{recursive:true})
const prefix=`outputs/visit-four-cards/${new URL(baseURL).hostname}`
let memberId,eventId,recordIds=[],attachmentEvents=[],readRetries=0
async function waitForReport(){
  const heading=page.getByRole('heading',{name:'本次情况',exact:true})
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
  assert.equal(await page.locator('[data-reading-card]').count(),4)
  for(const [id,open]of [['overview',true],['medication',false],['course',false],['sources',false]])assert.equal(await page.locator('#chapter-'+id+' .visit-reading-toggle').getAttribute('aria-expanded'),String(open))
  await page.screenshot({path:`${prefix}-first.png`})
  await page.getByRole('button',{name:'编辑本次情况',exact:true}).click()
  await page.getByLabel('当前情况（家长补充）').fill('合成验收：未测温，不推断正常')
  await page.getByRole('dialog',{name:'编辑本次情况'}).getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'编辑本次情况'})).toHaveCount(0)
  await page.getByRole('button',{name:'更改主诉',exact:true}).click()
  await page.getByLabel('本次主诉（家长陈述）').fill('合成验收：希望核对下一次记录')
  await page.getByRole('dialog',{name:'更改主诉'}).getByRole('checkbox',{name:/发布验收：肘窝皮肤发红/}).check()
  await page.getByRole('dialog',{name:'更改主诉'}).getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'更改主诉'})).toHaveCount(0)
  await page.goto(baseURL+'/health-events')
  await page.getByRole('button',{name:'就诊情况单，孩子情况快速整理',exact:true}).click()
  await waitForReport()
  const changed=(await api('/api/members/'+memberId+'/visit-sheet',undefined,'GET')).report
  assert.equal(changed.id,initial.report.id);assert.deepEqual(changed.focus.relatedSourceIds,['record:'+record.id])
  for(const title of ['本次想问','经过与处理','完整资料','本次情况']){
    await page.getByRole('button',{name:'章节目录'}).click()
    const directory=page.getByRole('dialog',{name:'章节目录'})
    assert.equal(await directory.locator('nav button').count(),4)
    await directory.getByRole('button',{name:new RegExp(title)}).click()
    await expect(directory).toHaveCount(0)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  }
  await page.getByRole('button',{name:'查看原话',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'原始依据'})).toContainText('发布验收：肘窝皮肤发红')
  await page.getByRole('dialog',{name:'原始依据'}).getByRole('button',{name:'关闭原始依据',exact:true}).click()
  await page.getByRole('button',{name:'编辑本次想问',exact:true}).click()
  await page.getByRole('textbox',{name:'本次想问',exact:true}).fill('本次发布验收问题（合成）')
  await page.getByRole('dialog',{name:'编辑本次想问'}).getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'编辑本次想问'})).toHaveCount(0)
  await page.reload();await waitForReport()
  assert.equal((await api('/api/members/'+memberId+'/visit-sheet',undefined,'GET')).report.question,'本次发布验收问题（合成）')
  await page.getByRole('button',{name:'编辑完整资料',exact:true}).click()
  await page.getByRole('button',{name:'添加 / 调整影像',exact:true}).click()
  const buffer=await sharp({create:{width:36,height:24,channels:3,background:'#147968'}}).png().toBuffer()
  const videoPath=path.resolve(prefix+'-synthetic.mp4')
  await promisify(execFile)(ffmpeg.path,['-f','lavfi','-i','color=c=teal:s=160x120:d=2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',videoPath],{windowsHide:true})
  const videoBuffer=await readFile(videoPath)
  await page.getByLabel('选择要上传的影像').setInputFiles([{name:'发布验收纯色几何图.png',mimeType:'image/png',buffer},{name:'发布验收合成视频.mp4',mimeType:'video/mp4',buffer:videoBuffer}])
  const picker=page.getByRole('dialog',{name:'添加 / 调整影像'})
  await expect(picker.getByText(/上传完成，待保存/)).toHaveCount(2,{timeout:45000})
  await picker.getByRole('button',{name:'保存影像选择'}).click();await expect(picker).toHaveCount(0)
  await page.reload();await waitForReport();await expect(page.locator('.visit-photos img')).toHaveCount(1,{timeout:15000});await expect(page.locator('.visit-video-thumb')).toHaveCount(1)
  const saved=(await api('/api/members/'+memberId+'/visit-sheet',undefined,'GET')).report
  for(const photo of saved.photos.filter(p=>saved.selectedPhotoIds.includes(p.sourceId))){
    assert.equal(photo.capturedAt,null);const source=saved.sources.find(s=>s.id===photo.sourceId);assert.ok(!source.recordId);attachmentEvents.push(source.eventId)
  }
  await page.getByRole('button',{name:'查看视频 2'}).click()
  const player=page.getByRole('dialog',{name:'视频原件'}).locator('video')
  await expect.poll(()=>player.evaluate(e=>e.readyState)).toBeGreaterThanOrEqual(2)
  await player.evaluate(e=>e.play());await expect.poll(()=>player.evaluate(e=>e.currentTime)).toBeGreaterThan(0)
  await page.getByRole('dialog',{name:'视频原件'}).getByRole('button',{name:'关闭视频原件',exact:true}).click()
  await page.getByRole('button',{name:'更新情况单',exact:true}).click();const draft=page.getByRole('dialog',{name:'更新情况单'})
  await draft.getByRole('button',{name:'整理并查看草稿',exact:true}).click()
  await expect(draft.getByRole('button',{name:'确认替换情况单'})).toBeVisible()
  assert.equal((await api('/api/members/'+memberId+'/visit-sheet',undefined,'GET')).report.version,saved.version)
  await draft.getByRole('button',{name:'返回更新情况单'}).click()
  assert.equal((await api('/api/members/'+memberId+'/visit-sheet',undefined,'GET')).report.version,saved.version)
  await page.getByRole('button',{name:'更新情况单',exact:true}).click();await draft.getByRole('button',{name:'整理并查看草稿'}).click();await draft.getByRole('button',{name:'确认替换情况单'}).click();await expect(draft).toHaveCount(0)
  assert.equal((await api('/api/members/'+memberId+'/visit-sheet',undefined,'GET')).report.version,saved.version+1)
  for(const width of [320,375,393,430,1280]){
    await page.setViewportSize({width,height:width===393?852:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    if(width===393||width===1280)await page.screenshot({path:prefix+'-'+width+'.png'})
  }
  await page.setViewportSize({width:393,height:852})
  await page.locator('[data-scroll-container]').evaluate(e=>Object.assign(e.style,{position:'static',height:'auto',overflow:'visible'}))
  await page.locator('.visit-report').evaluate(e=>Object.assign(e.style,{position:'static',overflow:'visible',height:'auto',minHeight:'100vh'}))
  await page.locator('html,body,#root').evaluateAll(elements=>elements.forEach(e=>Object.assign(e.style,{height:'auto',overflow:'visible'})))
  await page.screenshot({path:prefix+'-full.png',fullPage:true})
  await page.reload();await waitForReport()
  await page.getByRole('button',{name:'导出情况单',exact:true}).click()
  const exports=page.getByRole('dialog',{name:'导出情况单',exact:true})
  const pending=page.waitForEvent('download');await exports.getByRole('button',{name:'保存 HTML 情况单'}).click()
  const download=await pending,file=prefix+'-confirmed.html';await download.saveAs(file)
  const html=await readFile(file,'utf8');assert.match(html,/合成验收：希望核对下一次记录/);assert.match(html,/发布验收：肘窝皮肤发红/);assert.match(html,/data:image\/webp;base64,/);assert.match(html,/data:video\/mp4;base64,/)
  for(const secret of ['Bearer','blob:',record.id,memberId])assert.ok(!html.includes(secret))
  const offlineContext=await browser.newContext({viewport:{width:393,height:852},serviceWorkers:'block'}),offline=await offlineContext.newPage()
  await offlineContext.setOffline(true);await offline.goto(pathToFileURL(path.resolve(file)).href)
  const offlineVideo=offline.locator('video');await expect.poll(()=>offlineVideo.evaluate(e=>e.readyState)).toBeGreaterThanOrEqual(2)
  await offlineVideo.evaluate(e=>e.play());await expect.poll(()=>offlineVideo.evaluate(e=>e.currentTime)).toBeGreaterThan(0)
  await offline.screenshot({path:prefix+'-offline-playing.png'});await offlineContext.close()
  assert.deepEqual(failures,[])
  console.log(JSON.stringify({target:baseURL,health:'PASS',bothEntries:'PASS',fourCards:'PASS',sourceQuote:'PASS',editsSaveReload:'PASS',customFocusExplicitSources:'PASS',photoAndVideoUploadSaveReload:'PASS',previewCancelConfirm:'PASS',offlineActualVideoPlayback:'PASS',widths:[320,375,393,430,1280],runtimeErrors:0,readRetries,paidModelCalls:0}))

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
  for(const id of new Set(attachmentEvents.filter(Boolean)))await api(`/api/events/${id}`,undefined,'DELETE').catch(()=>cleanup.push('synthetic photo event'))
  if(memberId)await api(`/api/members/${memberId}`,undefined,'DELETE').catch(()=>cleanup.push('synthetic member'))
  if(memberId)console.log(cleanup.length?`Cleanup incomplete: ${cleanup.join(', ')}`:'Removed only this smoke run\'s synthetic records, event and member; isolated account/report audit remains.')
  await context.close();await browser.close()
}
