// Synthetic supplier only. API persistence, browser rendering and routing are real.
import {test,expect,type Page,type APIRequestContext} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import sharp from 'sharp'
import {writeFile} from 'node:fs/promises'
import {openRegion,choose} from '../body-locator/helpers'
import {maskIdentityName} from '../../src/utils/privateIdentity'
import {fingerprint} from '../../server/ai/business/contract.mjs'
const control='http://127.0.0.1:4868',token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
let memberId:string,memberName:string
const noAction={type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}
const subject={kind:'unknown',memberId:null,label:null,sources:[]}
async function reply(request:APIRequestContext,text:string,question:string|null=null,polarity='affirmed'){
 const r=await request.post(`${control}/front-reply-data`,{data:{reply:question?`收到。${question}`:'收到。',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'add',targetId:null,text,scope:'record',polarity,subject,sources:[{messageId:'@latest',attachmentId:null,quote:text}]}],nextQuestion:question?{id:null,text:question,target:'observation',sourceMessageId:'@latest'}:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}});expect(r.ok()).toBe(true)
}
async function send(page:Page,text:string){const input=page.getByRole('textbox',{name:'对话输入'});if(!await input.isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click();await input.fill(text);const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST');await page.getByRole('button',{name:'发送',exact:true}).click();const r=await accepted;expect(r.ok()).toBe(true);return r.json()}
async function settle(request:APIRequestContext,id:string,revision:number){let job:any;await expect.poll(async()=>{job=await(await request.get(`/api/members/${memberId}/recognition-jobs/${id}`,{headers,maxRetries:2})).json();return job.state==='failed'||job.resultRevision===revision&&['ready','needs_review'].includes(job.state)}).toBe(true);expect(job.state,JSON.stringify(job.error)).not.toBe('failed');return job}
async function generate(page:Page){
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 await page.getByRole('button',{name:'确认整理',exact:true}).click()
 await expect(page.getByRole('region',{name:'当前记录单'})).toBeVisible()
}

test('key information: paper home, empty temperature tool, inline spinner and one confirmed saved reading',async({page,request},info)=>{
 const home=page.locator('.smart-record-home'),footer=page.locator('.smart-record-page__footer'),nav=page.getByRole('navigation',{name:'主要导航'})
 const paper=await home.evaluate(element=>getComputedStyle(element).backgroundColor)
 expect(await footer.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(paper)
 expect(await nav.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(paper)
 await expect(page.locator('header h1')).toHaveCount(0)
 const child=page.getByRole('button',{name:'切换记录对象',exact:true})
 expect(await child.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe(paper)
 const media=await page.locator('.front-desk-welcome__media').boundingBox(),welcome=await page.locator('.front-desk-welcome').boundingBox()
 expect(media!.width).toBeLessThan(welcome!.width*.8)
 expect(await page.locator('.front-desk-welcome video').evaluate(element=>getComputedStyle(element).transform)).toBe('none')
 expect(Math.abs((await nav.boundingBox())!.y+(await nav.boundingBox())!.height-page.viewportSize()!.height)).toBeLessThan(2)
 await page.screenshot({path:info.outputPath('paper-home-smaller-video.png')})
 const first='有点发热';await reply(request,first,'有没有量过具体体温？');await request.get(`${control}/delay?ms=900`)
 const job=await send(page,first)
 await expect(page.locator('.nurse-turn--user p>.front-desk-message-loading')).toBeVisible()
 expect(await page.locator('.front-desk-message-loading svg').evaluate(element=>getComputedStyle(element).animationDuration)).toBe('1.8s')
 await settle(request,job.id,job.inputRevision)
 await expect(page.locator('.nurse-turn--assistant .nurse-avatar')).toHaveCount(0)
 await expect(page.locator('.nurse-turn--assistant').last()).not.toContainText('有没有量过')
 const number=page.getByRole('spinbutton',{name:'体温（℃）'}),slider=page.getByRole('slider',{name:'拖动选择体温'}),confirm=page.getByRole('button',{name:'确认数值',exact:true})
 await expect(number).toHaveValue('');await expect(confirm).toBeDisabled()
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 await slider.focus();await slider.press('Home');await slider.press('ArrowRight');await expect(number).toHaveValue('30.1')
 expect((await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()).messages).toHaveLength(before.messages.length)
 await number.fill('38.6');await reply(request,'测得体温 38.6℃。')
 const accepted=page.waitForResponse(response=>response.url().endsWith('/recognition-jobs')&&response.request().method()==='POST')
 await confirm.click();const measured=await(await accepted).json();await settle(request,measured.id,measured.inputRevision)
 await expect(page.getByRole('list',{name:'本轮询问进度'})).toContainText('体温数值已获得')
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/front-desk-record/contexts/*',async route=>{if(route.request().postDataJSON()?.action==='generate_current'){const response=await route.fetch();held=true;await gate;return route.fulfill({response})}return route.continue()})
 try{await page.getByRole('button',{name:'确认整理',exact:true}).click();await expect.poll(()=>held).toBe(true);await expect(page.getByRole('button',{name:'正在整理并保存…',exact:true})).toBeDisabled()}finally{release()}
 const card=page.getByRole('region',{name:'当前记录单',exact:true})
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
 await expect(card.getByRole('textbox')).toHaveCount(0)
 await expect(card.getByRole('heading',{name:'情况概述',exact:true})).toBeVisible();await expect(card.getByRole('heading',{name:'关键词',exact:true})).toBeVisible()
 await expect(card.locator('details[open]')).toHaveCount(0);await expect(card.getByRole('button',{name:'保存记录',exact:true})).toHaveCount(0)
 const saved=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 await expect(card.locator('.record-reading .symptom-record-original').first()).toHaveCSS('border-top-width','0px')
 await expect.poll(async()=>{const a=await card.getByRole('heading',{name:'情况概述',exact:true}).boundingBox(),b=await page.locator('.smart-record-page__body').boundingBox();return !!a&&!!b&&a.y>=b.y&&a.y<b.y+b.height}).toBe(true)
 await page.screenshot({path:info.outputPath('overview-keywords-folded-record.png')})
 await card.locator('summary').filter({hasText:'具体表现与测量'}).click();await expect(card.locator('details[open]')).toContainText('38.6℃')
 await page.screenshot({path:info.outputPath('expanded-record-details.png')})
 await page.reload();await expect(card.locator('details[open]')).toHaveCount(0);await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
 await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByRole('textbox',{name:'记录内容',exact:true}).fill('发热减轻，复测体温37.8℃。');await card.getByRole('button',{name:'保存修改',exact:true}).click()
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
 const edited=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 expect(edited.currentRecord.recordId).toBe(saved.currentRecord.recordId)
 const records=await(await request.get(`/api/events/${edited.currentRecord.eventId}/records`,{headers})).json()
 expect(records).toHaveLength(1);expect(records[0].content).toBe('发热减轻，复测体温37.8℃。')
 await page.locator('[data-front-entry="record"]').click();const detail=page.locator('.symptom-record-sheet')
 await expect(detail.getByRole('heading',{name:'情况概述',exact:true})).toBeVisible();await expect(detail.locator('details[open]')).toHaveCount(0)
})

test('key information: speaking other observations bypasses an empty numeric tool without inventing a measurement',async({page,request})=>{
 await reply(request,'有点发热','有没有量过具体体温？');let job=await send(page,'有点发热');await settle(request,job.id,job.inputRevision)
 await expect(page.getByRole('spinbutton',{name:'体温（℃）'})).toHaveValue('')
 await reply(request,'精神和平时一样。');job=await send(page,'精神和平时一样。');await settle(request,job.id,job.inputRevision)
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 expect(context.interview.checks.some((check:any)=>check.key==='temperature'&&check.state==='answered')).toBe(false)
 expect(context.facts.filter((fact:any)=>fact.status==='active').map((fact:any)=>fact.text).join('\n')).not.toMatch(/37|38|℃/)
 await expect(page.getByRole('button',{name:'继续补充',exact:true})).toHaveCount(0)
 await generate(page);await expect(page.getByRole('status',{name:'记录已保存'})).toBeVisible()
})

test('key information: saying a measurement was taken still needs an actual numeric value',async({page,request},info)=>{
 await reply(request,'有点发热','有没有量过具体体温？');let job=await send(page,'有点发热');await settle(request,job.id,job.inputRevision)
 await reply(request,'已经测量体温。');job=await send(page,'已经测量体温。');await settle(request,job.id,job.inputRevision)
 const progress=page.getByRole('list',{name:'本轮询问进度'})
 await expect(progress).toContainText('体温数值待补充')
 await expect(progress).not.toContainText('体温数值已获得')
 await page.screenshot({path:info.outputPath('temperature-not-obtained-without-number.png')})
 await reply(request,'测得体温38.6℃。');job=await send(page,'测得体温38.6℃。');await settle(request,job.id,job.inputRevision)
 await expect(progress).toContainText('体温数值已获得')
})
async function discussVisit(page:Page,request:APIRequestContext){
 await request.post(`${control}/front-reply-data`,{data:{reply:'可以把已有情况整理成就诊资料，供就诊时核对。',contextId:'@context',responseMode:'consultation',taskRelation:'continue',subject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const job=await send(page,'我准备去医院，挂什么科？');await settle(request,job.id,job.inputRevision)
 await expect(page.getByRole('region',{name:'就诊情况单'})).toBeVisible()
}

test('recorded voice retry resumes its immutable task instead of reposting the failed snapshot',async({page,request},info)=>{
 await request.get(`${control}/failure`)
 const before=await(await request.get(`${control}/status`)).json()
 const hold=page.getByRole('button',{name:'按住记录症状',exact:true})
 await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await page.waitForTimeout(1100)
 const posted=page.waitForResponse(response=>response.url().endsWith('/recognition-jobs')&&response.request().method()==='POST')
 await page.keyboard.up('Space');const accepted=await(await posted).json()
 await expect(page.getByRole('button',{name:'重试这条消息',exact:true})).toBeVisible()
 await expect(page.getByText('语音转写未完成，原录音仍保留，可以重试或改用文字。',{exact:true})).toBeVisible()
 const failed=await(await request.get(`${control}/status`)).json();expect(failed.asrCalls).toBe(before.asrCalls+1)
 await request.get(`${control}/success`);const text='胳膊有红点';await request.get(`${control}/voice?text=${encodeURIComponent(text)}`);await reply(request,text)
 const commanded=page.waitForResponse(response=>response.url().endsWith(`/recognition-jobs/${accepted.id}/commands`)&&response.request().method()==='POST')
 await page.getByRole('button',{name:'重试这条消息',exact:true}).click()
 const response=await commanded;expect(response.ok()).toBe(true);expect(response.request().postDataJSON().type).toBe('retry')
 await settle(request,accepted.id,accepted.inputRevision)
 await expect(page.getByRole('button',{name:'重试这条消息',exact:true})).toHaveCount(0)
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 expect(context.messages.filter((message:any)=>message.kind==='voice')).toHaveLength(1)
 expect(context.messages.find((message:any)=>message.kind==='voice').text).toBe(text)
 expect(context.continuedFromId).not.toBe(context.id)
 expect((await(await request.get(`${control}/status`)).json()).asrCalls).toBe(failed.asrCalls+1)
 await page.reload();await expect(page.getByText(text,{exact:true})).toBeVisible()
 expect((await(await request.get(`${control}/status`)).json()).asrCalls).toBe(failed.asrCalls+1)
 await page.screenshot({path:info.outputPath('voice-retry-resumed.png')})
})

test('second follow-up offers text consent, unknown location opens picker, and rephrased comparisons do not repeat',async({page,request},info)=>{
 const first='胳膊有小红点';await reply(request,first,'具体在哪个部位？')
 const callsBefore=(await(await request.get(`${control}/status`)).json()).calls
 let job=await send(page,first);await settle(request,job.id,job.inputRevision)
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(callsBefore+1)
 await expect(page.getByRole('button',{name:'选择症状部位',exact:true})).toBeVisible()
 const unknown='说不清具体位置。'
 await request.post(`${control}/front-reply-data`,{data:{reply:'可以点选部位。洗完澡后更明显吗？',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'add',targetId:null,text:unknown,scope:'record',polarity:'unknown',subject,sources:[{messageId:'@latest',attachmentId:null,quote:unknown}]}],nextQuestion:{id:null,text:'洗完澡后更明显吗？',target:'bath_comparison',sourceMessageId:'@latest'},requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 job=await send(page,unknown);await settle(request,job.id,job.inputRevision)
 const confirm=page.getByRole('button',{name:'确认整理',exact:true});await expect(confirm).toBeVisible()
 await expect(page.getByRole('list',{name:'本轮询问进度'})).toContainText('症状部位待补充 · 尚未明确')
 expect(await confirm.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
 expect(await confirm.evaluate(element=>getComputedStyle(element).color)).toBe('rgb(42, 120, 82)')
 // Picking a location is supplementary input, not an answer to the bath question.
 const beforeCancel=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 await page.getByRole('button',{name:'选择症状部位',exact:true}).click()
 const picker=page.getByRole('dialog',{name:'身体部位定位器',exact:true})
 await picker.getByRole('button',{name:'取消选择',exact:true}).click();await expect(picker).toHaveCount(0)
 expect((await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()).messages).toHaveLength(beforeCancel.messages.length)
 await page.getByRole('button',{name:'选择症状部位',exact:true}).click()
 await reply(request,'暂时无法确认具体症状部位。','洗完澡后更明显吗？','unknown')
 const selected=page.waitForResponse(response=>response.url().endsWith('/recognition-jobs')&&response.request().method()==='POST')
 await picker.getByRole('button',{name:'完成，暂不选择',exact:true}).click();job=await(await selected).json();await settle(request,job.id,job.inputRevision)
 const supplemented=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 expect(supplemented.interview.question.text).toBe('洗完澡后更明显吗？')
 expect(supplemented.messages.find((message:any)=>message.text==='暂时无法确认具体症状部位。').contextQuestion??null).toBeNull()
 const noComparison='洗澡之前没有观察，无法比较。'
 await request.post(`${control}/front-reply-data`,{data:{reply:'明白。洗澡后会更明显吗？',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'add',targetId:null,text:noComparison,scope:'record',polarity:'unknown',subject,sources:[{messageId:'@latest',attachmentId:null,quote:noComparison}]}],nextQuestion:{id:null,text:'洗澡后会更明显吗？',target:'after_bathing',sourceMessageId:'@latest'},requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 job=await send(page,noComparison);await settle(request,job.id,job.inputRevision)
 await expect(page.getByText('明白。洗澡后会更明显吗？',{exact:true})).toHaveCount(0)
 await expect(confirm).toBeVisible();const readyCalls=(await(await request.get(`${control}/status`)).json()).calls
 const reused=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes('/front-desk-record/contexts/')&&response.request().postDataJSON()?.action==='generate_current')
 await confirm.click();expect((await(await reused).json()).recognitionJob).toBeUndefined()
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(readyCalls)
 const draft=page.getByRole('region',{name:'当前记录单',exact:true});await expect(draft).toBeVisible()
 await expect(page.getByRole('dialog',{name:'症状记录单',exact:true})).toHaveCount(0)
 await expect(draft.getByRole('heading',{name:'情况概述',exact:true})).toBeVisible()
 await expect(draft.locator('summary').filter({hasText:'待补充与核对'})).toBeVisible();await expect(draft.locator('details[open]')).toHaveCount(0)
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord.recordId).toBeTruthy()
 await page.screenshot({path:info.outputPath('guided-structured-draft.png')})
})

test('selected body location and choice answers become one owned input each; fresh nurse reply is visible without scrolling',async({page,request},info)=>{
 const text='看见一小片红点，位置说不清。';await reply(request,text,'有没有新接触的衣物或洗护用品？')
 let job=await send(page,text);await settle(request,job.id,job.inputRevision)
 await page.getByRole('button',{name:'选择症状部位',exact:true}).click()
 const picker=page.getByRole('dialog',{name:'身体部位定位器',exact:true})
 await openRegion(page,'hand_left');await choose(page,'hand_left_palm_center')
 await expect(picker.locator('.locator-selected-line')).toContainText('左掌心')
 const selected='补充症状部位：左掌心。';await reply(request,selected,'孩子有说痒或疼，还是您看到他一直抓挠？')
 const posted=page.waitForResponse(response=>response.url().endsWith('/recognition-jobs')&&response.request().method()==='POST')
 await picker.getByRole('button',{name:/确认部位并补充到对话/}).click();job=await(await posted).json();await settle(request,job.id,job.inputRevision)
 await expect(picker).toHaveCount(0);await expect(page.getByText(selected,{exact:true})).toBeVisible()
 const choice=page.getByRole('group',{name:'选择回答',exact:true}).getByRole('button',{name:'看到抓挠',exact:true})
 await expect(choice).toBeVisible()
 await reply(request,'我看到孩子反复抓挠那里。','有没有新接触的衣物或洗护用品？');await request.get(`${control}/delay?ms=900`)
 const accepted=page.waitForResponse(response=>response.url().endsWith('/recognition-jobs')&&response.request().method()==='POST')
 await choice.click();job=await(await accepted).json()
 const body=page.locator('.smart-record-page__body');await body.evaluate(element=>element.scrollTop=0)
 await settle(request,job.id,job.inputRevision)
 const latest=page.locator('.nurse-turn--assistant[data-message-id]').last()
 await expect(latest).toContainText('有没有新接触的衣物或洗护用品？')
 await expect.poll(async()=>{const a=await latest.boundingBox(),b=await body.boundingBox();return !!a&&!!b&&a.y>=b.y-1&&a.y<b.y+b.height-30}).toBe(true)
 await expect(page.getByRole('list',{name:'本轮询问进度'})).toContainText('症状部位已获得')
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 expect(context.messages.filter((message:any)=>message.kind!=='assistant'&&message.text===selected)).toHaveLength(1)
 expect(context.messages.filter((message:any)=>message.kind!=='assistant'&&message.text==='我看到孩子反复抓挠那里。')).toHaveLength(1)
 expect(context.currentRecord).toBeUndefined()
 await page.screenshot({path:info.outputPath('location-choices-visible-reply.png')})
 const callsBefore=(await(await request.get(`${control}/status`)).json()).calls
 const generated=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes('/front-desk-record/contexts/')&&response.request().postDataJSON()?.action==='generate_current')
 await page.getByRole('button',{name:'确认整理',exact:true}).click();const generatedCard=await(await generated).json()
 expect(generatedCard.recognitionJob?.id).toBeTruthy();await settle(request,generatedCard.recognitionJob.id,generatedCard.recognitionJob.inputRevision)
 const callsAfter=(await(await request.get(`${control}/status`)).json()).calls;expect(callsAfter).toBeGreaterThan(callsBefore)
 const latestContext=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 const same=await request.post(`/api/members/${memberId}/front-desk-record/contexts/${latestContext.id}`,{headers,data:{action:'generate_current',expectedVersion:latestContext.version,confirmed:true}});expect(same.ok()).toBe(true)
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(callsAfter)
 expect(latestContext.currentRecord.recordId).toBeTruthy()
})
test.beforeEach(async({page,request})=>{
 memberName=`合成孩子${crypto.randomUUID().slice(0,4)}`;const r=await request.post('/api/members',{headers,data:{name:memberName,relationship:'child',birthday:'2024-01-01'}});expect(r.ok()).toBe(true);memberId=(await r.json()).id
 await request.post('/api/auth/current-member',{headers,data:{memberId}});await request.get(`${control}/success`);await request.get(`${control}/delay?ms=100`);await request.post(`${control}/draft-data`,{data:{items:null}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('continuous-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}));sessionStorage.setItem('continuous-initialized','true')}},{token,memberId})
 await page.goto('/nurse-station');await expect(page.getByRole('button',{name:'切换记录对象',exact:true})).toBeVisible()
})
test.afterEach(async({request})=>{await request.get(`${control}/success`);await request.get(`${control}/delay?ms=40`);await request.delete(`/api/members/${memberId}`,{headers})})
test('private home, keyboard classifications, four direct attachment actions, daily feeding and stable text switch',async({page},info)=>{
 await expect(page.getByText('我是记录员“护护”。有任何情况直接说，我可以帮你整理清楚。',{exact:true})).toBeVisible()
 await expect(page.locator('.front-desk-welcome')).not.toContainText(memberName)
 await expect(page.locator('.front-desk-followup')).toHaveCount(0)
 await expect(page.getByRole('group',{name:'记录入口',exact:true})).toHaveCount(0)
 await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 await page.screenshot({path:info.outputPath('front-desk-voice-home.png')})
 const before=await page.locator('.hoho-dialogue-composer').boundingBox();await page.getByRole('button',{name:'改用文字',exact:true}).click();const after=await page.locator('.hoho-dialogue-composer').boundingBox();expect(after!.height).toBe(before!.height);expect(after!.width).toBe(before!.width)
 expect(await page.locator('[aria-label="记录入口"] button').allTextContents()).toEqual(['记录症状','用药','日常','治疗复诊'])
 expect(await page.locator('[aria-label="记录入口"] button').evaluateAll(buttons=>buttons.map(button=>getComputedStyle(button).backgroundColor))).toEqual(['rgb(228, 243, 234)','rgb(239, 233, 248)','rgb(252, 242, 227)','rgb(228, 239, 252)'])
 await page.getByRole('button',{name:'日常',exact:true}).click();expect(await page.locator('.daily-record-options button').allTextContents()).toEqual(['喂养与饮食','睡眠','排便'])
 const dailyIcons=page.locator('.daily-record-options button svg[data-icon]')
 await expect(dailyIcons).toHaveCount(3)
 expect(await dailyIcons.evaluateAll(icons=>icons.map(icon=>icon.getAttribute('data-icon')))).toEqual(['pediatrics','bedtime','gastroenterology'])
 await expect.poll(()=>dailyIcons.evaluateAll(icons=>icons.every(icon=>icon.getBoundingClientRect().width===24&&icon.getAttribute('aria-hidden')==='true'&&getComputedStyle(icon.querySelector('.hoho-icon__outline')!).display!=='none'))).toBe(true)
 await page.getByRole('button',{name:'日常',exact:true}).click()
 const input=page.getByRole('textbox',{name:'对话输入',exact:true})
 await input.fill('第一行观察\n第二行观察\n第三行观察')
 await expect.poll(()=>input.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThan(24)
 await input.fill('')
 await expect.poll(async()=>(await page.locator('.hoho-dialogue-composer').boundingBox())?.height).toBe(before!.height)
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
 await expect(page.getByRole('button',{name:'确认整理',exact:true})).toHaveCount(0)
 await expect(page.locator('.front-desk-message-loading')).toHaveCount(0)
 await expect(page.locator('.nurse-avatar--user')).toHaveCount(0)
 await reply(request,'额头疼');const answer=await send(page,'额头疼');await settle(request,answer.id,answer.inputRevision)
 await expect(page.getByRole('button',{name:'确认整理',exact:true})).toBeVisible()
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 let context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined()
 if(process.env.VISIT_OPENROUTER_TEST==='1'){
  const replies=context.messages.filter((message:any)=>message.kind==='assistant'&&message.diagnostics)
  expect(replies.length).toBeGreaterThan(0)
  for(const message of replies){expect(message.diagnostics.provider).toBe('openrouter');expect(message.diagnostics.model).toBe('mistralai/synthetic')}
 }
 await page.reload();await expect(page.getByRole('button',{name:'确认整理',exact:true})).toBeVisible();await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'})
 await expect(card.getByText('查看原话',{exact:true})).toHaveCount(0);await expect(card.getByText('已记录',{exact:true})).toHaveCount(0)
 context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord.recordId).toBeTruthy()
 await page.reload();await expect(card).toBeVisible()
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();const recordId=context.currentRecord.recordId,eventId=context.currentRecord.eventId
 const records=await(await request.get(`/api/events/${eventId}/records`,{headers})).json();expect(records.length).toBe(1);expect(records[0].id).toBe(recordId);expect(records[0].sourceText).toContain(text);expect(records[0].content).toMatch(/额头[疼痛]/u)
 if(!await page.getByRole('textbox',{name:'对话输入'}).isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
 await page.getByRole('textbox',{name:'对话输入'}).fill('还没发出的补充')
 let slowCardReads=false
 await page.route('**/front-desk-record/contexts/*',async route=>{
  if(slowCardReads&&route.request().postDataJSON()?.action==='current_card'){const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,700));return route.fulfill({response})}
  return route.continue()
 })
 await page.route('**/src/pages/HealthEvents/index.tsx*',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue().catch(()=>undefined)})
 const cpu=await page.context().newCDPSession(page);await cpu.send('Emulation.setCPUThrottlingRate',{rate:4})
 try{await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page).toHaveURL(new RegExp(`recordId=${recordId}`));slowCardReads=true;await page.goBack();await expect(page).toHaveURL(/\/nurse-station$/);await expect(page.getByRole('textbox',{name:'对话输入'})).toHaveValue('还没发出的补充')}finally{await cpu.send('Emulation.setCPUThrottlingRate',{rate:1});await cpu.detach()}
 expect(await page.evaluate(()=>Number(sessionStorage.getItem('front-desk-calendar-replacements')))).toBe(0)
 await page.locator('.front-desk-top-entries').getByRole('button',{name:'症状记录单',exact:true}).click();const detail=page.locator('.symptom-record-sheet');await expect(detail).toContainText(/额头[疼痛]/u);await expect(detail.locator('summary').filter({hasText:'记录信息'})).toBeVisible();await expect(detail.getByRole('heading',{name:'情况概述',exact:true})).toBeVisible();await expect(page).toHaveURL(/nurse-station$/);await detail.getByRole('button',{name:/^编辑.*记录$/}).click();const editor=page.getByRole('dialog',{name:'症状记录单'});await expect(editor.getByRole('textbox',{name:'记录内容',exact:true})).toBeVisible();await editor.getByRole('button',{name:'取消',exact:true}).click();await editor.getByRole('button',{name:'关闭症状记录单',exact:true}).click();await expect(page.getByRole('textbox',{name:'对话输入'})).toHaveValue('还没发出的补充')
 await page.reload();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单']);await expect(page.getByRole('region',{name:'就诊情况单'})).toHaveCount(0)
 await discussVisit(page,request);await page.getByRole('region',{name:'就诊情况单'}).getByRole('button',{name:'一键整理',exact:true}).click();await expect(page.getByRole('dialog',{name:'就诊清单'})).toContainText(/额头[疼痛]/u);await page.getByRole('dialog',{name:'就诊清单'}).getByRole('button',{name:'关闭就诊清单',exact:true}).click()
 await page.screenshot({path:info.outputPath('saved-continuous-record.png')})
})
test('inline edits and sticky latest card, checklist changes in place only after success',async({page,request},info)=>{
 const text='今天胃口不太好';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toHaveCount(0)
 const contextBefore=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),cardBefore=await(await request.post(`/api/members/${memberId}/front-desk-record/contexts/${contextBefore.id}`,{headers,data:{action:'current_card'}})).json()
 await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 const inline=page.getByRole('region',{name:'当前记录单'}),sheet=page.getByRole('dialog',{name:'症状记录单'})
 await inline.getByRole('button',{name:'编辑',exact:true}).click();await inline.getByRole('textbox',{name:'记录内容',exact:true}).fill('今天胃口比昨天好一些');await inline.getByRole('button',{name:'保存修改',exact:true}).click();await expect(inline.getByText('今天胃口比昨天好一些',{exact:true})).toBeVisible();await expect(inline.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 await expect(inline.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
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
 await page.locator('.front-desk-top-entries').getByRole('button',{name:'症状记录单',exact:true}).click();await page.locator('.symptom-record-sheet').getByRole('button',{name:/^编辑(?:.*记录)?$/}).click();await sheet.getByRole('textbox',{name:'记录内容',exact:true}).fill('今天胃口又好了一些')
 await page.reload();await page.locator('.front-desk-top-entries').getByRole('button',{name:'症状记录单',exact:true}).click();await expect(sheet.getByRole('textbox',{name:'记录内容',exact:true})).toHaveValue('今天胃口又好了一些');await sheet.getByRole('button',{name:'保存修改',exact:true}).click();await sheet.getByRole('button',{name:'关闭症状记录单',exact:true}).click()
 await page.locator('.front-desk-top-entries').getByRole('button',{name:'就诊清单',exact:true}).click();await expect(page.getByRole('dialog',{name:'就诊清单'})).toContainText('今天胃口又好了一些')
})

test('save failure leaves the same conversation and retry confirmation writes exactly one record',async({page,request})=>{
 const text='右手有点痒';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision)
 await page.route('**/front-desk-record/contexts/*',async route=>route.request().postDataJSON()?.action==='generate_current'?route.fulfill({status:503,json:{error:{code:'SYNTHETIC_STORAGE_FAILURE',message:'合成保存故障'}}}):route.continue())
 await page.getByRole('button',{name:'确认整理',exact:true}).click();await expect(page.getByText(/合成保存故障/)).toBeVisible()
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(before.currentRecord).toBeUndefined()
 await page.unroute('**/front-desk-record/contexts/*');await generate(page)
 const after=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect((await(await request.get(`/api/events/${after.currentRecord.eventId}/records`,{headers})).json())).toHaveLength(1)
 await expect(page.getByRole('region',{name:'当前记录单'}).getByRole('status',{name:'记录已保存'})).toBeVisible()
})

test('lost confirmation receipt is recovered with the same record ID',async({page,request})=>{
 const text='昨晚睡得不好';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision)
 let lost=false,lostCommitted=false
 await page.route('**/front-desk-record/contexts/*',async route=>{if(!lost&&route.request().postDataJSON()?.action==='generate_current'){lost=true;const result=await route.fetch();expect(result.ok()).toBe(true);lostCommitted=true;return route.abort('failed')}return route.continue()})
 await page.getByRole('button',{name:'确认整理',exact:true}).click()
 await expect.poll(()=>lostCommitted).toBe(true)
 const first=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(first.currentRecord.recordId).toBeTruthy()
 // A background read may already recover the receipt. Otherwise repeat consent.
 const confirm=page.getByRole('button',{name:'确认整理',exact:true})
 await expect.poll(async()=>await confirm.isEnabled().catch(()=>false)||await page.getByRole('status',{name:'记录已保存'}).isVisible()).toBe(true)
 if(await confirm.isVisible())await confirm.click()
 await expect(page.getByRole('status',{name:'记录已保存'})).toBeVisible()
 const retry=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(retry.currentRecord.recordId).toBe(first.currentRecord.recordId);expect((await(await request.get(`/api/events/${first.currentRecord.eventId}/records`,{headers})).json())).toHaveLength(1)
})

test('correction updates the original record and leaves a single current card',async({page,request})=>{
 const text='右脚小趾碰疼了';await reply(request,text);let job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),fact=before.facts.find((f:any)=>f.status==='active'),correction='左脚小趾碰疼了'
 await reply(request,correction)
  await request.post(`${control}/front-reply-data`,{data:{reply:'收到，已修改为左脚小趾。',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'correct',targetId:fact.id,text:correction,scope:'record',polarity:'affirmed',subject,sources:[{messageId:'@latest',attachmentId:null,quote:correction}]}],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 job=await send(page,'刚才说错了，是左脚小趾碰疼了');try{await settle(request,job.id,job.inputRevision)}catch(error){const proof=await(await request.get(`${control}/continuous-record-proof?contextId=${before.id}`)).json();await writeFile(test.info().outputPath('synthetic-revision-proof.json'),JSON.stringify(proof,null,2));throw error}
 await generate(page);await expect(card).toHaveCount(1);await expect(card).toContainText('左脚小趾');await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();const after=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(after.currentRecord.recordId).toBe(before.currentRecord.recordId)
 const record=(await(await request.get(`/api/events/${after.currentRecord.eventId}/records`,{headers})).json()).find((r:any)=>r.id===after.currentRecord.recordId);expect(record.content).toContain('左脚');expect(record.sourceText).toContain(text);expect(record.sourceText).toContain('刚才说错了')
})

test('a dialogue-only version advance safely retries the same confirmation evidence once',async({page,request})=>{
 const text='手有点痒';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision)
 let stale=false
 await page.route('**/front-desk-record/contexts/*',async route=>{const data=route.request().postDataJSON();if(!stale&&data.action==='generate_current'){stale=true;return route.continue({postData:JSON.stringify({...data,expectedVersion:data.expectedVersion-1})})}return route.continue()})
 await generate(page);await expect(page.getByRole('status',{name:'记录已保存'})).toBeVisible();expect(stale).toBe(true)
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect((await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json())).toHaveLength(1)
})

test('manual card edits survive background organization and a reload',async({page,request})=>{
 const text='手臂有点痒';await reply(request,text);const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 await request.get(`${control}/delay?ms=900`)
 const card=page.getByRole('region',{name:'当前记录单'});await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByRole('textbox',{name:'记录内容',exact:true}).fill('现在手臂已经不痒了')
 const editResponse=page.waitForResponse(response=>response.url().includes('/front-desk-record/contexts/')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='edit_current')
 await card.getByRole('button',{name:'保存修改',exact:true}).click();const receipt=await editResponse;expect(receipt.ok()).toBe(true);const edited=await receipt.json();expect(edited.recognitionJob?.id).toBeTruthy();expect(edited.recognitionJob.id).not.toBe(job.id)
 await expect(card).toContainText('现在手臂已经不痒了')
 const latest=await(await request.get(`/api/members/${memberId}/recognition-jobs?scopeKey=front`,{headers})).json();expect(latest.id).toBe(edited.recognitionJob.id);await settle(request,latest.id,latest.inputRevision)
 await expect(card).toContainText('现在手臂已经不痒了');await page.reload();await expect(page.getByRole('region',{name:'当前记录单'})).toContainText('现在手臂已经不痒了')
})

test('a failed model still leaves a viewable raw record without false structured success',async({page,request})=>{
 await request.get(`${control}/failure`);const text='昨晚饭后胃有点不舒服';const job=await send(page,text)
 await expect.poll(async()=>{const state=await(await request.get(`/api/members/${memberId}/recognition-jobs/${job.id}`,{headers})).json();return state.state}).toBe('failed')
 const failedCalls=(await(await request.get(`${control}/status`)).json()).calls;await generate(page)
 expect((await(await request.get(`${control}/status`)).json()).calls).toBe(failedCalls)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card).toContainText(text);await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page.locator('.symptom-record-sheet')).toContainText(text)
})

