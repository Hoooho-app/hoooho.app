import {test,expect,type Page,type APIRequestContext} from '@playwright/test'
import {confirmFrontSubject} from '../helpers/nursing-interview'
import {readFile} from 'node:fs/promises'

// CONTRACT TESTS: PCM capture/MediaRecorder, application APIs and persistence are
// real local paths. Interim snapshots and ASR/model replies are explicit test
// doubles. These checks do not establish real-provider ASR accuracy or latency.
const control='http://127.0.0.1:4928'
let token=''
const headers:Record<string,string>={}
let memberId:string,memberName:string,authApi:APIRequestContext,authUser:any,authCookies:any[]=[]
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}}
const users=(page:Page)=>page.locator('.nurse-turn--user[data-message-id]')
const bubble=(page:Page,id:string)=>page.locator(`.nurse-turn--user[data-message-id=${JSON.stringify(id)}]`)

async function previewDouble(page:Page){
 type Session={id:string;text:string;revision:number}
 const sessions:Session[]=[]
 let held:{id:string;entered:ReturnType<typeof deferred>;release:ReturnType<typeof deferred>;text:string;revision:number}|undefined
 await page.route('**/api/ai/audio/live',async route=>{
  const session={id:crypto.randomUUID(),text:'',revision:1};sessions.push(session)
  await route.fulfill({json:{...session,state:'listening',sequence:0}})
 })
 await page.route('**/api/ai/audio/live/*',async route=>{
  const id=new URL(route.request().url()).pathname.split('/').at(-1)!,session=sessions.find(s=>s.id===id)!
  if(route.request().method()==='DELETE'){await route.fulfill({json:{...session,state:'closed',sequence:0}}).catch(()=>undefined);return}
  const pending=held?.id===id&&route.request().method()==='GET'?held:undefined
  if(pending){held=undefined;pending.entered.resolve();await pending.release.promise}
  const snapshot=pending?{...session,text:pending.text,revision:pending.revision}:session
  await route.fulfill({json:{...snapshot,state:'listening',sequence:0}}).catch(()=>undefined)
 })
 return {sessions,set(text:string,revision:number){Object.assign(sessions.at(-1)!,{text,revision})},holdNextRead(text:string,revision:number){const pending={id:sessions.at(-1)!.id,entered:deferred(),release:deferred(),text,revision};held=pending;return pending}}
}
async function start(page:Page){
 const hold=page.getByRole('button',{name:'按住说话',exact:true});await expect(hold).toBeEnabled();await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await expect(users(page)).toHaveCount(1)
 const id=await users(page).getAttribute('data-message-id');expect(id).toMatch(/^voice:/);return id!
}
async function settle(request:APIRequestContext,id:string){
 let job:any
 await expect.poll(async()=>{job=await(await request.get(`/api/members/${memberId}/recognition-jobs/${id}`,{headers})).json();return ['ready','needs_review','failed'].includes(job.state)&&job.resultRevision===job.inputRevision||job.state==='failed'},{timeout:30000}).toBe(true)
 expect(job.state,JSON.stringify(job.error??{})).not.toBe('failed');return job
}
async function noAudioDrafts(page:Page){
 const state=await page.evaluate(async memberId=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  const rows=await new Promise<any[]>((resolve,reject)=>{const tx=db.transaction('drafts'),store=tx.objectStore('drafts'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve(values.result.filter((_v,index)=>String(keys.result[index]).includes(`:${memberId}:`)));tx.onerror=()=>reject(tx.error)})
  db.close();let audio=0,pending=0
  const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(typeof value.type==='string'&&value.type.startsWith('audio/')||typeof value.mimeType==='string'&&value.mimeType.startsWith('audio/'))audio++;if(value.pendingVoice)pending++;if(Array.isArray(value)){value.forEach(visit);return}Object.values(value).forEach(visit)}
  rows.forEach(visit);return {audio,pending}
 },memberId)
 expect(state).toEqual({audio:0,pending:0})
}

