import {test,expect,type Page,type APIRequestContext} from '@playwright/test'
import sharp from 'sharp'
import {readFile} from 'node:fs/promises'
import {TokenService} from '../../server/auth/token-service.mjs'

const control='http://127.0.0.1:4868'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string,memberName:string
const noAction={type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}
const unknownSubject={kind:'unknown',memberId:null,label:null,sources:[]}
const source=(quote:string)=>({messageId:'@latest',attachmentId:null,quote})
const subject=(quote:string)=>({kind:'current',memberId,label:memberName,sources:[source(quote)]})
const response=(reply:string,patch:Record<string,unknown>={})=>({reply,contextId:'@context',responseMode:'conversation',taskRelation:'continue',subject:unknownSubject,recordChanges:[],nextQuestion:null,requestedAction:noAction,uncertainties:[],emergency:{currentChild:false,quote:''},...patch})
async function frontReply(request:APIRequestContext,value:Record<string,unknown>){
  const payload={...value,...(Array.isArray(value.recordChanges)?{recordChanges:value.recordChanges.map(change=>({scope:'record',...change}))}:{})}
  const result=await request.post(`${control}/front-reply-data`,{data:payload})
  expect(result.ok()).toBe(true)
}
async function snapshot(request:APIRequestContext,id:string){
  const result=await request.get(`/api/members/${memberId}/recognition-jobs/${id}`,{headers})
  expect(result.ok()).toBe(true);return result.json()
}
async function settle(request:APIRequestContext,id:string,revision:number){
  let result:any
  await expect.poll(async()=>{result=await snapshot(request,id);return result.state==='failed'||result.resultRevision>=revision&&['ready','needs_review'].includes(result.state)},{timeout:30000}).toBe(true)
  expect(result.state,JSON.stringify(result.error??{state:result.state,stage:result.stage})).not.toBe('failed');return result
}
async function send(page:Page,text:string){
  const input=page.getByLabel('对话输入')
  if(!await input.isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await input.fill(text)
  const acknowledged=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/recognition-jobs')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  const result=await acknowledged;expect(result.ok()).toBe(true);return result.json()
}
async function candidate(page:Page,request:APIRequestContext,raw:string,title='右足小趾碰伤'){
  const fact=raw.split('，')[0]
  await request.post(`${control}/draft-data`,{data:{items:[{category:'symptom',title,timeText:'昨晚',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:fact,quote:fact,sourceId:'@first',page:1}]}]}})
  await frontReply(request,response('已经按原话保留这次碰撞和触碰疼痛；是否肿胀可以先保留未知。',{contextId:'new',responseMode:'record',taskRelation:'new',subject:subject(fact),recordChanges:[{type:'add',targetId:null,text:fact,polarity:'affirmed',subject:subject(fact),sources:[source(fact)]}]}))
  const job=await send(page,raw);await settle(request,job.id,job.inputRevision)
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(context.review?.items.length).toBeGreaterThan(0);return {job,context}
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)}
async function temporaryPhoto(page:Page,request:APIRequestContext,color='#cabbbb'){
  const bytes=await sharp({create:{width:40,height:45,channels:3,background:color}}).png().toBuffer()
  await frontReply(request,response('图片里有一块浅色区域，可以先保留原图。'))
  const accepted=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/recognition-jobs')&&response.request().method()==='POST')
  await page.getByLabel('从相册选择',{exact:true}).setInputFiles({name:'临时预览原图.png',mimeType:'image/png',buffer:bytes})
  const acceptedResponse=await accepted;expect(acceptedResponse.ok()).toBe(true);const job=await acceptedResponse.json(),done=await settle(request,job.id,job.inputRevision)
  expect(done.state).toBe('ready');expect(done.review?.items??[]).toHaveLength(0)
  await expect(page.getByRole('button',{name:'保存原件',exact:true})).toBeVisible()
  return {bytes,context:await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()}
}

