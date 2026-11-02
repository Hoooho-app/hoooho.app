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

test('live speech occupies the latest timeline bubble behind lowered translucent feedback',async({page},info)=>{
  await type(page,'孩子今天手背有点红。'.repeat(50));await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.nurse-turn--assistant').last()).toBeVisible()
  await page.getByRole('button',{name:'改用语音',exact:true}).click()
  let text='',revision=1,submitted=0
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/recognition-jobs'))submitted++})
  await page.unroute('**/api/ai/audio/live**')
  await page.route('**/api/ai/audio/live',route=>route.fulfill({json:{id:'preview-test',state:'listening',text:'',revision:1,sequence:0}}))
  await page.route('**/api/ai/audio/live/*',route=>route.fulfill({json:{id:'preview-test',state:route.request().method()==='DELETE'?'closed':'listening',text,revision,sequence:0}}))
  const hold=page.getByRole('button',{name:'按住记录症状',exact:true}),history=await page.locator('.nurse-turn--user').count()
  const rect=(await hold.boundingBox())!
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down()
  const feedback=page.locator('.hoho-hold-feedback'),preview=page.locator('.front-desk-live-voice'),copy=preview.getByLabel('正在说的话',{exact:true}),body=page.locator('.smart-record-page__body')
  await expect(preview).toBeVisible();await expect(copy).toHaveText('')
  await expect(page.locator('.hoho-dialogue-composer')).toHaveCSS('opacity','0')
  await expect(feedback.locator('.hoho-hold-feedback__transcript')).toHaveCount(0)
  expect(await preview.evaluate(e=>e.parentElement?.lastElementChild===e)).toBe(true)
  expect(await preview.evaluate(e=>!!e.closest('.smart-record-page__body'))).toBe(true)
  const node=await preview.elementHandle()
  text='孩子今天有点咳嗽';revision++;await expect(copy).toHaveText(text)
  text='孩子今天咳了两声，现在精神还好';revision++;await expect(copy).toHaveText(text)
  expect(await node!.evaluate(e=>e.isConnected)).toBe(true)
  await expect(feedback).not.toContainText('正在录音');await expect(feedback).not.toContainText('正在听你说')
  await expect(page.locator('.hoho-hold-feedback__time')).toContainText(/0:0[1-9]/)
  expect(await preview.locator('.nurse-turn-content').evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))).toEqual({background:'rgb(255, 255, 255)',color:'rgb(39, 51, 50)'})
  for(const size of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
    await page.setViewportSize(size)
    await expect.poll(async()=>{const bubble=(await preview.boundingBox())!,controls=(await feedback.locator('.hoho-hold-feedback__status').boundingBox())!;return bubble.y+bubble.height<=controls.y}).toBe(true)
    const bounds=(await preview.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(size.width)
    expect(await preview.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true)
    await page.screenshot({path:info.outputPath(`timeline-live-${size.width}.png`)})
  }
  await page.mouse.move(100,0);await expect(feedback).toContainText('松开取消')
  await expect(copy).toHaveText(text)
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await expect(feedback).not.toContainText('松开取消')
  text='孩子今天有点咳嗽。'.repeat(100)+'a'.repeat(150);revision++;await expect(copy).toHaveText(text)
  await expect.poll(()=>body.evaluate(e=>e.scrollTop+e.clientHeight>=e.scrollHeight-2)).toBe(true)
  await page.mouse.move(100,0);await expect(feedback).toContainText('松开取消');await page.mouse.up()
  await expect(feedback).toHaveCount(0);await expect(preview).toHaveCount(0)
  await expect(page.locator('.hoho-dialogue-composer')).toHaveCSS('opacity','1')
  await expect(page.locator('.nurse-turn--user')).toHaveCount(history);expect(submitted).toBe(0)
  text='';revision++
  await hold.focus();await page.keyboard.down('Space');await expect(preview).toBeVisible();await expect(copy).toHaveText('')
  await page.keyboard.press('Escape');await page.keyboard.up('Space')
  await expect(feedback).toHaveCount(0);await expect(preview).toHaveCount(0);expect(submitted).toBe(0)
})