test.beforeAll(async({playwright,baseURL})=>{
 const session=JSON.parse(await readFile(new URL('../../.codex-tmp/v3-browser-session.json',import.meta.url),'utf8'))
 authApi=await playwright.request.newContext({baseURL,storageState:session.storageState})
 expect(session.token).toBeTruthy();expect(session.user.id).toBeTruthy()
 token=session.token;authUser=session.user;headers.Authorization=`Bearer ${token}`
 authCookies=(await authApi.storageState()).cookies;expect(authCookies.length).toBeGreaterThan(0)
 headers.Cookie=authCookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ');headers.Origin=new URL(baseURL!).origin;headers['Sec-Fetch-Site']='same-origin'
})
test.afterAll(async()=>{await authApi?.dispose()})
test.beforeEach(async({page,request},info)=>{
 memberName=info.title.includes('large text')?'甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸':`V3合成${crypto.randomUUID().slice(0,6)}`
 const result=await request.post('/api/members',{headers,data:{name:memberName,relationship:'child',birthday:'2024-01-01'}});expect(result.ok()).toBe(true);const member=await result.json();memberId=member.id
 expect((await request.post('/api/auth/current-member',{headers,data:{memberId}})).ok()).toBe(true)
 await page.context().addCookies(authCookies)
 await request.get(`${control}/success`);await request.get(`${control}/delay?ms=40`);await request.post(`${control}/draft-data`,{data:{items:null}})
 await page.addInitScript(({token,memberId,user,member})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('voice-v3-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,authStatus:'authenticated',currentMemberId:memberId,members:[member],profile:null},version:5}));sessionStorage.setItem('voice-v3-initialized','true')}},{token,memberId,user:authUser,member})
 await page.goto('/nurse-station');await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
})
test.afterEach(async({request})=>{await request.get(`${control}/success`);await request.delete(`/api/members/${memberId}`,{headers})})

test('V3 unavailable live connection keeps genuine capture; failed empty ASR has no durable audio or false success',async({page},info)=>{
 let finals=0,jobs=0,assets=0
 page.on('request',r=>{if(r.method()!=='POST')return;const path=new URL(r.url()).pathname;if(path.endsWith('/recognition-jobs'))jobs++;if(path.endsWith('/recognition-assets'))assets++})
 await page.evaluate(()=>{const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);(window as any).__v3Tracks=[];navigator.mediaDevices.getUserMedia=async options=>{const stream=await native(options);(window as any).__v3Tracks.push(...stream.getTracks());return stream}})
 await page.route('**/api/ai/audio/live',r=>r.fulfill({status:503,json:{error:{code:'ASR_LIVE_UNAVAILABLE',message:'合成连接不可用'}}}))
 await page.route('**/api/ai/audio/transcriptions',r=>{finals++;return r.fulfill({status:503,json:{error:{code:'ASR_BAILIAN_PERMISSION',message:'合成转写未完成'}}})})
 const id=await start(page)
 await expect(bubble(page,id)).toContainText('实时转写不可用，松开后转写')
 expect(await page.evaluate(()=>(window as any).__v3Tracks.map((t:MediaStreamTrack)=>t.readyState))).toEqual(['live'])
 await expect(page.locator('.hoho-hold-feedback__time').first()).toContainText(/0:0[1-9]/)
 expect(finals).toBe(0);await page.keyboard.up('Space')
 await expect(bubble(page,id).getByRole('button',{name:'重新说',exact:true})).toBeVisible()
 await expect(bubble(page,id).getByRole('button',{name:'改用文字',exact:true})).toBeVisible()
 await expect(page.locator('.smart-record-saved')).toHaveCount(0)
 expect(finals).toBe(1);expect(jobs).toBe(0);expect(assets).toBe(0)
 expect(await page.evaluate(()=>(window as any).__v3Tracks.map((t:MediaStreamTrack)=>t.readyState))).toEqual(['ended'])
 await noAudioDrafts(page);await page.screenshot({path:info.outputPath('failed-new-audio-no-durable-original.png')})
 await page.reload();await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeEnabled()
 await expect(users(page)).toHaveCount(0);await noAudioDrafts(page)
 // Explicit browser permission-error double; not a claim of physical Safari QA.
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic permission rejection','NotAllowedError')}})
 await page.getByRole('button',{name:'按住说话',exact:true}).focus();await page.keyboard.down('Space');await page.keyboard.up('Space')
 await expect(page.getByRole('alert')).toBeVisible();await expect(users(page)).toHaveCount(0)
 expect(finals).toBe(1);expect(jobs).toBe(0)
})

test('V3 large text and long child name remain readable; partial updates respect a reader scrolling up',async({page},info)=>{
 const preview=await previewDouble(page),id=await start(page)
 const long='孩子今天左前臂有一点发红，时间还没记清楚。'.repeat(35)+' https://example.invalid/'+ 'a'.repeat(180)
 preview.set(long,2);await expect(bubble(page,id).locator('p').first()).toHaveText(long)
 const body=page.locator('.smart-record-page__body')
 await body.evaluate(e=>{e.dispatchEvent(new WheelEvent('wheel',{deltaY:-500,bubbles:true}));e.scrollTop=0})
 const top=await body.evaluate(e=>e.scrollTop)
 preview.set(long+' 还有一小段正在说。',3)
 await expect(bubble(page,id).locator('p').first()).toContainText('还有一小段正在说。')
 expect(await body.evaluate(e=>e.scrollTop)).toBe(top)
 await expect(page.getByRole('button',{name:'回到正在转写',exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await page.keyboard.up('Space');await expect(users(page)).toHaveCount(0)
 // Double the computed text sizes, independently of browser page zoom. This is
 // a text-scaling simulation; physical OS/Safari text zoom is a separate check.
 await page.evaluate(()=>{const values=[...document.querySelectorAll<HTMLElement>('.smart-record-dialog *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),line:parseFloat(getComputedStyle(e).lineHeight)}));for(const {e,size,line}of values){e.style.fontSize=`${size*2}px`;if(Number.isFinite(line))e.style.lineHeight=`${line*2}px`}})
 await expect(page.getByText(memberName,{exact:true}).first()).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 const child=page.locator('.front-desk-current-child');if(await child.count())expect(await child.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true)
 await page.screenshot({path:info.outputPath('long-child-name-200-percent-text-simulation.png')})
})

test('V3 snapshots revise one DOM node; final text alone reaches a real saved record',async({page,request},info)=>{
 const preview=await previewDouble(page),releaseFinal=deferred();let enteredFinal=false
 const submitted:any[]=[],assetUploads:string[]=[]
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-jobs'))submitted.push(r.postDataJSON());if(r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-assets'))assetUploads.push(r.url())})
 const final=`${memberName}今天左前臂有点红。`
 await request.get(`${control}/voice?text=${encodeURIComponent(final)}`)
 // The final request still reaches the real local transcription API and its
 // configured provider double. Only delivery is held to inspect finalization.
 await page.route('**/api/ai/audio/transcriptions',async route=>{try{const response=await route.fetch();expect(response.ok()).toBe(true);enteredFinal=true;await releaseFinal.promise;await route.fulfill({response})}catch{await route.abort().catch(()=>undefined)}})
 try{
  const id=await start(page),node=await bubble(page,id).elementHandle();expect(node).toBeTruthy()
  preview.set('今天手背发红',2);await expect(bubble(page,id).locator('p').first()).toHaveText('今天手背发红')
  preview.set('今天左前臂有点红',3);await expect(bubble(page,id).locator('p').first()).toHaveText('今天左前臂有点红')
  preview.set('过期快照不应覆盖',2);await page.waitForTimeout(500);await expect(bubble(page,id).locator('p').first()).toHaveText('今天左前臂有点红')
  preview.set('今天左前臂有点红',4);await page.waitForTimeout(500);await expect(users(page)).toHaveCount(1)
  expect(await node!.evaluate(element=>element.isConnected)).toBe(true)
  await expect(page.locator('.hoho-hold-feedback__transcript')).toHaveCount(0)
  expect(submitted).toHaveLength(0)
  await page.keyboard.up('Space');await expect.poll(()=>enteredFinal).toBe(true)
  await expect(bubble(page,id)).toContainText('正在确认文字')
  expect(await node!.evaluate(element=>element.isConnected)).toBe(true)
  const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-jobs'))
  releaseFinal.resolve();const response=await accepted;expect(response.ok()).toBe(true);const job=await response.json();await settle(request,job.id)
  await expect(bubble(page,id).locator('p').first()).toHaveText(final);await expect(bubble(page,id)).toHaveCount(1)
  expect(await node!.evaluate(element=>element.isConnected)).toBe(true)
  expect(submitted).toHaveLength(1);expect(submitted[0].input.id).toBe(id);expect(submitted[0].input.kind).toBe('text');expect(submitted[0].input.text).toBe(final);expect(submitted[0].input.assetIds).toEqual([]);expect(submitted[0].input).not.toHaveProperty('asrAssetId');expect(assetUploads).toEqual([])
  await noAudioDrafts(page)
  await confirmFrontSubject(page);await page.getByRole('button',{name:'核对记录',exact:true}).click()
  const saving=page.waitForResponse(r=>r.request().method()==='POST'&&/\/ai-drafts\/[^/]+\/save$/.test(new URL(r.url()).pathname))
  await page.getByRole('button',{name:/^保存(?:给.+|记录)?$/}).last().click()
  const savedResponse=await saving;expect(savedResponse.ok()).toBe(true);const saved=await savedResponse.json();expect(saved.state).toBe('saved');expect(saved.result.count).toBe(1)
  const reference=saved.result.records[0],records=await(await request.get(`/api/events/${reference.eventId}/records`,{headers})).json(),record=records.find((r:any)=>r.id===reference.recordId)
  expect(record.sourceText).toBe(final);expect(JSON.stringify(record)).not.toMatch(/audio\/|\.webm|语音原件/)
  const attachments=await(await request.get(`/api/events/${reference.eventId}/attachments`,{headers})).json();expect(attachments).toEqual([])
  await expect(page.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();await noAudioDrafts(page)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('voice-final-real-text-save.png')})
 }finally{releaseFinal.resolve();await page.keyboard.up('Space').catch(()=>undefined)}
})

test('V3 cancel and reset remove the draft and fence a late snapshot from the next recording',async({page})=>{
 const preview=await previewDouble(page);let jobs=0,asr=0
 page.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='POST'&&p.endsWith('/recognition-jobs'))jobs++;if(r.method()==='POST'&&p==='/api/ai/audio/transcriptions')asr++})
 const first=await start(page);preview.set('取消前确实识别的文字',2);await expect(bubble(page,first)).toContainText('取消前确实识别的文字')
 const old=preview.holdNextRead('旧录音迟到结果不能复活',99)
 try{
  await old.entered.promise
  await page.keyboard.press('Escape');await page.keyboard.up('Space');await expect(bubble(page,first)).toHaveCount(0)
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'新建对话',exact:true}).click()
  const second=await start(page);expect(second).not.toBe(first);preview.set('新一段当前有效文字',2);await expect(bubble(page,second)).toContainText('新一段当前有效文字')
  old.release.resolve();await page.waitForTimeout(500)
  await expect(users(page)).toHaveCount(1);await expect(bubble(page,second)).toContainText('新一段当前有效文字');await expect(page.getByText('旧录音迟到结果不能复活',{exact:true})).toHaveCount(0)
  await page.keyboard.press('Escape');await page.keyboard.up('Space');await expect(users(page)).toHaveCount(0)
  expect(jobs).toBe(0);expect(asr).toBe(0);await expect(page.locator('.smart-record-saved')).toHaveCount(0);await noAudioDrafts(page)
 }finally{old.release.resolve();await page.keyboard.press('Escape').catch(()=>undefined);await page.keyboard.up('Space').catch(()=>undefined)}
})


