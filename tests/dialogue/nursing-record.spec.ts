import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'

const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string
test.beforeEach(async({page,request})=>{
  const response=await request.post('/api/members',{headers,data:{name:'护理引导验收（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'}})
  expect(response.ok()).toBe(true);memberId=(await response.json()).id
  await request.get('http://127.0.0.1:4198/success')
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}})
  await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
  await page.goto('/nurse-station')
  await page.getByRole('button',{name:'改用文字',exact:true}).click()
})

async function send(page:import('@playwright/test').Page,text:string){
  await page.getByLabel('对话输入').fill(text)
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
}

test('specific questions, bound quick answers, refresh, unknown stop and professional save',async({page,request},info)=>{
  await send(page,'身上有点东西，老挠')
  await expect(page.getByText('变化出现在哪个部位？可以点身体部位，也可以拍一张照片。',{exact:true})).toBeVisible()
  await expect(page.getByLabel('回答当前问题')).toBeVisible()
  await expect(page.getByLabel('整理后的描述')).toContainText('反复抓挠')
  await page.getByLabel('对话输入').fill('还有一段待补充')
  const submitted=page.waitForRequest(r=>r.url().endsWith('/recognition-jobs')&&r.method()==='POST')
  await page.getByRole('button',{name:'四肢',exact:true}).click()
  expect((await submitted).postDataJSON().input.answerTo.questionId).toBe('skin-location')
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
  await expect(page.getByLabel('对话输入')).toHaveValue('还有一段待补充')
  const context=await (await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(context.interview.turnCount).toBeLessThanOrEqual(3)
  await page.reload()
  if(await page.getByRole('button',{name:'改用文字',exact:true}).isVisible())await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await expect(page.getByLabel('回答当前问题')).toBeVisible()
  await expect(page.getByLabel('对话输入')).toHaveValue('还有一段待补充')
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:667})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    expect((await page.getByRole('button',{name:'没注意',exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('button',{name:'没注意',exact:true}).click()
  await expect(page.getByRole('button',{name:'保存记录',exact:true})).toBeEnabled()
  await expect(page.getByLabel('回答当前问题')).toHaveCount(0)
  await page.screenshot({path:info.outputPath('focused-summary.png')})
  await page.getByRole('button',{name:'保存记录',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看',exact:true})).toBeVisible()
  await expect(page.getByLabel('回答当前问题')).toHaveCount(0)
  await expect(page.getByLabel('对话输入')).toHaveValue('还有一段待补充')
})

test('professional summary is primary and saving does not require opening original fields',async({page,request},info)=>{
  await send(page,'昨天小腿起了红点，老挠')
  await page.getByRole('button',{name:'核对记录',exact:true}).click()
  await expect(page.getByLabel('整理后的描述')).toContainText('反复抓挠')
  const originals=page.locator('details.smart-record-originals')
  await expect(originals).not.toHaveAttribute('open','')
  await expect(originals.locator('dl')).not.toBeVisible()
  await page.screenshot({path:info.outputPath('professional-first-review.png')})
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看',exact:true})).toBeVisible()
  const context=await (await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  const saved=await (await request.get(`/api/members/${memberId}/ai-drafts/${context.draftId}`,{headers})).json()
  const recordRef=saved.result.records[0]
  const records=await (await request.get(`/api/events/${recordRef.eventId}/records`,{headers})).json()
  const record=records.find((r:{id:string})=>r.id===recordRef.recordId)
  expect(record.content).toContain('反复抓挠')
  expect(record.sourceText).toBe('昨天小腿起了红点，老挠')
})

test('spoken no is interpreted only for the currently bound question',async({page,request},info)=>{
  await send(page,'孩子昨晚开始咳嗽')
  await expect(page.getByLabel('回答当前问题')).toBeVisible()
  await request.get(`http://127.0.0.1:4198/voice?text=${encodeURIComponent('没有')}`)
  await page.getByRole('button',{name:'改用语音',exact:true}).click()
  const hold=page.getByRole('button',{name:'按住说话',exact:true})
  await hold.focus();await page.keyboard.down('Space')
  await expect(page.getByRole('button',{name:'正在录音，松开即结束'})).toBeVisible()
  await page.waitForTimeout(900);await page.keyboard.up('Space')
  await expect(page.getByRole('button',{name:'保存记录',exact:true})).toBeEnabled()
  await expect(page.getByLabel('整理后的描述')).toContainText('家长未见孩子有明显呼吸费力')
  await expect(page.getByLabel('整理后的描述')).not.toContainText('没有呕吐')
  await page.screenshot({path:info.outputPath('voice-answer-summary.png')})
})

test('a useful specific question is still offered when extraction has no item yet',async({page,request})=>{
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:[]}})
  await page.getByLabel('对话输入').fill('身上有点东西')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.getByLabel('回答当前问题')).toBeVisible()
  await expect(page.getByRole('button',{name:'先记下来',exact:true})).toBeEnabled()
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'先记下来',exact:true}).click()
  await expect(page.getByText('原始描述已保留，暂未整理出可保存的记录。可以继续补充，也可以先保存原话。',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'先保存原话',exact:true})).toBeEnabled()
})
