import { test as base, expect, chromium } from '@playwright/test'
// A separate browser per flow also supports Chromium's single-process fallback.
const test=base.extend({page:async({launchOptions,baseURL},use)=>{const browser=await chromium.launch(launchOptions);const page=await browser.newPage({baseURL,viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'});try{await use(page)}finally{await browser.close()}}})
import sharp from 'sharp'
import {PDFDocument} from 'pdf-lib'
import {execFileSync} from 'node:child_process'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'
import {useLegacyFrontProtocol} from '../helpers/front-protocol-compat'
import { finishNursingQuestions, waitForNurseReply } from '../helpers/nursing-interview'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string

test.beforeEach(async({page,request})=>{
 const response=await request.post('/api/members',{headers,data:{name:'小禾（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'}})
 expect(response.ok()).toBe(true);memberId=(await response.json()).id
 await request.get('http://127.0.0.1:4198/success')
 await request.get('http://127.0.0.1:4198/delay?ms=400')
 await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}));let calls=0;Object.defineProperty(window,'__speechCalls',{get:()=>calls});if(window.speechSynthesis)window.speechSynthesis.speak=()=>{calls++}},{token,memberId})
 await page.goto('/nurse-station')
 await expect(page.getByRole('button',{name:'切换记录对象',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
})

// Current home conversation/card/follow-up contracts are exercised by tests/front-desk-continuous.
test('home navigation and record entries retain the conversation without exit prompts',async({page,request})=>{
 await typeText(page,'昨天脸颊有点红')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await waitForNurseReply(page)
 await typeText(page,'这句补充还没有发送')
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('button',{name:'喂养与饮食',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'退出智能记录',exact:true})).toHaveCount(0)
 const feeding=page.getByRole('dialog',{name:'喂养/饮食',exact:true})
 await expect(feeding).toBeVisible()
 await feeding.getByRole('button',{name:'返回',exact:true}).click()
 await expect(page).toHaveURL(/nurse-station$/)
 await expect(page.locator('.nurse-turn--user').first()).toContainText('昨天脸颊有点红')
 await expect(page.getByLabel('对话输入')).toHaveValue('这句补充还没有发送')
 expect((await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()).id).toBe(context.id)
 await page.getByRole('button',{name:'快速查找',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'退出智能记录',exact:true})).toHaveCount(0)
 await expect(page).toHaveURL(/quick-search/)
 await page.goto('/nurse-station')
 await expect(page.getByLabel('对话输入')).toHaveValue('这句补充还没有发送')
})

async function typeText(page:import('@playwright/test').Page,value:string){
 const keyboard=page.getByRole('button',{name:'改用文字',exact:true})
 if(await keyboard.isVisible())await keyboard.click()
 await page.getByLabel('对话输入').fill(value)
}
async function startNew(page:import('@playwright/test').Page){
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 await page.getByRole('navigation',{name:'对话记录',exact:true}).getByRole('button',{name:'新建对话',exact:true}).click()
 await expect(page.locator('.hoho-dialogue-composer--conversation')).toBeVisible()
 // New-conversation archival is asynchronous; wait for its final voice state
 // instead of asserting against the disabled keyboard while it is unmounting.
 await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
 await expect(page.getByLabel('对话输入')).toHaveCount(0)
}

test('new conversation survives reload and exposes submitted originals and unsent drafts in history',async({page},info)=>{
 const raw='昨天脸颊有点红'
 await typeText(page,raw)
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await waitForNurseReply(page)
 await expect(page.locator('.nurse-turn--assistant .nurse-avatar')).toHaveCount(0)
 expect(await page.locator('.nurse-turn--user .nurse-turn-content').first().evaluate(e=>e.getBoundingClientRect().width)).toBeLessThanOrEqual((await page.locator('.nurse-conversation').evaluate(e=>e.getBoundingClientRect().width))*.85)
 await expect(page.locator('.conversation-time').first()).toContainText(/2026/)
 expect(await page.locator('.nurse-turn--assistant .nurse-turn-content').last().evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(235, 239, 230)')
 expect(await page.locator('.nurse-turn--user .nurse-turn-content').last().evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)')
 await page.screenshot({path:info.outputPath('chat.png')})
 await startNew(page)
 await page.reload();await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled();await typeText(page,'')
 await typeText(page,'还没发送的饮食观察')
 await startNew(page)
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 await page.getByRole('button',{name:'查看全部对话',exact:true}).click()
 await expect(page).toHaveURL(/conversation-history$/)
 await expect(page.getByRole('button').filter({hasText:raw})).toBeVisible()
 await expect(page.getByRole('button').filter({hasText:'还没发送的饮食观察'})).toBeVisible()
 await page.getByRole('button').filter({hasText:raw}).click()
 await expect(page.locator('.nurse-turn--user')).toContainText(raw)
 await expect(page.getByRole('button',{name:'回到当前对话',exact:true})).toBeVisible()
 await page.screenshot({path:info.outputPath('history-detail.png')})
 expect(await page.evaluate(()=>(window as any).__speechCalls)).toBe(0)
})

test('leaving with unsent input switches directly and restores the input',async({page})=>{
 await typeText(page,'尚未提交的观察，先查一下资料')
 await page.getByRole('button',{name:'快速查找',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'退出智能记录'})
 await expect(dialog).toHaveCount(0)
 await expect(page).toHaveURL(/quick-search/)
 await page.goBack()
 await expect(page.getByLabel('对话输入')).toHaveValue('尚未提交的观察，先查一下资料')
})


test('failed recording survives refresh, retries and remains readable after a new conversation',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/failure')
 const hold=page.getByRole('button',{name:'按住记录症状',exact:true})
 await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await page.waitForTimeout(650);await page.keyboard.up('Space')
 await expect(page.locator('.front-desk-failed-actions').getByRole('button',{name:'重试',exact:true})).toBeVisible()
 await page.reload()
 await expect(page.locator('.front-desk-failed-actions').getByRole('button',{name:'重试',exact:true})).toBeVisible()
 await request.get('http://127.0.0.1:4198/success')
 await page.locator('.front-desk-failed-actions').getByRole('button',{name:'重试',exact:true}).click()
 await finishNursingQuestions(page)
 await expect(page.getByRole('region',{name:'当前记录单'}).getByRole('status',{name:'记录已保存'})).toBeVisible()
 await startNew(page)
 await typeText(page,'另一段对话：今天吃了一碗粥')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await finishNursingQuestions(page)
 await expect(page.getByRole('region',{name:'当前记录单'}).getByRole('status',{name:'记录已保存'})).toBeVisible()
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 await page.getByRole('button',{name:'查看全部对话',exact:true}).click()
 await page.locator('.conversation-history-list button').filter({hasText:'本机草稿'}).filter({hasText:'今天没有呕吐'}).click()
 await expect(page.getByLabel('语音原件')).toBeVisible()
 await expect(page.locator('.nurse-conversation')).not.toContainText('另一段对话：今天吃了一碗粥')
 await page.getByRole('button',{name:'回到当前对话',exact:true}).click()
 await expect(page.locator('.nurse-conversation')).toContainText('另一段对话：今天吃了一碗粥')
})

test('camera retains the original image upload and feeding label opens its original form',async({page,request})=>{
 // A declared synthetic observation is a provider contract fixture, not a
 // claim that the uploaded color swatch was understood by a real model.
 await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null,visualOutput:{kind:'observation',status:'readable',text:'',observations:[{text:'合成可见表现：局部发红',region:'图片中央'}]}}})
 const png=await sharp({create:{width:96,height:96,channels:3,background:'#eeccaa'}}).png().toBuffer()
 const chooser=page.waitForEvent('filechooser')
 await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
 await(await chooser).setFiles({name:'合成观察.png',mimeType:'image/png',buffer:png})
 await finishNursingQuestions(page)
 const card=page.getByRole('region',{name:'当前记录单'}),recognition=card.getByRole('region',{name:'资料识别结果'})
 await expect(recognition).toContainText('合成可见表现：局部发红')
 await expect(card.getByRole('status').filter({hasText:'待核对记录对象，核对后保存'})).toBeVisible()
 await expect(card.getByRole('status',{name:'记录已保存'})).toHaveCount(0)
 await recognition.getByRole('button',{name:/^这是.+的资料$/}).click()
 await expect(recognition).toHaveCount(0)
 await expect(card).toContainText('合成可见表现：局部发红')
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
 await expect(page.getByRole('img',{name:'合成观察.png',exact:true})).toBeVisible()
 await startNew(page)
 await page.getByRole('button',{name:'改用文字',exact:true}).click()
 await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('button',{name:'喂养与饮食',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'喂养/饮食',exact:true})).toBeVisible()
})



