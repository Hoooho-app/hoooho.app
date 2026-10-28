// Synthetic supplier only. API persistence, browser rendering and routing are real.
import {test,expect,type Page,type APIRequestContext} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import sharp from 'sharp'
import {writeFile} from 'node:fs/promises'
const control='http://127.0.0.1:4868',token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
let memberId:string,memberName:string
const noAction={type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}
const subject={kind:'unknown',memberId:null,label:null,sources:[]}
async function reply(request:APIRequestContext,text:string,question:string|null=null){
 const r=await request.post(`${control}/front-reply-data`,{data:{reply:question?`收到。${question}`:'收到。',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'add',targetId:null,text,scope:'record',polarity:'affirmed',subject,sources:[{messageId:'@latest',attachmentId:null,quote:text}]}],nextQuestion:question?{id:null,text:question,target:'observation',sourceMessageId:'@latest'}:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}});expect(r.ok()).toBe(true)
}
async function send(page:Page,text:string){const input=page.getByRole('textbox',{name:'对话输入'});if(!await input.isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click();await input.fill(text);const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST');await page.getByRole('button',{name:'发送',exact:true}).click();const r=await accepted;expect(r.ok()).toBe(true);return r.json()}
async function settle(request:APIRequestContext,id:string,revision:number){let job:any;await expect.poll(async()=>{job=await(await request.get(`/api/members/${memberId}/recognition-jobs/${id}`,{headers,maxRetries:2})).json();return job.state==='failed'||job.resultRevision===revision&&['ready','needs_review'].includes(job.state)}).toBe(true);expect(job.state,JSON.stringify(job.error)).not.toBe('failed');return job}
async function generate(page:Page){
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 await page.getByRole('button',{name:'生成记录单',exact:true}).click()
 await expect(page.getByRole('region',{name:'当前记录单'})).toBeVisible()
}
async function discussVisit(page:Page,request:APIRequestContext){
 await request.post(`${control}/front-reply-data`,{data:{reply:'可以把已有情况整理成就诊资料，供就诊时核对。',contextId:'@context',responseMode:'consultation',taskRelation:'continue',subject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const job=await send(page,'我准备去医院，挂什么科？');await settle(request,job.id,job.inputRevision)
 await expect(page.getByRole('region',{name:'就诊情况单'})).toBeVisible()
}
test.beforeEach(async({page,request})=>{
 memberName=`合成孩子${crypto.randomUUID().slice(0,4)}`;const r=await request.post('/api/members',{headers,data:{name:memberName,relationship:'child',birthday:'2024-01-01'}});expect(r.ok()).toBe(true);memberId=(await r.json()).id
 await request.post('/api/auth/current-member',{headers,data:{memberId}});await request.get(`${control}/success`);await request.get(`${control}/delay?ms=100`);await request.post(`${control}/draft-data`,{data:{items:null}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('continuous-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}));sessionStorage.setItem('continuous-initialized','true')}},{token,memberId})
 await page.goto('/nurse-station');await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
})
test.afterEach(async({request})=>{await request.get(`${control}/success`);await request.get(`${control}/delay?ms=40`);await request.delete(`/api/members/${memberId}`,{headers})})
test('compact home tools, dynamic name, four direct attachment actions, daily feeding and stable text switch',async({page},info)=>{
 await expect(page.getByText(`我是${memberName}的档案员，TA的任何情况我都能帮助整理。`,{exact:true})).toBeVisible()
 await expect(page.locator('.front-desk-followup')).toHaveCount(0)
 expect(await page.locator('[aria-label="记录入口"] button').allTextContents()).toEqual(['记录症状','就诊资料回传','用药','日常'])
 await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 expect(await page.locator('[aria-label="记录入口"] button').evaluateAll(buttons=>buttons.map(button=>getComputedStyle(button).backgroundColor))).toEqual(['rgb(228, 243, 234)','rgb(228, 239, 252)','rgb(239, 233, 248)','rgb(248, 237, 244)'])
 await page.getByRole('button',{name:'日常',exact:true}).click();expect(await page.locator('.daily-record-options button').allTextContents()).toEqual(['喂养与饮食','睡眠','排便'])
 const dailyImages=page.locator('.daily-record-options button img')
 await expect(dailyImages).toHaveCount(3)
 await expect.poll(()=>dailyImages.evaluateAll(images=>images.every(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0&&getComputedStyle(image).visibility==='visible'))).toBe(true)
 await page.getByRole('button',{name:'日常',exact:true}).click()
 await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('front-desk-voice-home.png')})
 const before=await page.locator('.hoho-dialogue-composer').boundingBox();await page.getByRole('button',{name:'改用文字',exact:true}).click();const after=await page.locator('.hoho-dialogue-composer').boundingBox();expect(after!.height).toBe(before!.height);expect(after!.width).toBe(before!.width)
 const input=page.getByRole('textbox',{name:'对话输入',exact:true})
 await input.fill('尚未发送的观察')
 expect(await input.evaluate(element=>{const style=getComputedStyle(element);return [style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth,style.outlineStyle,style.boxShadow]})).toEqual(['0px','0px','0px','0px','none','none'])
 await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('button',{name:'喂养与饮食',exact:true}).click()
 const feeding=page.getByRole('dialog',{name:'喂养/饮食',exact:true});await expect(feeding).toBeVisible();await feeding.getByRole('button',{name:'返回',exact:true}).click()
 await expect(page).toHaveURL(/nurse-station$/);await expect(input).toHaveValue('尚未发送的观察')
 await input.fill('');await page.screenshot({path:info.outputPath('front-desk-borderless-input.png')})
 await page.getByRole('button',{name:'添加照片、视频或文件'}).click();expect(await page.locator('.hoho-dialogue-media-sources button').allTextContents()).toEqual(['传照片','拍照片','拍视频','选择文件'])
 for(const [label,accept] of [['传照片','image/'],['拍照片','image/'],['拍视频','video/'],['选择文件','application/pdf']]){if(label!=='传照片')await page.getByRole('button',{name:'添加照片、视频或文件'}).click();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:label,exact:true}).click();expect(await(await chooser).element().getAttribute('accept')).toContain(accept)}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
 for(const button of await page.locator('[aria-label="记录入口"] button').all())expect(await button.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true)
 await page.screenshot({path:info.outputPath('front-desk-mobile.png')})
})
test('processing and questions precede explicit generation, save and reopening the same record',async({page,request},info)=>{
 const observeCalendarHistory=()=>{
  const key='front-desk-calendar-replacements';if(sessionStorage.getItem(key)===null)sessionStorage.setItem(key,'0')
  const replace=history.replaceState.bind(history)
  history.replaceState=(data:unknown,unused:string,url?:string|URL|null)=>{if(url){const target=new URL(String(url),location.href);if(target.pathname==='/health-events'&&target.searchParams.has('recordId')&&target.searchParams.has('sort'))sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key))+1))}return replace(data,unused,url)}
 }
 await page.addInitScript(observeCalendarHistory);await page.evaluate(observeCalendarHistory)
 const text='今天头有点疼';await reply(request,text,'哪里最不舒服？');await request.get(`${control}/delay?ms=800`)
 const job=await send(page,text)
 await expect(page.getByRole('status',{name:'正在处理这条消息'})).toBeVisible()
 await expect(page.getByText('收到',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 await expect(page.getByRole('region',{name:'就诊情况单'})).toHaveCount(0)
 await settle(request,job.id,job.inputRevision)
 await expect(page.getByText('收到。哪里最不舒服？',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'生成记录单',exact:true})).toHaveCount(0)
 await expect(page.locator('.front-desk-message-loading')).toHaveCount(0)
 await expect(page.locator('.nurse-avatar--user')).toHaveCount(0)
 await reply(request,'额头疼');const answer=await send(page,'额头疼');await settle(request,answer.id,answer.inputRevision)
 await expect(page.getByRole('button',{name:'生成记录单',exact:true})).toBeVisible()
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 let context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined()
 await page.reload();await expect(page.getByRole('button',{name:'生成记录单',exact:true})).toBeVisible();await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'})
 await expect(card.getByText('查看原话',{exact:true})).toHaveCount(0);await expect(card.getByText('已记录',{exact:true})).toHaveCount(0)
 context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined()
 await page.reload();await expect(card).toBeVisible()
 await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();const recordId=context.currentRecord.recordId,eventId=context.currentRecord.eventId
 const records=await(await request.get(`/api/events/${eventId}/records`,{headers})).json();expect(records.length).toBe(1);expect(records[0].id).toBe(recordId);expect(records[0].sourceText).toContain(text);expect(records[0].content).toMatch(/额头[疼痛]/u)
 if(!await page.getByRole('textbox',{name:'对话输入'}).isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
 await page.getByRole('textbox',{name:'对话输入'}).fill('还没发出的补充')
 let slowCardReads=false
 await page.route('**/front-desk-record/contexts/*',async route=>{
  if(slowCardReads&&route.request().postDataJSON()?.action==='current_card'){const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,700));return route.fulfill({response})}
  return route.continue()
 })
 await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page).toHaveURL(new RegExp(`recordId=${recordId}`));slowCardReads=true;await page.goBack();await expect(page.getByRole('textbox',{name:'对话输入'})).toHaveValue('还没发出的补充')
 expect(await page.evaluate(()=>Number(sessionStorage.getItem('front-desk-calendar-replacements')))).toBe(0)
 await page.locator('.front-desk-top-entries').getByRole('button',{name:'症状记录单',exact:true}).click();await expect(page.getByRole('dialog',{name:'症状记录单'})).toContainText(/额头[疼痛]/u);await page.getByRole('dialog',{name:'症状记录单'}).getByRole('button',{name:'关闭症状记录单',exact:true}).click()
 await page.reload();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单']);await expect(page.getByRole('region',{name:'就诊情况单'})).toHaveCount(0)
 await discussVisit(page,request);await page.getByRole('region',{name:'就诊情况单'}).getByRole('button',{name:'一键整理',exact:true}).click();await expect(page.getByRole('dialog',{name:'就诊清单'})).toContainText(/额头[疼痛]/u);await page.getByRole('dialog',{name:'就诊清单'}).getByRole('button',{name:'关闭就诊清单',exact:true}).click()
 await page.screenshot({path:info.outputPath('saved-continuous-record.png')})
})
test('inline edits and sticky latest card, checklist changes in place only after success',async({page,request},info)=>{
 const text='今天胃口不太好';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toHaveCount(0)
 const contextBefore=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),cardBefore=await(await request.post(`/api/members/${memberId}/front-desk-record/contexts/${contextBefore.id}`,{headers,data:{action:'current_card'}})).json()
 await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 const inline=page.getByRole('region',{name:'当前记录单'}),sheet=page.getByRole('dialog',{name:'症状记录单'})
 await inline.getByRole('button',{name:'编辑',exact:true}).click();await inline.getByRole('textbox',{name:'记录内容',exact:true}).fill('今天胃口比昨天好一些');await inline.getByRole('button',{name:'完成修改',exact:true}).click();await expect(inline.getByText('今天胃口比昨天好一些',{exact:true})).toBeVisible();await expect(inline.getByRole('status',{name:'记录已保存'})).toHaveCount(0);await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 await inline.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 await discussVisit(page,request)
 // Failed and in-flight organization never publishes a pinned checklist.
 const organize=page.getByRole('region',{name:'就诊情况单'}).getByRole('button',{name:'一键整理',exact:true})
 await page.route('**/front-desk-record/contexts/*',async route=>route.request().postDataJSON()?.action==='visit_checklist'?route.fulfill({status:503,json:{error:{code:'SYNTHETIC_CHECKLIST_FAILURE',message:'合成整理故障'}}}):route.continue())
 await organize.click();await expect(page.getByText(/合成整理故障/)).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单']);await expect(page.getByRole('dialog',{name:'就诊清单'})).toHaveCount(0)
 await page.unroute('**/front-desk-record/contexts/*')
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/front-desk-record/contexts/*',async route=>{if(route.request().postDataJSON()?.action==='visit_checklist'){const response=await route.fetch();held=true;await gate;return route.fulfill({response})}return route.continue()})
 try{await organize.click();await expect.poll(()=>held).toBe(true);await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单']);await expect(page.getByRole('dialog',{name:'就诊清单'})).toHaveCount(0)}finally{release()}
 await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单','就诊清单']);await expect(page.getByRole('dialog',{name:'就诊清单'})).toContainText('今天胃口比昨天好一些')
 await page.unroute('**/front-desk-record/contexts/*')
 expect(await page.locator('.front-desk-top-entries button').evaluateAll(buttons=>buttons.map(button=>getComputedStyle(button).backgroundColor))).toEqual(['rgb(190, 220, 202)','rgb(192, 213, 242)'])
 const afterEdit=await(await request.post(`/api/members/${memberId}/front-desk-record/contexts/${contextBefore.id}`,{headers,data:{action:'current_card'}})).json();expect(afterEdit.occurredAt).toBe(cardBefore.occurredAt);expect(afterEdit.timePrecision).toBe(cardBefore.timePrecision)
 await page.screenshot({path:info.outputPath('visit-checklist.png')})
 await page.getByRole('dialog',{name:'就诊清单'}).getByRole('button',{name:'关闭就诊清单',exact:true}).click()
 await page.locator('.front-desk-top-entries').getByRole('button',{name:'症状记录单',exact:true}).click();await sheet.getByRole('button',{name:'编辑',exact:true}).click();await sheet.getByRole('textbox',{name:'记录内容',exact:true}).fill('今天胃口又好了一些')
 await page.reload();await page.locator('.front-desk-top-entries').getByRole('button',{name:'症状记录单',exact:true}).click();await expect(sheet.getByRole('textbox',{name:'记录内容',exact:true})).toHaveValue('今天胃口又好了一些');await sheet.getByRole('button',{name:'完成修改',exact:true}).click();await sheet.getByRole('button',{name:'关闭症状记录单',exact:true}).click()
 await page.locator('.front-desk-top-entries').getByRole('button',{name:'就诊清单',exact:true}).click();await expect(page.getByRole('dialog',{name:'就诊清单'})).toContainText('今天胃口又好了一些')
})

test('save failure leaves the same draft and retry writes exactly one record',async({page,request})=>{
 const text='右手有点痒';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'})
 await page.route('**/front-desk-record/contexts/*',async route=>{if(route.request().postDataJSON()?.action==='save_current')return route.fulfill({status:503,json:{error:{code:'SYNTHETIC_STORAGE_FAILURE',message:'合成保存故障'}}});return route.continue()})
 await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByText(/合成保存故障/)).toBeVisible();await expect(card.getByRole('button',{name:'保存记录',exact:true})).toBeVisible();await expect(card.getByRole('status',{name:'记录已保存'})).toHaveCount(0);await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(before.currentRecord).toBeUndefined()
 await page.unroute('**/front-desk-record/contexts/*');await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const after=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect((await(await request.get(`/api/events/${after.currentRecord.eventId}/records`,{headers})).json()).length).toBe(1)
})

test('lost save receipt is recovered with the same record ID',async({page,request})=>{
 const text='昨晚睡得不好';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 let lost=false
 await page.route('**/front-desk-record/contexts/*',async route=>{if(!lost&&route.request().postDataJSON()?.action==='save_current'){lost=true;const result=await route.fetch();expect(result.ok()).toBe(true);return route.abort('failed')}return route.continue()})
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'保存记录',exact:true})).toBeEnabled()
 const first=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(first.currentRecord.recordId).toBeTruthy()
 await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const retry=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(retry.currentRecord.recordId).toBe(first.currentRecord.recordId);expect((await(await request.get(`/api/events/${first.currentRecord.eventId}/records`,{headers})).json()).length).toBe(1)
})

test('correction updates the original record and leaves a single current card',async({page,request})=>{
 const text='右脚小趾碰疼了';await reply(request,text);let job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),fact=before.facts.find((f:any)=>f.status==='active'),correction='左脚小趾碰疼了'
 await reply(request,correction)
  await request.post(`${control}/front-reply-data`,{data:{reply:'收到，已修改为左脚小趾。',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'correct',targetId:fact.id,text:correction,scope:'record',polarity:'affirmed',subject,sources:[{messageId:'@latest',attachmentId:null,quote:correction}]}],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 job=await send(page,'刚才说错了，是左脚小趾碰疼了');try{await settle(request,job.id,job.inputRevision)}catch(error){const proof=await(await request.get(`${control}/continuous-record-proof?contextId=${before.id}`)).json();await writeFile(test.info().outputPath('synthetic-revision-proof.json'),JSON.stringify(proof,null,2));throw error}
 await generate(page);await expect(card).toHaveCount(1);await expect(card).toContainText('左脚小趾');await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();const after=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(after.currentRecord.recordId).toBe(before.currentRecord.recordId)
 const record=(await(await request.get(`/api/events/${after.currentRecord.eventId}/records`,{headers})).json()).find((r:any)=>r.id===after.currentRecord.recordId);expect(record.content).toContain('左脚');expect(record.sourceText).toContain(text);expect(record.sourceText).toContain('刚才说错了')
})

test('a dialogue-only version advance safely retries the same save evidence once',async({page,request})=>{
 const text='手有点痒';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 let stale=false
 await page.route('**/front-desk-record/contexts/*',async route=>{
  const data=route.request().postDataJSON()
  if(!stale&&data.action==='save_current'){stale=true;return route.continue({postData:JSON.stringify({...data,expectedVersion:data.expectedVersion-1})})}
  return route.continue()
 })
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();expect(stale).toBe(true)
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect((await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json())).toHaveLength(1)
})

test('manual card edits survive background organization and a reload',async({page,request})=>{
 const text='手臂有点痒';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 await request.get(`${control}/delay?ms=900`)
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByRole('textbox',{name:'记录内容',exact:true}).fill('现在手臂已经不痒了')
 const editResponse=page.waitForResponse(response=>response.url().includes('/front-desk-record/contexts/')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='edit_current')
 await card.getByRole('button',{name:'完成修改',exact:true}).click();const receipt=await editResponse;expect(receipt.ok()).toBe(true);const edited=await receipt.json();expect(edited.recognitionJob?.id).toBeTruthy();expect(edited.recognitionJob.id).not.toBe(job.id)
 await expect(card).toContainText('现在手臂已经不痒了')
 const latest=await(await request.get(`/api/members/${memberId}/recognition-jobs?scopeKey=front`,{headers})).json();expect(latest.id).toBe(edited.recognitionJob.id);await settle(request,latest.id,latest.inputRevision)
 await expect(card).toContainText('现在手臂已经不痒了');await page.reload();await expect(page.getByRole('region',{name:'当前记录单'})).toContainText('现在手臂已经不痒了')
})

test('a failed model still leaves a viewable raw record without false structured success',async({page,request})=>{
 await request.get(`${control}/failure`);const text='昨晚饭后胃有点不舒服';const job=await send(page,text)
 await expect.poll(async()=>{const state=await(await request.get(`/api/members/${memberId}/recognition-jobs/${job.id}`,{headers})).json();return state.state}).toBe('failed')
 await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card).toContainText(text);await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page.locator('.symptom-record-sheet')).toContainText(text)
})

test('blank input does not submit; punctuation remains conversation with no automatic save',async({page,request})=>{
 await page.getByRole('button',{name:'改用文字',exact:true}).click();const input=page.getByRole('textbox',{name:'对话输入'});await input.fill('   ');await expect(page.getByRole('button',{name:'发送',exact:true})).toHaveCount(0)
 await request.post(`${control}/front-reply-data`,{data:{reply:'收到，可以慢慢说。',contextId:'new',responseMode:'conversation',taskRelation:'new',subject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const job=await send(page,'。');await settle(request,job.id,job.inputRevision);const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined();expect(context.review?.items??[]).toHaveLength(0)
})

test('real browser audio and synthetic ASR correction update the same record',async({page,request})=>{
 const text='手背有点痒';await reply(request,text);let job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),fact=before.facts.find((f:any)=>f.status==='active'),corrected='手心有点痒'
 await request.get(`${control}/voice?text=${encodeURIComponent('改成手心有点痒')}`)
 await request.post(`${control}/front-reply-data`,{data:{reply:'收到，部位已修改为手心。',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'correct',targetId:fact.id,text:corrected,scope:'record',polarity:'affirmed',subject,sources:[{messageId:'@latest',attachmentId:null,quote:corrected}]}],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 await page.getByRole('button',{name:'改用语音',exact:true}).click();const hold=page.getByRole('button',{name:'按住记录症状',exact:true});await hold.focus();await page.keyboard.down('Space');await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible();await page.waitForTimeout(1400)
 const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST');await page.keyboard.up('Space');const result=await accepted;expect(result.ok()).toBe(true);job=await result.json();await expect(page.getByRole('status',{name:'正在转写和处理这段语音'})).toBeVisible();await expect(page.getByText('收到',{exact:true})).toHaveCount(0);await settle(request,job.id,job.inputRevision)
 await generate(page);await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();await expect(page.locator('.nurse-turn--user').last()).toContainText('改成手心有点痒');await expect(card).toContainText('手心')
 const after=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(after.currentRecord.recordId).toBe(before.currentRecord.recordId);await expect(card).toHaveCount(1)
})

test('explicit save command persists once using the displayed current card',async({page,request})=>{
 const text='吃完饭肚子有点胀';await reply(request,text);let job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page);await expect(page.getByRole('region',{name:'当前记录单'})).toBeVisible()
 job=await send(page,'保存这条');await settle(request,job.id,job.inputRevision);const card=page.getByRole('region',{name:'当前记录单'});await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect((await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json()).length).toBe(1)
})

test('member switch fences a delayed response and updates the dynamic greeting',async({page,request})=>{
 const otherName='另一位合成孩子',created=await request.post('/api/members',{headers,data:{name:otherName,relationship:'child',birthday:'2025-01-01'}});expect(created.ok()).toBe(true);const otherId=(await created.json()).id
 await page.reload();await reply(request,'头有点疼');await request.get(`${control}/delay?ms=1500`)
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route(/\/recognition-jobs\/[^/?]+(?:\?.*)?$/,async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),body=await response.json();if(!held&&body.frontDesk?.context.messages.some((m:any)=>m.kind==='assistant')){held=true;await gate}await route.fulfill({response,json:body}).catch(()=>undefined)})
 try{
  await send(page,'头有点疼');await expect.poll(()=>held).toBe(true);await page.getByRole('button',{name:'打开菜单',exact:true}).click();await page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'打开我的孩子',exact:true}).click();await page.getByRole('dialog',{name:'我的孩子'}).getByRole('button',{name:`切换到${otherName}`,exact:true}).click();release()
  await expect(page.getByText(`我是${otherName}的档案员，TA的任何情况我都能帮助整理。`,{exact:true})).toBeVisible();await expect(page.locator('.nurse-turn--user')).toHaveCount(0);await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
  await reply(request,'睡得很好');const job=await send(page,'睡得很好');expect((await request.get(`/api/members/${otherId}/recognition-jobs/${job.id}`,{headers})).ok()).toBe(true)
 }finally{release?.();await request.delete(`/api/members/${otherId}`,{headers})}
})

test('photo-only upload retains its bytes and saves a readable original without a manufactured symptom',async({page,request})=>{
 const bytes=await sharp({create:{width:48,height:48,channels:3,background:'#bdd7c7'}}).png().toBuffer()
 await request.post(`${control}/front-reply-data`,{data:{reply:'收到，图片里是一片浅绿色区域。',contextId:'new',responseMode:'conversation',taskRelation:'new',subject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'添加照片、视频或文件'}).click();const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'传照片',exact:true}).click();await(await picker).setFiles({name:'合成照片.png',mimeType:'image/png',buffer:bytes})
 const response=await accepted;expect(response.ok()).toBe(true);const job=await response.json();await settle(request,job.id,job.inputRevision);await generate(page)
 await expect(page.locator('.front-desk-top-entries')).toHaveCount(0);const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),records=await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json();expect(records).toHaveLength(1);expect(records[0].type).toBe('note');expect(records[0].aiProvenance.attachmentIds).toHaveLength(1)
 await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page.locator('.symptom-record-sheet')).toBeVisible();await page.locator('.symptom-record-sheet').getByRole('button',{name:'读取原件 1',exact:true}).click();const original=page.locator('.symptom-record-sheet').getByRole('link',{name:'查看原件 1',exact:true});await expect(original).toHaveAttribute('href',/^blob:/);expect(await original.evaluate(async link=>{const buffer=await(await fetch((link as HTMLAnchorElement).href)).arrayBuffer();return btoa(String.fromCharCode(...new Uint8Array(buffer)))})).toBe(bytes.toString('base64'))
})

test('archive classification keeps the exact vaccination entry destination and the universal view button',async({page,request},info)=>{
 const text='昨天下午接种了乙肝疫苗';await reply(request,text)
 await request.post(`${control}/draft-data`,{data:{items:[{category:'vaccination',title:'乙肝疫苗接种',timeText:'昨天',subject:'current',archiveCategory:'vaccination',relationKey:null,fields:[{name:'vaccineName',value:'乙肝疫苗',quote:'乙肝疫苗',sourceId:'@first',page:1}]}]}})
 const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'保存记录',exact:true}).click();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),entry=context.currentRecord.profileEntries[0]
 expect(entry.sectionId).toBe('vaccination');expect(entry.entryId.startsWith(`${context.currentRecord.recordId}/`)).toBe(true)
 await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page).toHaveURL(new RegExp('health-profile/vaccination\\?'))
 await expect(page.locator('[data-record-id]').filter({hasText:'乙肝'}).first()).toHaveAttribute('data-record-id',entry.entryId)
 await page.screenshot({path:info.outputPath('saved-vaccination-entry.png')})
})


test('declining generation preserves the conversation through reload and offers again after a new answer',async({page,request})=>{
 const first='今早胃口一般';await reply(request,first);let job=await send(page,first);await settle(request,job.id,job.inputRevision)
 await page.getByRole('button',{name:'继续补充',exact:true}).click()
 await page.reload();await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.getByRole('button',{name:'生成记录单',exact:true})).toHaveCount(0)
 const second='中午吃了半碗饭';await reply(request,second);job=await send(page,second);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card).toContainText('胃口');await expect(card).toContainText('半碗饭')
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined()
})

test('a late generation response cannot display an obsolete card over a newer question',async({page,request})=>{
 const first='昨晚有点咳嗽';await reply(request,first);let job=await send(page,first);await settle(request,job.id,job.inputRevision)
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/front-desk-record/contexts/*',async route=>{if(route.request().postDataJSON()?.action==='generate_current'){const response=await route.fetch();held=true;await gate;return route.fulfill({response})}return route.continue()})
 try{
  await page.getByRole('button',{name:'生成记录单',exact:true}).click();await expect.poll(()=>held).toBe(true)
  await reply(request,'今天还在咳嗽','还有流鼻涕吗？');job=await send(page,'今天还在咳嗽');await settle(request,job.id,job.inputRevision)
  release();await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.getByRole('button',{name:'生成记录单',exact:true})).toHaveCount(0)
  await expect(page.getByText('收到。还有流鼻涕吗？',{exact:true})).toBeVisible()
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined()
 }finally{release?.()}
})
