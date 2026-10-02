import { test, expect } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import sharp from 'sharp'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}

test('百炼图片草稿经确认保存，附件和记录标识真实供应商，成员与取消隔离',async({page,request})=>{
  await request.get('http://127.0.0.1:4198/success')
  const original='合成观察，没有呕吐'
  await request.post('http://127.0.0.1:4198/draft-data',{data:{ocrText:original,items:[{category:'symptom',title:'合成记录',timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'symptom',value:'没有呕吐',quote:'没有呕吐',sourceId:'@first',page:1}]}]}})
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'child-a',members:[],profile:null},version:5}))},token)
  await page.goto('/health-events');await page.getByRole('button',{name:'智能记录',exact:true}).click()
  const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
  const image=await sharp({create:{width:200,height:160,channels:3,background:'#ffffff'}}).png().toBuffer()
  await sheet.locator('input[type=file]').setInputFiles({name:'synthetic-image.png',mimeType:'image/png',buffer:image})
  const before=await(await request.get('http://127.0.0.1:4198/status')).json()
  await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click()
  await expect(sheet.getByRole('button',{name:'已核对，一次保存 1 条',exact:true})).toBeEnabled()
  const draft=await(await request.get('/api/members/child-a/ai-drafts',{headers})).json()
  expect(draft.generation.provider).toBe('bailian');expect(draft.generation.model).toBe('qwen3.7-plus');expect(draft.generation.requestId).toBe('01234567-1234-1234-1234-123456789abc')
  expect(draft.sources[0].page).toBe(1);expect(draft.sources[0].text).toBe(original)
  expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls-before.calls).toBe(2)
  expect((await request.get(`/api/members/empty-child/ai-drafts/${draft.id}`,{headers})).status()).toBe(404)
  await sheet.getByRole('button',{name:'已核对，一次保存 1 条',exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:'outputs/bailian-ai/iphone-se-image-confirmation.png'})
  await sheet.getByRole('button',{name:'已核对，一次保存 1 条',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('已保存 1 条')
  const saved=await(await request.get(`/api/members/child-a/ai-drafts/${draft.id}`,{headers})).json()
  const recordsResponse=await request.get(`/api/events/${saved.result.records[0].eventId}/records`,{headers})
  expect(recordsResponse.status()).toBe(200)
  const records=await recordsResponse.json(),record=records.find((r:any)=>r.id===saved.result.records[0].recordId)
  expect(record.aiProvenance.provider).toBe('bailian');expect(record.aiProvenance.model).toBe('qwen3.7-plus')
  expect(saved.state).toBe('saved');expect(saved.result.count).toBe(1)
  await sheet.getByRole('button',{name:'撤销本次保存',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('已撤销')
})

test('百炼未配置 ASR 时拒绝转写，不自动调用遗留 OpenAI 密钥',async({request})=>{
  const before=await(await request.get('http://127.0.0.1:4198/status')).json()
  const response=await request.post('/api/ai/audio/transcriptions',{headers,data:{mimeType:'audio/webm',dataUrl:'data:audio/webm;base64,U1lOVEhFVElD'}})
  expect(response.status()).toBe(503);expect((await response.json()).error.code).toBe('ASR_NOT_CONFIGURED')
  const after=await(await request.get('http://127.0.0.1:4198/status')).json()
  expect(after.asrCalls).toBe(before.asrCalls);expect(after.calls).toBe(before.calls)
})

test('症状误分类与漏时间的供应商替身经领域校正，手机确认保存不增加模型请求',async({page,request})=>{
  await request.get('http://127.0.0.1:4198/success')
  const raw='今天没有呕吐，只是恶心'
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:[{category:'examination',title:'合成观察',timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'symptom',value:raw,quote:raw,sourceId:'@first',page:1}]}]}})
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'child-a',members:[],profile:null},version:5}))},token)
  await page.goto('/health-events');await page.getByRole('button',{name:'智能记录',exact:true}).click()
  const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
  await sheet.getByLabel('原始记录内容').fill(raw)
  const before=await(await request.get('http://127.0.0.1:4198/status')).json()
  await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click()
  await expect(sheet.getByRole('button',{name:'已核对，一次保存 1 条',exact:true})).toBeEnabled()
  const draft=await(await request.get('/api/members/child-a/ai-drafts',{headers})).json()
  expect(draft.items[0].category).toBe('symptom');expect(draft.items[0].time.raw).toBe('今天');expect(draft.items[0].time.precision).toBe('day')
  await expect(sheet.getByLabel('记录类型')).toHaveValue('symptom');await expect(sheet.getByLabel('发生时间')).toHaveValue('今天')
  await sheet.getByRole('button',{name:'已核对，一次保存 1 条',exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:'outputs/bailian-ai/iphone-se-quality-fix-mock.png'})
  await sheet.getByRole('button',{name:'已核对，一次保存 1 条',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('已保存 1 条')
  const saved=await(await request.get(`/api/members/child-a/ai-drafts/${draft.id}`,{headers})).json(),ref=saved.result.records[0]
  const records=await(await request.get(`/api/events/${ref.eventId}/records`,{headers})).json(),record=records.find((r:any)=>r.id===ref.recordId)
  expect(record.type).toBe('symptom');expect(record.aiProvenance.time.precision).toBe('day');expect(record.aiProvenance.fields[0].value).toBe(raw)
  expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls-before.calls).toBe(1)
  await sheet.getByRole('button',{name:'撤销本次保存',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('已撤销')
})