test('blank input does not submit; punctuation remains conversation with no automatic save',async({page,request})=>{
 await page.getByRole('button',{name:'改用文字',exact:true}).click();const input=page.getByRole('textbox',{name:'对话输入'});await input.fill('   ');await expect(page.getByRole('button',{name:'发送',exact:true})).toHaveCount(0);const callsBefore=(await(await request.get(`${control}/status`)).json()).calls;await input.press('Enter');expect((await(await request.get(`${control}/status`)).json()).calls).toBe(callsBefore);await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
 await request.post(`${control}/front-reply-data`,{data:{reply:'收到，可以慢慢说。',contextId:'new',responseMode:'conversation',taskRelation:'new',subject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const job=await send(page,'。');await settle(request,job.id,job.inputRevision);const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord).toBeUndefined();expect(context.review?.items??[]).toHaveLength(0)
})

test('real browser audio and synthetic ASR correction update the same record',async({page,request})=>{
 const text='手背有点痒';await reply(request,text);let job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),fact=before.facts.find((f:any)=>f.status==='active'),corrected='手心有点痒'
 await request.get(`${control}/voice?text=${encodeURIComponent('改成手心有点痒')}`)
 await request.post(`${control}/front-reply-data`,{data:{reply:'收到，部位已修改为手心。',contextId:'@context',responseMode:'record',taskRelation:'continue',subject,recordChanges:[{type:'correct',targetId:fact.id,text:corrected,scope:'record',polarity:'affirmed',subject,sources:[{messageId:'@latest',attachmentId:null,quote:corrected}]}],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 await page.getByRole('button',{name:'改用语音',exact:true}).click();const hold=page.getByRole('button',{name:'按住记录症状',exact:true});await hold.focus();await page.keyboard.down('Space');await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible();await page.waitForTimeout(1400)
 const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST');await page.keyboard.up('Space');const result=await accepted;expect(result.ok()).toBe(true);job=await result.json();await expect(page.getByRole('status',{name:'正在转写和处理这段语音'})).toBeVisible();await expect(page.getByText('收到',{exact:true})).toHaveCount(0);await settle(request,job.id,job.inputRevision)
 await generate(page);await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();await expect(page.locator('.nurse-turn--user').last()).toContainText('改成手心有点痒');await expect(card).toContainText('手心')
 const after=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(after.currentRecord.recordId).toBe(before.currentRecord.recordId);await expect(card).toHaveCount(1)
})

test('explicit save command persists once using the displayed current card',async({page,request})=>{
 const text='吃完饭肚子有点胀';await reply(request,text);let job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page);await expect(page.getByRole('region',{name:'当前记录单'})).toBeVisible()
 job=await send(page,'保存这条');await settle(request,job.id,job.inputRevision);const card=page.getByRole('region',{name:'当前记录单'});await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect((await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json()).length).toBe(1)
})

test('member switch fences a delayed response and keeps the welcome private',async({page,request})=>{
 const otherName='另一位合成孩子',created=await request.post('/api/members',{headers,data:{name:otherName,relationship:'child',birthday:'2025-01-01'}});expect(created.ok()).toBe(true);const otherId=(await created.json()).id
 await page.reload();await reply(request,'头有点疼');await request.get(`${control}/delay?ms=1500`)
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route(/\/recognition-jobs\/[^/?]+(?:\?.*)?$/,async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),body=await response.json();if(!held&&body.frontDesk?.context.messages.some((m:any)=>m.kind==='assistant')){held=true;await gate}await route.fulfill({response,json:body}).catch(()=>undefined)})
 try{
  await send(page,'头有点疼');await expect.poll(()=>held).toBe(true);await page.getByRole('button',{name:'打开菜单',exact:true}).click();await page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'切换记录对象',exact:true}).click();await page.getByRole('dialog',{name:'我的孩子'}).getByRole('button',{name:`切换到${maskIdentityName(otherName)}`,exact:true}).click();release()
  await expect(page.getByText('我是记录员“护护”。有任何情况直接说，我可以帮你整理清楚。',{exact:true})).toBeVisible();await expect(page.locator('.front-desk-welcome')).not.toContainText(otherName);await expect(page.locator('.nurse-turn--user')).toHaveCount(0);await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.locator('.front-desk-top-entries')).toHaveCount(0)
  await reply(request,'睡得很好');const job=await send(page,'睡得很好');expect((await request.get(`/api/members/${otherId}/recognition-jobs/${job.id}`,{headers})).ok()).toBe(true)
 }finally{release?.();await request.delete(`/api/members/${otherId}`,{headers})}
})

