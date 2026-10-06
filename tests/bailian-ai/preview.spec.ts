import {test,expect} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {TokenService} from '../../server/auth/token-service.mjs'
import observedOCR from '../../server/ai/providers/fixtures/bailian-synthetic-ocr-array-20261003.json' with {type:'json'}
import {visitAISummaryInput} from '../../server/visit-sheets/visit-ai-summary.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
async function login(page:any,memberId='child-a'){await page.addInitScript(({token,memberId}:{token:string;memberId:string})=>{sessionStorage.setItem('hoooho-auth-token',token);if(!localStorage.getItem('hoooho-app'))localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})}
async function generate(page:any){await page.getByRole('button',{name:'更新情况单',exact:true}).click();const d=page.getByRole('dialog',{name:'更新情况单',exact:true});await d.getByRole('checkbox',{name:/使用现有 AI/}).check();await d.getByRole('button',{name:'整理并查看草稿',exact:true}).click();return d}
async function openScope(page:any){await page.getByRole('button',{name:'编辑完整资料',exact:true}).click();await page.getByRole('dialog',{name:'编辑完整资料'}).getByRole('button',{name:'调整 / 恢复资料范围',exact:true}).click()}

test('反馈回归：已知基本信息核对失败可读，范围和问题更新立即清除旧AI预览',async({page,request},info)=>{
 await request.get('http://127.0.0.1:4198/success')
 await login(page);await page.goto('/visit-summary')
 await expect(page.getByRole('heading',{name:'本次情况',exact:true})).toBeVisible()
 const read=async()=>(await(await request.get('/api/members/child-a/visit-sheet',{headers})).json()).report
 let report=await read()
 expect((await request.put('/api/members/child-a/visit-sheet',{headers,data:{expectedVersion:report.version,requestId:'feedback-preview-focus',selection:null,focus:{mode:'source',sourceId:'record:s0'}}})).ok()).toBeTruthy()
 await page.reload();report=await read()
 const input=visitAISummaryInput(report),quote=input.sections.find(s=>s.id==='record').lines.find(s=>s.startsWith('[record:s0]'))
 await request.post('http://127.0.0.1:4198/draft-data',{data:{summaryOutput:{overview:'皮肤观察记录',keyPoints:[{text:'皮肤观察记录',quote,sectionId:'record'}],missingInformation:['性别尚未提供']}}})
 const update=await generate(page)
 const preview=page.getByRole('region',{name:'AI初步整理，需核对',exact:true})
 await expect(preview).toContainText('当前档案已有年龄或性别')
 await expect(preview.getByText('/summary',{exact:false})).not.toBeVisible()
 expect((await read()).version).toBe(report.version)
 await update.getByRole('button',{name:'返回更新情况单',exact:true}).click();await openScope(page)
 const scope=page.getByRole('dialog',{name:'本次资料范围',exact:true})
 await scope.getByRole('radio',{name:'选择情况与时间',exact:true}).check();await scope.locator('input[type=checkbox]').first().check()
 await scope.getByLabel('开始时间（选填）').fill('2026-09-01T00:00');await scope.getByLabel('结束时间（选填）').fill('2026-09-02T00:00')
 await scope.getByRole('button',{name:'预览范围变化',exact:true}).click();await scope.getByRole('button',{name:'确认范围并更新情况单',exact:true}).click()
 await expect(scope).toHaveCount(0);await expect(preview).toHaveCount(0)
 await expect(page.getByRole('button',{name:'导出待核对摘要（文本）',exact:true})).toHaveCount(0)
 await openScope(page)
 await scope.getByRole('radio',{name:'全部可访问资料（恢复完整范围）',exact:true}).check();await scope.getByRole('button',{name:'预览范围变化',exact:true}).click();await scope.getByRole('button',{name:'确认范围并更新情况单',exact:true}).click();await expect(scope).toHaveCount(0)
 await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
 await generate(page)
 const candidate=page.getByRole('region',{name:'更新草稿',exact:true});await expect(candidate).toBeVisible()
 await update.getByRole('button',{name:'返回更新情况单',exact:true}).click()
 await page.getByRole('button',{name:'编辑本次想问',exact:true}).click();await page.getByLabel('本次想问',{exact:true}).fill('反馈合成问题更新');await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'编辑本次想问',exact:true})).toHaveCount(0);await expect(candidate).toHaveCount(0)
 await page.getByRole('button',{name:'更新情况单',exact:true}).click();await expect(candidate).toHaveCount(0);await expect(preview).toHaveCount(0);await update.getByRole('button',{name:'返回更新情况单',exact:true}).click()
 await page.screenshot({path:info.outputPath('feedback-old-ai-cleared.png')})
})
test('多项OCR数组仍失败但预览可见，不能直接保存',async({page,request})=>{
 const parts=[...JSON.parse(observedOCR.content),...JSON.parse(observedOCR.content)]
 await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{ocrText:parts}})
 await login(page,'empty-child');await page.goto('/health-profile/smart-record');await page.getByRole('button',{name:'上传与智能识别',exact:true}).click();await page.getByRole('combobox',{name:'资料类型'}).selectOption('record');const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
 const image=Buffer.from((await readFile(new URL('../../server/ai/business/fixtures/synthetic-report.png.b64',import.meta.url),'utf8')).trim(),'base64');await sheet.locator('input[type=file]').first().setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:image})
 const before=(await(await request.get('http://127.0.0.1:4198/status')).json()).calls
 await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('region',{name:'AI初步整理，需核对',exact:true})).toBeVisible();await expect(sheet.getByLabel('编辑AI初步整理')).toHaveValue(parts.map(p=>p.text).join('\n\n'))
 const d=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(d.state).toBe('failed');expect(d.preview.status).toBe('unverified');expect((await request.post(`/api/members/empty-child/ai-drafts/${d.id}/save`,{headers,data:{version:d.version,confirmed:true}})).status()).toBe(409)
 expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls-before).toBe(1);await request.delete(`/api/members/empty-child/ai-drafts/${d.id}`,{headers});await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
})

