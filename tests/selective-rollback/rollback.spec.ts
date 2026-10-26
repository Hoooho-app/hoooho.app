import {test,expect,request as requests,type APIRequestContext} from '@playwright/test'
import {readFile} from 'node:fs/promises'

let api:APIRequestContext,session:any,member:any,headers:Record<string,string>
test.beforeEach(async({page,baseURL})=>{
 session=JSON.parse(await readFile(new URL('../../.codex-tmp/rollback-browser-session.json',import.meta.url),'utf8'))
 headers={Authorization:`Bearer ${session.token}`}
 api=await requests.newContext({baseURL,storageState:session.storageState,extraHTTPHeaders:headers})
 const created=await api.post('/api/members',{data:{name:`回滚验收${crypto.randomUUID().slice(0,4)}`,relationship:'child',birthday:'2024-01-01'}})
 expect(created.ok()).toBe(true);member=await created.json()
 expect((await api.post('/api/auth/current-member',{data:{memberId:member.id}})).ok()).toBe(true)
 await page.context().addCookies(session.storageState.cookies)
 await page.addInitScript(({session,member})=>{
  sessionStorage.setItem('hoooho-auth-token',session.token)
  if(!sessionStorage.getItem('rollback-auth-initialized')){
   localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:session.user,authStatus:'authenticated',currentMemberId:member.id,members:[member],profile:null},version:5}))
   sessionStorage.setItem('rollback-auth-initialized','1')
  }
 },{session,member})
})
test.afterEach(async()=>{await api?.dispose()})

test('V3 unfinished editors restore into the old input without submission or saving',async({page},info)=>{
 let modelRequests=0
 page.on('request',r=>{if(r.method()==='POST'&&/recognition-jobs|audio\/transcriptions/.test(r.url()))modelRequests++})
 await page.addInitScript(({accountId,memberId})=>{
  if(sessionStorage.getItem('rollback-draft-seeded'))return
  sessionStorage.setItem('rollback-draft-seeded','1')
  const q=indexedDB.open('hoooho-smart-record-drafts',1)
  q.onupgradeneeded=()=>q.result.createObjectStore('drafts')
  q.onsuccess=()=>{const db=q.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({text:'',files:[],occurredAt:'',timeUnknown:true,requestId:'v3-pending-input',conversationInput:'新的未发送输入',updatedAt:Date.now(),voiceTextDraft:{id:'voice-v3',text:'未提交的部分转写',at:123,incomplete:true},manualTextReview:{contextId:'previous-context',contextVersion:2,sourceText:'不可变原话',text:'用户核对过的文字',open:true,requested:true},rawSaveTarget:{memberId,contextId:'previous-context',contextVersion:2,originalsVersion:1,state:'saving'}},`home-smart:${accountId}:${memberId}:new`);tx.oncomplete=()=>db.close()}
 },{accountId:session.user.id,memberId:member.id})
 await page.goto('/nurse-station')
 const input=page.getByLabel('对话输入')
 await expect(input).toBeVisible()
 await expect(input).toHaveValue('新的未发送输入\n未提交的部分转写\n用户核对过的文字')
 await expect(page.locator('.front-desk-welcome')).toBeVisible()
 await input.fill('用户继续编辑，仍未提交')
 await page.reload()
 await expect(input).toBeVisible()
 await expect(input).toHaveValue('用户继续编辑，仍未提交')
 const stored=await page.evaluate(async key=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const q=indexedDB.open('hoooho-smart-record-drafts',1);q.onsuccess=()=>resolve(q.result)})
  try{return await new Promise<any>(resolve=>{const q=db.transaction('drafts').objectStore('drafts').get(key);q.onsuccess=()=>resolve(q.result)})}finally{db.close()}
 },`home-smart:${session.user.id}:${member.id}:new`)
 expect(stored.rawSaveTarget).toBeUndefined()
 expect(stored.interactionRollbackRecovery.manualTextReview.sourceText).toBe('不可变原话')
 expect(modelRequests).toBe(0)
 expect((await(await api.get(`/api/members/${member.id}/cases`)).json()).active).toHaveLength(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
 await page.screenshot({path:info.outputPath('restored-input.png'),fullPage:true})
})

test('V3 saved records remain readable and editable with unknown time and immutable sources',async({page},info)=>{
 const front=`/api/members/${member.id}/front-desk-record`,raw='回滚验收原话，未提供发生时间。',edited='回滚前用户核对过的文字，发生时间仍未知。'
 const original=await api.post(front,{data:{kind:'legacy',requestId:crypto.randomUUID(),updatedAt:Date.now(),turns:[{text:raw}],files:[],voiceFiles:[]}})
 expect(original.ok()).toBe(true);const source=await original.json()
 const confirmed=await api.post(`${front}/contexts/${source.id}`,{data:{action:'confirm_subject',expectedVersion:source.version}})
 expect(confirmed.ok()).toBe(true)
 const version=(await confirmed.json()).version,body={action:'save_original',expectedVersion:version,confirmed:true,reviewText:edited}
 const saved=await api.post(`${front}/contexts/${source.id}`,{data:body});expect(saved.ok()).toBe(true)
 const receipt=await saved.json(),reference=receipt.savedDraft.result.records[0]
 const replay=await api.post(`${front}/contexts/${source.id}`,{data:body});expect(replay.ok()).toBe(true)
 expect((await replay.json()).savedDraft.result.records[0].recordId).toBe(reference.recordId)
 await page.goto(`/health-events?eventId=${reference.eventId}&recordId=${reference.recordId}`)
 await expect(page.getByText(edited,{exact:true}).first()).toBeVisible()
 await expect(page.getByText('发生时间待确认',{exact:true})).toBeVisible()
 await page.screenshot({path:info.outputPath('preserved-record-details.png'),fullPage:true})
 await page.getByRole('button',{name:/^编辑/}).first().click()
 const time=page.getByLabel('发生时间',{exact:true})
 await expect(time).toHaveValue('')
 await page.getByRole('textbox',{name:'记录内容',exact:true}).fill('回滚后补充文字，仍不编造时间。')
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect.poll(async()=>{
  const records=await(await api.get(`/api/events/${reference.eventId}/records`)).json()
  return records.find((r:any)=>r.id===reference.recordId)?.content
 }).toBe('回滚后补充文字，仍不编造时间。')
 const records=await(await api.get(`/api/events/${reference.eventId}/records`)).json(),record=records.find((r:any)=>r.id===reference.recordId)
 expect(records).toHaveLength(1);expect(record.sourceText).toBe(raw)
 expect(record.caseContext.timeUnknown).toBe(true);expect(record.aiProvenance.time.precision).toBe('unknown')
 expect((await(await api.get(`/api/members/${member.id}/cases`)).json()).active).toHaveLength(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
})