test('photo-only upload retains its bytes and saves a readable original without a manufactured symptom',async({page,request})=>{
 const bytes=await sharp({create:{width:48,height:48,channels:3,background:'#bdd7c7'}}).png().toBuffer()
 await request.post(`${control}/front-reply-data`,{data:{reply:'收到，图片里是一片浅绿色区域。',contextId:'new',responseMode:'conversation',taskRelation:'new',subject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'添加照片、视频或文件'}).click();const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'传照片',exact:true}).click();await(await picker).setFiles({name:'合成照片.png',mimeType:'image/png',buffer:bytes})
 const response=await accepted;expect(response.ok()).toBe(true);const job=await response.json();await settle(request,job.id,job.inputRevision);await generate(page)
 await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单']);const card=page.getByRole('region',{name:'当前记录单'});await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible();await expect(page.locator('.front-desk-top-entries button')).toHaveText(['症状记录单'])
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),records=await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json();expect(records).toHaveLength(1);expect(records[0].type).toBe('note');expect(records[0].aiProvenance.attachmentIds).toHaveLength(1)
 await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page.locator('.symptom-record-sheet')).toBeVisible();await page.locator('.symptom-record-sheet').locator('summary').filter({hasText:'原始资料'}).click();await page.locator('.symptom-record-sheet').getByRole('button',{name:'读取原件 1',exact:true}).click();const original=page.locator('.symptom-record-sheet').getByRole('link',{name:'查看原件 1',exact:true});await expect(original).toHaveAttribute('href',/^blob:/);expect(await original.evaluate(async link=>{const buffer=await(await fetch((link as HTMLAnchorElement).href)).arrayBuffer();return btoa(String.fromCharCode(...new Uint8Array(buffer)))})).toBe(bytes.toString('base64'))
})