test.beforeEach(async({page,request})=>{
  memberName=`安安${crypto.randomUUID().slice(0,5)}`
  const created=await request.post('/api/members',{headers,data:{name:memberName,relationship:'child',birthday:'2024-01-01'}})
  expect(created.ok()).toBe(true);memberId=(await created.json()).id
  await request.post('/api/auth/current-member',{headers,data:{memberId}})
  await request.get(`${control}/success`);await request.get(`${control}/delay?ms=40`)
  await request.post(`${control}/draft-data`,{data:{items:null}})
  await page.addInitScript(({token,memberId})=>{if(!sessionStorage.getItem('hoooho-auth-token'))sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('nurse-upgrade-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}));sessionStorage.setItem('nurse-upgrade-initialized','true')}},{token,memberId})
  await page.goto('/nurse-station')
  await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
})
test.afterEach(async({request})=>{await request.get(`${control}/success`);await request.get(`${control}/delay?ms=40`);await request.delete(`/api/members/${memberId}`,{headers})})

test('blank and zero-width input make no model call or empty chat message',async({page,request})=>{
  await page.getByRole('button',{name:'改用文字',exact:true}).click()
  const input=page.getByLabel('对话输入'),before=await(await request.get(`${control}/stats`)).json(),posts:string[]=[]
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/recognition-jobs'))posts.push(r.url())})
  for(const text of ['', '   \n\t', '\u200B\u200C\u200D\u2060\uFEFF']){
    await input.fill(text);await input.press('Enter')
    const button=page.getByRole('button',{name:'发送',exact:true})
    if(await button.isVisible()&&await button.isEnabled())await button.click()
  }
  await page.waitForTimeout(150)
  expect(posts).toEqual([]);expect((await(await request.get(`${control}/stats`)).json()).calls).toBe(before.calls)
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
})

test('question clarification and punctuation remain natural zero-candidate conversation',async({page,request},info)=>{
  const question='你方便说一下所在城市吗？'
  await frontReply(request,response(question,{responseMode:'clarification',taskRelation:'new',nextQuestion:{id:null,text:question,target:'location.city',sourceMessageId:'@latest'}}))
  let job=await send(page,'我想了解就诊前需要准备什么');await settle(request,job.id,job.inputRevision)
  await expect(page.getByText(question,{exact:true})).toBeVisible()
  const explained='我是在问你目前在哪个城市，方便把就诊准备说得更贴近你的情况；暂时不想说也可以。'
  await frontReply(request,response(explained,{responseMode:'clarification'}));job=await send(page,'？');await settle(request,job.id,job.inputRevision)
  await expect(page.getByText(explained,{exact:true})).toBeVisible()
  await expect(page.getByText('已整理，请核对关键内容',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:/^这是.+的记录$/})).toHaveCount(0)
  await expect(page.getByRole('button',{name:/^(?:立即保存|核对记录)$/})).toHaveCount(0)
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(context.review?.items??[]).toHaveLength(0);expect(context.recordResult??null).toBeNull()
  await noOverflow(page);await page.screenshot({path:info.outputPath('natural-no-candidates.png')})
})

test('conversation preserves the prior candidate and explicit save waits for the real receipt',async({page,request},info)=>{
  const raw=`${memberName}昨晚碰到右脚小趾，今天触碰时说疼，是否肿胀还没注意。`
  const {context:before}=await candidate(page,request,raw)
  const reply='不客气，刚才那份记录还保留着，需要时可以继续核对。'
  await frontReply(request,response(reply));let job=await send(page,'谢谢');await settle(request,job.id,job.inputRevision)
  await expect(page.getByText(reply,{exact:true})).toBeVisible()
  const unchanged=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(unchanged.review.id).toBe(before.review.id);expect(unchanged.review.version).toBe(before.review.version)
  expect(unchanged.review.items).toEqual(before.review.items)
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
  await frontReply(request,response('我会保存这份已经核对的记录。',{responseMode:'operation',requestedAction:{type:'save',targetIds:[before.review.id],targetVersion:before.review.version,confirmation:'explicit',quote:'保存这条'}}))
  job=await send(page,'保存这条');await settle(request,job.id,job.inputRevision)
  await expect(page.locator('.smart-record-saved')).toBeVisible()
  const saved=await(await request.get(`/api/members/${memberId}/ai-drafts/${before.review.id}`,{headers})).json()
  expect(saved.state).toBe('saved');expect(saved.result.count).toBe(1)
  const records=await(await request.get(`/api/events/${saved.result.records[0].eventId}/records`,{headers})).json()
  expect(records.filter((r:{id:string})=>r.id===saved.result.records[0].recordId)).toHaveLength(1)
  await expect(page.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'知道了',exact:true})).toBeVisible()
  await expect(page.getByText('正在保存这条记录。',{exact:true})).toHaveCount(0)
  await expect(page.getByText('已回应',{exact:true})).toHaveCount(0)
  // Exercise the saved actions near the floating shortcut on SE 320px and
  // each project's ordinary phone width. No visible user browser is changed.
  const originalViewport=page.viewportSize()!
  for(const width of [...new Set([320,originalViewport.width])]){
    await page.setViewportSize({width,height:originalViewport.height})
    const dismiss=page.getByRole('button',{name:'知道了',exact:true})
    await dismiss.scrollIntoViewIfNeeded()
    await page.locator('.smart-record-page__body').evaluate(element=>{element.scrollTop=Math.max(0,element.scrollTop-40)})
    await expect.poll(async()=>page.evaluate(()=>{
      const jump=document.querySelector('.front-desk-jump-wrap button'),buttons=[...document.querySelectorAll('.smart-record-saved-actions button')]
      if(!jump)return true
      const a=jump.getBoundingClientRect()
      return buttons.every(button=>{const b=button.getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom})
    })).toBe(true)
    await noOverflow(page)
    if(width===320){await page.locator('.smart-record-page__body').evaluate(element=>element.scrollTo({top:element.scrollHeight}));await page.screenshot({path:info.outputPath('saved-after-real-receipt-320.png')})}
  }
  await page.setViewportSize(originalViewport)
  await page.locator('.smart-record-page__body').evaluate(element=>element.scrollTo({top:element.scrollHeight}))
  await noOverflow(page);await page.screenshot({path:info.outputPath('saved-after-real-receipt.png')})
  if(!await page.getByLabel('对话输入').isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('下一条尚未发送的新内容')
  const route=page.url(),mutations:string[]=[]
  page.on('request',request=>{if(request.method()==='POST'&&/\/(?:ai-drafts\/[^/]+\/save|case-records|recognition-jobs)$/.test(new URL(request.url()).pathname))mutations.push(request.url())})
  await page.getByRole('button',{name:'知道了',exact:true}).click()
  await expect(page.getByRole('button',{name:'知道了',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'查看记录',exact:true})).toHaveCount(0)
  await expect(page.getByLabel('对话输入')).toHaveValue('下一条尚未发送的新内容')
  expect(page.url()).toBe(route);expect(mutations).toEqual([])
  const retained=await(await request.get(`/api/events/${saved.result.records[0].eventId}/records`,{headers})).json()
  expect(retained.filter((record:{id:string})=>record.id===saved.result.records[0].recordId)).toHaveLength(1)
})

test('export downloads the exact receipt snapshot and keeps its old bubble after another response',async({page,request})=>{
  const {context}=await candidate(page,request,`${memberName}昨晚碰到右脚小趾`)
  await frontReply(request,response('我来导出这份已展示的记录。',{responseMode:'operation',requestedAction:{type:'export',targetIds:[context.review.id],targetVersion:context.review.version,confirmation:'explicit',quote:'导出这份记录'}}))
  let job=await send(page,'导出这份记录'),done=await settle(request,job.id,job.inputRevision)
  expect(done.operationReceipt?.state).toBe('completed');expect(done.operationReceipt?.targetId).toBe(context.review.id)
  expect(done.operationReceipt?.targetVersion).toBe(context.review.version)
  await expect(page.getByRole('button',{name:'下载记录',exact:true})).toBeVisible()
  await page.getByLabel('对话输入').fill('下载时还没发出的新内容')
  const file=page.waitForEvent('download');await page.getByRole('button',{name:'下载记录',exact:true}).click()
  const downloaded=await file;expect(downloaded.suggestedFilename()).toBe(done.operationReceipt.fileName)
  expect(await readFile((await downloaded.path())!,'utf8')).toBe(done.operationReceipt.text)
  await expect(page.getByLabel('对话输入')).toHaveValue('下载时还没发出的新内容')
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  await frontReply(request,response('不客气，原记录和下载入口都还在。'));job=await send(page,'谢谢');await settle(request,job.id,job.inputRevision)
  await expect(page.getByRole('button',{name:'下载记录',exact:true})).toHaveCount(1)
  await page.reload();await expect(page.getByRole('button',{name:'下载记录',exact:true})).toHaveCount(1)
})

test('viewing the exact saved record preserves new text and photo without an exit confirmation',async({page,request})=>{
  const {context}=await candidate(page,request,`${memberName}昨晚碰到右脚小趾`)
  await frontReply(request,response('我会保存这份已经核对的记录。',{responseMode:'operation',requestedAction:{type:'save',targetIds:[context.review.id],targetVersion:context.review.version,confirmation:'explicit',quote:'保存这条'}}))
  const job=await send(page,'保存这条'),saved=await settle(request,job.id,job.inputRevision),record=saved.operationReceipt.savedDraft.result.records[0]
  await expect(page.getByRole('button',{name:'查看记录',exact:true})).toBeVisible()
  const bytes=await sharp({create:{width:45,height:46,channels:3,background:'#bdd8ce'}}).png().toBuffer()
  await frontReply(request,response('这张新图片先保留在当前对话。',{contextId:'new',taskRelation:'new'}))
  const accepted=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/recognition-jobs')&&response.request().method()==='POST')
  await page.getByLabel('从相册选择',{exact:true}).setInputFiles({name:'返回后仍在的新照片.png',mimeType:'image/png',buffer:bytes})
  const ack=await accepted,newJob=await ack.json();await settle(request,newJob.id,newJob.inputRevision)
  await expect(page.getByRole('button',{name:'保存原件',exact:true})).toBeVisible()
  if(!await page.getByLabel('对话输入').isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('查看旧记录前还没发送的新内容')
  await page.getByRole('button',{name:'查看记录',exact:true}).click()
  await expect.poll(()=>new URL(page.url()).searchParams.get('recordId')).toBe(record.recordId)
  await expect(page.getByRole('dialog',{name:/保存这次草稿/})).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('memberId')).toBe(memberId)
  await page.goBack()
  await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
  await expect(page.getByLabel('对话输入')).toHaveValue('查看旧记录前还没发送的新内容')
  await expect(page.getByRole('img',{name:'返回后仍在的新照片.png',exact:true})).toHaveCount(1)
  await expect(page.getByRole('dialog',{name:/保存这次草稿/})).toHaveCount(0)
})

test('image-only input uploads and receives a sourced preview without inferring a child record',async({page,request},info)=>{
  const reply='图片里有一块浅红色区域。你想把这张图用于记录哪个部位的变化？'
  await frontReply(request,response(reply,{responseMode:'clarification',taskRelation:'new',nextQuestion:{id:null,text:'你想把这张图用于记录哪个部位的变化？',target:'attachment.purpose',sourceMessageId:'@latest'}}))
  const png=await sharp({create:{width:80,height:90,channels:3,background:'#d8a0a0'}}).png().toBuffer()
  const upload=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/recognition-assets')&&r.request().method()==='POST')
  const ack=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/recognition-jobs')&&r.request().method()==='POST')
  await page.getByLabel('从相册选择',{exact:true}).setInputFiles({name:'合成测试图片.png',mimeType:'image/png',buffer:png})
  expect((await upload).ok()).toBe(true);const accepted=await ack;expect(accepted.ok()).toBe(true)
  const submitted=accepted.request().postDataJSON()
  expect(submitted.input.kind).toBe('image');expect(submitted.input.text).toBe('');expect(submitted.input.assetIds).toHaveLength(1)
  const job=await accepted.json();await settle(request,job.id,job.inputRevision)
  await expect(page.getByText(reply,{exact:true})).toBeVisible()
  await expect(page.getByRole('img',{name:'合成测试图片.png',exact:true})).toHaveCount(1)
  await expect(page.getByRole('button',{name:/^(?:立即保存|核对记录)$/})).toHaveCount(0)
  await expect(page.getByText('已整理，请核对关键内容',{exact:true})).toHaveCount(0)
  const state=await snapshot(request,job.id);expect(state.review?.items??[]).toHaveLength(0)
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  const original=context.messages.find((message:{kind:string})=>message.kind==='image')
  expect(original?.files).toHaveLength(1);expect(original.files[0].dataUrl).toMatch(/^data:image\/png;base64,/)
  await noOverflow(page);await page.screenshot({path:info.outputPath('image-only-preview.png')})
})

test('ready attachment preview saves the original only after explicit intent and version confirmation',async({page,request},info)=>{
  const {bytes,context}=await temporaryPhoto(page,request)
  expect(context.originalsSubjectConfirmed).toBe(false)
  await expect(page.getByRole('button',{name:/^这是.+的记录$/})).toHaveCount(0)
  if(!await page.getByLabel('对话输入').isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('未发送的照护交接补充')
  await page.getByRole('button',{name:'保存原件',exact:true}).click()
  await expect(page.getByRole('button',{name:`这是${memberName}的记录`,exact:true})).toBeVisible()
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('对话输入')).toHaveValue('未发送的照护交接补充')
  await expect(page.getByRole('button',{name:`这是${memberName}的记录`,exact:true})).toBeVisible()
  const before=await(await request.get(`${control}/stats`)).json(),saved=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.includes('/front-desk-record/contexts/')&&response.request().postDataJSON()?.action==='save_original')
  await page.getByRole('button',{name:`这是${memberName}的记录`,exact:true}).click()
  const result=await saved;expect(result.ok()).toBe(true);const receipt=await result.json()
  expect(receipt.savedDraft.result.count).toBe(1)
  const record=receipt.savedDraft.result.records[0],attachments=await(await request.get(`/api/events/${record.eventId}/attachments`,{headers})).json()
  expect(attachments).toHaveLength(1);expect(await(await request.get(`/api/events/${record.eventId}/attachments/${attachments[0].id}/content`,{headers})).body()).toEqual(bytes)
  await expect(page.locator('.smart-record-saved')).toHaveCount(1)
  await expect(page.getByLabel('对话输入')).toHaveValue('未发送的照护交接补充')
  expect((await(await request.get(`${control}/stats`)).json()).calls).toBe(before.calls)
  await noOverflow(page);await page.screenshot({path:info.outputPath('ready-original-saved.png')})
})