test('V3 interrupted finalization keeps editable partial text and fences a late ASR final',async({page,request},info)=>{
 // Explicit protocol/provider doubles: a real acknowledged listening snapshot
 // supplies partial text. The real local batch-ASR endpoint completes, but its
 // response delivery is held. Backgrounding then interrupts that pending stage;
 // this is not a fabricated live-disconnect callback after release closed live.
 const preview=await previewDouble(page),releaseFinal=deferred()
 let finalEntered=false,lateResponseSettled=false,asrRequests=0
 const submitted:any[]=[],assetUploads:string[]=[]
 const lateFinal=`${memberName}今天左手疼。`,edited=`${memberName}今天左前臂有点红。`
 await request.get(`${control}/voice?text=${encodeURIComponent(lateFinal)}`)
 page.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()!=='POST')return;if(path==='/api/ai/audio/transcriptions')asrRequests++;if(path.endsWith('/recognition-jobs'))submitted.push(r.postDataJSON());if(path.endsWith('/recognition-assets'))assetUploads.push(r.url())})
 await page.route('**/api/ai/audio/transcriptions',async route=>{
  try{const response=await route.fetch();expect(response.ok()).toBe(true);finalEntered=true;await releaseFinal.promise;await route.fulfill({response})}
  catch{await route.abort().catch(()=>undefined)}
  finally{lateResponseSettled=true}
 })
 try{
  const id=await start(page),node=await bubble(page,id).elementHandle();expect(node).toBeTruthy()
  preview.set('今天手背发红',2);await expect(bubble(page,id).locator('p').first()).toHaveText('今天手背发红')
  await expect(page.getByLabel('已录音1秒',{exact:true})).toBeVisible()
  await page.keyboard.up('Space');await expect.poll(()=>finalEntered).toBe(true)
  await expect(bubble(page,id)).toContainText('正在确认文字');expect(submitted).toHaveLength(0)
  // The actual hook listens to document.hidden. Restore both properties below
  // so this isolated browser continues through the ordinary foreground UI.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
  await expect(bubble(page,id).getByRole('button',{name:'编辑文字',exact:true})).toBeVisible()
  await expect(bubble(page,id)).toContainText('转写未完成')
  await expect(page.locator('.hoho-hold-feedback')).toHaveCount(0)
  expect(await node!.evaluate(element=>element.isConnected)).toBe(true)
  await page.evaluate(()=>{delete (document as unknown as Record<string,unknown>).hidden;delete (document as unknown as Record<string,unknown>).visibilityState;document.dispatchEvent(new Event('visibilitychange'))})
  await bubble(page,id).getByRole('button',{name:'编辑文字',exact:true}).click()
  await bubble(page,id).getByRole('textbox',{name:'更正转写文字',exact:true}).fill(edited)
  expect(await node!.evaluate(element=>element.isConnected)).toBe(true)
  const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-jobs'))
  await bubble(page,id).getByRole('button',{name:'继续核对',exact:true}).click()
  const acceptedResponse=await accepted;expect(acceptedResponse.ok()).toBe(true);const job=await acceptedResponse.json()
  const input=page.getByLabel('对话输入',{exact:true})
  if(!await input.count())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await expect(input).toBeEnabled();await input.fill('下一段新稿尚未发送')
  releaseFinal.resolve();await expect.poll(()=>lateResponseSettled).toBe(true)
  await settle(request,job.id)
  await expect(bubble(page,id).locator('p').first()).toHaveText(edited);await expect(bubble(page,id)).toHaveCount(1)
  expect(await node!.evaluate(element=>element.isConnected)).toBe(true)
  await expect(page.getByText(lateFinal,{exact:true})).toHaveCount(0)
  await expect(input).toHaveValue('下一段新稿尚未发送')
  expect(submitted).toHaveLength(1);expect(submitted[0].input.id).toBe(id);expect(submitted[0].input.text).toBe(edited);expect(submitted[0].input.kind).toBe('text');expect(submitted[0].input.assetIds).toEqual([]);expect(submitted[0].input).not.toHaveProperty('asrAssetId')
  expect(asrRequests).toBe(1);expect(assetUploads).toEqual([])
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(context.messages.filter((message:{id:string})=>message.id===id)).toHaveLength(1)
  expect(context.messages.find((message:{id:string})=>message.id===id).text).toBe(edited)
  expect(context.review.inputText).toBe(edited);expect(JSON.stringify(context.review)).not.toContain(lateFinal)
  await noAudioDrafts(page);await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  await page.screenshot({path:info.outputPath('partial-edited-late-final-fenced.png')})
 }finally{
  releaseFinal.resolve();await page.keyboard.up('Space').catch(()=>undefined)
  await page.evaluate(()=>{delete (document as unknown as Record<string,unknown>).hidden;delete (document as unknown as Record<string,unknown>).visibilityState;document.dispatchEvent(new Event('visibilitychange'))}).catch(()=>undefined)
 }
})


