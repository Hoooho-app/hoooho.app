import {test as base,expect,chromium,type Page,type Locator} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const test=base.extend({page:async({launchOptions,baseURL},use)=>{const browser=await chromium.launch(launchOptions);const page=await browser.newPage({baseURL,viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'});try{await use(page)}finally{await browser.close()}}})
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string

test.beforeEach(async({page,request},info)=>{
 if(info.title.startsWith('login')){await page.addInitScript(()=>localStorage.setItem('hoooho:welcome:seen:v1','true'));return}
 const created=await request.post('/api/members',{headers,data:{name:'浅色视觉（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'}})
 expect(created.ok()).toBe(true);memberId=(await created.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
})
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
async function readable(locator:Locator){
 const colors=await locator.evaluate(e=>{
  const parse=(s:string)=>s.match(/[\d.]+/g)!.map(Number)
  const ancestors:Element[]=[];for(let n:Element|null=e;n;n=n.parentElement)ancestors.unshift(n)
  let bg=[255,255,255]
  for(const n of ancestors){const c=parse(getComputedStyle(n).backgroundColor),alpha=c[3]??1;bg=bg.map((v,i)=>c[i]*alpha+v*(1-alpha))}
  return {fg:parse(getComputedStyle(e).color).slice(0,3),bg}
 })
 const lum=(rgb:number[])=>rgb.map(c=>{const s=c/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0)
 const a=lum(colors.fg),b=lum(colors.bg)
 expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5)
}

test('clean light canvas and light surfaces cover navigation, forms and shared pages',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/nurse-station');await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
 expect(await page.locator('.smart-record-home').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(244, 242, 237)')
 expect(await page.locator('.smart-record-home').evaluate(e=>getComputedStyle(e).backgroundImage)).toBe('none')
 await readable(page.getByRole('button',{name:'切换记录对象',exact:true}).first());await readable(page.getByRole('button',{name:'按住记录症状',exact:true}))
 await page.screenshot({path:info.outputPath('home-390.png')})
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'侧边栏菜单'}).getByText('辅助工具',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'健康日历',exact:true})).toHaveCount(0)
 await readable(page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'反馈',exact:true}))
 await page.screenshot({path:info.outputPath('drawer-390.png')})
 await page.keyboard.press('Escape')
 for(const [entry,form] of [['记录症状','记录症状'],['喂养与饮食','喂养/饮食'],['用药','记录用药'],['治疗复诊','就诊资料']]){
  await page.goto('/nurse-station');await page.getByRole('button',{name:'改用文字',exact:true}).click();if(entry==='喂养与饮食')await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('button',{name:entry,exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible();await noOverflow(page)
  await readable(page.getByRole('dialog').locator('header h1').first());await readable(page.getByRole('dialog').locator('header>button').first())
  await page.screenshot({path:info.outputPath(`form-${entry.replace('/','-')}.png`)})
  await page.keyboard.press('Escape')
 }
 for(const entry of ['睡眠','排便']){
  await page.goto('/nurse-station');await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('button',{name:entry,exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible();await readable(page.getByRole('dialog').locator('header h1'));await readable(page.getByRole('dialog').locator('header>button').first());await noOverflow(page)
  if(entry==='排便')await readable(page.locator('.bowel-fieldset>legend').first())
  await page.screenshot({path:info.outputPath(`form-${entry}.png`)})
 }
 for(const path of ['/health-events?view=day','/health-events?view=month','/health-profile','/health-profile/growth','/health-profile/basic','/health-profile/allergy','/conversation-history','/quick-search','/recent-review','/settings','/help','/about','/account/security']){
  await page.goto(path);await expect(page.locator('.app-shell:not(.session-recovery-screen)')).toBeVisible();await noOverflow(page)
  if(path==='/health-profile')await readable(page.getByRole('heading',{name:'孩子档案',exact:true}))
  if(path==='/health-profile/growth')await readable(page.locator('.growth-empty-state p'))
  if(path==='/health-profile/basic'){await readable(page.getByRole('tab',{name:'身高曲线',exact:true}));await page.getByRole('button',{name:/— cm/}).click();await page.getByLabel('手动编辑身高 cm').fill('82.0');await page.getByLabel('手动编辑身高 cm').blur();await page.getByRole('button',{name:/— kg/}).click();await page.getByLabel('手动编辑体重 kg').fill('11.0');await page.getByLabel('手动编辑体重 kg').blur();await page.getByRole('button',{name:'保存本次更新',exact:true}).click();await expect(page.locator('.growth-chart-record')).toHaveCount(1)}
  await page.screenshot({path:info.outputPath(path.replace(/[^a-z0-9]/gi,'-')+'.png')})
 }
 for(const width of [375,430,1280]){await page.setViewportSize({width,height:844});await page.goto('/nurse-station');await noOverflow(page);await page.screenshot({path:info.outputPath(`home-${width}.png`)})}
 expect(errors).toEqual([])
})

test('login keeps readable light form above the global light canvas',async({page},info)=>{
 await page.goto('/login');await expect(page.getByRole('heading',{name:'欢迎使用 Hoooho',exact:true})).toBeVisible()
 await readable(page.getByRole('heading').first());await readable(page.getByRole('button',{name:'登录',exact:true}));await noOverflow(page)
 await page.screenshot({path:info.outputPath('login-390.png')})
})