test('an old confirmed subject cannot authorize a newly uploaded attachment version',async({page,request})=>{
  const first=await temporaryPhoto(page,request)
  const confirmed=await request.post(`/api/members/${memberId}/front-desk-record/contexts/${first.context.id}`,{headers,data:{action:'confirm_subject',expectedVersion:first.context.version}})
  expect(confirmed.ok()).toBe(true);const old=await confirmed.json();expect(old.originalsSubjectConfirmed).toBe(true)
  await page.reload();await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
  const second=await temporaryPhoto(page,request,'#b8c9ca')
  expect(second.context.id).toBe(first.context.id);expect(second.context.originalsVersion).toBeGreaterThan(old.originalsVersion)
  expect(second.context.subject.confirmed).toBe(true);expect(second.context.originalsSubjectConfirmed).toBe(false)
  await expect(page.getByRole('button',{name:/^这是.+的记录$/})).toHaveCount(0)
  await page.getByRole('button',{name:'保存原件',exact:true}).click()
  await expect(page.getByRole('button',{name:`这是${memberName}的记录`,exact:true})).toBeVisible()
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  const persisted=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(persisted.saved??false).toBe(false);expect(persisted.originalsSubjectConfirmed).toBe(false)
})

test('a pending original-save intent stays with its member through a real member switch',async({page,request})=>{
  const otherName=`妹妹${crypto.randomUUID().slice(0,5)}`,created=await request.post('/api/members',{headers,data:{name:otherName,relationship:'child',birthday:'2025-01-01'}})
  expect(created.ok()).toBe(true);const otherId=(await created.json()).id
  try{
    await page.reload();await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
    await temporaryPhoto(page,request);await page.getByRole('button',{name:'保存原件',exact:true}).click()
    await expect(page.getByRole('button',{name:`这是${memberName}的记录`,exact:true})).toBeVisible()
    await page.getByRole('button',{name:'打开菜单',exact:true}).click()
    await page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'打开我的孩子',exact:true}).click()
    await page.getByRole('dialog',{name:'我的孩子'}).getByRole('button',{name:`切换到${otherName}`,exact:true}).click()
    await expect(page.getByRole('dialog',{name:'我的孩子'})).toHaveCount(0)
    await expect(page.getByRole('button',{name:/^这是.+的记录$/})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'保存原件',exact:true})).toHaveCount(0)
    await expect(page.locator('.smart-record-saved')).toHaveCount(0)
    const old=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json();expect(old.saved??false).toBe(false)
  }finally{await request.delete(`/api/members/${otherId}`,{headers})}
})