test('V3 failed text uses explicit manual review, one real original save and exact detail return',async({page,request},info)=>{
 // Only the provider is deliberately failed. UI, context confirmation,
 // save_original, persistence, receipt replay and detail routing remain real.
 const raw='刚才孩子咳了两声。',edited='刚才孩子咳了三声，随后停止。'
 const counts={jobs:0,assets:0,asr:0,confirm:0,originalSave:0,structuredSave:0,directRecordCreate:0,recordPatch:0}
 const saveInputs:{url:string;body:any}[]=[]
 page.on('request',r=>{
  const p=new URL(r.url()).pathname,m=r.method()
  if(m==='POST'&&p.endsWith('/recognition-jobs'))counts.jobs++
  if(m==='POST'&&p.endsWith('/recognition-assets'))counts.assets++
  if(m==='POST'&&p==='/api/ai/audio/transcriptions')counts.asr++
  if(m==='POST'&&/\/ai-drafts\/[^/]+\/save$/.test(p))counts.structuredSave++
  if(m==='POST'&&/\/api\/events\/[^/]+\/records$/.test(p))counts.directRecordCreate++
  if(m==='PATCH'&&/\/api\/records\/[^/]+$/.test(p))counts.recordPatch++
  if(m==='POST'&&p.includes('/front-desk-record/contexts/')){
   const body=r.postDataJSON()
   if(body.action==='confirm_subject')counts.confirm++
   if(body.action==='save_original'){counts.originalSave++;saveInputs.push({url:r.url(),body})}
  }
 })
 await request.get(`${control}/failure`)
 await page.getByRole('button',{name:'改用文字',exact:true}).click()
 await page.getByLabel('对话输入').fill(raw)
 const submitted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-jobs'))
 await page.getByRole('button',{name:'发送',exact:true}).click()
 const response=await submitted;expect(response.ok()).toBe(true);const initial=await response.json()
 let failed:any
 await expect.poll(async()=>{failed=await(await request.get(`/api/members/${memberId}/recognition-jobs/${initial.id}`,{headers})).json();return failed.state},{timeout:30000}).toBe('failed')
 expect(failed.frontDesk?.context?.id).toBeTruthy()
 const contextUrl=`/api/members/${memberId}/front-desk-record/contexts/${failed.frontDesk.context.id}`
 await expect(page.getByRole('button',{name:'手动核对',exact:true})).toBeVisible()
 await expect(page.locator('.smart-record-saved')).toHaveCount(0)
 expect(counts.originalSave).toBe(0);expect(counts.structuredSave).toBe(0)
 await page.getByRole('button',{name:'手动核对',exact:true}).click()
 const manual=page.getByRole('dialog',{name:'手动核对原话',exact:true})
 await expect(manual).toBeVisible()
 await expect(manual.getByText('对象待确认 · 尚未保存',{exact:true})).toBeVisible()
 const save=manual.getByRole('button',{name:`保存给${memberName}`,exact:true})
 await expect(save).toBeDisabled();await expect(manual.getByLabel('手动核对文字')).toHaveValue(raw)
 const unconfirmed=await(await request.get(contextUrl,{headers})).json()
 expect(unconfirmed.saved).not.toBe(true);expect(unconfirmed.subject?.confirmed).not.toBe(true)
 expect(counts.originalSave).toBe(0)
 const confirming=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(`/contexts/${unconfirmed.id}`)&&r.request().postDataJSON().action==='confirm_subject')
 await manual.getByRole('button',{name:`这是${memberName}的记录`,exact:true}).click()
 const confirmedResponse=await confirming;expect(confirmedResponse.ok()).toBe(true);const confirmed=await confirmedResponse.json()
 expect(confirmed.subject).toMatchObject({kind:'current',memberId,confirmed:true})
 await expect(save).toBeEnabled();await expect(manual.getByText('当前对话已有更新，请返回重新核对。',{exact:true})).toHaveCount(0)
 expect(counts.confirm).toBe(1);expect(counts.originalSave).toBe(0)
 await manual.getByLabel('手动核对文字').fill(edited)
 const saving=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(`/contexts/${confirmed.id}`)&&r.request().postDataJSON().action==='save_original')
 // Same-turn repeat click checks the actual UI lock, without introducing a
 // second model call or faking a saved receipt.
 await save.evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click()})
 const savedResponse=await saving;expect(savedResponse.ok()).toBe(true);const result=await savedResponse.json(),saved=result.savedDraft
 expect(saved.state).toBe('saved');expect(saved.result.count).toBe(1);expect(result.context.saved).toBe(true)
 const reference=saved.result.records[0]
 expect(saveInputs).toHaveLength(1)
 expect(saveInputs[0].body).toMatchObject({action:'save_original',confirmed:true,expectedVersion:confirmed.version,reviewText:edited})
 await expect(manual).toHaveCount(0)
 const receipt=page.locator('.smart-record-saved').filter({has:page.getByRole('button',{name:'查看记录',exact:true})})
 await expect(receipt).toHaveCount(1);await expect(receipt).toContainText(memberName)
 await expect(page.getByRole('button',{name:'重试这条消息',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'移除这条未成功的消息',exact:true})).toHaveCount(0)
 const readRecords=async()=>await(await request.get(`/api/events/${reference.eventId}/records`,{headers})).json()
 const records=await readRecords(),record=records.find((r:any)=>r.id===reference.recordId)
 expect(records).toHaveLength(1);expect(record).toBeTruthy();expect(record.content).toBe(edited)
 expect(record.sourceText).toBe(raw);expect(record.aiProvenance.sourceTextEdited).toBe(true)
 expect(record.aiProvenance.provider).toBe('manual');expect(record.aiProvenance.title).toBe('原话记录')
 expect(record.journal.timePrecision).toBe('unknown');expect(record.aiProvenance.time.precision).toBe('unknown')
 expect(JSON.stringify(record)).not.toMatch(/audio\/|\.webm|语音原件/)
 expect(await(await request.get(`/api/events/${reference.eventId}/attachments`,{headers})).json()).toEqual([])
 await noAudioDrafts(page)
 // Replaying the actual confirmed operation must return its original receipt.
 // This extra APIRequestContext call is explicit and is not a second UI save.
 const replayResponse=await request.post(saveInputs[0].url,{headers,data:saveInputs[0].body})
 expect(replayResponse.ok()).toBe(true);const replay=await replayResponse.json()
 expect(replay.savedDraft.result.records.map((r:any)=>r.recordId)).toEqual([reference.recordId])
 expect((await readRecords()).map((r:any)=>r.id)).toEqual([reference.recordId])
 const nextInput='这一段还没有发送。'
 await page.getByLabel('对话输入').fill(nextInput)
 await receipt.getByRole('button',{name:'收起',exact:true}).click()
 await expect(receipt.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 await receipt.getByRole('button',{name:'查看记录',exact:true}).click()
 await expect.poll(()=>new URL(page.url()).searchParams.get('recordId')).toBe(reference.recordId)
 expect(new URL(page.url()).searchParams.get('memberId')).toBe(memberId)
 const detail=page.locator('.symptom-record-sheet[role=dialog]')
 await expect(detail).toBeVisible();await expect(detail.locator('.symptom-record-original').first()).toHaveText(edited)
 await detail.locator('.record-user-original>summary').click()
 await expect(detail.locator('.record-user-original>p')).toHaveText(edited)
  await detail.getByText('更正前文字',{exact:true}).click();await expect(detail.locator('.record-user-original details p')).toHaveText(raw)
 await detail.locator('.symptom-record-detail-actions button').click()
 await expect(detail.getByLabel('发生时间',{exact:true})).toHaveValue('')
 await detail.getByLabel('记录内容',{exact:true}).fill('这段修改尚未保存。')
 await detail.getByRole('button',{name:'取消',exact:true}).click()
 await expect(detail.getByText('还有未保存的修改',{exact:true})).toBeVisible()
 await detail.getByRole('button',{name:'放弃修改',exact:true}).click()
 await expect(detail).toBeVisible();await expect(detail.locator('.symptom-record-original').first()).toHaveText(edited)
 await detail.locator('.hoho-bottom-sheet__close').click()
 await expect(page).toHaveURL(/\/nurse-station(?:\?|$)/)
 await expect(page.getByLabel('对话输入')).toHaveValue(nextInput)
 await expect(page.locator('.smart-record-saved').getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 expect(counts).toEqual({jobs:1,assets:0,asr:0,confirm:1,originalSave:1,structuredSave:0,directRecordCreate:0,recordPatch:0})
 expect((await readRecords()).find((r:any)=>r.id===reference.recordId).content).toBe(edited)
 await noAudioDrafts(page)
 await page.screenshot({path:info.outputPath('manual-review-real-local-receipt-return.png')})
 await page.reload();await expect(page.getByLabel('对话输入')).toHaveValue(nextInput)
 await expect(page.getByRole('button',{name:'重试这条消息',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'移除这条未成功的消息',exact:true})).toHaveCount(0)
})

