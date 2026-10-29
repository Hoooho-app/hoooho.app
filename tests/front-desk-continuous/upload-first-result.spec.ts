// Synthetic suppliers; real uploads, API persistence, browser clicks and recovery.
import {test,expect,type APIRequestContext,type Page} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {fingerprint} from '../../server/ai/business/contract.mjs'
import sharp from 'sharp'
const control='http://127.0.0.1:4868',token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
let memberId:string
const base='/api/members/'
const text='收费单列出合成检查甲和合成检查乙，未提供检查结果。'
const unknown={kind:'unknown',memberId:null,label:null,sources:[]}
const noAction={type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}
async function fixture(request:APIRequestContext,content:string,attachmentId:string|null=null,question:string|null=null){
 await request.post(`${control}/front-reply-data`,{data:{reply:attachmentId?`单据类型：收费导引单。\n项目：合成检查甲、合成检查乙。\n检查结果：未提供。`:question??content,contextId:attachmentId?'new':'@context',responseMode:'record',taskRelation:attachmentId?'switch':'continue',subject:unknown,recordChanges:[{type:'add',targetId:null,text:content,scope:'record',polarity:'affirmed',subject:unknown,sources:[{messageId:'@latest',attachmentId,quote:content}]}],nextQuestion:question?{id:null,text:question,target:'observation',sourceMessageId:'@latest'}:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
}
async function settled(request:APIRequestContext,id:string){let job:any;await expect.poll(async()=>{job=await(await request.get(`${base}${memberId}/recognition-jobs/${encodeURIComponent(id)}`,{headers})).json();return ['ready','needs_review','failed'].includes(job.state)}).toBe(true);expect(job.state,JSON.stringify(job.error)).not.toBe('failed');return job}
async function send(page:Page,content:string){await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByRole('textbox',{name:'对话输入',exact:true}).fill(content);const ack=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST');await page.getByRole('button',{name:'发送',exact:true}).click();return(await ack).json()}
async function photo(){const bytes=await sharp({create:{width:120,height:160,channels:3,background:'#dadada'}}).png().toBuffer(),dataUrl=`data:image/png;base64,${bytes.toString('base64')}`;return {bytes,attachmentId:`file-${fingerprint(dataUrl).slice(0,24)}`}}
async function upload(page:Page,bytes:Buffer){const posted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加照片、视频或文件'}).click();await(await chooser).setFiles({name:'合成收费单.png',mimeType:'image/png',buffer:bytes});return posted}
test.beforeEach(async({page,request})=>{
 const response=await request.post('/api/members',{headers,data:{name:'合成孩子',relationship:'child',birthday:'2024-01-01'}});expect(response.ok()).toBe(true);memberId=(await response.json()).id
 await request.post('/api/auth/current-member',{headers,data:{memberId}});await request.get(`${control}/success`);await request.get(`${control}/delay?ms=80`);await request.post(`${control}/draft-data`,{data:{items:null}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('first-result-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}));sessionStorage.setItem('first-result-initialized','1')}},{token,memberId})
 await page.goto('/nurse-station');await expect(page.getByRole('button',{name:'切换记录对象',exact:true})).toBeVisible()
})
test.afterEach(async({request})=>{await request.get(`${control}/success`);await request.get(`${control}/delay?ms=40`);await request.delete(`${base}${memberId}`,{headers})})

test('rejected image cannot borrow an older task ACK; legacy pending image recovers after reload and retries its same original',async({page,request})=>{
 await fixture(request,'合成先前观察')
 const older=await send(page,'合成先前观察');await settled(request,older.id)
 // Cancel only once the browser has selected the existing task for this upload.
 // Cancelling earlier races the normal poll, which can correctly choose a fresh task.
 const cancelBeforeSubmission = async (route: import('@playwright/test').Route) => {
  if(route.request().method()!=='POST')return route.continue()
  expect(route.request().postDataJSON().id).toBe(older.id)
  const discarded=await request.post(`${base}${memberId}/recognition-jobs/${older.id}/commands`,{headers,data:{id:'synthetic-cancel',type:'discard'}})
  expect(discarded.ok()).toBe(true)
  await route.continue()
 }
 await page.route('**/recognition-jobs',cancelBeforeSubmission)
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 let uploads=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/recognition-assets'))uploads++})
 const rejected=await upload(page,bytes);expect(rejected.status()).toBe(409)
 const rejectedInput=rejected.request().postDataJSON().input
 await expect(page.getByRole('button',{name:'重试',exact:true})).toBeVisible()
 await expect(page.getByRole('status',{name:'正在处理这条消息'})).toHaveCount(0)
 // Wait for the client recovery GET before changing interception. Disabling
 // Chromium interception while that GET starts can strand it in the harness.
 await page.unroute('**/recognition-jobs',cancelBeforeSubmission)
 // Reproduce the persisted pending state left by the previous client release.
 await page.evaluate(async({memberId,inputId})=>{
  const {captureDraft,checkpointCaptureDraft}=await import('/src/features/ai-business/captureDraft.ts')
  for(const prefix of ['home-smart','smart']){
   const key=`${prefix}:visit-test:${memberId}:new`,draft=await captureDraft(key)
   if(!draft?.conversationTurns?.some(turn=>turn.id===inputId))continue
   const legacy={...draft,updatedAt:Date.now(),frontContextVersion:(draft.frontContextVersion??0)+2,conversationTurns:draft.conversationTurns.map(turn=>turn.id===inputId?{...turn,status:'pending' as const,error:undefined,errorCode:undefined}:turn)}
   await captureDraft(key,legacy);checkpointCaptureDraft(key,legacy);return
  }
  throw Error('Synthetic legacy draft not found')
 },{memberId,inputId:rejectedInput.id})
 const before=(await(await request.get(`${control}/status`)).json()).calls
 await page.reload();await expect(page.getByRole('button',{name:'重试',exact:true})).toBeVisible()
 await expect(page.getByRole('img',{name:'合成收费单.png',exact:true})).toBeVisible()
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(before)
 const posted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'重试',exact:true}).click();const retried=await posted;expect(retried.ok()).toBe(true)
 const body=retried.request().postDataJSON();expect(body.id).not.toBe(older.id);expect(body.input.id).toBe(rejectedInput.id);expect(body.input.assetIds).toEqual(rejectedInput.assetIds)
 expect(body.input.contextId).toBeUndefined();expect(body.input.answerTo).toBeUndefined();expect(uploads).toBe(1)
 const done=await settled(request,(await retried.json()).id)
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText('合成检查甲')
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(before+1)
 const context=await(await request.get(`${base}${memberId}/front-desk-record/contexts/${done.frontDesk.context.id}`,{headers})).json()
 expect(context.messages.filter((message:any)=>message.kind==='image')).toHaveLength(1);expect(context.currentRecord).toBeUndefined()
})

test('an accepted image paused during processing survives reload and resumes the same task without reupload',async({page,request})=>{
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 await request.get(`${control}/delay?ms=3000`)
 let uploads=0,posts=0
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/recognition-assets'))uploads++;if(r.method()==='POST'&&r.url().endsWith('/recognition-jobs'))posts++})
 const response=await upload(page,bytes),accepted=await response.json(),input=response.request().postDataJSON().input
 const pause=await request.post(`${base}${memberId}/recognition-jobs/${accepted.id}/commands`,{headers,data:{id:'synthetic-interruption',type:'pause'}})
 expect(pause.ok()).toBe(true);expect((await pause.json()).state).toBe('paused')
 await expect(page.getByRole('button',{name:'继续处理',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'继续处理',exact:true})).toBeInViewport()
 await expect(page.getByRole('status',{name:'正在处理这条消息'})).toHaveCount(0)
 const before=(await(await request.get(`${control}/status`)).json()).calls
 await page.reload()
 await expect(page.getByRole('button',{name:'继续处理',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'继续处理',exact:true})).toBeInViewport()
 await expect(page.getByText('处理已暂停，原件和已完成步骤保留',{exact:true})).toBeVisible()
 await expect(page.getByRole('img',{name:'合成收费单.png',exact:true})).toBeVisible()
 await expect(page.getByRole('status',{name:'正在处理这条消息'})).toHaveCount(0)
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(before)
 await request.get(`${control}/delay?ms=80`)
 const commanded=page.waitForResponse(r=>r.url().endsWith(`/recognition-jobs/${accepted.id}/commands`)&&r.request().method()==='POST')
 await page.getByRole('button',{name:'继续处理',exact:true}).click()
 const resumed=await commanded;expect(resumed.ok()).toBe(true);expect(resumed.request().postDataJSON().type).toBe('resume')
 const ready=await settled(request,accepted.id)
 expect(ready.inputStates.map((value:any)=>value.id)).toEqual([input.id])
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText(text)
 await expect(page.getByRole('button',{name:'继续处理',exact:true})).toHaveCount(0)
 expect(uploads).toBe(1);expect(posts).toBe(1)
 const context=await(await request.get(`${base}${memberId}/front-desk-record/contexts/${ready.frontDesk.context.id}`,{headers})).json()
 expect(context.messages.filter((message:any)=>message.kind==='image')).toHaveLength(1);expect(context.currentRecord).toBeUndefined()
})

test('organization failure after a readable image exposes same-task retry and retains the first reading',async({page,request})=>{
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 let uploads=0,posts=0
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/recognition-assets'))uploads++;if(r.method()==='POST'&&r.url().endsWith('/recognition-jobs'))posts++})
 const response=await upload(page,bytes),accepted=await response.json()
 await settled(request,accepted.id)
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText(text)
 await request.get(`${control}/failure`)
 const generated=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/front-desk-record/contexts/')&&r.request().postDataJSON()?.action==='generate_current')
 await page.getByRole('button',{name:'确认整理',exact:true}).click()
 const organization=(await(await generated).json()).recognitionJob
 expect(organization.id).toBeTruthy()
 let failed:any
 await expect.poll(async()=>{failed=await(await request.get(`${base}${memberId}/recognition-jobs/${organization.id}`,{headers})).json();return failed.state}).toBe('failed')
 expect(failed.unresolvedInputs).toHaveLength(0)
 expect(failed.inputStates.every((value:any)=>value.status==='completed')).toBe(true)
 await expect(page.getByRole('button',{name:'重试这一步',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'重试这一步',exact:true})).toBeInViewport()
 await expect(page.getByRole('group',{name:'护护的回复',exact:true}).filter({hasText:'单据类型：收费导引单'})).toContainText('合成检查甲')
 await expect(page.getByRole('status',{name:'正在处理这条消息'})).toHaveCount(0)
 await request.get(`${control}/success`)
 const commanded=page.waitForResponse(r=>r.url().endsWith(`/recognition-jobs/${encodeURIComponent(organization.id)}/commands`)&&r.request().method()==='POST')
 await page.getByRole('button',{name:'重试这一步',exact:true}).click()
 const retried=await commanded;expect(retried.ok()).toBe(true);expect(retried.request().postDataJSON().type).toBe('retry')
 await settled(request,organization.id)
 expect(uploads).toBe(1);expect(posts).toBe(1)
 const context=await(await request.get(`${base}${memberId}/front-desk-record`,{headers})).json()
 expect(context.messages.filter((message:any)=>message.kind==='image')).toHaveLength(1);expect(context.currentRecord).toBeUndefined()
})

test('lost image ACK recovers the exact accepted input without duplicate uploads or recognition',async({page,request})=>{
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 let posts=0
 await page.route('**/recognition-jobs',async route=>{if(route.request().method()!=='POST')return route.continue();posts++;await route.fetch();await route.abort('failed')})
 const before=(await(await request.get(`${control}/status`)).json()).calls
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加照片、视频或文件'}).click();await(await chooser).setFiles({name:'合成收费单.png',mimeType:'image/png',buffer:bytes})
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText('合成检查甲')
 await expect(page.getByRole('button',{name:'重试',exact:true})).toHaveCount(0)
 expect(posts).toBe(1);expect((await(await request.get(`${control}/status`)).json()).calls).toBe(before+1)
})

test('an accepted image cancelled before ACK recovery stays cancelled and is never automatically resubmitted',async({page,request})=>{
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 let posts=0
 await page.route('**/recognition-jobs',async route=>{
  if(route.request().method()!=='POST')return route.continue()
  posts++;const response=await route.fetch(),job=await response.json()
  const cancelled=await request.post(`${base}${memberId}/recognition-jobs/${job.id}/commands`,{headers,data:{id:'synthetic-cancel-before-recovery',type:'discard'}});expect(cancelled.ok()).toBe(true)
  await route.abort('failed')
 })
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加照片、视频或文件'}).click();await(await chooser).setFiles({name:'合成收费单.png',mimeType:'image/png',buffer:bytes})
 await expect(page.getByText('这条输入已取消，原件仍保留；请选择新的资料继续。',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'重试',exact:true})).toBeDisabled()
 expect(posts).toBe(1)
})

test('a transcribed but cancelled voice stays cancelled and a new document can still be organized',async({page,request})=>{
 const voiceText='合成录音观察'
 await fixture(request,voiceText,null,'具体在什么部位？')
 await request.get(`${control}/voice?text=${encodeURIComponent(voiceText)}`)
 let posts=0
 let releasePoll!:()=>void
 const pollGate=new Promise<void>(resolve=>{releasePoll=resolve})
 await page.route('**/recognition-jobs/*',async route=>{
  if(route.request().method()==='GET')await pollGate
  await route.continue()
 })
 const loseCancelledVoiceAck=async(route:import('@playwright/test').Route)=>{
  if(route.request().method()!=='POST')return route.continue()
  posts++
  const response=await route.fetch(),job=await response.json()
  const done=await settled(request,job.id)
  expect(done.transcript?.text).toBe(voiceText)
  const cancelled=await request.post(`${base}${memberId}/recognition-jobs/${job.id}/commands`,{headers,data:{id:'synthetic-cancel-transcribed-voice',type:'discard'}})
  expect(cancelled.ok()).toBe(true)
  releasePoll()
  await route.abort('failed')
 }
 await page.route('**/recognition-jobs',loseCancelledVoiceAck)
 const hold=page.getByRole('button',{name:'按住记录症状',exact:true})
 await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await page.waitForTimeout(1100)
 await page.keyboard.up('Space')
 await expect(page.getByText('这条输入已取消，原件仍保留；请选择新的资料继续。',{exact:true})).toBeVisible()
 await expect(page.getByRole('status',{name:'正在转写和处理这段语音'})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'重试',exact:true})).toBeDisabled()
 await page.unroute('**/recognition-jobs',loseCancelledVoiceAck)
 const before=(await(await request.get(`${control}/status`)).json()).asrCalls
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 const posted=await upload(page,bytes);expect(posted.ok()).toBe(true)
 await settled(request,(await posted.json()).id)
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText(text)
 await expect(page.getByRole('button',{name:'确认整理',exact:true})).toBeEnabled()
 expect(posts).toBe(1)
 expect((await(await request.get(`${control}/status`)).json()).asrCalls).toBe(before)
})

test('first upload reading is shown after one call, does not answer the previous symptom question, and organization waits for consent',async({page,request})=>{
 await fixture(request,'孩子手上有合成红点',null,'从什么时候开始的？')
 const older=await send(page,'孩子手上有合成红点');await settled(request,older.id)
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 await request.post(`${control}/draft-data`,{data:{items:null,ocrText:`合成机构\n2026-09-29\n${text}`,visualOutput:{kind:'document',status:'readable',text,observations:[]}}})
 const before=(await(await request.get(`${control}/status`)).json()).calls
 const posted=await upload(page,bytes);expect(posted.ok()).toBe(true);const body=posted.request().postDataJSON();expect(body.input.answerTo).toBeUndefined()
 const first=await settled(request,(await posted.json()).id)
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText(text)
 await expect(page.getByText('资料内容（初步识别）',{exact:true})).toBeVisible()
 await expect(page.getByText('资料内容（初步识别）',{exact:true})).toBeInViewport()
 await expect(page.getByRole('region',{name:'资料识别结果'}).getByRole('button',{name:/^这是.+的资料$/})).toHaveCount(0)
 const consent=page.getByRole('button',{name:'确认整理',exact:true});await expect(consent).toBeEnabled()
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(before+1)
 expect(first.review).toBeNull()
 const context=await(await request.get(`${base}${memberId}/front-desk-record/contexts/${first.frontDesk.context.id}`,{headers})).json()
 expect(context.messages.find((message:any)=>message.id===body.input.id).contextQuestion??null).toBeNull();expect(context.currentRecord).toBeUndefined()
 await page.reload();await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText(text);await expect(consent).toBeEnabled()
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(before+1)
 await request.get(`${control}/delay?ms=1200`)
 const generated=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/front-desk-record/contexts/')&&r.request().postDataJSON()?.action==='generate_current')
 await consent.click();const card=await(await generated).json();expect(card.recognitionJob?.id).toBeTruthy()
 await expect(page.getByRole('region',{name:'当前记录单'})).toContainText('合成检查甲')
 await settled(request,card.recognitionJob.id)
 expect((await(await request.get(`${base}${memberId}/front-desk-record/contexts/${first.frontDesk.context.id}`,{headers})).json()).currentRecord).toBeUndefined()
 await expect(page.getByRole('status').filter({hasText:'待核对记录对象，核对后保存'})).toBeVisible()
 await expect(page.getByRole('button',{name:'重试保存',exact:true})).toHaveCount(0)
 await page.getByRole('region',{name:'当前记录单'}).getByRole('button',{name:/^这是.+的资料$/}).click()
 const receipt=page.getByRole('status',{name:'记录已保存',exact:true});await expect(receipt).toBeVisible()
 const recordId=await receipt.getAttribute('data-record-id');expect(recordId).toBeTruthy()
 await page.reload();await expect(page.getByRole('status',{name:'记录已保存',exact:true})).toHaveAttribute('data-record-id',recordId!)
})

test('failed optional organization retains the first reading and can finish the authorized original save after ownership confirmation',async({page,request})=>{
 const {bytes,attachmentId}=await photo();await fixture(request,text,attachmentId)
 const posted=await upload(page,bytes);expect(posted.ok()).toBe(true)
 await settled(request,(await posted.json()).id)
 await expect(page.getByRole('region',{name:'资料识别结果'})).toContainText(text)
 await request.get(`${control}/failure`)
 const generated=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/front-desk-record/contexts/')&&r.request().postDataJSON()?.action==='generate_current')
 await page.getByRole('button',{name:'确认整理',exact:true}).click()
 const pending=await(await generated).json();expect(pending.pendingSave).toBe('subject');expect(pending.saved).toBeNull()
 await expect.poll(async()=>{const job=await(await request.get(`${base}${memberId}/recognition-jobs/${pending.recognitionJob.id}`,{headers})).json();return job.state}).toBe('failed')
 const card=page.getByRole('region',{name:'当前记录单'})
 await expect(card.getByRole('region',{name:'资料识别结果'})).toContainText(text)
 const confirm=card.getByRole('button',{name:/^这是.+的资料$/});await expect(confirm).toBeEnabled();await confirm.click()
 const receipt=card.getByRole('status',{name:'记录已保存',exact:true});await expect(receipt).toContainText('原话和附件已保存')
 const recordId=await receipt.getAttribute('data-record-id');expect(recordId).toBeTruthy()
 await page.reload();await expect(page.getByRole('status',{name:'记录已保存',exact:true})).toHaveAttribute('data-record-id',recordId!)
 const context=await(await request.get(`${base}${memberId}/front-desk-record/contexts/${pending.contextId}`,{headers})).json()
 expect(context.currentRecord.recordId).toBe(recordId)
 const records=await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json()
 expect(records).toHaveLength(1);expect(records[0].aiProvenance.attachmentIds).toHaveLength(1)
})