test('failed extraction keeps the original and requires explicit subject confirmation before raw saving',async({page,request})=>{
  const raw='昨晚碰到右脚小趾',reply='原话已经保留，整理结果还需要核对。'
  await request.post(`${control}/draft-data`,{data:{items:[{category:'symptom',title:'待核对记录',timeText:'昨晚',subject:'unknown',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'未提供的描述',quote:'未提供的描述',sourceId:'@first',page:1}]}]}})
  await frontReply(request,response(reply,{contextId:'new',responseMode:'record',taskRelation:'new',recordChanges:[{type:'add',targetId:null,text:raw,polarity:'affirmed',subject:unknownSubject,sources:[source(raw)]}]}))
  const job=await send(page,raw)
  await expect.poll(async()=>(await snapshot(request,job.id)).state).toBe('failed')
  await expect(page.getByText('已整理，请核对关键内容',{exact:true})).toHaveCount(0)
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  await expect(page.getByRole('button',{name:/^这是.+的记录$/})).toHaveCount(0)
  if(!await page.getByLabel('对话输入').isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('还有一段没有发送的新内容')
  await page.getByRole('button',{name:'先保存原话',exact:true}).click()
  const confirmed=page.waitForResponse(r=>new URL(r.url()).pathname.includes('/front-desk-record/contexts/')&&r.request().method()==='POST')
  const persisted=page.waitForResponse(r=>new URL(r.url()).pathname.includes('/front-desk-record/contexts/')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='save_original')
  await page.getByRole('button',{name:`这是${memberName}的记录`,exact:true}).click()
  const confirmation=await confirmed;expect(confirmation.ok()).toBe(true)
  const confirmedContext=await confirmation.json();expect(confirmedContext.subject).toMatchObject({kind:'current',memberId,confirmed:true})
  await expect(page.getByRole('button',{name:`这是${memberName}的记录`,exact:true})).toHaveCount(0)
  const result=await persisted;expect(result.ok()).toBe(true);expect(result.request().postDataJSON()).toMatchObject({action:'save_original',confirmed:true})
  const receipt=await result.json();expect(receipt.savedDraft.state).toBe('saved')
  const record=receipt.savedDraft.result.records[0],records=await(await request.get(`/api/events/${record.eventId}/records`,{headers})).json()
  expect(records.filter((item:{id:string})=>item.id===record.recordId)).toHaveLength(1)
  await expect(page.locator('.smart-record-saved')).toBeVisible();await expect(page.getByLabel('对话输入')).toHaveValue('还有一段没有发送的新内容')
})