test('a long conversation keeps the composer stable and lets the reader return to the latest message',async({page},info)=>{
 for(let i=0;i<6;i++){
  await typeText(page,`昨天脸颊有点红，原话观察第${i+1}次。`)
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(i+1)
  await waitForNurseReply(page)
 }
 const body=page.locator('.smart-record-page__body')
 await page.waitForTimeout(500)
 await body.evaluate(e=>{e.dispatchEvent(new WheelEvent('wheel',{deltaY:-500,bubbles:true}));e.scrollTop=0})
 await expect(page.getByRole('button',{name:'回到最新消息',exact:true})).toBeVisible()
 const top=await body.evaluate(e=>e.scrollTop)
 await page.waitForTimeout(600)
 expect(await body.evaluate(e=>e.scrollTop)).toBe(top)
 await page.getByRole('button',{name:'回到最新消息',exact:true}).click()
 await expect.poll(()=>body.evaluate(e=>e.scrollHeight-e.scrollTop-e.clientHeight)).toBeLessThan(80)
 await page.screenshot({path:info.outputPath('long-chat.png')})
})

test('recording keeps the home in place and supports cancellation without a ghost message',async({page},info)=>{
 const hold=page.getByRole('button',{name:'按住记录症状',exact:true})
 await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await expect(page.locator('.hoho-hold-feedback--conversation')).toBeVisible()
 await page.waitForTimeout(350)
 await page.screenshot({path:info.outputPath('recording.png')})
 await page.keyboard.press('Escape');await page.keyboard.up('Space')
 await expect(page.locator('.hoho-hold-feedback--conversation')).toHaveCount(0)
 await expect(hold).toBeEnabled()
 await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
})


