import {test,expect} from '@playwright/test'
import {useLegacyFrontProtocol} from '../helpers/front-protocol-compat'
import {TokenService} from '../../server/auth/token-service.mjs'

const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
test.beforeEach(async({page,request})=>{
  const response=await request.post('/api/members',{headers:{Authorization:`Bearer ${token}`},data:{name:'冷感流程（虚构）',relationship:'child',birthday:'2024-10-25'}})
  const member=await response.json()
  await request.get('http://127.0.0.1:4198/success')
  await request.get('http://127.0.0.1:4198/delay?ms=1000')
  await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}})
  await page.addInitScript(({token,memberId})=>{
    sessionStorage.setItem('hoooho-auth-token',token)
    localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))
  },{token,memberId:member.id})
  await page.goto('/smart-record?source=front-desk')
  await page.getByRole('button',{name:'改用文字'}).click()
})

test('[legacy protocol2] cold narrative asks relevant questions before the summary and offers equal record actions',async({page},info)=>{
  const legacy=await useLegacyFrontProtocol(page)
  await page.getByLabel('对话输入').fill('身体有点冷')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  const processing=page.locator('.front-desk-processing')
  await expect(processing).toContainText(/正在接收内容|正在整理这段话/)
  await expect(processing.locator('video')).toHaveCount(0)
  await expect(processing.getByRole('img',{name:'护护护士',exact:true})).toBeVisible()
  await expect(page.getByText(/是孩子自己说冷，还是你摸着觉得凉/)).toBeVisible()
  await legacy.assertContext()
  await expect(processing).toHaveCount(0)
  await expect(page.locator('.recognition-steps')).toHaveCount(0)
  await expect(page.locator('.smart-professional-summary')).toHaveCount(0)
  const actions=page.getByLabel('记录操作',{exact:true})
  await expect(actions).toHaveCount(0)
  await page.getByRole('button',{name:'摸着凉',exact:true}).click()
  await expect(page.getByText(/这种情况大概从什么时候开始，持续多久了/)).toBeVisible()
  await expect(actions).toHaveCount(0)
  await page.getByLabel('对话输入').fill('今天开始，持续了十分钟')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.smart-professional-summary')).toBeVisible()
  await expect(actions.getByRole('button',{name:'立即保存',exact:true})).toBeEnabled()
  await expect(actions.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
  for(const width of [320,375,390]){
    await page.setViewportSize({width,height:844})
    const sizes=await actions.locator('button').evaluateAll(elements=>elements.map(el=>({width:el.getBoundingClientRect().width,top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height,border:getComputedStyle(el).borderStyle})))
    expect(Math.abs(sizes[0].width-sizes[1].width)).toBeLessThan(1)
    expect(Math.abs(sizes[0].top-sizes[1].top)).toBeLessThan(1)
    expect(sizes.every(s=>s.height>=44&&s.border!=='none')).toBe(true)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
  await page.reload()
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
  await expect(page.locator('.nurse-turn--user')).toContainText(['身体有点冷','家长摸着孩子身体觉得凉。','今天开始，持续了十分钟'])
  await page.screenshot({path:info.outputPath('nurse-dialogue-ready.png')})
  await page.getByRole('button',{name:'核对记录',exact:true}).click()
  await expect(page.getByRole('heading',{name:'核对记录',exact:true})).toBeVisible()
})

test('reduced motion keeps a visible static nurse while real processing continues',async({page,request})=>{
  const reply='身体有点冷的描述收到了，可以先核对原话。'
  const unknown={kind:'unknown',memberId:null,label:null,sources:[]}
  await request.post('http://127.0.0.1:4198/front-reply-data',{data:{reply,contextId:'new',responseMode:'record',taskRelation:'new',subject:unknown,recordChanges:[{type:'add',targetId:null,text:'身体有点冷',scope:'record',polarity:'affirmed',subject:unknown,sources:[{messageId:'@latest',attachmentId:null,quote:'身体有点冷'}]}],nextQuestion:null,requestedAction:{type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''},uncertainties:[],emergency:{currentChild:false,quote:''}}})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.getByLabel('对话输入').fill('身体有点冷')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  const portrait=page.locator('.front-desk-processing__avatar')
  await expect(portrait).toBeVisible()
  expect(await portrait.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  await expect(page.locator('.front-desk-processing video')).toHaveCount(0)
  await expect(page.getByText(reply,{exact:true})).toBeVisible()
})