test('V3 lost manual-save receipt reopens locked and replays the exact original operation',async({page,request},info)=>{
 // Only the understanding provider is deliberately failed. The first
 // save_original reaches the real local server and persists successfully;
 // route.abort drops its actual HTTP receipt rather than inventing a result.
 const raw='刚才孩子咳了两声。',edited='刚才孩子咳了三声，随后停止。'
 const nextInput='下一段新草稿还没有发送。'
 const counts={jobs:0,assets:0,asr:0,structuredSave:0,directRecordCreate:0}
 const inputs:{url:string;body:any}[]=[]
 let firstResult:any,secondResult:any,dropped=false
 page.on('request',r=>{
  if(r.method()!=='POST')return
  const path=new URL(r.url()).pathname
  if(path.endsWith('/recognition-jobs'))counts.jobs++
  if(path.endsWith('/recognition-assets'))counts.assets++
  if(path==='/api/ai/audio/transcriptions')counts.asr++
  if(/\/ai-drafts\/[^/]+\/save$/.test(path))counts.structuredSave++
  if(/\/api\/events\/[^/]+\/records$/.test(path))counts.directRecordCreate++
 })
 await page.route(`**/api/members/${memberId}/front-desk-record/contexts/*`,async route=>{
  const req=route.request()
  if(req.method()!=='POST'||req.postDataJSON().action!=='save_original'){await route.continue();return}
  const body=req.postDataJSON();inputs.push({url:req.url(),body})
  const response=await route.fetch()
  expect(response.ok()).toBe(true)
  const result=await response.json()
  expect(result.savedDraft.state).toBe('saved');expect(result.context.saved).toBe(true)
  if(inputs.length===1){firstResult=result;await route.abort('connectionreset');dropped=true}
  else{expect(inputs).toHaveLength(2);secondResult=result;await route.fulfill({response})}
 })
 await request.get(`${control}/failure`)
 await page.getByRole('button',{name:'改用文字',exact:true}).click()
 await page.getByLabel('对话输入',{exact:true}).fill(raw)
 const submitted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-jobs'))
 await page.getByRole('button',{name:'发送',exact:true}).click()
 const accepted=await submitted;expect(accepted.ok()).toBe(true);const job=await accepted.json()
 let failed:any
 await expect.poll(async()=>{failed=await(await request.get(`/api/members/${memberId}/recognition-jobs/${job.id}`,{headers})).json();return failed.state},{timeout:30000}).toBe('failed')
 const contextUrl=`/api/members/${memberId}/front-desk-record/contexts/${failed.frontDesk.context.id}`
 await page.getByRole('button',{name:'手动核对',exact:true}).click()
 const manual=page.getByRole('dialog',{name:'手动核对原话',exact:true}),editor=manual.getByLabel('手动核对文字',{exact:true})
 await expect(manual).toBeVisible();await expect(editor).toHaveValue(raw)
 const confirming=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(`/contexts/${failed.frontDesk.context.id}`)&&r.request().postDataJSON().action==='confirm_subject')
 await manual.getByRole('button',{name:`这是${memberName}的记录`,exact:true}).click()
 const confirmedResponse=await confirming;expect(confirmedResponse.ok()).toBe(true);const confirmed=await confirmedResponse.json()
 expect(confirmed.subject).toMatchObject({kind:'current',memberId,confirmed:true})
 await editor.fill(edited)
 const save=manual.getByRole('button',{name:`保存给${memberName}`,exact:true})
 await expect(save).toBeEnabled();await save.click()
 await expect.poll(()=>dropped).toBe(true)
 await expect(save).toBeEnabled();await expect(editor).toBeDisabled();await expect(editor).toHaveValue(edited)
 await expect(manual.getByRole('alert')).toBeVisible()
 await expect(page.locator('.smart-record-saved')).toHaveCount(0)
 expect(inputs).toHaveLength(1)
 expect(inputs[0].body).toEqual({action:'save_original',expectedVersion:confirmed.version,confirmed:true,reviewText:edited})
 const reference=firstResult.savedDraft.result.records[0]
 const readContext=async()=>await(await request.get(contextUrl,{headers})).json()
 const readRecords=async()=>await(await request.get(`/api/events/${reference.eventId}/records`,{headers})).json()
 const persisted=await readContext(),records=await readRecords()
 expect(persisted.saved).toBe(true)
 expect(persisted.operationReceipts.filter((r:any)=>r.type==='save_original')).toHaveLength(1)
 expect(records).toHaveLength(1);expect(records[0].id).toBe(reference.recordId)
 expect(records[0].content).toBe(edited);expect(records[0].sourceText).toBe(raw)
 expect(records[0].journal.timePrecision).toBe('unknown')
 // Closing the form must retain the committed request, while a separate
 // unsent conversation input remains available and is not a save source.
 await manual.getByRole('button',{name:'关闭手动核对原话',exact:true}).click()
 await expect(manual).toHaveCount(0)
 await page.getByLabel('对话输入',{exact:true}).fill(nextInput)
 await page.getByRole('button',{name:'手动核对',exact:true}).click()
 await expect(manual).toBeVisible();await expect(editor).toBeDisabled();await expect(editor).toHaveValue(edited)
 await manual.getByText('用户原话',{exact:true}).click()
 await expect(manual.locator('details>p')).toHaveText(raw)
 expect(inputs).toHaveLength(1)
 const replaying=page.waitForResponse(r=>r.request().method()==='POST'&&r.request().url()===inputs[0].url&&r.request().postDataJSON().action==='save_original')
 await expect(save).toBeEnabled();await save.click()
 const replayResponse=await replaying;expect(replayResponse.ok()).toBe(true)
 const replay=await replayResponse.json()
 expect(replay.savedDraft.result.records.map((r:any)=>r.recordId)).toEqual([reference.recordId])
 expect(secondResult.savedDraft.result.records[0].recordId).toBe(reference.recordId)
 expect(inputs).toHaveLength(2);expect(inputs[1]).toEqual(inputs[0])
 await expect(manual).toHaveCount(0)
 const receipt=page.locator('.smart-record-saved').filter({has:page.getByRole('button',{name:'查看记录',exact:true})})
 await expect(receipt).toHaveCount(1);await expect(receipt).toContainText(memberName)
 await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue(nextInput)
 const recovered=await readContext(),after=await readRecords()
 expect(recovered.operationReceipts.filter((r:any)=>r.type==='save_original')).toHaveLength(1)
 expect(after.map((r:any)=>r.id)).toEqual([reference.recordId])
 expect(after[0].content).toBe(edited);expect(after[0].sourceText).toBe(raw)
 expect(counts).toEqual({jobs:1,assets:0,asr:0,structuredSave:0,directRecordCreate:0})
 await noAudioDrafts(page)
 await page.screenshot({path:info.outputPath('manual-review-lost-receipt-exact-replay.png')})
})