test('compact sidebar and clean light canvas carry through the shared health pages',async({page})=>{
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:680})
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  const drawer=page.getByRole('dialog',{name:'侧边栏菜单'})
  expect((await drawer.locator('.hoho-drawer').boundingBox())!.width).toBeCloseTo(Math.min(width*.88,360),0)
  for(const row of await drawer.locator('.drawer-identity-row').all()){
   expect(await row.evaluate(e=>getComputedStyle(e).borderTopWidth)).toBe('0px')
   expect(await row.evaluate(e=>getComputedStyle(e).borderBottomWidth)).toBe('0px')
  }
  await page.keyboard.press('Escape')
 }
 for(const url of ['/health-events','/health-profile','/settings','/quick-search']){
  await page.goto(url)
  await expect(page.locator('.app-shell:not(.session-recovery-screen)')).toBeVisible()
  expect(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).backgroundImage)).toBe('none')
  expect(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(244, 242, 237)')
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#f4f2ed')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
})

test('one camera directly opens the system chooser and a blank PDF retains its original without a false candidate',async({page,request})=>{
 const picker=page.waitForEvent('filechooser')
 await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'添加附件',exact:true})).toHaveCount(0)
 const chosen=await picker
 expect(await chosen.element().getAttribute('accept')).toContain('video/mp4')
 const pdf=await PDFDocument.create();pdf.addPage([120,180])
 await chosen.setFiles({name:'虚构就诊原件.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())})
 const original=page.getByRole('group',{name:'PDF原件：虚构就诊原件.pdf',exact:true})
 await expect(original.getByRole('link',{name:'查看原件',exact:true})).toHaveAttribute('href',/^blob:/)
 // This PDF has an actually blank page. Retention is not successful clinical
 // extraction; keep the real original without manufacturing a review card.
 await expect.poll(async()=>(await(await request.get(`/api/members/${memberId}/recognition-jobs`,{headers})).json())?.state).toBe('ready')
 const completed=await(await request.get(`/api/members/${memberId}/recognition-jobs`,{headers})).json()
 expect(completed.review?.items??[]).toHaveLength(0)
 expect(completed.operationReceipt).toBeUndefined()
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toHaveCount(0)
 await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 await page.getByRole('button',{name:'确认整理',exact:true}).click()
 await expect(page.getByRole('region',{name:'当前记录单'}).getByRole('status',{name:'记录已保存'})).toBeVisible()
 await expect(page.getByText('已记录',{exact:true})).toHaveCount(0)
 await expect(page.locator('.smart-record-saved')).toHaveCount(0)
 await page.reload()
 await expect(page.getByRole('group',{name:'PDF原件：虚构就诊原件.pdf',exact:true}).getByRole('link',{name:'下载PDF',exact:true})).toHaveAttribute('href',/^blob:/)
})