test('an unreadable image is saved only after subject confirmation and retains the exact downloadable original',async({page,request})=>{
  const original=Buffer.from('Explicit invalid PNG bytes for isolated original preservation regression.'),before=await(await request.get(`${control}/stats`)).json()
  const accepted=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/recognition-jobs')&&response.request().method()==='POST')
  await page.getByLabel('从相册选择',{exact:true}).setInputFiles({name:'坏图原件.png',mimeType:'image/png',buffer:original})
  const response=await accepted;expect(response.ok()).toBe(true);const job=await response.json(),settled=await settle(request,job.id,job.inputRevision)
  expect(settled.state).toBe('needs_review');expect(settled.review?.items??[]).toHaveLength(0)
  expect(JSON.stringify(settled)).not.toContain(original.toString('base64'))
  expect((await(await request.get(`${control}/stats`)).json()).calls).toBe(before.calls)
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  await expect(page.getByRole('button',{name:/^这是.+的记录$/})).toHaveCount(0)
  await page.getByRole('button',{name:'保存原件',exact:true}).click()
  const confirmation=page.waitForResponse(response=>new URL(response.url()).pathname.includes('/front-desk-record/contexts/')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='confirm_subject')
  const saved=page.waitForResponse(response=>new URL(response.url()).pathname.includes('/front-desk-record/contexts/')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='save_original')
  await page.getByRole('button',{name:`这是${memberName}的记录`,exact:true}).click()
  expect((await confirmation).ok()).toBe(true)
  const result=await saved;expect(result.ok()).toBe(true)
  const receipt=await result.json();expect(receipt.savedDraft.state).toBe('saved');expect(receipt.savedDraft.result.count).toBe(1)
  const record=receipt.savedDraft.result.records[0];expect(record.category).toBe('other')
  const attachments=await(await request.get(`/api/events/${record.eventId}/attachments`,{headers})).json()
  expect(attachments).toHaveLength(1)
  const bytes=await request.get(`/api/events/${record.eventId}/attachments/${attachments[0].id}/content`,{headers})
  expect(bytes.ok()).toBe(true);expect(await bytes.body()).toEqual(original)
  const cases=await(await request.get(`/api/members/${memberId}/cases`,{headers})).json();expect(cases.active).toHaveLength(0)
  expect((await(await request.get(`${control}/stats`)).json()).calls).toBe(before.calls)
  await expect(page.locator('.smart-record-saved')).toBeVisible()
})

