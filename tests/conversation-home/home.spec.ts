import { test as base, expect, chromium } from '@playwright/test'
// A separate browser per flow also supports Chromium's single-process fallback.
const test=base.extend({page:async({launchOptions,baseURL},use)=>{const browser=await chromium.launch(launchOptions);const page=await browser.newPage({baseURL,viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'});try{await use(page)}finally{await browser.close()}}})
import sharp from 'sharp'
import { TokenService } from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string

test.beforeEach(async({page,request})=>{
 const response=await request.post('/api/members',{headers,data:{name:'小禾（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'}})
 expect(response.ok()).toBe(true);memberId=(await response.json()).id
 await request.get('http://127.0.0.1:4198/success')
 await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}));let calls=0;Object.defineProperty(window,'__speechCalls',{get:()=>calls});if(window.speechSynthesis)window.speechSynthesis.speak=()=>{calls++}},{token,memberId})
 await page.goto('/nurse-station')
 await expect(page.getByRole('heading',{name:/护护/})).toBeVisible()
 await expect(page.getByLabel('对话输入')).toBeEnabled()
})

async function startNew(page:import('@playwright/test').Page){
 await page.getByRole('button',{name:'更多操作',exact:true}).click()
 await page.getByRole('menuitem',{name:'新建对话',exact:true}).click()
 await expect(page.getByLabel('对话输入')).toHaveValue('')
 await expect(page.getByLabel('对话输入')).toBeEnabled()
}

test('real home keeps reception, five original entries and full clean navigation at mobile and shell widths',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await expect(page.locator('.hoho-reception video')).toHaveAttribute('src',/nurse-station-idle-1/)
 for(const width of [320,375,390,430,620,1280]){
  await page.setViewportSize({width,height:932})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  const buttons=page.locator('.record-entry-grid>button')
  expect(await buttons.allTextContents()).toEqual(['记录症状','喂养/饮食','日常','用药','就诊资料'])
  for(const button of await buttons.all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.locator('.hoho-reception video').evaluate(e=>getComputedStyle(e).objectFit)).toBe('contain')
  if(width===390){expect((await page.locator('.hoho-reception').boundingBox())!.width).toBe(358);expect((await page.locator('.hoho-reception video').boundingBox())!.width).toBe(112)}
 }
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:info.outputPath('home.png')})
 await page.getByRole('button',{name:'日常',exact:true}).click()
 await expect(page.getByRole('group',{name:'记录日常选项'})).toBeVisible()
 expect(await page.getByRole('group',{name:'记录日常选项'}).getByRole('button').allTextContents()).toEqual(['睡眠','排便'])
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'更多操作',exact:true}).click()
 expect(await page.getByRole('menu',{name:'对话操作'}).getByRole('menuitem').allTextContents()).toEqual(['新建对话','分享护护','产品介绍'])
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 const drawer=page.getByRole('dialog',{name:'侧边栏菜单'})
 for(const label of ['服务前台','健康日历','孩子档案','一键整理','对话记录','呵护之旅','辅助工具','产品中心'])await expect(drawer.getByRole('button',{name:label,exact:true})).toBeVisible()
 await drawer.getByRole('button',{name:'辅助工具',exact:true}).click()
 for(const label of ['忌口卡','排敏观察','配料表扫描','用药安排','照顾交接单'])await expect(drawer.getByRole('button',{name:label,exact:true})).toBeVisible()
 await drawer.getByRole('button',{name:'产品中心',exact:true}).click()
 for(const label of ['设置','帮助','反馈','关于'])await expect(drawer.getByRole('button',{name:label,exact:true})).toBeVisible()
 await page.screenshot({path:info.outputPath('sidebar.png')})
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'快速查找',exact:true}).click()
 await expect(page).toHaveURL(/quick-search/)
 expect(errors).toEqual([])
})

test('new conversation survives reload and exposes submitted originals and unsent drafts in history',async({page},info)=>{
 const raw='昨天脸颊有点红'
 await page.getByLabel('对话输入').fill(raw)
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
 await page.screenshot({path:info.outputPath('chat.png')})
 await startNew(page)
 await page.reload();await expect(page.getByLabel('对话输入')).toBeEnabled();await expect(page.getByLabel('对话输入')).toHaveValue('')
 await page.getByLabel('对话输入').fill('还没发送的饮食观察')
 await startNew(page)
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 await page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'对话记录',exact:true}).click()
 await expect(page).toHaveURL(/conversation-history$/)
 await expect(page.getByRole('button').filter({hasText:raw})).toBeVisible()
 await expect(page.getByRole('button').filter({hasText:'还没发送的饮食观察'})).toBeVisible()
 await page.getByRole('button').filter({hasText:raw}).click()
 await expect(page.locator('.nurse-turn--user')).toContainText(raw)
 await expect(page.getByRole('button',{name:'回到当前对话',exact:true})).toBeVisible()
 await page.screenshot({path:info.outputPath('history-detail.png')})
 expect(await page.evaluate(()=>(window as any).__speechCalls)).toBe(0)
})

