import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import {fingerprint} from '../../server/ai/business/contract.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const raw='今天吃了半碗粥，脸颊有点红，没有呕吐，午睡睡了一个小时'
const items=[{category:'symptom',title:'脸颊观察',timeText:'今天',archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'symptom',value:'脸颊有点红，没有呕吐',quote:'脸颊有点红，没有呕吐',sourceId:'input',page:1}]}]
let directory:string,aac:string
test.beforeAll(async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-aac-contract-'))
  const target=path.join(directory,'recording.m4a')
  execFileSync(ffmpeg.path,['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','aac',target],{stdio:'ignore'})
  aac=(await readFile(target)).toString('base64')
})
test.afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true})})
test.beforeEach(async({page,request})=>{
  await request.get('http://127.0.0.1:4198/success')
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items}})
  await request.get(`http://127.0.0.1:4198/voice?text=${encodeURIComponent(raw)}`)
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))},token)
  await page.goto('/nurse-station')
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
})

test('page navigation, in-bubble scoped restore/restart, no sheet; direct URL falls back home',async({page})=>{
  await expect(page).toHaveURL(/smart-record\?source=front-desk$/)
  await expect(page.getByRole('heading',{name:'智能记录',exact:true})).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'收起'})).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字'}).click()
  await page.getByLabel('对话输入').fill('还没发送的观察')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  const resume=page.getByRole('button',{name:'继续上次的记录',exact:true})
  await expect(resume.locator('xpath=ancestor::*[contains(@class,"nurse-turn-content")]')).toHaveCount(1)
  await page.getByRole('button',{name:'重新开始记录',exact:true}).click()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字'}).click()
  await expect(page.getByLabel('对话输入')).toHaveValue('')
  await page.reload()
  await resume.click()
  await page.getByRole('button',{name:'改用文字'}).click()
  await expect(page.getByLabel('对话输入')).toHaveValue('还没发送的观察')
  await page.goto('/smart-record?source=front-desk')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
})

test('two native Chromium recordings, ASR login recovery, mixed image organization and save without re-ASR',async({page,request},info)=>{
  let asr=0,organizations=0;const originalMimes:string[]=[]
  await page.route('**/api/ai/audio/transcriptions',route=>++asr===1?route.fulfill({status:401,json:{error:{code:'UNAUTHORIZED'}}}):route.continue())
  page.on('request',r=>{if(r.url().endsWith('/ai-drafts')&&r.method()==='POST'){organizations++;originalMimes.push(...(r.postDataJSON().voiceFiles??[]).map((f:any)=>f.mimeType))}})
  const hold=page.getByRole('button',{name:'按住说话',exact:true})
  for(let i=0;i<2;i++){
    await expect(hold).toBeEnabled();await hold.focus();await page.keyboard.down('Space')
    await expect(page.getByRole('button',{name:'正在录音，松手发送'})).toBeVisible()
    await page.waitForTimeout(1000);await page.keyboard.up('Space')
    await expect(page.locator('.nurse-turn--user')).toHaveCount(i+1)
  }
  expect(asr).toBe(3);expect(organizations).toBe(0)
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'拍照',exact:true}).click()
  const picker=await chooser;expect(await picker.element().getAttribute('capture')).toBeNull()
  await expect(page.getByRole('menu')).toHaveCount(0)
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVf8AAAAASUVORK5CYII='
  await picker.setFiles({name:'合成图片.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')})
  await expect(page.locator('.dialogue-file')).toContainText('合成图片.png')
  // This isolated OCR double returns the same observed symptom. It does not
  // prove real vision recognition; unrelated report rows correctly block save.
  const imageSource=`file-${fingerprint(`data:image/png;base64,${image}`).slice(0,24)}`
  const mixedItems=items.map(item=>({...item,fields:[...item.fields,{...item.fields[0],sourceId:imageSource}]}))
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:mixedItems,ocrText:'脸颊有点红，没有呕吐'}})
  const organize=page.getByRole('button',{name:'帮我整理',exact:true});await expect(organize.locator('xpath=ancestor::*[contains(@class,"nurse-turn-content")]')).toHaveCount(1)
  await organize.click();await page.getByRole('button',{name:'核对 1 条记录',exact:true}).click()
  expect(originalMimes).toHaveLength(2);expect(originalMimes.every(m=>m.startsWith('audio/webm'))).toBe(true)
  await page.getByRole('button',{name:'确认保存 1 条',exact:true}).click()
  await expect(page.getByText('已经记好了。',{exact:false})).toBeVisible()
  expect(asr).toBe(3)
  await page.screenshot({path:info.outputPath('recording-saved.png')})
})

test('restored real AAC/M4A bytes with dotted MIME are decoded for ASR and retained for organization; other scopes untouched',async({page})=>{
  await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeEnabled()
  await page.evaluate(async data=>{
    const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer
    const file={kind:'bytes-v1',name:'语音原件-恢复.m4a',type:'audio/mp4;codecs=mp4a.40.2',lastModified:123,bytes}
    await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite'),s=t.objectStore('drafts');const draft={text:'',files:[file],pendingVoice:file,occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'aac-restore'};s.put(draft,'home-smart:visit-test:empty-child:new');s.put({...draft,text:'其他成员内容'},'home-smart:visit-test:other-child:new');s.put({...draft,text:'其他账号内容'},'home-smart:other-account:empty-child:new');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}})
  },aac)
  await page.reload();await page.getByRole('button',{name:'继续上次的记录',exact:true}).click()
  await page.getByRole('button',{name:'再试一次',exact:true}).click()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator('.nurse-turn--user')).toContainText(raw)
  await expect(page.getByText('其他成员内容',{exact:false})).toHaveCount(0)
  await expect(page.getByText('其他账号内容',{exact:false})).toHaveCount(0)
  await page.getByRole('button',{name:'帮我整理',exact:true}).click()
  await expect(page.getByRole('button',{name:'核对 1 条记录',exact:true})).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('equal visible controls, direct native picker, 320/390/430 widths and keyboard viewport; leave recording keeps bytes',async({page},info)=>{
  const row=page.locator('.hoho-dialogue-composer')
  await expect(row.getByRole('button',{name:'按住说话',exact:true})).toBeEnabled()
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:667})
    const boxes=await row.locator(':scope > button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {top:r.top,height:r.height,border:s.borderTopWidth,background:s.backgroundColor}}))
    expect(boxes.map(b=>b.height)).toEqual([44,44,44]);expect(new Set(boxes.map(b=>b.top)).size).toBe(1)
    expect(boxes[0].border).toBe('1px');expect(boxes[2].border).toBe('1px')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:info.outputPath(`smart-record-${width}.png`)})
  }
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'拍照',exact:true}).click();const picker=await chooser
  expect(await picker.element().getAttribute('accept')).toBe('image/jpeg,image/png,image/webp')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('软键盘草稿')
  await page.setViewportSize({width:390,height:380});await expect(page.getByLabel('对话输入')).toBeInViewport()
  await page.getByRole('button',{name:'改用语音'}).click()
  const hold=page.getByRole('button',{name:'按住说话',exact:true});await hold.focus();await page.keyboard.down('Space');await page.waitForTimeout(1000)
  await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page).toHaveURL(/nurse-station$/)
  await page.keyboard.up('Space');await page.getByRole('button',{name:'和护士说说',exact:true}).click();await page.getByRole('button',{name:'继续上次的记录',exact:true}).click()
  await expect(page.getByRole('button',{name:'再试一次',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeDisabled()
})
