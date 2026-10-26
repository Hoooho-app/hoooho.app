import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
let token:string,headers:{Authorization:string},memberId:string,accountId:string,cookies:any[]
const control='http://127.0.0.1:4258'
test.beforeAll(async({request})=>{
 const response=await request.post('/api/auth/register',{data:{nickname:`follow${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()}})
 expect(response.ok(),await response.text()).toBeTruthy();const session=await response.json();token=session.token;accountId=session.user.id;headers={Authorization:`Bearer ${token}`};cookies=(await request.storageState()).cookies
})
test.beforeEach(async({page,request})=>{
 await request.get(`${control}/success`);await request.get(`${control}/delay?ms=200`);await request.post(`${control}/draft-data`,{data:{items:null}});await page.context().addCookies(cookies)
 const response=await request.post('/api/members',{headers,data:{name:'症状跟进测试（虚构）',birthday:'2024-12-20',relationship:'child'}});expect(response.ok()).toBeTruthy();memberId=(await response.json()).id
 await request.post('/api/auth/current-member',{headers,data:{memberId}})
 await page.addInitScript(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId,accountId})
 page.on('pageerror',error=>{throw error})
})
async function seed(request:any,text:string,minutes=1){const response=await request.post(`/api/members/${memberId}/case-records`,{headers,data:{requestId:randomUUID(),text,occurredAt:new Date(Date.now()-minutes*60000).toISOString(),files:[],journal:{categories:['symptom']}}});expect(response.ok(),await response.text()).toBeTruthy();return response.json()}
async function supplement(page:Page,id:string,text:string){await page.goto('/cases');await page.locator(`[data-case-id="${id}"]`).getByRole('button',{name:'补充变化',exact:true}).click();await expect(page).toHaveURL(/smart-record\?source=case-followup/);await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByRole('textbox',{name:'对话输入',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:true}).click()}

test('folded by default, no merge/materials, text edit and three bottom actions share one row',async({page,request},info)=>{
 const saved=await seed(request,'颈部发红，没有扩大');await seed(request,'颈部发痒，抓挠')
 await page.goto(`/cases?eventId=${saved.eventId}`)
 await expect(page.getByRole('heading',{name:'症状跟进',exact:true})).toBeVisible()
 await expect(page.locator('.case-followup-card')).toHaveCount(2)
 await expect(page.locator('.case-followup-timeline')).toHaveCount(0)
 await expect(page.getByRole('button',{name:/合并/})).toHaveCount(0)
 const card=page.locator(`[data-case-id="${saved.eventId}"]`)
 const edit=card.locator('.case-followup-management button');await expect(edit).toHaveText('编辑');await expect(edit.locator('svg')).toHaveCount(0)
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:width===375?667:844})
  const row=card.locator('.case-followup-primary-actions button');await expect(row).toHaveText(['补充变化','标记已康复','删除'])
  const boxes=await row.evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {top:r.top,width:r.width,height:r.height,border:s.borderTopWidth,borderStyle:s.borderTopStyle,borderColor:s.borderTopColor}}))
  expect(Math.max(...boxes.map(b=>b.top))-Math.min(...boxes.map(b=>b.top))).toBeLessThan(1);expect(boxes.every(b=>b.width>=44&&b.height>=44)).toBe(true)
  expect(boxes.every(b=>b.border==='1px'&&b.borderStyle==='solid'&&!['transparent','rgba(0, 0, 0, 0)'].includes(b.borderColor))).toBe(true)
  await expect(edit).toHaveCSS('font-size',await row.last().evaluate(b=>getComputedStyle(b).fontSize))
  const toggle=card.getByRole('button',{name:'展开',exact:true});await expect(toggle).toHaveText('');await expect(toggle.locator('svg')).toHaveCount(1);await expect(toggle).toHaveAttribute('aria-expanded','false')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.screenshot({path:info.outputPath(`folded-${width}.png`)})
 }
 await edit.click();await page.getByLabel('情况名称',{exact:true}).fill('颈部皮疹');await page.getByRole('dialog',{name:'编辑情况'}).getByRole('button',{name:'保存',exact:true}).click();await expect(card.getByRole('heading',{name:'颈部皮疹',exact:true})).toBeVisible()
 await card.getByRole('button',{name:'展开',exact:true}).click();await expect(card.locator('.case-followup-timeline')).toContainText('颈部发红');await expect(card.getByRole('heading',{name:'原始资料',exact:true})).toHaveCount(0)
 await expect(card.getByRole('button',{name:'收起',exact:true})).toHaveText('');await expect(card.locator('.case-followup-toggle svg')).toHaveClass(/case-followup-chevron-open/)
 await card.getByRole('button',{name:'标记已康复',exact:true}).click();await expect(card).toHaveCount(0);await page.getByRole('tab',{name:/已归档/}).click();await expect(card.getByRole('button',{name:'恢复跟进',exact:true})).toBeVisible()
 for(const button of await card.locator('.case-followup-primary-actions button').all()){await expect(button).toHaveCSS('border-top-width','1px');await expect(button).toHaveCSS('border-top-style','solid')}
 await card.getByRole('button',{name:'恢复跟进',exact:true}).click();await page.getByRole('tab',{name:/跟进中/}).click();await expect(card).toBeVisible()
 await card.getByRole('button',{name:'删除颈部皮疹',exact:true}).click();await page.getByRole('dialog',{name:'删除情况'}).getByRole('button',{name:'确认删除',exact:true}).click();await expect(card).toHaveCount(0)
})
test('supplement saves to the same symptom and opens its process above other folded symptoms',async({page,request},info)=>{
 const saved=await seed(request,'头皮发红',30);await seed(request,'脚踝发痒',1)
 const text='今天头皮发痒，抓挠后发红，没有发热'
 await supplement(page,saved.eventId,text)
 await page.getByRole('button',{name:/^(?:先记下来|立即保存)$/}).last().click()
 await expect(page.getByText('已保存，可在症状跟进的变化过程查看。',{exact:true})).toBeVisible()
 const records=await(await request.get(`/api/events/${saved.eventId}/records`,{headers})).json();const record=records.find((r:any)=>r.sourceText===text);expect(record).toBeTruthy();expect(record.content).toBe(record.aiProvenance.professionalSummary.text);expect(record.content).toContain('瘙痒');expect(record.sourceText).toBe(text)
 await page.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page).toHaveURL(/\/cases\?/)
 expect(new URL(page.url()).searchParams.get('eventId')).toBe(saved.eventId);expect(new URL(page.url()).searchParams.get('recordId')).toBe(record.id)
 const card=page.locator('.case-followup-card').first();await expect(card).toHaveAttribute('data-case-id',saved.eventId)
 await expect(card.locator('.case-followup-timeline')).toBeVisible();await expect(page.locator('.case-followup-timeline')).toHaveCount(1)
 const line=card.locator(`[data-record-id="${record.id}"]`);await expect(line.locator('.case-followup-record-summary')).toHaveText('头皮瘙痒、抓挠')
 await expect(line.getByRole('heading',{name:'原始资料',exact:true})).toHaveCount(0)
 await line.getByText('查看完整原文',{exact:true}).click();await expect(line.locator('details p')).toHaveText(text)
 await page.screenshot({path:info.outputPath('returned-process.png')})
 await page.goto('/cases');await expect(page.locator('.case-followup-timeline')).toHaveCount(0)
})
test('saving original after model failure also returns to the symptom process',async({page,request})=>{
 const saved=await seed(request,'手臂发红');await request.get(`${control}/failure`)
 await supplement(page,saved.eventId,'手臂有点痒，原话保留测试')
 await page.getByRole('button',{name:'先保存原话',exact:true}).click({timeout:30000})
 await expect(page.getByText('已保存，可在症状跟进的变化过程查看。',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'查看记录',exact:true}).click();await expect(page).toHaveURL(/\/cases\?/)
 const recordId=new URL(page.url()).searchParams.get('recordId');expect(recordId).toBeTruthy();const line=page.locator(`[data-case-id="${saved.eventId}"] [data-record-id="${recordId}"]`);await expect(line.locator('.case-followup-record-summary')).toHaveText('手臂瘙痒');await line.getByText('查看完整原文',{exact:true}).click();await expect(line.locator('details[open]')).toContainText('手臂有点痒，原话保留测试')
})

test('historical long narratives use one-line core phrases and muted dates inside the process, preserving originals',async({page,request},info)=>{
 const raw='今天头皮一直发痒，抓挠后发红，没有发热，还有一些反复出现的细节，完整原始记录应当全部保留。'
 const saved=await seed(request,raw,90)
 const before=await(await request.get(`/api/events/${saved.eventId}/records`,{headers})).json()
 await page.goto('/cases');const card=page.locator(`[data-case-id="${saved.eventId}"]`)
 await expect(card.locator('.case-followup-title')).toHaveText('头皮瘙痒、抓挠')
 await expect(card.locator('.lucide-cross')).toHaveCount(1)
 await expect(card.locator('.case-followup-description,.case-followup-keyword,.case-followup-dates')).toHaveCount(0)
 await expect(card.locator('.case-followup-management button')).toHaveCSS('font-weight','400')
 await expect(card.getByRole('button',{name:'展开',exact:true})).toHaveCSS('font-weight','400')
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844})
  const title=card.locator('.case-followup-title');const size=await title.evaluate(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight),fits:e.scrollWidth<=e.clientWidth+1}))
  expect(size.height).toBeLessThanOrEqual(size.line+1);expect(size.fits).toBe(true)
 }
 await card.getByRole('button',{name:'展开',exact:true}).click()
 const timeline=card.locator('.case-followup-timeline');await expect(timeline.getByText('最近更新',{exact:true})).toBeVisible();await expect(timeline.getByText('首次记录',{exact:true})).toBeVisible()
 await expect(timeline.locator('.case-followup-dates>div').first()).toHaveCSS('border-top-width','0px')
 await expect(card.getByRole('button',{name:'收起',exact:true})).toHaveCSS('font-weight','400')
 await expect(timeline.locator('.case-followup-record-summary')).toHaveText('头皮瘙痒、抓挠')
 await timeline.getByText('查看完整原文',{exact:true}).click();await expect(timeline.locator('details p').first()).toHaveText(raw)
 await page.screenshot({path:info.outputPath('legacy-expanded-430.png')})
 const after=await(await request.get(`/api/events/${saved.eventId}/records`,{headers})).json();expect(after).toEqual(before)
})