test('a lost subject-confirmation acknowledgement recovers the exact newer context on retry',async({page,request})=>{
  const original=Buffer.from('Synthetic unreadable image for confirmation acknowledgement recovery.'),ack=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/recognition-jobs')&&response.request().method()==='POST')
  await page.getByLabel('从相册选择',{exact:true}).setInputFiles({name:'确认回执测试.png',mimeType:'image/png',buffer:original})
  const accepted=await ack,job=await accepted.json();await settle(request,job.id,job.inputRevision)
  const before=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  let lost=false
  await page.route(/\/front-desk-record\/contexts\/[^/?]+$/,async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='confirm_subject'&&!lost){
      const response=await route.fetch();expect(response.ok()).toBe(true);lost=true;await route.abort('failed');return
    }
    await route.continue()
  })
  if(!await page.getByLabel('对话输入').isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('还没有发送的补充')
  await page.getByRole('button',{name:'保存原件',exact:true}).click()
  const confirm=page.getByRole('button',{name:`这是${memberName}的记录`,exact:true})
  await confirm.click();await expect.poll(()=>lost).toBe(true);await expect(confirm).toBeEnabled()
  const persisted=await(await request.get(`/api/members/${memberId}/front-desk-record/contexts/${before.id}`,{headers})).json()
  expect(persisted.subject).toMatchObject({kind:'current',memberId,confirmed:true});expect(persisted.version).toBeGreaterThan(before.version)
  const saved=page.waitForResponse(response=>new URL(response.url()).pathname.includes('/front-desk-record/contexts/')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='save_original')
  await confirm.click()
  await expect(confirm).toHaveCount(0)
  const result=await saved;expect(result.ok()).toBe(true)
  await expect(page.getByLabel('对话输入')).toHaveValue('还没有发送的补充')
  await expect(page.locator('.smart-record-saved')).toHaveCount(1)
  const current=await(await request.get(`/api/members/${memberId}/front-desk-record/contexts/${before.id}`,{headers})).json()
  expect(current.version).toBe(persisted.version+1);expect(current.id).toBe(before.id);expect(current.saved).toBe(true)
})

