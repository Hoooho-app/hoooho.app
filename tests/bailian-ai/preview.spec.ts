import {test,expect} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {TokenService} from '../../server/auth/token-service.mjs'
import observedOCR from '../../server/ai/providers/fixtures/bailian-synthetic-ocr-array-20261003.json' with {type:'json'}
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
async function login(page:any,memberId='child-a'){await page.addInitScript(({token,memberId}:{token:string;memberId:string})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})}
test('真实合成OCR内容离线手机回放：数组仍失败但预览可见，不能直接保存',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{ocrText:JSON.parse(observedOCR.content)}})
 await login(page,'empty-child');await page.goto('/health-events');await page.getByRole('button',{name:'智能记录',exact:true}).click();const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
 const image=Buffer.from((await readFile(new URL('../../server/ai/business/fixtures/synthetic-report.png.b64',import.meta.url),'utf8')).trim(),'base64');await sheet.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:image})
 const before=(await(await request.get('http://127.0.0.1:4198/status')).json()).calls
 await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('region',{name:'AI初步整理，需核对',exact:true})).toBeVisible();await expect(sheet.getByLabel('编辑AI初步整理')).toHaveValue(JSON.parse(observedOCR.content)[0].text)
 const d=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(d.state).toBe('failed');expect(d.preview.status).toBe('unverified');expect((await request.post(`/api/members/empty-child/ai-drafts/${d.id}/save`,{headers,data:{version:d.version,confirmed:true}})).status()).toBe(409)
 expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls-before).toBe(1);await request.delete(`/api/members/empty-child/ai-drafts/${d.id}`,{headers});await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
})
test('来源失败手机预览可编辑，正式保存拒绝，原文可带入既有手动表单且零额外模型请求',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/success')
 const raw='合成体验验收：今天没有呕吐，只是恶心'
 await request.post('http://127.0.0.1:4198/draft-data',{data:{items:[{category:'symptom',title:'合成观察',timeText:'今天',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'呕吐',quote:'没有呕吐',sourceId:'@first',page:1}]}]}})
 await login(page,'empty-child');await page.goto('/health-events');await page.getByRole('button',{name:'智能记录',exact:true}).click();const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
 await sheet.getByLabel('原始记录内容').fill(raw);await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click()
 const preview=sheet.getByRole('region',{name:'AI初步整理，需核对',exact:true});await expect(preview).toBeVisible();await expect(preview).toContainText('来源或否定关系未通过核对')
 await expect(sheet.getByLabel('原始记录内容')).toHaveValue(raw);await preview.getByLabel('编辑AI初步整理').fill('人工对照原话：今天没有呕吐，只是恶心')
 const draft=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(draft.state).toBe('failed')
 expect((await request.post(`/api/members/empty-child/ai-drafts/${draft.id}/save`,{headers,data:{version:draft.version,confirmed:true}})).status()).toBe(409)
 const before=(await(await request.get('http://127.0.0.1:4198/status')).json()).calls
 await preview.getByRole('button',{name:'带入手动表单核对',exact:true}).click();const manual=page.getByRole('dialog',{name:'手动核对AI内容',exact:true})
 await expect(manual.getByLabel('快捷记录文字')).toHaveValue('人工对照原话：今天没有呕吐，只是恶心')
 await manual.getByRole('button',{name:'继续核对',exact:true}).click();await expect(manual.getByLabel('编辑识别原话')).toBeVisible();await manual.getByRole('button',{name:'确认保存',exact:true}).click();await expect(manual).toHaveCount(0)
 expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls).toBe(before)
 const events=await(await request.get('/api/events',{headers})).json(),event=events.find((e:any)=>e.memberId==='empty-child'&&e.title==='人工核对记录')
 expect(event).toBeTruthy();const records=await(await request.get(`/api/events/${event.id}/records`,{headers})).json();expect(records[0].sourceType).toBe('text_record');expect(records[0].aiProvenance).toBeUndefined();expect(records[0].sourceText).toBe(raw)
 await request.delete(`/api/records/${records[0].id}`,{headers});await request.delete(`/api/events/${event.id}`,{headers});await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
})
test('无效摘要可编辑及带标识导出，旧摘要不被覆盖；切换成员不泄露预览',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{summaryOutput:{overview:'合成初步摘要，需核对',keyPoints:[{text:'没有呕吐',sectionId:'record',quote:'模型新增的错误引用'}],missingInformation:[]}}})
 const before=await(await request.get('/api/members/child-a/visit-sheet',{headers})).json()
 await login(page);await page.goto('/visit-summary');await page.getByRole('button',{name:/^(生成|重新生成) AI 病情摘要$/}).click()
 const preview=page.getByRole('region',{name:'AI初步整理，需核对',exact:true});await expect(preview).toBeVisible();await preview.getByLabel('编辑AI初步整理').fill('人工修改：没有呕吐，只是恶心。仍待核对。')
 for(const [label,format] of [['导出待核对摘要（文本）','txt'],['导出待核对摘要（离线HTML）','html']]){const waiting=page.waitForEvent('download');await preview.getByRole('button',{name:label,exact:true}).click();const download=await waiting,content=await readFile((await download.path())!,'utf8');expect(content).toContain('非已确认报告');expect(content).toContain('人工修改');if(format==='html'){const offline=await page.context().newPage();await offline.route('**/*',r=>r.abort());await offline.setContent(content);await expect(offline.getByRole('heading',{name:'待核对 · 非已确认报告'})).toBeVisible();await offline.close()}}
 const after=await(await request.get('/api/members/child-a/visit-sheet',{headers})).json();expect(after.report).toEqual(before.report)
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('hoooho-app')!);s.state.currentMemberId='empty-child';localStorage.setItem('hoooho-app',JSON.stringify(s))});await page.reload();await expect(page.getByRole('region',{name:'AI初步整理，需核对',exact:true})).toHaveCount(0)
 await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
})
