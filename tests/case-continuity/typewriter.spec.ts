import { test, expect, devices, type Page, type APIRequestContext } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { quickNoteExamples } from '../../src/features/case-continuity/quickNoteExamples'

let token: string, userId: string, memberId: string
let fixtureSession: Awaited<ReturnType<APIRequestContext['storageState']>>
// Own fixture account: other spec files deliberately mutate legacy shared records.
// Keep real API loading in this suite, without mocking responses or hiding errors.
test.beforeAll(async ({ request }) => {
  await mkdir('outputs/home-review-20261005/local', { recursive: true })
  const registered = await request.post('/api/auth/register', { data: { nickname: '头部布局验收' + crypto.randomUUID().slice(0,8), password: 'fixture-layout-only-20261004', idempotencyKey: crypto.randomUUID() }, headers: { 'x-forwarded-for': '198.51.100.230' } })
  expect(registered.ok()).toBe(true)
  const session = await registered.json(); token = session.token; userId = session.user.id
  const member = await request.post('/api/members', { headers: { Authorization: `Bearer ${token}` }, data: { name: '布局验收（合成）', relationship: 'child', gender: 'female', birthday: '2025-01-01' } })
  expect(member.ok()).toBe(true); memberId = (await member.json()).id
  fixtureSession = await request.storageState()
})
async function initialize(page: Page) {
  await page.context().addCookies(fixtureSession.cookies)
  await page.addInitScript(({token,userId,memberId}) => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: userId }, currentMemberId: memberId, members: [], profile: null }, version: 5 })) }, {token,userId,memberId})
}
async function ready(page: Page) {
  await page.goto('/nurse-station')
  await expect(page.locator('.nurse-station-hero__main')).toBeVisible()
}
test('十条示例逐字输入/停留/整条清空/循环，375/390/430三行布局始终稳定',async({page})=>{
  test.setTimeout(240000)
  const measurements: unknown[] = []
  await initialize(page)
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page)
  const time=new Date();await page.clock.install({time});await page.clock.pauseAt(time)
  for(const width of [375,390,430]) {
    await page.setViewportSize({width,height:width===320?568:667});await page.emulateMedia({reducedMotion:'reduce'});await ready(page);await page.emulateMedia({reducedMotion:'no-preference'})
    const entry=page.locator('.continuity-record-entry'),example=entry.locator('.continuity-record-entry__example'),visible=example.locator('span')
    await expect(entry).toBeVisible();await expect(visible).toHaveText('')
    const metrics=()=>entry.evaluate(el=>{const action=el.querySelector('.continuity-record-entry__action')!.getBoundingClientRect(),copy=el.querySelector('.continuity-record-entry__copy')!.getBoundingClientRect(),rect=el.getBoundingClientRect();return {height:rect.height,actionX:action.x,actionY:action.y,copyWidth:copy.width,actionWidth:action.width}})
    const baseline=await metrics();expect(baseline.height).toBe(114)
    const surfaces = await entry.locator('.continuity-record-entry__buttons .hoho-button').evaluateAll(buttons => buttons.map(button => {
      const surface = getComputedStyle(button, '::before'), rect = button.getBoundingClientRect()
      return { paintedHeight: rect.height - parseFloat(surface.top) - parseFloat(surface.bottom), background: getComputedStyle(button).backgroundColor, pointerEvents: surface.pointerEvents }
    }))
    expect(surfaces).toEqual([{ paintedHeight: 36, background: 'rgba(0, 0, 0, 0)', pointerEvents: 'none' }, { paintedHeight: 36, background: 'rgba(0, 0, 0, 0)', pointerEvents: 'none' }])
    await expect(example).toHaveCSS('font-size','13px');await expect(example).toHaveCSS('line-height','22px');await expect(entry.locator('strong,.continuity-record-entry__header,a')).toHaveCount(0)
    await expect(entry.locator('input,textarea')).toHaveCount(0)
    await expect(entry.locator('.continuity-record-entry__record button,.continuity-record-entry__record a')).toHaveCount(0)
    const buttons=await entry.locator('.continuity-record-entry__buttons').evaluate(el=>[...el.children].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));expect(buttons[0].x).toBe(buttons[1].x);expect(buttons[0].width).toBe(buttons[1].width);expect(buttons[0].height).toBe(44);expect(buttons[1].height).toBe(44);expect(buttons[1].y-buttons[0].y-buttons[0].height).toBe(0)
    for(let index=0;index<quickNoteExamples.length;index++) {
      const text=quickNoteExamples[index];await expect(example).toHaveAttribute('data-typewriter-index',String(index))
      for(let length=1;length<=text.length;length++){await page.clock.runFor(50);await expect(visible).toHaveText(text.slice(0,length));expect(await metrics()).toEqual(baseline);const caret=await example.evaluate(el=>{const c=el.querySelector('i')!.getBoundingClientRect(),r=el.getBoundingClientRect();return {right:c.right,edge:r.right,bottom:c.bottom,boxBottom:r.bottom}});expect(caret.right).toBeLessThanOrEqual(caret.edge);expect(caret.bottom).toBeLessThanOrEqual(caret.boxBottom)}
      expect(await metrics()).toEqual(baseline)
      const fits=await example.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el.querySelector('span')!.firstChild!);const rects=[...range.getClientRects()],r=el.getBoundingClientRect();return {lines:rects.length,maxRight:Math.max(...rects.map(x=>x.right)),edge:r.right,textBottom:range.getBoundingClientRect().bottom,boxBottom:r.bottom,width:r.width,overflow:el.scrollHeight>el.clientHeight}})
      measurements.push({viewportWidth:width,index,...fits});expect(fits.lines).toBe(3);expect(fits.maxRight).toBeLessThanOrEqual(fits.edge);expect(fits.textBottom).toBeLessThanOrEqual(fits.boxBottom);expect(fits.overflow).toBe(false)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      if(index===0){await entry.scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/home-review-20261005/local/home-${width}.png`})}
      await page.clock.runFor(3499);await expect(visible).toHaveText(text)
      await page.clock.runFor(1);await expect(visible).toHaveText('')
      expect(await metrics()).toEqual(baseline)
      await page.clock.runFor(199);await expect(example).toHaveAttribute('data-typewriter-index',String(index));await expect(visible).toHaveText('')
      await page.clock.runFor(1);await expect(example).toHaveAttribute('data-typewriter-index',String((index+1)%10))
    }
  }
  await writeFile('outputs/home-review-20261005/local/thirty-full-example-measurements.json',JSON.stringify(measurements,null,2))
})

test('模拟后台暂停与恢复、减少动态效果及页面重挂载无计时叠加',async({page})=>{
  await initialize(page);await page.emulateMedia({reducedMotion:'reduce'});await ready(page);const time=new Date();await page.clock.install({time});await page.clock.pauseAt(time);await page.emulateMedia({reducedMotion:'no-preference'})
  const example=page.locator('.continuity-record-entry__example'),text=example.locator('span')
  await expect(text).toHaveText('');await page.clock.runFor(50);await expect(text).toHaveText('身')
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
  await expect(example).toHaveAttribute('data-typewriter-index','0');await page.clock.runFor(5000);await expect(text).toHaveText('身')
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))})
  await page.clock.runFor(50);await expect(text).toHaveText('身上')
  await page.emulateMedia({reducedMotion:'reduce'});await expect(text).toHaveText(quickNoteExamples[0]);await page.clock.runFor(10000);await expect(text).toHaveText(quickNoteExamples[0])
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.locator('.continuity-record-entry__record').click();await expect(page).toHaveURL(/\/smart-record$/);await page.clock.runFor(10000)
  await page.goBack();await expect(text).toHaveText('');await page.clock.runFor(49);await expect(text).toHaveText('');await page.clock.runFor(1);await expect(text).toHaveText('身')
})

test('框体四区域只跳转一次，首页示例不预填草稿、不唤起输入',async({page})=>{
  await initialize(page);await page.goto('/nurse-station');const entry=page.locator('.continuity-record-entry')
  await expect(entry).toBeVisible()
  await page.evaluate(()=>{const push=history.pushState.bind(history);(window as any).entryPushes=0;history.pushState=(...args)=>{(window as any).entryPushes++;return push(...args)}})
  for(const area of ['blank','example','action','keyboard']) {
    await page.evaluate(()=>{(window as any).entryPushes=0})
    expect(await entry.evaluate(el=>el.querySelector('input,textarea,[contenteditable=true]')===null)).toBe(true)
    if(area==='blank')await entry.locator('.continuity-record-entry__record').click({position:{x:5,y:5}})
    else if(area==='keyboard'){await entry.locator('.continuity-record-entry__record').focus();await page.keyboard.press('Enter')}
    else await entry.locator(area==='example'?'.continuity-record-entry__example':'.continuity-record-entry__action').click()
    await expect(page).toHaveURL(/\/smart-record$/)
    expect(await page.evaluate(()=>(window as any).entryPushes)).toBe(1)
    await expect(page.getByRole('textbox',{name:'哪里不舒服',exact:true})).toHaveValue('')
    await page.goBack();await expect(entry).toBeVisible()
  }
})

test('右侧下方跟进按钮独立，鼠标及键盘只跳转一次且默认跟进中',async({page})=>{
  await initialize(page);await page.goto('/nurse-station')
  const link=page.getByRole('button',{name:/^跟进列表/})
  await page.evaluate(()=>{const push=history.pushState.bind(history);(window as any).entryPushes=0;history.pushState=(...args)=>{(window as any).entryPushes++;return push(...args)}})
  for(const keyboard of [false,true]) {
    await page.evaluate(()=>{(window as any).entryPushes=0})
    if(keyboard){await link.focus();await page.keyboard.press('Enter')}else await link.click({position:{x:4,y:22}})
    await expect(page).toHaveURL(/\/cases$/);expect(await page.evaluate(()=>(window as any).entryPushes)).toBe(1)
    await expect(page.getByRole('tab',{name:/跟进中/})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('textbox',{name:'哪里不舒服',exact:true})).toHaveCount(0)
    await page.goBack();await expect(link).toBeVisible()
  }
})

test('实际节奏短录屏：输入、停留、整条清空及点击原流程',async({browser,baseURL})=>{
  const context=await browser.newContext({...devices['iPhone SE'],viewport:{width:375,height:667},baseURL,recordVideo:{dir:'outputs/home-review-20261005/local',size:{width:375,height:667}},serviceWorkers:'block'})
  const page=await context.newPage();await initialize(page);await page.goto('/nurse-station')
  await expect(page.locator('.continuity-record-entry')).toBeVisible()
  await expect(page.locator('.continuity-record-entry__example span')).toHaveText(quickNoteExamples[1],{timeout:20000})
  await page.locator('.continuity-record-entry__action').click();await expect(page).toHaveURL(/\/smart-record$/)
  await expect(page.getByRole('textbox',{name:'哪里不舒服',exact:true})).toHaveValue('')
  await context.close()
  await page.video()!.saveAs('outputs/home-review-20261005/local/typewriter-and-entry.webm')
})