test('releasing live text continues as one pending message until authoritative final transcription',async({page,request})=>{
  const partial='孩子今天咳嗽',final='孩子今天咳了两声，现在精神还好。'
  await page.unroute('**/api/ai/audio/live**')
  await page.route('**/api/ai/audio/live',route=>route.fulfill({json:{id:'release-test',state:'listening',text:'',revision:1,sequence:0}}))
  await page.route('**/api/ai/audio/live/*',route=>route.fulfill({json:{id:'release-test',state:route.request().method()==='DELETE'?'closed':'listening',text:partial,revision:2,sequence:0}}))
  await request.get(`${control}/voice?text=${encodeURIComponent(final)}`);await request.get(`${control}/delay?ms=1600`)
  await record(page);await expect(page.locator('.front-desk-live-voice p')).toHaveText(partial)
  await page.keyboard.up('Space')
  await expect(page.locator('.front-desk-live-voice')).toHaveCount(0)
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
  await expect(page.locator('.nurse-turn--user p')).toHaveText(partial)
  await expect(page.locator('.nurse-turn--user p')).toHaveText(final,{timeout:30000})
  await expect(page.locator('.nurse-turn--user')).toHaveCount(1)
})

test('empty home recording temporarily shows a timeline bubble; cancelling restores welcome without history',async({page})=>{
  await expect(page.getByRole('region',{name:'记录介绍',exact:true})).toBeVisible()
  await record(page)
  await expect(page.locator('.front-desk-live-voice')).toBeVisible()
  await expect(page.getByRole('region',{name:'记录介绍',exact:true})).toHaveCount(0)
  await page.keyboard.press('Escape');await page.keyboard.up('Space')
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await expect(page.getByRole('region',{name:'记录介绍',exact:true})).toBeVisible()
})

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
  await expect(page.locator('.journal-search-field [data-icon="search"]')).toHaveAttribute('data-icon-variant','large-lens-short-handle')
  await page.goBack();await expect(page.getByLabel('对话输入',{exact:true})).toHaveValue(text)
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  const drawer=page.getByRole('dialog',{name:'侧边栏菜单'})
  // Sidebar labels are compact keywords; the opened draft must still retain the full original below.
  await drawer.locator('.drawer-history-open').filter({hasText:'昨晚睡得不安稳'}).click()
  await expect(page).toHaveURL(/nurse-station\?draft=/)
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'继续此对话',exact:true})).toHaveCount(0)
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

test('camera uses the browser system chooser even inside a native container; cancelling retains input',async({page},info)=>{
  const add=page.locator('.hoho-main-header').getByRole('button',{name:'新建对话',exact:true})
  await expect(add).toHaveCount(0)
  const selected=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
  const input=(await selected).element()
  expect(await input.getAttribute('accept')).toContain('video/mp4')
  expect(await input.getAttribute('accept')).toContain('application/pdf')
  await input.setInputFiles([])
  await expect(page.getByRole('dialog',{name:'添加附件',exact:true})).toHaveCount(0)
  await type(page,'选择附件前输入的补充')
  await page.evaluate(()=>{
    ;(window as any).__customPickerCalls=0
    window.hooohoNativeAttachments=async()=>{(window as any).__customPickerCalls++;throw new Error('应用自定义菜单不应打开')}
  })
  const systemPicker=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
  await (await systemPicker).setFiles([])
  await expect(page.getByLabel('对话输入')).toHaveValue('选择附件前输入的补充')
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(add).toHaveCount(0)
  expect(await page.evaluate(()=>(window as any).__customPickerCalls)).toBe(0)
  await expect(page.getByRole('dialog',{name:'添加附件',exact:true})).toHaveCount(0)
  await page.screenshot({path:info.outputPath('attachment-cancel-keeps-input.png')})
})

test('a system picker opened for the old conversation cannot attach its late files to a new one',async({page,request})=>{
  await type(page,'旧对话中尚未发送的输入')
  const choosing=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'添加照片、视频或文件',exact:true}).click()
  const picker=await choosing
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.getByRole('dialog',{name:'侧边栏菜单',exact:true}).getByRole('button',{name:'新建对话',exact:true}).click()
  await expect(page.getByLabel('对话输入',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
  await picker.setFiles({name:'迟到的合成照片.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XcAAAAASUVORK5CYII=','base64')})
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await expect(page.locator('.nurse-turn--user')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await(await request.get(`/api/members/${memberId}/recognition-jobs`,{headers})).json()).toBeNull()
})
