import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import {fingerprint} from '../../server/ai/business/contract.mjs'
import sharp from 'sharp'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const raw='今天吃了半碗粥，脸颊有点红，没有呕吐，午睡睡了一个小时'
const items=[{category:'symptom',title:'脸颊观察',timeText:'今天',archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'symptom',value:'脸颊有点红，没有呕吐',quote:'脸颊有点红，没有呕吐',sourceId:'input',page:1}]}]
let directory:string,aac:string,testMemberId:string
test.beforeAll(async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-aac-contract-'))
  const target=path.join(directory,'recording.m4a')
  execFileSync(ffmpeg.path,['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','aac',target],{stdio:'ignore'})
  aac=(await readFile(target)).toString('base64')
})
test.afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true})})
test.beforeEach(async({page,request})=>{
  const created=await request.post('/api/members',{headers:{Authorization:`Bearer ${token}`},data:{name:'小禾（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'}})
  expect(created.ok()).toBe(true);testMemberId=(await created.json()).id
  await request.get('http://127.0.0.1:4198/success')
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items}})
  await request.get(`http://127.0.0.1:4198/voice?text=${encodeURIComponent(raw)}`)
  await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId:testMemberId})
  await page.goto('/nurse-station')
  await page.setViewportSize({width:375,height:667})
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
})

test('page navigation, direct reentry preserves unsent input without choices; direct URL falls back home',async({page},info)=>{
  await expect(page).toHaveURL(/smart-record\?source=front-desk$/)
  await expect(page.getByRole('heading',{name:'智能记录',exact:true})).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'收起'})).toHaveCount(0)
  await expect(page.getByText('记录对象：',{exact:false})).toHaveCount(0)
  await expect(page.locator('.nurse-turn--assistant').first().locator('.nurse-avatar')).toHaveCount(1)
  await expect(page.locator('.nurse-turn--assistant').first().locator('p')).toHaveCount(2)
  await page.screenshot({path:info.outputPath('opening.png')})
  await page.getByRole('button',{name:'改用文字'}).click()
  await page.getByLabel('对话输入').fill('还没发送的观察')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  await expect(page.getByRole('button',{name:/继续上次|重新开始|保留的另一份/})).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字'}).click()
  await expect(page.getByLabel('对话输入')).toHaveValue('还没发送的观察')
  await page.reload()
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
    if(i===0)await page.screenshot({path:info.outputPath('recording-feedback.png')})
    await page.waitForTimeout(1000);await page.keyboard.up('Space')
    await expect(page.locator('.nurse-turn--user')).toHaveCount(i+1)
  }
  await expect.poll(()=>asr).toBe(3);await expect(hold).toBeEnabled();expect(organizations).toBe(0)
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'拍照',exact:true}).click()
  const picker=await chooser;expect(await picker.element().getAttribute('capture')).toBeNull()
  await expect(page.getByRole('menu')).toHaveCount(0)
  const image=(await sharp({create:{width:120,height:100,channels:3,background:'#1b7a6e'}}).png().toBuffer()).toString('base64')
  await picker.setFiles({name:'合成图片.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')})
  await expect(page.getByRole('img',{name:'合成图片.png'})).toBeVisible()
  // This isolated OCR double returns the same observed symptom. It does not
  // prove real vision recognition; unrelated report rows correctly block save.
  const imageSource=`file-${fingerprint(`data:image/png;base64,${image}`).slice(0,24)}`
  const mixedItems=items.map(item=>({...item,fields:[...item.fields,{...item.fields[0],sourceId:imageSource}]}))
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:mixedItems,ocrText:'脸颊有点红，没有呕吐'}})
  const organize=page.getByRole('button',{name:'帮我整理',exact:true});await expect(organize.locator('xpath=ancestor::*[contains(@class,"nurse-turn-content")]')).toHaveCount(1)
  await organize.click();await page.getByRole('button',{name:'核对 1 条记录',exact:true}).click()
  await expect(page.getByRole('button',{name:'返回对话继续补充',exact:true}).locator('xpath=ancestor::*[contains(@class,"nurse-turn-content")]')).toHaveCount(1)
  expect(originalMimes).toHaveLength(2);expect(originalMimes.every(m=>m.startsWith('audio/webm'))).toBe(true)
  await page.getByRole('button',{name:'确认保存 1 条',exact:true}).click()
  await expect(page.getByText('已经记好了。',{exact:false})).toBeVisible()
  expect(asr).toBe(3)
  await page.screenshot({path:info.outputPath('recording-saved.png')})
})

