import {test,expect,type Page} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`},control='http://127.0.0.1:4198'
let memberId:string
test.beforeEach(async({page,request})=>{
  const response=await request.post('/api/members',{headers,data:{name:'小禾（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'}})
  expect(response.ok()).toBe(true);memberId=(await response.json()).id
  await request.get(`${control}/success`);await request.get(`${control}/delay?ms=300`)
  await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
  await page.route('**/api/ai/audio/live**',route=>route.abort())
  await page.goto('/nurse-station')
  await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
})
async function type(page:Page,text:string){await page.getByRole('button',{name:'改用文字',exact:true}).click();await page.getByLabel('对话输入',{exact:true}).fill(text)}
async function record(page:Page){await page.getByRole('button',{name:'按住记录症状',exact:true}).focus();await page.keyboard.down('Space');await expect(page.getByRole('button',{name:'正在录音，松开即结束',exact:true})).toBeVisible();await page.waitForTimeout(800)}
async function home(page:Page){await page.getByRole('navigation',{name:'主要导航'}).getByRole('button',{name:'症状记录',exact:true}).click();await expect(page.locator('.hoho-dialogue-composer')).toBeVisible()}

test('unsent input switches without a prompt, appears in the sidebar and reopens without being sent',async({page,request},info)=>{
  const text='昨晚睡得不安稳，这段还没发送'
  await type(page,text)
  for(const target of ['孩子档案','健康日历']){
    await page.getByRole('navigation',{name:'主要导航'}).getByRole('button',{name:target,exact:true}).click()
    await expect(page).toHaveURL(target==='孩子档案'?/\/health-profile$/:/\/health-events(?:\?|$)/)
    await expect(page.getByRole('dialog',{name:'退出智能记录',exact:true})).toHaveCount(0)
    await home(page);await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue(text)
  }
  await page.getByRole('button',{name:'快速查找',exact:true}).click();await expect(page).toHaveURL(/quick-search/)
  await page.goBack();await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue(text)
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  const drawer=page.getByRole('dialog',{name:'侧边栏菜单'})
  // Sidebar labels are compact keywords; the opened draft must still retain the full original below.
  await drawer.locator('.drawer-history-open').filter({hasText:'昨晚睡得不安稳'}).click()
  await expect(page).toHaveURL(/conversation-history\?draft=/)
  await expect(page.locator('.nurse-turn--user')).toContainText(text)
  await page.getByRole('button',{name:'继续此对话',exact:true}).click()
  await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue(text)
  await page.reload();await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue(text)
  const context=await(await request.get(`/api/members/${memberId}/front-desk-record`,{headers})).json()
  expect(context).toBeNull()
  await page.screenshot({path:info.outputPath('autosaved-unsent-home.png')})
})

test('released voice shows only loading and its accepted task survives a page switch without a duplicate',async({page,request},info)=>{
  await request.get(`${control}/delay?ms=2600`)
  const accepted=page.waitForResponse(r=>r.url().endsWith('/recognition-jobs')&&r.request().method()==='POST')
  await record(page);await page.keyboard.up('Space')
  const bubble=page.locator('.nurse-turn--user .nurse-turn-content').first()
  await expect(bubble.getByRole('status')).toBeVisible()
  await expect(bubble).toHaveText('')
  await expect(bubble.locator('svg')).toHaveCount(1)
  await page.screenshot({path:info.outputPath('voice-loading-only.png')})
  const job=await(await accepted).json()
  await page.getByRole('navigation',{name:'主要导航'}).getByRole('button',{name:'孩子档案',exact:true}).click()
  await expect(page).toHaveURL(/health-profile$/);await home(page)
  await expect.poll(async()=>{const value=await(await request.get(`/api/members/${memberId}/recognition-jobs/${job.id}`,{headers})).json();return value.inputStates?.[0]?.status},{timeout:30000}).toBe('completed')
  await expect(page.locator('.nurse-turn--user p').first()).not.toBeEmpty()
  const current=await(await request.get(`/api/members/${memberId}/recognition-jobs/${job.id}`,{headers})).json()
  expect(current.inputStates).toHaveLength(1)
  await page.reload();await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
})

test('leaving during recording retains original bytes before immediate reentry',async({page})=>{
  await record(page)
  await page.getByRole('navigation',{name:'主要导航'}).getByRole('button',{name:'孩子档案',exact:true}).click()
  await page.keyboard.up('Space');await expect(page).toHaveURL(/health-profile$/)
  await home(page)
  await expect.poll(()=>page.evaluate(async memberId=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    try{return await new Promise<number>((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(`home-smart:visit-test:${memberId}:new`);r.onsuccess=()=>resolve(r.result?.files?.filter((f:any)=>f.type.startsWith('audio/')).reduce((n:number,f:any)=>n+(f.bytes?.byteLength??f.size??0),0)??0);r.onerror=()=>reject(r.error)})}finally{db.close()}
  },memberId)).toBeGreaterThan(300)
  await expect(page.getByRole('dialog',{name:'退出智能记录',exact:true})).toHaveCount(0)
})

test('failed voice has two compact actions on one row and retries the same task',async({page,request},info)=>{
  await page.setViewportSize({width:320,height:667});await request.get(`${control}/failure`)
  await record(page);await page.keyboard.up('Space')
  const actions=page.locator('.nurse-turn--user .front-desk-failed-actions')
  await expect(actions.getByRole('button')).toHaveText(['重试','移除'])
  const positions=await actions.getByRole('button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().y))
  expect(Math.abs(positions[0]-positions[1])).toBeLessThan(1)
  await page.screenshot({path:info.outputPath('voice-failure-two-actions.png')})
  const before=await(await request.get(`/api/members/${memberId}/recognition-jobs`,{headers})).json()
  await request.get(`${control}/success`)
  await actions.getByRole('button',{name:'重试',exact:true}).click()
  await expect(actions).toHaveCount(0)
  const after=await(await request.get(`/api/members/${memberId}/recognition-jobs`,{headers})).json()
  expect(after.id).toBe(before.id);expect(after.inputStates).toHaveLength(1)
})

test('camera opens a system chooser directly; native cancellation retains input without opening another chooser',async({page},info)=>{
  const selected=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
  const input=(await selected).element()
  expect(await input.getAttribute('accept')).toContain('video/mp4')
  expect(await input.getAttribute('accept')).toContain('application/pdf')
  await expect(page.getByRole('dialog',{name:'添加附件',exact:true})).toHaveCount(0)
  await type(page,'选择附件前输入的补充')
  await page.evaluate(()=>{window.hooohoNativeAttachments=async()=>{throw new DOMException('已取消','AbortError')}})
  let extraChoosers=0;page.on('filechooser',()=>extraChoosers++)
  await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
  await expect(page.getByLabel('对话输入')).toHaveValue('选择附件前输入的补充')
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(extraChoosers).toBe(0)
  await page.screenshot({path:info.outputPath('attachment-cancel-keeps-input.png')})
})