test('真实单页OCR数组离线手机回放：解包后继续严格抽取，待确认且不自动保存',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{ocrText:JSON.parse(observedOCR.content)}})
 await login(page,'empty-child');await page.goto('/health-profile/smart-record');await page.getByRole('button',{name:'上传与智能识别',exact:true}).click();await page.getByRole('combobox',{name:'资料类型'}).selectOption('record');const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
 const image=Buffer.from((await readFile(new URL('../../server/ai/business/fixtures/synthetic-report.png.b64',import.meta.url),'utf8')).trim(),'base64');await sheet.locator('input[type=file]').first().setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:image})
 const before=(await(await request.get('http://127.0.0.1:4198/status')).json()).calls
 await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('button',{name:'已核对，一次保存 1 条'})).toBeEnabled()
 const d=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(d.state).toBe('ready');expect(d.sources[0].text).toBe(JSON.parse(observedOCR.content)[0].text);expect(d.generation.provider).toBe('bailian');expect(d.result).toBeNull()
 expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls-before).toBe(2)
 expect((await request.post(`/api/members/empty-child/ai-drafts/${d.id}/save`,{headers,data:{version:d.version,confirmed:false}})).ok()).toBe(false)
 await request.delete(`/api/members/empty-child/ai-drafts/${d.id}`,{headers});await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
})
test('来源失败手机预览可编辑，正式保存拒绝，原文可带入既有手动表单且零额外模型请求',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/success')
 const raw='合成体验验收：今天没有呕吐，只是恶心'
 await request.post('http://127.0.0.1:4198/draft-data',{data:{items:[{category:'symptom',title:'合成观察',timeText:'今天',subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'呕吐',quote:'没有呕吐',sourceId:'@first',page:1}]}]}})
 await login(page,'empty-child');await page.goto('/health-profile/smart-record');await page.getByRole('button',{name:'上传与智能识别',exact:true}).click();await page.getByRole('combobox',{name:'资料类型'}).selectOption('record');const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true})
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
 await login(page);await page.goto('/visit-summary');await generate(page)
 const preview=page.getByRole('region',{name:'AI初步整理，需核对',exact:true});await expect(preview).toBeVisible();await preview.getByLabel('编辑AI初步整理').fill('人工修改：没有呕吐，只是恶心。仍待核对。')
 for(const [label,format] of [['导出待核对摘要（文本）','txt'],['导出待核对摘要（离线HTML）','html']]){const waiting=page.waitForEvent('download');await preview.getByRole('button',{name:label,exact:true}).click();const download=await waiting,content=await readFile((await download.path())!,'utf8');expect(content).toContain('非已确认报告');expect(content).toContain('人工修改');if(format==='html'){const offline=await page.context().newPage();await offline.route('**/*',r=>r.abort());await offline.setContent(content);await expect(offline.getByRole('heading',{name:'待核对 · 非已确认报告'})).toBeVisible();await offline.close()}}
 const after=await(await request.get('/api/members/child-a/visit-sheet',{headers})).json();expect(after.report).toEqual(before.report)
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('hoooho-app')!);s.state.currentMemberId='empty-child';localStorage.setItem('hoooho-app',JSON.stringify(s))});await page.reload();await expect(page.getByRole('region',{name:'AI初步整理，需核对',exact:true})).toHaveCount(0)
 await request.post('http://127.0.0.1:4198/draft-data',{data:{}})
})