test('restored real AAC/M4A bytes with dotted MIME are decoded for ASR and retained for organization; other scopes untouched',async({page})=>{
  await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeEnabled()
  await page.evaluate(async ({aac,memberId})=>{
    const bytes=Uint8Array.from(atob(aac),c=>c.charCodeAt(0)).buffer
    const file={kind:'bytes-v1',name:'语音原件-恢复.m4a',type:'audio/mp4;codecs=mp4a.40.2',lastModified:123,bytes}
    await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite'),s=t.objectStore('drafts');const draft={text:'',files:[file],pendingVoice:file,occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'aac-restore'};s.put(draft,`home-smart:visit-test:${memberId}:new`);s.put({...draft,text:'其他成员内容'},'home-smart:visit-test:other-child:new');s.put({...draft,text:'其他账号内容'},`home-smart:other-account:${memberId}:new`);t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}})
  },{aac,memberId:testMemberId})
  await page.reload()
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
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:667})
    const boxes=await row.locator(':scope > button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {top:r.top,height:r.height,border:s.borderTopWidth,background:s.backgroundColor}}))
    expect(boxes.map(b=>b.height)).toEqual([44,44,44]);expect(new Set(boxes.map(b=>b.top)).size).toBe(1)
    expect(boxes[0].border).toBe('1px');expect(boxes[2].border).toBe('1px')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:info.outputPath(`smart-record-${width}.png`)})
  }
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'拍照',exact:true}).click();const picker=await chooser
  expect(await picker.element().getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/heic,image/heif')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('软键盘草稿')
  await page.setViewportSize({width:390,height:380});await expect(page.getByLabel('对话输入')).toBeInViewport()
  await page.getByRole('button',{name:'改用语音'}).click()
  const hold=page.getByRole('button',{name:'按住说话',exact:true});await hold.focus();await page.keyboard.down('Space');await page.waitForTimeout(1000)
  await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page).toHaveURL(/nurse-station$/)
  await page.keyboard.up('Space');await page.getByRole('button',{name:'和护士说说',exact:true}).click()
  await expect(page.getByRole('button',{name:'再试一次',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeDisabled()
})

test('development entry uses the same durable dialogue API',async({page})=>{
  await page.goto('http://127.0.0.1:4197/smart-record?source=front-desk')
  await page.getByRole('button',{name:'改用文字'}).click()
  await page.getByLabel('对话输入').fill('今天吃了半碗粥')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByText('这次观察收到了，可以接着补充。',{exact:true})).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
test('invalid image explains processing phase and can be explicitly removed without blocking valid text',async({page})=>{
  await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('今天吃了半碗粥');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByText('这次观察收到了，可以接着补充。',{exact:true})).toBeVisible()
  const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'拍照',exact:true}).click();await(await choosing).setFiles({name:'损坏的测试图片.png',mimeType:'image/png',buffer:Buffer.from('synthetic broken image')})
  await expect(page.getByRole('alert').first()).toContainText('图片处理失败')
  await page.getByRole('button',{name:'移除这条未成功的消息'}).click()
  await expect(page.getByRole('button',{name:'移除这条未成功的消息'})).toHaveCount(0)
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.getByRole('button',{name:'帮我整理',exact:true})).toBeEnabled()
})
test('old failed audio does not silently disable Chinese text sending',async({page})=>{
  await page.route('**/api/ai/audio/transcriptions',route=>route.fulfill({status:503,json:{error:{code:'ASR_TIMEOUT',message:'转写暂时失败'}}}))
  const hold=page.getByRole('button',{name:'按住说话',exact:true});await hold.focus();await page.keyboard.down('Space');await page.waitForTimeout(900);await page.keyboard.up('Space')
  await expect(page.getByRole('button',{name:'再试一次',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('中文文字仍能发送')
  await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByText('这次观察收到了，可以接着补充。',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'再试一次',exact:true})).toBeVisible()
})
test('a reply arriving during recording waits for microphone release before automatic speech',async({page})=>{
  await page.evaluate(()=>{(window as any).__recordSpoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{ text:string; constructor(text:string){this.text=text} }});Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return[]},speak(value:any){if(value.text.trim())(window as any).__recordSpoken.push(value.text);value.onstart?.();setTimeout(()=>value.onend?.(),10)}}})})
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/front-desk-record',async route=>{if(route.request().method()==='POST')await gate;await route.continue()})
  await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('今天吃了半碗粥');await page.getByRole('button',{name:'发送',exact:true}).click()
  await page.getByRole('button',{name:'改用语音'}).click();await page.getByRole('button',{name:'按住说话',exact:true}).focus();await page.keyboard.down('Space')
  await expect(page.getByRole('button',{name:'正在录音，松手发送'})).toBeVisible();release()
  await expect(page.getByText('这次观察收到了，可以接着补充。',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>(window as any).__recordSpoken)).not.toContain('这次观察收到了，可以接着补充。')
  for(const button of await page.getByRole('button',{name:'朗读护士回复'}).all())await expect(button).toBeDisabled()
  await page.keyboard.up('Space')
  await expect.poll(()=>page.evaluate(()=>(window as any).__recordSpoken)).toContain('这次观察收到了，可以接着补充。')
})

