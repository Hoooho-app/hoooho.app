import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { TokenService } from '../../server/auth/token-service.mjs'
import { isProductPathVisible } from '../../shared/product-visibility.mjs'
const token = new TokenService('design-quality-e2e-secret', 3600000).create({id:'design-quality-account'})
test.beforeEach(async ({page}) => {
  await page.addInitScript(token => {
    sessionStorage.setItem('hoooho-auth-token',token)
    localStorage.setItem('hoooho-app', JSON.stringify({state:{authUser:{id:'design-quality-account'},currentMemberId:'design-quality-member',members:[],profile:null},version:5}))
    const host=window as Window & { appearanceColors: string[]; hooohoNativeAppearance:(color:string)=>void }
    host.appearanceColors=[]
    host.hooohoNativeAppearance=color=>host.appearanceColors.push(color)
  }, token)
})

test('every visible fixed route paints its edges and synchronizes browser and optional native surround',async({page},info)=>{
  const source=await readFile('src/app/router.tsx','utf8')
  const routes=[...new Set([...source.matchAll(/path: '([^']+)'/g)].map(x=>x[1]).filter(x=>!x.includes(':')&&!x.includes('*')&&!x.startsWith('/ops')&&isProductPathVisible(x)))]
  const coverage=[]; const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  for(const route of routes){
    await page.goto(route)
    await page.locator('main,.app-shell,.hoooho-onboarding').first().waitFor()
    await expect.poll(()=>page.evaluate(()=>document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content)).toMatch(/^#[0-9a-f]{6}$/)
    await expect.poll(()=>page.evaluate(()=>(window as Window & {appearanceColors:string[]}).appearanceColors.at(-1))).toBe(await page.locator('meta[name="theme-color"]').getAttribute('content'))
    const edges=await page.evaluate(()=>{
      const background=(element:Element|null):string=>{for(let node=element;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;if(color.startsWith('rgb('))return color}return 'none'}
      return {actual:location.pathname,top:background(document.elementFromPoint(2,1)),bottom:background(document.elementFromPoint(2,innerHeight-2))}
    })
    expect(edges.top,route).toBe(edges.bottom)
    expect(edges.top,route).not.toBe('none')
    coverage.push({route,...edges})
  }
  expect(errors).toEqual([])
  await info.attach('route-coverage.json',{body:JSON.stringify(coverage,null,2),contentType:'application/json'})
})

test('theme, welcome, overlay cancellation, viewport restoration and old-container fallback keep colors current',async({page},info)=>{
  await page.goto('/nurse-station')
  await expect(page.locator('.front-desk-welcome')).toBeVisible()
  await page.evaluate(()=>document.documentElement.dataset.careTheme='mist-blue')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#f0f4f5')
  await expect(page.locator('.hoho-bottom-navigation')).toHaveCSS('background-color','rgb(240, 244, 245)')
  const geometry=await page.locator('.hoho-bottom-navigation').boundingBox()
  expect(Math.abs(geometry!.y+geometry!.height-page.viewportSize()!.height)).toBeLessThanOrEqual(1)
  // A translucent modal scrim must extend to the native status-bar surround too.
  await page.evaluate(()=>{const layer=document.createElement('div');layer.id='appearance-scrim';layer.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5)';document.body.append(layer)})
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#787a7b')
  await page.evaluate(()=>document.getElementById('appearance-scrim')!.remove())
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#f0f4f5')
  await page.setViewportSize({width:375,height:430})
  await page.setViewportSize({width:375,height:667})
  await page.goto('/welcome')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#f3f0e7')
  await page.getByRole('button', {name:'第 2 页：看清经过',exact:true}).click()
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#09231b')
  await page.screenshot({path:info.outputPath('welcome-forest.png')})
  await page.goto('/health-profile')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#f4f2ed')
  await page.evaluate(()=>delete (window as Window & {hooohoNativeAppearance?:unknown}).hooohoNativeAppearance)
  await page.evaluate(()=>document.documentElement.dataset.careTheme='mist-blue')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#f0f4f5')
  await page.reload()
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#f4f2ed')
  await page.screenshot({path:info.outputPath('profile.png')})
})