test('video uploads and saves its real original without replacing the current conversation',async({page,request})=>{
 await typeText(page,'当前对话未发送的观察')
 const temp=mkdtempSync(path.join(tmpdir(),'hoho-video-home-')),videoPath=path.join(temp,'synthetic.mp4')
 try{
  execFileSync(ffmpeg.path,['-loglevel','error','-f','lavfi','-i','color=c=red:s=160x120:r=10','-t','1','-c:v','libx264','-pix_fmt','yuv420p',videoPath])
  const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
  await(await picker).setFiles({name:'虚构视频.mp4',mimeType:'video/mp4',buffer:readFileSync(videoPath)})
  const recorder=page.getByRole('dialog',{name:'核对视频记录',exact:true})
  await expect(recorder).toBeVisible()
  await expect(recorder.getByText('1. 虚构视频.mp4',{exact:true})).toBeVisible()
  await expect(recorder.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(1,{timeout:30000})
  await recorder.getByLabel('哪里不舒服',{exact:true}).fill('今天观察到孩子手臂发红，附原始视频')
  page.once('dialog',dialog=>dialog.accept())
  await recorder.getByRole('button',{name:'返回',exact:true}).click()
  // Returning from the recorder keeps its separate draft and the unsent chat input.
  if(await recorder.isVisible()){page.once('dialog',dialog=>dialog.accept());await recorder.getByRole('button',{name:'返回',exact:true}).click()}
  await expect(page.getByLabel('对话输入')).toHaveValue('当前对话未发送的观察')
  await page.reload()
  await page.getByRole('button',{name:'继续核对视频',exact:true}).click()
  await expect(page.getByLabel('哪里不舒服',{exact:true})).toHaveValue('今天观察到孩子手臂发红，附原始视频')
  let saves=0
  await page.route('**/api/members/*/case-records',async route=>{
   saves++;const response=await route.fetch()
   await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;let fail=true;IDBObjectStore.prototype.put=function(value,key){if(fail&&this.name==='drafts'){fail=false;throw new DOMException('synthetic checkpoint failure','QuotaExceededError')}return original.call(this,value,key)}})
   await route.fulfill({response})
  })
  const saving=page.waitForResponse(response=>response.url().includes('/case-records')&&response.request().method()==='POST')
  await page.getByRole('dialog',{name:'核对视频记录',exact:true}).getByRole('button',{name:'保存记录',exact:true}).click()
  const response=await saving;expect(response.ok()).toBe(true);const saved=await response.json();expect(saved.attachmentIds).toHaveLength(1)
  await expect(page.getByRole('button',{name:'恢复视频保存结果',exact:true})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'恢复视频保存结果',exact:true}).click()
  await expect(page.getByRole('button',{name:'恢复视频保存结果',exact:true})).toHaveCount(0)
  expect(saves).toBe(1)
  await expect(page.getByText('视频记录已保存，可查看原件。',{exact:true})).toHaveCount(1)
  await expect(page.getByLabel('对话输入')).toHaveValue('当前对话未发送的观察')
  const attachments=await request.get(`/api/events/${saved.eventId}/records`,{headers});expect(attachments.ok()).toBe(true)
  expect(JSON.stringify(await attachments.json())).toContain(saved.attachmentIds[0])
 }finally{rmSync(temp,{recursive:true,force:true})}
})


