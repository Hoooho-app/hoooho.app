import { test, expect, devices, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { quickNoteExamples } from '../../src/features/case-continuity/quickNoteExamples'

const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
async function initialize(page:Page) {
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))},token)
}

test('十条示例逐字输入/停留/删除/循环，375及320布局始终稳定',async({page})=>{
  test.setTimeout(120000)
  await initialize(page)
  const time=new Date();await page.clock.install({time});await page.clock.pauseAt(time)
  for(const width of [375,320]) {
    await page.setViewportSize({width,height:width===320?568:667});await page.goto('/nurse-station')
    const entry=page.locator('.continuity-record-entry'),example=entry.locator('.continuity-record-entry__example'),visible=example.locator('span')
    await expect(entry).toBeVisible();await expect(visible).toHaveText('')
    const metrics=()=>entry.evaluate(el=>{const action=el.querySelector('.continuity-record-entry__action')!.getBoundingClientRect(),copy=el.querySelector('.continuity-record-entry__copy')!.getBoundingClientRect(),rect=el.getBoundingClientRect();return {height:rect.height,actionX:action.x,actionY:action.y,copyWidth:copy.width,actionWidth:action.width}})
    const baseline=await metrics();expect(baseline.height).toBe(108)
    const style=await entry.locator('strong').evaluate(el=>getComputedStyle(el).fontSize);expect(style).toBe('14px')
    await expect(entry.locator('input,textarea')).toHaveCount(0)
    await expect(entry.locator('.continuity-record-entry__record button,.continuity-record-entry__record a')).toHaveCount(0)
    const header=await entry.locator('.continuity-record-entry__header').evaluate(el=>{const title=el.querySelector('strong')!,link=el.querySelector('a')!,t=title.getBoundingClientRect(),l=link.getBoundingClientRect();return {weight:getComputedStyle(title).fontWeight,linkSize:getComputedStyle(link).fontSize,titleRight:t.right,linkLeft:l.left,topDifference:Math.abs(t.y-(l.y+6))}})
    expect(header.weight).toBe('700');expect(header.linkSize).toBe(style);expect(header.titleRight).toBeLessThanOrEqual(header.linkLeft);expect(header.topDifference).toBeLessThan(1)
    for(let index=0;index<quickNoteExamples.length;index++) {
      const text=quickNoteExamples[index];await expect(example).toHaveAttribute('data-typewriter-index',String(index))
      for(let length=1;length<=text.length;length++){await page.clock.runFor(90);await expect(visible).toHaveText(text.slice(0,length))}
      expect(await metrics()).toEqual(baseline)
      const fits=await example.evaluate(el=>{const action=el.closest('button')!.querySelector('.continuity-record-entry__action')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el.querySelector('span')!);return {height:range.getBoundingClientRect().height,right:range.getBoundingClientRect().right,actionLeft:action.left,overflow:el.scrollHeight>el.clientHeight}})
      expect(fits.height).toBeLessThanOrEqual(44);expect(fits.right).toBeLessThanOrEqual(fits.actionLeft);expect(fits.overflow).toBe(false)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      if(index===3){await entry.scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/home-followup-header-20261004/local/home-${width}.png`})}
      await page.clock.runFor(2199);await expect(visible).toHaveText(text)
      await page.clock.runFor(1);await expect(visible).toHaveText(text)
      for(let length=text.length-1;length>=0;length--){await page.clock.runFor(45);await expect(visible).toHaveText(text.slice(0,length))}
      expect(await metrics()).toEqual(baseline)
      await page.clock.runFor(299);await expect(example).toHaveAttribute('data-typewriter-index',String(index));await expect(visible).toHaveText('')
      await page.clock.runFor(1);await expect(example).toHaveAttribute('data-typewriter-index',String((index+1)%10))
    }
  }
})

test('模拟后台暂停与恢复、减少动态效果及页面重挂载无计时叠加',async({page})=>{
  await initialize(page);const time=new Date();await page.clock.install({time});await page.clock.pauseAt(time);await page.goto('/nurse-station')
  const example=page.locator('.continuity-record-entry__example'),text=example.locator('span')
  await expect(text).toHaveText('');await page.clock.runFor(90);await expect(text).toHaveText('换')
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
  await expect(example).toHaveAttribute('data-typewriter-index','0');await page.clock.runFor(5000);await expect(text).toHaveText('换')
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))})
  await page.clock.runFor(90);await expect(text).toHaveText('换了')
  await page.emulateMedia({reducedMotion:'reduce'});await expect(text).toHaveText(quickNoteExamples[0]);await page.clock.runFor(10000);await expect(text).toHaveText(quickNoteExamples[0])
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.locator('.continuity-record-entry').click();await expect(page).toHaveURL(/\/smart-record$/);await page.clock.runFor(10000)
  await page.goBack();await expect(text).toHaveText('');await page.clock.runFor(89);await expect(text).toHaveText('');await page.clock.runFor(1);await expect(text).toHaveText('换')
})

test('框体四区域只跳转一次，首页示例不预填草稿、不唤起输入',async({page})=>{
  await initialize(page);await page.goto('/nurse-station');const entry=page.locator('.continuity-record-entry')
  await expect(entry).toBeVisible()
  await page.evaluate(()=>{const push=history.pushState.bind(history);(window as any).entryPushes=0;history.pushState=(...args)=>{(window as any).entryPushes++;return push(...args)}})
  for(const area of ['blank','title','example','action']) {
    await page.evaluate(()=>{(window as any).entryPushes=0})
    expect(await entry.evaluate(el=>el.querySelector('input,textarea,[contenteditable=true]')===null)).toBe(true)
    if(area==='blank')await entry.click({position:{x:5,y:5}})
    else if(area==='title'){const rect=(await entry.locator('strong').boundingBox())!;await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2)}
    else await entry.locator(area==='example'?'.continuity-record-entry__example':'.continuity-record-entry__action').click()
    await expect(page).toHaveURL(/\/smart-record$/)
    expect(await page.evaluate(()=>(window as any).entryPushes)).toBe(1)
    await expect(page.getByRole('textbox',{name:'哪里不舒服'})).toHaveValue('')
    await page.goBack();await expect(entry).toBeVisible()
  }
})

test('同排跟进列表是独立入口，鼠标及键盘均只跳转一次',async({page})=>{
  await initialize(page);await page.goto('/nurse-station')
  const link=page.getByRole('link',{name:'跟进列表',exact:true})
  await page.evaluate(()=>{const push=history.pushState.bind(history);(window as any).entryPushes=0;history.pushState=(...args)=>{(window as any).entryPushes++;return push(...args)}})
  for(const keyboard of [false,true]) {
    await page.evaluate(()=>{(window as any).entryPushes=0})
    if(keyboard){await link.focus();await page.keyboard.press('Enter')}else await link.click()
    await expect(page).toHaveURL(/\/cases$/);expect(await page.evaluate(()=>(window as any).entryPushes)).toBe(1)
    await expect(page.getByRole('textbox',{name:'哪里不舒服'})).toHaveCount(0)
    await page.goBack();await expect(link).toBeVisible()
  }
})

test('实际节奏短录屏：输入、停留、删除及点击原流程',async({browser})=>{
  const context=await browser.newContext({...devices['iPhone SE'],baseURL:'http://127.0.0.1:4196',recordVideo:{dir:'outputs/home-followup-header-20261004/local',size:{width:375,height:667}},serviceWorkers:'block'})
  const page=await context.newPage();await initialize(page);await page.goto('/nurse-station')
  await expect(page.locator('.continuity-record-entry')).toBeVisible()
  await expect(page.locator('.continuity-record-entry__example span')).toHaveText(quickNoteExamples[1],{timeout:12000})
  await page.locator('.continuity-record-entry__action').click();await expect(page).toHaveURL(/\/smart-record$/)
  await expect(page.getByRole('textbox',{name:'哪里不舒服'})).toHaveValue('')
  await context.close()
  await page.video()!.saveAs('outputs/home-followup-header-20261004/local/typewriter-and-entry.webm')
})
