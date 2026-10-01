import {expect,test,type Page,type Locator} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {TokenService} from '../../server/auth/token-service.mjs'
export const accountId='body-locator-test-account'
export const token=()=>new TokenService('body-locator-local-test-only',3600000).create({id:accountId})
export const picker=(page:Page)=>page.getByRole('dialog',{name:'身体部位定位器',exact:true})
export async function isolateLiveApi(page:Page) {
  if(!process.env.BODY_BASE_URL)return
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),headers={...route.request().headers()}
    if(headers.origin)headers.origin='http://127.0.0.1:4197'
    if(headers.referer){const ref=new URL(headers.referer);headers.referer=`http://127.0.0.1:4197${ref.pathname}${ref.search}`}
    const response=await page.request.fetch(`http://127.0.0.1:4197${url.pathname}${url.search}`,{method:route.request().method(),headers,data:route.request().postData()??undefined})
    await route.fulfill({response})
  })
}
export async function prepare(page:Page,child='body-girl') {
  const memberId=`${child}-${test.info().project.name}`,authToken=token()
  await isolateLiveApi(page)
  page.on('pageerror',error=>{throw error})
  await page.addInitScript(({authToken,memberId,accountId})=>{
    sessionStorage.setItem('hoooho-auth-token',authToken)
    if(!sessionStorage.getItem('body-locator-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}));sessionStorage.setItem('body-locator-initialized','true')}
  },{authToken,memberId,accountId})
  await page.goto('/health-events');await page.getByRole('button',{name:'记一下',exact:true}).click();await page.getByRole('dialog',{name:'记一下',exact:true}).getByRole('button',{name:'记录症状',exact:true}).click()
  const form=page.getByRole('dialog',{name:'记录症状',exact:true});await expect(form).toBeVisible();return form
}
export async function global(page:Page) {
  const p=picker(page)
  if(await p.getByRole('button',{name:'返回全身',exact:true}).count())await p.getByRole('button',{name:'返回全身',exact:true}).click()
  await p.locator('.locator-stage').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
}
export async function openRegion(page:Page,id:string) {
  await global(page)
  const p=picker(page),category=id.replace(/_(left|right)$/,''),side=id.match(/_(left|right)$/)?.[1]
  const entry=p.locator(`[data-region-id="${category}"]`)
  if(await entry.count())await entry.click()
  else{await p.getByRole('button',{name:'更多部位',exact:true}).click();await page.getByRole('dialog',{name:'更多部位',exact:true}).locator(`[data-region-id="${category}"]`).click()}
  if(side)await p.getByRole('group',{name:'选择左右',exact:true}).getByRole('button').nth(side==='left'?0:1).click()
}
export async function choose(page:Page,id:string) {
  const p=picker(page),button=p.locator(`[data-location-id="${id}"]`)
  await p.locator('.locator-stage').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  if(await button.count()){await button.click();return}
  await p.getByRole('button',{name:'用文字选择',exact:true}).click()
  await page.getByRole('dialog',{name:'用文字选择',exact:true}).locator(`[data-location-id="${id}"]`).click()
  await page.keyboard.press('Escape')
}
export async function complete(page:Page) {await picker(page).getByRole('button',{name:/完成并返回症状记录|完成，暂不选择/}).click();await expect(picker(page)).toHaveCount(0)}
export async function screenshot(page:Page,name:string) {
  const dir=`outputs/body-locator/${process.env.BODY_EVIDENCE||'v2'}/${test.info().project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/${name}.png`})
}
export async function noOverflow(page:Page,p:Locator) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(await p.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  const footer=await p.locator('.hoho-bottom-sheet__footer').boundingBox()
  expect(footer!.y+footer!.height).toBeLessThanOrEqual((await page.evaluate(()=>innerHeight))+1)
}