test('image-only recognition stays visible while ownership is pending, then confirms, saves and reopens its actual text',async({page,request},info)=>{
 const observation='图中可见局部发红'
 await request.post(`${control}/draft-data`,{data:{visualOutput:{kind:'observation',status:'readable',text:'',observations:[{text:observation,region:'图像中央'}]},items:[{category:'symptom',title:'照片观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:observation,quote:observation,sourceId:'@visual',page:1}]}]}})
 const bytes=await sharp({create:{width:120,height:120,channels:3,background:'#cc8877'}}).png().toBuffer()
 const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'添加照片、视频或文件'}).click();const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'传照片',exact:true}).click();await(await picker).setFiles({name:'合成待核对照片.png',mimeType:'image/png',buffer:bytes})
 const response=await accepted;expect(response.ok()).toBe(true);const job=await response.json();await settle(request,job.id,job.inputRevision)
 const preview=page.getByRole('region',{name:'资料识别结果'})
 await expect(preview).toBeVisible();await expect(preview).toContainText(observation)
 await expect(preview).toContainText('资料内容（初步识别）')
 await expect(preview.getByRole('button',{name:`这是${maskIdentityName(memberName)}的资料`,exact:true})).toHaveCount(0)
 await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0)
 await page.screenshot({path:info.outputPath('recognized-pending-photo.png')})
 await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'})
 const ownership=card.getByRole('region',{name:'资料识别结果'})
 await expect(ownership).toContainText('记录对象待核对')
 const confirmSubject=ownership.getByRole('button',{name:`这是${maskIdentityName(memberName)}的资料`,exact:true});await expect(confirmSubject).toBeEnabled();await confirmSubject.click()
 await expect(card).toContainText(observation)
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
 await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
 const records=await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json()
 expect(records).toHaveLength(1);expect(records[0].content).toContain(observation)
 await card.getByRole('button',{name:'查看记录',exact:true}).click()
 await expect(page.locator('.symptom-record-sheet')).toContainText(observation)
 await page.screenshot({path:info.outputPath('recognized-photo-record.png')})
})