test('Chinese composition, independent sends, failed message retry and two image selections retain their own bubbles',async({page},info)=>{
  await page.getByRole('button',{name:'改用文字'}).click()
  const input=page.getByLabel('对话输入')
  await input.fill('今天吃了半碗粥')
  await input.dispatchEvent('compositionstart');await input.press('Enter')
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await input.dispatchEvent('compositionend')
  let ids:string[]=[],attempt=0
  await page.route('**/front-desk-record',route=>{if(route.request().method()!=='POST')return route.continue();ids.push(route.request().postDataJSON().id);return ++attempt===1?route.fulfill({status:503,json:{error:{code:'FRONT_RECORD_UNAVAILABLE',message:'测试网络中断'}}}):route.continue()})
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByRole('button',{name:'重试这条消息'})).toBeVisible()
  await expect(page.locator('.nurse-turn--user')).toContainText('今天吃了半碗粥')
  await page.getByRole('button',{name:'重试这条消息'}).click()
  await expect(page.getByRole('button',{name:'重试这条消息'})).toHaveCount(0)
  expect(ids[0]).toBe(ids[1])
  await input.fill('午睡了一个小时');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.nurse-turn--user')).toHaveCount(2)
  await page.screenshot({path:info.outputPath('text-input.png')})
  const png=await sharp({create:{width:180,height:120,channels:3,background:'#1b7a6e'}}).png().toBuffer()
  for(let i=0;i<2;i++){
    const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'拍照',exact:true}).click();await(await choosing).setFiles({name:`测试图片${i}.png`,mimeType:'image/png',buffer:png})
    await expect(page.getByRole('img',{name:`测试图片${i}.png`})).toBeVisible()
    await expect(page.getByText('我看到了图片里的测试图形。还有什么需要记下来的吗？',{exact:true})).toHaveCount(i+1)
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
  await expect(page.locator('.nurse-turn--user')).toHaveCount(4)
  await page.getByRole('button',{name:'查看图片：测试图片1.png'}).click()
  await expect(page.getByRole('img',{name:'测试图片1.png'})).toHaveClass(/is-expanded/)
  await page.screenshot({path:info.outputPath('multimodal-images.png')})
  await page.reload()
  await expect(page.getByRole('button',{name:/继续上次|重新开始/})).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('继续刚才的图片');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByRole('img',{name:'测试图片0.png'})).toBeVisible();await expect(page.getByRole('img',{name:'测试图片1.png'})).toBeVisible()
})
