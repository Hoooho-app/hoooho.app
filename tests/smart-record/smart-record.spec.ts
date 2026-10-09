import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
const raw='吃了半碗粥，脸颊有点红，没有呕吐，午睡睡了一个小时'
const items=[['diet',[['food','粥'],['amount','半碗']]],['symptom',[['symptom','脸颊有点红，没有呕吐'],['location','脸颊']]],['sleep',[['quality','午睡睡了一个小时']]]].map(([category,fields])=>({category,title:category,timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:(fields as string[][]).map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))}))
test.beforeEach(async({page,request})=>{
 await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{items}})
 await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))},token)
 await page.goto('/smart-record');await expect(page.getByLabel('原始记录内容')).toHaveCount(0);await page.getByRole('button',{name:'键盘输入',exact:true}).click()
})
test('关键核对、编辑后关闭恢复、一次保存三类原话且不重复写入',async({page,request})=>{
 const text=page.getByLabel('原始记录内容');await expect(text).toBeEnabled();await text.fill(raw);await page.getByRole('button',{name:'整理这段话',exact:true}).click()
 await expect(page.locator('.smart-record-item')).toHaveCount(3);await expect(page.getByRole('button',{name:'确认保存 3 条'})).toBeEnabled()
 await expect(page.locator('.smart-record-item').first().getByLabel('食物',{exact:true})).toHaveValue('粥')
 await page.getByLabel('数量',{exact:true}).fill('小半碗');await page.reload();await expect(page.getByLabel('原始记录内容')).toHaveCount(0);await page.getByRole('button',{name:'键盘输入',exact:true}).click();await expect(page.getByLabel('数量',{exact:true})).toHaveValue('小半碗');await expect(text).toHaveValue(raw)
 for(const width of [320,375,390]){await page.setViewportSize({width,height:667});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await page.screenshot({path:'outputs/smart-record-review.png',fullPage:true})
 await page.getByRole('button',{name:'确认保存 3 条'}).click();await expect(page).toHaveURL(/\/health-events\//)
 const eventId=page.url().split('/').at(-1),records=await(await request.get(`/api/events/${eventId}/records`,{headers})).json()
 expect(records).toHaveLength(3);expect(new Set(records.map((r:any)=>r.journal.categories[0]))).toEqual(new Set(['diet','symptom','sleep']));expect(records.every((r:any)=>r.sourceText===raw)).toBe(true);expect(records.some((r:any)=>r.content.includes('小半碗'))).toBe(true)
 await page.goto('/smart-record');await expect(page.getByLabel('原始记录内容')).toHaveCount(0);await page.getByRole('button',{name:'键盘输入',exact:true}).click();await expect(text).toHaveValue('')
})
test('识别失败保留原话、上版和人工编辑，手动重试不覆盖修改',async({page,request})=>{
 await page.getByLabel('原始记录内容').fill(raw);await page.getByRole('button',{name:'整理这段话',exact:true}).click();await expect(page.getByRole('button',{name:'确认保存 3 条'})).toBeEnabled();await page.getByLabel('数量',{exact:true}).fill('小半碗')
 await request.get('http://127.0.0.1:4198/failure');await page.getByLabel('原始记录内容').fill(raw+'，补充观察');await page.getByRole('button',{name:'重新整理',exact:true}).click();await expect(page.getByRole('alert')).toContainText('原话与草稿保留');await expect(page.getByLabel('数量',{exact:true})).toHaveValue('小半碗');await expect(page.getByRole('button',{name:'确认保存 3 条'})).toBeDisabled()
 await page.reload();await expect(page.getByLabel('原始记录内容')).toHaveCount(0);await page.getByRole('button',{name:'键盘输入',exact:true}).click();await expect(page.getByLabel('原始记录内容')).toHaveValue(raw+'，补充观察');await expect(page.getByLabel('数量',{exact:true})).toHaveValue('小半碗');await request.get('http://127.0.0.1:4198/success');await page.getByRole('button',{name:'重试整理',exact:true}).click();await expect(page.getByRole('button',{name:'确认保存 3 条'})).toBeEnabled();await expect(page.getByLabel('数量',{exact:true})).toHaveValue('小半碗')
})
test('实际录音转写后自动整理，失败录音刷新后仍能重试',async({page,request})=>{
 await request.get(`http://127.0.0.1:4198/voice?text=${encodeURIComponent(raw)}`)
 const button=page.getByRole('button',{name:'按住说话',exact:true});await expect(button).toBeEnabled();await button.focus();await page.keyboard.down('Space');await expect(page.getByRole('button',{name:'正在录音…'})).toBeVisible();await page.waitForTimeout(900);await page.keyboard.up('Space');await expect(page.locator('.smart-record-item')).toHaveCount(3);await expect(page.getByLabel('原始记录内容')).toHaveCount(0);await page.getByRole('button',{name:'键盘输入',exact:true}).click();await expect(page.getByLabel('原始记录内容')).toHaveValue(raw);await expect(page.getByRole('button',{name:'确认保存 3 条'})).toBeEnabled()
 await page.route('**/api/ai/audio/transcriptions',route=>route.fulfill({status:503,json:{error:{code:'ASR_TIMEOUT'}}}));await button.focus();await page.keyboard.down('Space');await expect(page.getByRole('button',{name:'正在录音…'})).toBeVisible();await page.waitForTimeout(900);await page.keyboard.up('Space');await expect(page.getByRole('button',{name:'重试语音识别'})).toBeEnabled();await page.reload();await expect(page.getByRole('button',{name:'重试语音识别'})).toBeEnabled();await page.unroute('**/api/ai/audio/transcriptions');await request.get('http://127.0.0.1:4198/voice?text=补充观察');await page.getByRole('button',{name:'重试语音识别'}).click();await page.getByRole('button',{name:'键盘输入',exact:true}).click();await expect(page.getByLabel('原始记录内容')).toHaveValue(raw+'\n补充观察');await expect(page.getByRole('button',{name:'确认保存 3 条'})).toBeEnabled()
})