test('uncertain uploaded text can be reviewed without losing its warning and saved only after explicit adoption',async({page,request},info)=>{
 const observation='合成照片可见局部发红'
 const bytes=await sharp({create:{width:80,height:80,channels:3,background:'#bb7766'}}).png().toBuffer(),dataUrl=`data:image/png;base64,${bytes.toString('base64')}`,attachmentId=`file-${fingerprint(dataUrl).slice(0,24)}`
 await request.post(`${control}/draft-data`,{data:{visualOutput:{kind:'document',status:'uncertain',text:observation,observations:[]},items:[{category:'symptom',title:'待核对照片',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:observation,quote:observation,sourceId:'@first',page:1}]}]}})
 await request.post(`${control}/front-reply-data`,{data:{reply:'已看到部分资料，请对照原件核对。',contextId:'new',responseMode:'record',taskRelation:'new',subject,recordChanges:[{type:'add',targetId:null,text:observation,scope:'record',polarity:'affirmed',subject,sources:[{messageId:'@latest',attachmentId,quote:observation}]}],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''}}})
 const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'添加照片、视频或文件'}).click();const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'传照片',exact:true}).click();await(await picker).setFiles({name:'合成不完整照片.png',mimeType:'image/png',buffer:bytes})
 const job=await(await accepted).json();await settle(request,job.id,job.inputRevision)
 const preview=page.getByRole('region',{name:'资料识别结果'})
 await expect(preview).toContainText(observation)
 await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'})
 await expect(card.getByRole('region',{name:'资料识别结果'})).toContainText('不清楚')
 const confirm=card.getByRole('region',{name:'资料识别结果'}).getByRole('button',{name:`这是${maskIdentityName(memberName)}的资料`,exact:true});if(await confirm.isVisible()){await expect(confirm).toBeEnabled();await confirm.click()}
 await expect(card.getByRole('status',{name:'记录已保存'})).toContainText('识别内容待核对')
 await card.getByRole('button',{name:'核对识别内容',exact:true}).click()
 await expect(card.getByRole('textbox',{name:'记录内容',exact:true})).toHaveValue(new RegExp(observation))
 await page.reload();await expect(card.getByRole('textbox',{name:'记录内容',exact:true})).toHaveValue(new RegExp(observation))
 await card.getByRole('button',{name:'取消',exact:true}).click()
 await expect(card.getByRole('region',{name:'资料识别结果'})).toContainText(observation)
 await card.getByRole('button',{name:'核对识别内容',exact:true}).click()
 await card.getByRole('button',{name:'保存修改',exact:true}).click()
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
 await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),records=await(await request.get(`/api/events/${context.currentRecord.eventId}/records`,{headers})).json()
 expect(records).toHaveLength(1);expect(records[0].content).toContain(observation)
 await page.screenshot({path:info.outputPath('reviewed-partial-photo.png')})
})

