import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
let token:string,headers:{Authorization:string},memberId:string,accountId:string,cookies:any[]
const control='http://127.0.0.1:4248'
test.beforeAll(async({request})=>{
 const registration=await request.post('/api/auth/register',{data:{nickname:`overview${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()}});expect(registration.ok(),await registration.text()).toBeTruthy();const session=await registration.json();token=session.token;accountId=session.user.id;headers={Authorization:`Bearer ${token}`};cookies=(await request.storageState()).cookies
})
test.beforeEach(async({page,request})=>{
 await request.get(`${control}/success`);await request.get(`${control}/delay?ms=200`);await page.context().addCookies(cookies)
 const response=await request.post('/api/members',{headers,data:{name:'方案验收孩子',birthday:'2024-12-20',gender:'female',relationship:'child'}});expect(response.ok()).toBeTruthy();memberId=(await response.json()).id
 await request.post('/api/auth/current-member',{headers,data:{memberId}})
 await page.addInitScript(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId,accountId})
 page.on('pageerror',error=>{throw error})
})
async function dimensions(page:Page,name:string){for(const width of [320,375,390,430]){await page.setViewportSize({width,height:width===375?667:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`test-results/overview-approved/${name}-${width}.png`})}await page.setViewportSize({width:375,height:667})}
async function daily(page:Page,name:string){await page.goto('/health-events');await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('group',{name:'记录日常选项'}).getByRole('button',{name,exact:true}).click()}
async function manage(page:Page,name:string){await page.getByRole('button',{name:`管理${name}`,exact:true}).click();await page.getByRole('button',{name:'编辑',exact:true}).click()}
test('five profile lists: real counts, overflow edit/delete/undo, vaccine visible date, family relation preserved',async({page,request})=>{
 for(const kind of ['allergy','chronic','family-history','surgery','vaccination']){
  await page.goto(`/health-profile/${kind}`);await expect(page.getByText('正在读取档案…')).toHaveCount(0)
  await page.getByRole('button',{name:`添加${{'allergy':'过敏史','chronic':'慢性病史','family-history':'家族史','surgery':'手术史','vaccination':'疫苗接种记录'}[kind]}`,exact:true}).click()
  const form=page.locator('.inline-profile-editor');const field=form.locator('input:not([readonly]):not([type=date])');await field.fill(`验收${kind}`)
  if(kind==='vaccination')await form.getByLabel('接种日期',{exact:true}).fill('2025-06-01')
  if(kind==='family-history')await form.getByRole('combobox').selectOption({label:'母亲'})
  await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form).toHaveCount(0)
  await expect(page.getByRole('button',{name:`管理验收${kind}`})).toBeVisible()
  if(kind==='vaccination')await expect(page.locator('.inline-profile-list')).toContainText('2025-06-01')
  if(kind==='family-history')await expect(page.locator('.inline-profile-list')).toContainText('母亲')
  await dimensions(page,kind)
  await manage(page,`验收${kind}`);await page.locator('.inline-profile-editor input:not([readonly]):not([type=date])').fill(`编辑${kind}`)
  await page.locator('.inline-profile-editor').getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.inline-profile-editor')).toHaveCount(0)
  await page.getByRole('button',{name:`管理编辑${kind}`} ).click();await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByRole('button',{name:`管理编辑${kind}`})).toHaveCount(0)
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('button',{name:`管理编辑${kind}`})).toBeVisible()
 }
 await page.goto('/health-profile');await expect(page.locator('.health-profile-entry__count')).toHaveCount(5);await expect(page.getByText('查看与补充')).toHaveCount(0);await dimensions(page,'profile-home')
 const upload=page.getByRole('button',{name:'上传资料',exact:true});await expect(upload).toBeInViewport();await upload.click();await page.locator('input[type=file]:not([capture])').setInputFiles({name:'原件.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});await expect(page.getByRole('dialog',{name:'上传资料'})).toBeVisible()
})
test('sleep 24h, explicit confirmation and minute edits; stool readable labels, time first, original options preserved',async({page})=>{
 await daily(page,'睡眠');const form=page.getByRole('dialog',{name:'记录睡眠'});await expect(form.getByRole('group',{name:/每圈24小时/})).toBeVisible();const save=form.getByRole('button',{name:'保存记录'});await expect(save).toBeDisabled();await form.getByRole('checkbox').check();await expect(save).toBeEnabled()
 const slider=form.getByRole('slider').first();await slider.focus();await page.keyboard.press('ArrowLeft');await expect(form.getByRole('checkbox')).not.toBeChecked();await expect(save).toBeDisabled();await dimensions(page,'sleep');await form.getByRole('checkbox').check();await save.click();await expect(form).toHaveCount(0)
 await daily(page,'排便');const bowel=page.getByRole('dialog',{name:'记录排便'});await expect(bowel.locator('.bowel-shape-grid button')).toHaveCount(7);await expect(bowel.locator('.bowel-color-grid button')).toHaveCount(8);await expect(bowel.getByRole('button',{name:'黄色',exact:true})).toHaveText('黄色')
 expect(await bowel.evaluate(node=>node.querySelector('.record-time-group')!.getBoundingClientRect().top<node.querySelector('.bowel-shape-grid')!.getBoundingClientRect().top)).toBe(true)
 await bowel.getByRole('button',{name:'糊状',exact:true}).click();await bowel.getByRole('button',{name:'黄色',exact:true}).click();await dimensions(page,'bowel')
 await bowel.getByRole('button',{name:'保存记录'}).click();await expect(bowel).toHaveCount(0)
})
test('month date sheet is one row per record, opens details, restores focus; duplicate close preserves form',async({page,request})=>{
 const date='2026-10-01',records=[]
 for(let index=0;index<3;index++){const r=await request.post(`/api/members/${memberId}/case-records`,{headers,data:{text:`测试原话${index}`,occurredAt:`${date}T0${index+7}:00:00+08:00`,requestId:randomUUID(),files:[],journal:{categories:['other']}}});expect(r.ok(),await r.text()).toBeTruthy();records.push(await r.json())}
 await page.goto(`/health-events?view=month&day=${date}&month=2026-10`);const cell=page.getByRole('button',{name:/^2026-10-01，/});await cell.click();const sheet=page.getByRole('dialog',{name:'10月1日 · 3条记录'});await expect(sheet).toBeVisible();await expect(sheet.locator('[data-day-record]')).toHaveCount(3);await expect(sheet.getByText('完整记录')).toHaveCount(0);await dimensions(page,'day-sheet');await sheet.locator('[data-day-record]').first().click();await expect(sheet).toHaveCount(0);await expect(page.getByRole('dialog').last()).toContainText('测试原话2');await page.keyboard.press('Escape');await expect(sheet).toBeVisible();await page.keyboard.press('Escape');await expect(cell).toBeFocused()
 await daily(page,'排便');const bowel=page.getByRole('dialog',{name:'记录排便'});await bowel.getByRole('button',{name:'水样',exact:true}).click()
 await page.route('**/api/quick-records/duplicate-check',route=>route.fulfill({json:{duplicate:{eventId:records[0].eventId,recordId:records[0].recordId,summary:'原排便记录',occurredAt:new Date().toISOString(),changeSummary:'',hasClearChange:false}}}))
 await bowel.getByRole('button',{name:'保存记录'}).click();const duplicate=page.getByRole('dialog',{name:'可能已记录过',exact:true});await expect(duplicate).toBeVisible();await duplicate.getByRole('button',{name:/^关闭可能/}).click();await expect(bowel).toBeVisible();await expect(bowel.getByRole('button',{name:'水样',exact:true})).toHaveAttribute('aria-pressed','true');await expect(bowel.getByRole('button',{name:'保存记录'})).toBeEnabled();await expect(page.getByText('已记下来')).toHaveCount(0)
})
test('follow-up shows facts and timeline, edits title, deletes group safely',async({page,request})=>{
 const capture=await request.post(`/api/members/${memberId}/case-records`,{headers,data:{requestId:randomUUID(),text:'颈部发红，今天没有扩大',occurredAt:'2026-10-01T10:00:00+08:00',files:[],journal:{categories:['symptom']}}});expect(capture.ok()).toBeTruthy();const saved=await capture.json()
 await page.goto('/cases');const card=page.locator(`[data-case-id="${saved.eventId}"]`);await expect(card.getByText('首次记录',{exact:true})).toBeVisible();await expect(card.getByText('最近更新',{exact:true})).toBeVisible();await expect(card.getByText('变化过程',{exact:true})).toBeVisible();await expect(card.locator('.case-followup-timeline')).toBeVisible();await dimensions(page,'follow-up')
 await card.getByRole('button',{name:/^编辑/}).click();await page.getByLabel('情况名称',{exact:true}).fill('颈部皮疹');await page.getByRole('dialog',{name:'编辑情况'}).getByRole('button',{name:'保存',exact:true}).click();await expect(card.getByRole('heading',{name:'颈部皮疹',exact:true})).toBeVisible()
 await card.getByRole('button',{name:'删除颈部皮疹',exact:true}).click();await page.getByRole('dialog',{name:'删除情况'}).getByRole('button',{name:'确认删除',exact:true}).click();await expect(card).toHaveCount(0)
})
test('smart progress has checkpoints and stop; failure saves original without model or duplicate',async({page,request})=>{
 await request.get(`${control}/failure`);await request.get(`${control}/delay?ms=1500`);await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByRole('textbox').fill('今天颈部有点红，抓了几次。');await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.getByRole('list',{name:'整理进度'})).toBeVisible();await expect(page.getByRole('button',{name:'停止处理',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'先保存原话',exact:true})).toBeVisible({timeout:30000});await dimensions(page,'smart-failure')
 const before=await(await request.get(control)).json();let loseAck=true;await page.route('**/case-records',async route=>{if(loseAck){loseAck=false;await route.fetch();await route.abort('failed')}else await route.continue()});await page.getByRole('button',{name:'先保存原话',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:/Failed to fetch|网络/})).toBeVisible();await page.getByRole('button',{name:'先保存原话',exact:true}).click();await expect(page.getByText('原话已保存，可在健康随记查看。')).toBeVisible();const after=await(await request.get(control)).json();expect(after.calls).toBe(before.calls)
 await page.getByRole('button',{name:'查看',exact:true}).click();await expect(page).toHaveURL(/health-events/)
})

test('stool keeps structured values and six originals through retry/back, then persists the same facts',async({page,request})=>{
 await daily(page,'排便');const form=page.getByRole('dialog',{name:'记录排便'});await form.getByRole('button',{name:'糊状',exact:true}).click();await form.getByRole('button',{name:'黄褐',exact:true}).click();await form.locator('.bowel-overview-supplement>summary').click();await form.getByRole('slider',{name:'分量',exact:true}).fill('2');await form.getByRole('button',{name:'黏液',exact:true}).click()
 let fail=true;await page.route('**/api/quick-records/*/photos',async route=>{if(route.request().method()==='POST'&&fail){fail=false;await route.fulfill({status:503,json:{error:{message:'合成上传失败'}}})}else await route.continue()})
 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
 await form.locator('input[type=file]').setInputFiles(Array.from({length:7},(_,index)=>({name:`原图${index}.png`,mimeType:'image/png',buffer:pixel})));await expect(form.locator('.bowel-photo-grid img')).toHaveCount(6);await expect(form.getByRole('button',{name:/重试上传/})).toHaveCount(1);await expect(form.getByRole('button',{name:'保存记录'})).toBeDisabled();await form.getByRole('button',{name:/重试上传/}).click();await expect(form.getByRole('button',{name:'保存记录'})).toBeEnabled();await form.getByRole('button',{name:'返回记录新情况'}).click()
 await daily(page,'排便');await expect(form.getByRole('button',{name:'糊状',exact:true})).toHaveAttribute('aria-pressed','true');await expect(form.locator('.bowel-photo-grid img')).toHaveCount(6);await form.locator('.bowel-overview-supplement>summary').click();await expect(form.getByRole('slider',{name:'分量',exact:true})).toHaveValue('2')
 const response=page.waitForResponse(response=>response.url().endsWith('/api/quick-records')&&response.request().method()==='POST');await form.getByRole('button',{name:'保存记录'}).click();const result=await(await response).json();const records=await(await request.get(`/api/events/${result.eventId}/records`,{headers})).json();const record=records.find((item:any)=>item.id===result.recordId);expect(record.journal.bowel.shapes).toEqual(['糊状']);expect(record.journal.bowel.amount).toBe('一般');expect(record.journal.bowel.observations).toContain('黏液');expect(record.journal.bowel.color).toBe('黄褐')
})
test('smart stop can resume to compact ordered result actions and the existing review page',async({page,request})=>{
 await request.get(`${control}/delay?ms=1800`);await page.goto('/smart-record?source=front-desk');await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByRole('textbox').fill('今天颈部发红');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'停止处理',exact:true}).click();await expect(page.getByRole('button',{name:'继续处理',exact:true})).toBeVisible();await page.getByRole('button',{name:'继续处理',exact:true}).click();await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled({timeout:30000});await expect(page.locator('.smart-record-actions>.hoho-button')).toHaveText(['核对记录','直接记录']);await page.getByRole('button',{name:'核对记录',exact:true}).click();await expect(page.getByRole('heading',{name:'核对记录',exact:true})).toBeVisible();await expect(page.locator('.smart-record-review')).toBeVisible()
})