test('a lost original-save acknowledgement retains one retry entry and replays the same saved record',async({page,request})=>{
  const original=Buffer.from('Unreadable synthetic original for durable raw-save acknowledgement recovery.'),accepted=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/recognition-jobs')&&response.request().method()==='POST')
  await page.getByLabel('从相册选择',{exact:true}).setInputFiles({name:'保存回执测试.png',mimeType:'image/png',buffer:original})
  const submitted=await accepted,job=await submitted.json();await settle(request,job.id,job.inputRevision)
  let calls=0,firstRecordId:string|undefined
  await page.route(/\/front-desk-record\/contexts\/[^/?]+$/,async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='save_original'){
      calls++
      if(calls===1){const result=await route.fetch();expect(result.ok()).toBe(true);firstRecordId=(await result.json()).savedDraft.result.records[0].recordId;await route.abort('failed');return}
    }
    await route.continue()
  })
  if(!await page.getByLabel('对话输入').isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('丢回执时保留的未发送内容')
  await page.getByRole('button',{name:'保存原件',exact:true}).click();await page.getByRole('button',{name:`这是${memberName}的记录`,exact:true}).click()
  await expect.poll(()=>calls).toBe(1)
  await expect(page.getByRole('button',{name:'保存原件',exact:true})).toBeEnabled()
  await expect(page.getByRole('button',{name:'保存原件',exact:true})).toHaveCount(1)
  await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  const replay=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.includes('/front-desk-record/contexts/')&&response.request().postDataJSON()?.action==='save_original')
  await page.getByRole('button',{name:'保存原件',exact:true}).click()
  const result=await replay;expect(result.ok()).toBe(true);const receipt=await result.json(),record=receipt.savedDraft.result.records[0]
  expect(record.recordId).toBe(firstRecordId);expect(calls).toBe(2)
  const rows=await(await request.get(`/api/events/${record.eventId}/records`,{headers})).json();expect(rows.filter((item:{id:string})=>item.id===record.recordId)).toHaveLength(1)
  await expect(page.locator('.smart-record-saved')).toHaveCount(1)
  await expect(page.getByLabel('对话输入')).toHaveValue('丢回执时保留的未发送内容')
})