test('archive classification keeps the exact vaccination entry destination and the universal view button',async({page,request},info)=>{
 const text='昨天下午接种了乙肝疫苗';await reply(request,text)
 await request.post(`${control}/draft-data`,{data:{items:[{category:'vaccination',title:'乙肝疫苗接种',timeText:'昨天',subject:'current',archiveCategory:'vaccination',relationKey:null,fields:[{name:'vaccineName',value:'乙肝疫苗',quote:'乙肝疫苗',sourceId:'@first',page:1}]}]}})
 const job=await send(page,text);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible();await expect(card.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
 const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json(),entry=context.currentRecord.profileEntries[0]
 expect(entry.sectionId).toBe('vaccination');expect(entry.entryId.startsWith(`${context.currentRecord.recordId}/`)).toBe(true)
 await card.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page).toHaveURL(new RegExp('health-profile/vaccination\\?'))
 await expect(page.locator('[data-record-id]').filter({hasText:'乙肝'}).first()).toHaveAttribute('data-record-id',entry.entryId)
 await page.screenshot({path:info.outputPath('saved-vaccination-entry.png')})
})


test('continuing directly preserves the conversation without a redundant continue button or premature save',async({page,request})=>{
 const first='今早胃口一般';await reply(request,first);let job=await send(page,first);await settle(request,job.id,job.inputRevision)
 await expect(page.getByRole('button',{name:'继续补充',exact:true})).toHaveCount(0)
 await page.reload();await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.getByRole('button',{name:'确认整理',exact:true})).toBeVisible()
 const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(before.currentRecord).toBeUndefined()
 const second='中午吃了半碗饭';await reply(request,second);job=await send(page,second);await settle(request,job.id,job.inputRevision);await generate(page)
 const card=page.getByRole('region',{name:'当前记录单'});await expect(card).toContainText('胃口');await expect(card).toContainText('半碗饭');await expect(card.getByRole('status',{name:'记录已保存'})).toBeVisible()
})

test('a late generation response cannot display an obsolete card over a newer question',async({page,request})=>{
 const first='昨晚有点咳嗽';await reply(request,first);let job=await send(page,first);await settle(request,job.id,job.inputRevision)
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/front-desk-record/contexts/*',async route=>{if(route.request().postDataJSON()?.action==='generate_current'){const response=await route.fetch();held=true;await gate;return route.fulfill({response})}return route.continue()})
 try{
  await page.getByRole('button',{name:'确认整理',exact:true}).click();await expect.poll(()=>held).toBe(true)
  await reply(request,'今天还在咳嗽','还有流鼻涕吗？');job=await send(page,'今天还在咳嗽');await settle(request,job.id,job.inputRevision)
  release();await expect(page.getByRole('region',{name:'当前记录单'})).toHaveCount(0);await expect(page.getByRole('button',{name:'确认整理',exact:true})).toHaveCount(0)
  await expect(page.getByText('收到。还有流鼻涕吗？',{exact:true})).toBeVisible()
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(context.currentRecord.evidenceVersion).toBeLessThan(context.evidenceVersion)
 }finally{release?.()}
})
