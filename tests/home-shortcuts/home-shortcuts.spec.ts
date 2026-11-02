import {test,expect,type Page} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const accountId='time-view-test-account',token=new TokenService('time-view-e2e-local-only-secret',3600_000).create({id:accountId})
const labels=['记录症状','回传就诊资料','记载用药','喂养与饮食','睡眠','排便']
const titles=['记录症状','就诊资料','记录用药','喂养/饮食','记录睡眠','记录排便']
async function prepare(page:Page){
  page.on('pageerror',error=>{throw error})
  await page.addInitScript(({token,accountId})=>{
    sessionStorage.setItem('hoooho-auth-token',token)
    if(!sessionStorage.getItem('six-entry-fixture')){
      localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:'child-two',members:[],profile:null},version:5}))
      sessionStorage.setItem('six-entry-fixture','1')
    }
  },{token,accountId})
  await page.goto('/nurse-station')
  await page.getByRole('button',{name:'改用文字',exact:true}).click()
  return page.getByRole('group',{name:'记录入口',exact:true})
}
for(const [width,height] of [[320,667],[375,667],[430,844],[1024,900],[375,360]])test(`six shortcuts scroll locally and open original forms at ${width}x${height}`,async({page},info)=>{
  await page.setViewportSize({width,height})
  const group=await prepare(page)
  await expect(group.getByRole('button')).toHaveText(labels)
  expect(await group.getByRole('button').evaluateAll(nodes=>nodes.map(el=>el.getAttribute('data-ha-choice')))).toEqual(['symptom','materials','medication','diet','sleep','elimination'])
  await expect(page.getByRole('button',{name:'日常',exact:true})).toHaveCount(0)
  await expect(page.locator('.daily-record-options')).toHaveCount(0)
  const buttons=await group.getByRole('button').evaluateAll(nodes=>nodes.map(el=>({y:el.getBoundingClientRect().y,height:el.getBoundingClientRect().height,color:getComputedStyle(el).backgroundColor,full:el.scrollWidth<=el.clientWidth})))
  expect(new Set(buttons.map(x=>x.y)).size).toBe(1)
  expect(new Set(buttons.map(x=>x.color)).size).toBe(6)
  expect(buttons.every(x=>x.height===44&&x.full)).toBe(true)
  const nav=page.getByRole('navigation',{name:'主要导航',exact:true})
  const before=await nav.boundingBox()
  const cdp=await page.context().newCDPSession(page)
  const rect=(await group.boundingBox())!
  if(width<600){
    expect(await group.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width-35,y:rect.y+22}]})
    for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width-35-i*22,y:rect.y+22}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await expect.poll(()=>group.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
    expect(await nav.boundingBox()).toEqual(before)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await group.getByRole('button',{name:'排便',exact:true}).focus()
    await expect(group.getByRole('button',{name:'排便',exact:true})).toBeInViewport()
    await group.getByRole('button',{name:'记录症状',exact:true}).focus()
    await expect(group.getByRole('button',{name:'记录症状',exact:true})).toBeInViewport()
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('six-shortcuts.png')})
  await page.getByLabel('对话输入',{exact:true}).fill('这段观察尚未发送')
  let writes=0
  page.on('request',r=>{if(r.method()!=='GET'&&/\/api\/(quick-records|records|events)(\/|$)/.test(new URL(r.url()).pathname))writes++})
  for(let i=0;i<labels.length;i++){
    await group.getByRole('button',{name:labels[i],exact:true}).click()
    const form=page.getByRole('dialog',{name:titles[i],exact:true})
    await expect(form).toBeVisible()
    await form.getByRole('button',{name:/^返回/}).click()
    await expect(form).toHaveCount(0)
    await expect(page).toHaveURL(/nurse-station$/)
    await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue('这段观察尚未发送')
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hoooho-app')!).state.currentMemberId)).toBe('child-two')
  }
  expect(writes).toBe(0)
  await page.getByRole('button',{name:'改用语音',exact:true}).click()
  await expect(group).toHaveCount(0)
  await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await expect(group.getByRole('button')).toHaveText(labels)
  await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue('这段观察尚未发送')
  await page.reload()
  await expect(group.getByRole('button')).toHaveText(labels)
  await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue('这段观察尚未发送')
})