test('a delayed old checkpoint cannot overwrite a sourced correction',async({page,request})=>{
  let release!:()=>void,entered!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve}),blocked=new Promise<void>(resolve=>{entered=resolve})
  await page.route(/\/recognition-jobs\/[^/?]+(?:\?.*)?$/,async route=>{
    if(route.request().method()!=='GET')return route.continue()
    const result=await route.fetch(),body=await result.json()
    if(!held&&body.resultRevision===1&&body.review?.items?.length&&body.state==='ready'){held=true;entered();await gate}
    await route.fulfill({response:result,json:body}).catch(()=>undefined)
  })
  try{
    const raw=`${memberName}昨晚碰到右脚小趾`
    await request.post(`${control}/draft-data`,{data:{items:[{category:'symptom',title:'右足小趾碰伤',timeText:'昨晚',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:raw,quote:raw,sourceId:'@first',page:1}]}]}})
    await frontReply(request,response('保留这次碰撞和触碰疼痛。',{contextId:'new',responseMode:'record',taskRelation:'new',subject:subject(raw),recordChanges:[{type:'add',targetId:null,text:raw,polarity:'affirmed',subject:subject(raw),sources:[source(raw)]}]}))
    const first=await send(page,raw);await expect.poll(()=>held,{timeout:30000}).toBe(true);await blocked
    const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
    const fact=(context.facts??context.factLedger??[]).find((f:{status:string})=>f.status==='active');expect(fact?.id).toBeTruthy()
    const corrected=`${memberName}昨晚碰到左脚小趾`,correction=`刚才说错了，${corrected}，不是右脚。`,reply='已更正为左脚小趾，右侧的旧表述不再作为当前记录依据。'
    await request.post(`${control}/draft-data`,{data:{items:[{category:'symptom',title:'左足小趾碰伤',timeText:'昨晚',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:corrected,quote:corrected,sourceId:'@first',page:1}]}]}})
    await frontReply(request,response(reply,{responseMode:'record',recordChanges:[{type:'correct',targetId:fact.id,text:corrected,polarity:'affirmed',subject:subject(corrected),sources:[source(corrected)]}]}))
    const second=await send(page,correction);expect(second.id).toBe(first.id)
    release();await settle(request,second.id,second.inputRevision)
    await expect(page.getByText(reply,{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled();await page.getByRole('button',{name:'核对记录',exact:true}).click()
    await expect(page.locator('.smart-review-card')).toContainText('左脚小趾')
    await expect(page.locator('.smart-review-card')).not.toContainText('右脚小趾')
  }finally{release?.()}
})

test('switching members while a response is delayed cannot reveal the old members draft',async({page,request})=>{
  const otherName=`妹妹${crypto.randomUUID().slice(0,5)}`
  const created=await request.post('/api/members',{headers,data:{name:otherName,relationship:'child',birthday:'2025-01-01'}});expect(created.ok()).toBe(true)
  const otherId=(await created.json()).id
  await page.reload();await expect(page.getByRole('heading',{name:'前台',exact:true})).toBeVisible()
  let release!:()=>void,entered!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve}),blocked=new Promise<void>(resolve=>{entered=resolve})
  await frontReply(request,response('这条回复只属于切换前的孩子。'))
  await page.route(/\/recognition-jobs\/[^/?]+(?:\?.*)?$/,async route=>{
    if(route.request().method()!=='GET')return route.continue()
    const result=await route.fetch(),body=await result.json()
    if(!held&&body.resultRevision===1&&body.state==='ready'){held=true;entered();await gate}
    await route.fulfill({response:result,json:body}).catch(()=>undefined)
  })
  try{
    await send(page,'先聊一下记录怎么用');await expect.poll(()=>held,{timeout:30000}).toBe(true);await blocked
    await page.getByRole('button',{name:'打开菜单',exact:true}).click()
    await page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'打开我的孩子',exact:true}).click()
    await page.getByRole('dialog',{name:'我的孩子'}).getByRole('button',{name:`切换到${otherName}`,exact:true}).click()
    release()
    await expect(page.getByRole('dialog',{name:'我的孩子'})).toHaveCount(0)
    await expect(page.getByText('这条回复只属于切换前的孩子。',{exact:true})).toHaveCount(0)
    await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
    await frontReply(request,response('现在继续当前孩子的对话。',{contextId:'new',taskRelation:'new'}))
    const job=await send(page,'你好')
    const result=await request.get(`/api/members/${otherId}/recognition-jobs/${job.id}`,{headers});expect(result.ok()).toBe(true)
    await expect(page.getByText('现在继续当前孩子的对话。',{exact:true})).toBeVisible()
    await expect(page.getByText('这条回复只属于切换前的孩子。',{exact:true})).toHaveCount(0)
    await expect(page.locator('.smart-record-saved')).toHaveCount(0)
  }finally{release?.();await request.delete(`/api/members/${otherId}`,{headers})}
})
