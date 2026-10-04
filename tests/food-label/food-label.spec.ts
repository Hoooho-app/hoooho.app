import {test,expect,type Page} from '@playwright/test'
const memberId='synthetic-food-child',accountId='synthetic-food-owner'
const photo={name:'label.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XcAAAAASUVORK5CYII=','base64')}
const rows=Array.from({length:21},(_,i)=>({chinese:i===20?'最后一项很长的中文复合成分名称':'合成布局验收成分'+(i+1),original:i===20?'LongOriginalIngredientNameWithoutAnyBreaksForOverflowTesting':'Original ingredient '+(i+1),status:i===1?'known':i===2?'possible':'pending',reason:'仅用于布局测试，不是实际食品分析'}))
async function prepare(page:Page){
  await page.addInitScript(({memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token','synthetic-token');localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{memberId,accountId})
  const requests:Record<string,unknown>[]=[]
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname
    let body:unknown={}
    if(path==='/api/auth/session')body={token:'synthetic-token',user:{id:accountId,currentMemberId:memberId,nickname:'合成验收'}}
    if(path==='/api/members')body=[{id:memberId,name:'不应在核对页展示',birthday:'2025-01-01',gender:'female',relationship:'child'}]
    if(path==='/api/account/entry-state')body={familyMemberCount:1,hasValidHealthRecord:false}
    if(path==='/api/events'||path==='/api/auth/profile-sections')body=[]
    if(path==='/api/food-label/check'){const input=route.request().postDataJSON();requests.push(input);body={taskId:input.taskId,memberId:input.memberId,ingredients:rows,contains:[],advisory:[],title:'发现需注意成分',counts:'已识别21项 · 1项已知冲突 · 20项待确认',scope:'合成布局测试',tone:'warning'}}
    await route.fulfill({json:body,headers:{'Cache-Control':'no-store'}})
  });return requests
}
for(const width of [375,393,430])test(`whole page scroll, 21 rows, no persisted data at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:667});const requests=await prepare(page)
  await page.goto('/food-label');await expect(page.getByRole('heading',{name:'食品标签核对',exact:true})).toBeVisible()
  await expect(page.getByText('不应在核对页展示')).toHaveCount(0)
  await page.screenshot({path:info.outputPath(`entry-${width}.png`)})
  const album=page.locator('input[type=file][multiple]');await album.setInputFiles([photo,{...photo,name:'second.png'},{...photo,name:'third.png'},{...photo,name:'fourth.png'}])
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  await expect(page.locator('.food-label-photos img')).toHaveCount(4)
  expect((requests[0].photos as unknown[]).length).toBe(4)
  await page.screenshot({path:info.outputPath(`result-${width}.png`)})
  await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded();await expect(page.locator('.food-label-ingredients li').last()).toBeVisible()
  await page.screenshot({path:info.outputPath(`bottom-${width}.png`)})
  await page.addStyleTag({content:'html {font-size:200% !important}'});await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  const persisted=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(persisted).not.toContain('Original ingredient');expect(persisted).not.toContain('data:image')
  await page.reload();await expect(page.getByRole('button',{name:'拍摄食品标签',exact:true})).toBeVisible();await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
})
test('supplement appends, retake resets, cancel and late responses do not recover data',async({page})=>{
  const requests=await prepare(page);await page.goto('/food-label');const album=page.locator('input[type=file][multiple]'),camera=page.locator('input[capture=environment]')
  await album.setInputFiles([]);expect(requests.length).toBe(0)
  await album.setInputFiles(photo);await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  await camera.setInputFiles(photo);await expect.poll(()=>requests.length).toBe(2);expect((requests[1].photos as unknown[]).length).toBe(2)
  await page.getByRole('button',{name:'重新拍摄',exact:true}).click();await expect(page.getByRole('button',{name:'拍摄食品标签',exact:true})).toBeVisible();await expect(page.locator('.food-label-photos img')).toHaveCount(0)
  await camera.setInputFiles(photo);await expect.poll(()=>requests.length).toBe(3);expect((requests[2].photos as unknown[]).length).toBe(1)
  await page.goto('/nurse-station');await page.goto('/food-label');await expect(page.getByRole('button',{name:'拍摄食品标签',exact:true})).toBeVisible()
})
test('member switching and late requests cannot restore another member result',async({page})=>{
  await prepare(page);await page.goto('/food-label')
  let release:()=>void=()=>{},started:()=>void=()=>{}
  const waiting=new Promise<void>(resolve=>{started=resolve}),hold=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/food-label/check',async route=>{started();await hold;try{const input=route.request().postDataJSON();await route.fulfill({json:{...input,ingredients:rows,contains:[],advisory:[],title:'旧结果',counts:'旧统计',scope:'旧范围',tone:'warning'}})}catch{/* The browser cancels the old request. */}})
  await page.locator('input[type=file][multiple]').setInputFiles(photo);await waiting
  await page.evaluate(async()=>{const store=await import('/src/store/useAppStore.ts');store.useAppStore.getState().setCurrentMemberId('different-synthetic-child',{sync:false})})
  await expect(page.getByRole('button',{name:'拍摄食品标签',exact:true})).toBeVisible();release()
  await expect(page.getByText('旧结果')).toHaveCount(0);await expect(page.locator('.food-label-photos img')).toHaveCount(0)
})