test('failed video keeps its original across refresh and cannot save before attachment recovery',async({page})=>{
 await page.route('**/api/quick-records/*/media',route=>route.abort('failed'))
 const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
 await(await picker).setFiles({name:'保留失败原件.mp4',mimeType:'video/mp4',buffer:Buffer.from('synthetic upload interrupted')})
 const recorder=page.getByRole('dialog',{name:'核对视频记录',exact:true})
 await expect(recorder.getByRole('button',{name:'重试上传 保留失败原件.mp4',exact:true})).toBeVisible()
 await recorder.getByLabel('哪里不舒服',{exact:true}).fill('这条观察与视频都需要保留')
 await expect(recorder.getByRole('button',{name:'保存记录',exact:true})).toBeDisabled()
 page.once('dialog',dialog=>dialog.accept());await recorder.getByRole('button',{name:'返回',exact:true}).click()
 await page.reload()
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/quick-records/*/photos',async route=>{if(route.request().method()==='GET'){await gate;await route.continue()}else await route.continue()})
 await page.getByRole('button',{name:'继续核对视频',exact:true}).click()
 await expect(page.getByLabel('哪里不舒服',{exact:true})).toHaveValue('这条观察与视频都需要保留')
 await expect(recorder.getByRole('button',{name:'保存记录',exact:true})).toBeDisabled()
 release()
 await expect(recorder.getByRole('button',{name:'重试上传 保留失败原件.mp4',exact:true})).toBeVisible()
 await expect(recorder.getByRole('button',{name:'保存记录',exact:true})).toBeDisabled()
 const originals=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{const request=indexedDB.open('hoooho-pending-symptom-media',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('files','readonly'),read=tx.objectStore('files').getAll();read.onsuccess=()=>{const count=read.result.filter((item:any)=>item.file.name==='保留失败原件.mp4').length;db.close();resolve(count)};read.onerror=()=>reject(read.error)}}))
 expect(originals).toBe(1)
})

test('speech text appears before release and cancel leaves no submitted or saved message',async({page},info)=>{
 let readCount=0
 await page.route('**/api/ai/audio/live',route=>route.fulfill({json:{id:'00000000-0000-4000-a000-000000000001',state:'listening',text:'',sequence:-1,revision:0}}))
 await page.route('**/api/ai/audio/live/*',route=>{
  const method=route.request().method()
  if(method==='GET')readCount++
  return route.fulfill({json:{id:'00000000-0000-4000-a000-000000000001',state:method==='DELETE'?'closed':'listening',text:readCount?'孩子今天左手有点红':'',sequence:1,revision:readCount?1:0}})
 })
 const hold=page.getByRole('button',{name:'按住记录症状',exact:true})
 await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await expect(page.getByLabel('正在说的话')).toContainText('孩子今天左手有点红')
 const overlay=page.locator('.hoho-hold-feedback--conversation');await expect(overlay.getByLabel('正在说的话')).toBeVisible()
 await page.screenshot({path:info.outputPath('live-speech-before-release.png')})
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await page.keyboard.up('Space')
 await expect(page.getByLabel('正在说的话')).toHaveCount(0)
 await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
 await page.reload();await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
})