test('real review edits a field, saves through the original pipeline and opens the exact record',async({page},info)=>{
 await page.getByLabel('对话输入').fill('昨天脸颊有点红')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.getByRole('button',{name:'核对记录',exact:true}).click()
 await expect(page.getByRole('heading',{name:'核对记录',exact:true})).toBeVisible()
 await page.getByRole('button',{name:/编辑.*的名称/}).click()
 await page.getByRole('dialog').getByRole('textbox',{name:'症状',exact:true}).fill('脸颊观察')
 await page.getByRole('button',{name:'确定',exact:true}).click()
 await page.screenshot({path:info.outputPath('review.png')})
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect(page.getByRole('button',{name:'查看',exact:true})).toBeVisible()
 await expect(page.getByLabel('对话输入')).toBeEnabled()
 await expect(page.locator('.record-entry-grid>button')).toHaveCount(5)
 await page.getByRole('button',{name:'查看',exact:true}).click()
 await expect(page).toHaveURL(/recordId=/)
 await expect(page.getByRole('dialog')).toBeVisible()
 expect(await page.evaluate(()=>(window as any).__speechCalls)).toBe(0)
})

test('leaving with unsent input keeps the existing draft guard and restores the input',async({page})=>{
 await page.getByLabel('对话输入').fill('尚未提交的观察，先查一下资料')
 await page.getByRole('button',{name:'快速查找',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'退出智能记录'})
 await expect(dialog).toBeVisible()
 await dialog.getByRole('button',{name:'保存草稿并退出',exact:true}).click()
 await expect(page).toHaveURL(/quick-search/)
 await page.goBack()
 await expect(page.getByLabel('对话输入')).toHaveValue('尚未提交的观察，先查一下资料')
})


test('failed recording survives refresh, retries and remains readable after a new conversation',async({page,request})=>{
 await request.get('http://127.0.0.1:4198/failure')
 await page.getByRole('button',{name:'改用语音',exact:true}).click()
 const hold=page.getByRole('button',{name:'按住说话',exact:true})
 await hold.focus();await page.keyboard.down('Space')
 await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible()
 await page.waitForTimeout(650);await page.keyboard.up('Space')
 await expect(page.getByRole('button',{name:/^重试$|^重试未完成的转写$/})).toBeVisible()
 await page.reload()
 await expect(page.getByRole('button',{name:/^重试$|^重试未完成的转写$/})).toBeVisible()
 await request.get('http://127.0.0.1:4198/success')
 await page.getByRole('button',{name:/^重试$|^重试未完成的转写$/}).click()
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
 await startNew(page)
 await page.getByLabel('对话输入').fill('另一段对话：今天吃了一碗粥')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 await page.getByRole('dialog',{name:'侧边栏菜单'}).getByRole('button',{name:'对话记录',exact:true}).click()
 await page.getByRole('button',{name:'保存草稿并退出',exact:true}).click()
 await page.locator('.conversation-history-list button').filter({hasText:'本机草稿'}).filter({hasText:'今天没有呕吐'}).click()
 await expect(page.getByLabel('语音原件')).toBeVisible()
 await expect(page.locator('.nurse-conversation')).not.toContainText('另一段对话：今天吃了一碗粥')
 await page.getByRole('button',{name:'回到当前对话',exact:true}).click()
 await expect(page.locator('.nurse-conversation')).toContainText('另一段对话：今天吃了一碗粥')
})

test('plus retains the original image upload and feeding label opens its original form',async({page})=>{
 const png=await sharp({create:{width:96,height:96,channels:3,background:'#eeccaa'}}).png().toBuffer()
 const chooser=page.waitForEvent('filechooser')
 await page.getByRole('button',{name:'添加图片',exact:true}).click()
 await(await chooser).setFiles({name:'合成观察.png',mimeType:'image/png',buffer:png})
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
 await expect(page.getByRole('img',{name:'合成观察.png',exact:true})).toBeVisible()
 await startNew(page)
 await page.getByRole('button',{name:'喂养/饮食',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'喂养/饮食',exact:true})).toBeVisible()
})


