import {test,expect,type Page} from '@playwright/test'
const memberId='synthetic-food-child',accountId='synthetic-food-owner'
const photo={name:'label.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XcAAAAASUVORK5CYII=','base64')}
const rows=Array.from({length:21},(_,i)=>({chinese:i===20?'最后一项很长的中文复合成分名称':'合成布局验收成分'+(i+1),original:i===20?'LongOriginalIngredientNameWithoutAnyBreaksForOverflowTesting':'Original ingredient '+(i+1),status:i===1?'known':'clear',reason:''}))
async function prepare(page:Page,language='zh-CN',ingredients=rows){
  await page.addInitScript(({memberId,accountId,language})=>{sessionStorage.setItem('hoooho-auth-token','synthetic-token');localStorage.setItem('hoooho-settings',JSON.stringify({state:{accounts:{[accountId]:{interfaceLanguage:language}}},version:1}));localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{memberId,accountId,language})
  const requests:Record<string,unknown>[]=[]
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname
    let body:unknown={}
    if(path==='/api/auth/session')body={token:'synthetic-token',user:{id:accountId,currentMemberId:memberId,nickname:'合成验收'}}
    if(path==='/api/members')body=[{id:memberId,name:'不应在核对页展示',birthday:'2025-01-01',gender:'female',relationship:'child'}]
    if(path==='/api/account/entry-state')body={familyMemberCount:1,hasValidHealthRecord:false}
    if(path==='/api/events'||path==='/api/auth/profile-sections'||path.endsWith('/medication-reminders')||path.endsWith('/growth-measurements')||path.endsWith('/case-records'))body=[]
    if(path==='/api/food-label/check'){const input=route.request().postDataJSON();requests.push(input);body={taskId:input.taskId,memberId:input.memberId,ingredients,continuation:'opaque-synthetic-continuation',contains:[],advisory:[],title:'标签未读完整，请补拍',counts:'21项待确认',scope:'标签未完整，暂不能排除遗漏',tone:'warning'}}
    await route.fulfill({json:body,headers:{'Cache-Control':'no-store'}})
  });return requests
}
for(const width of [375,390,430])test(`entry back returns home by touch even after old route assets expire at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:667});await prepare(page)
  await page.goto('/food-label');await expect(page.getByRole('heading',{name:'配料表扫描',exact:true})).toBeVisible()
  // Model an already-open scan document whose old lazy home module is no longer
  // available after a release. A new home document resolves fresh module URLs.
  let homeDocuments=0
  await page.route('**/nurse-station',async route=>{if(route.request().isNavigationRequest())homeDocuments++;await route.continue()})
  await page.route('**/src/pages/NurseStation/index.tsx',route=>homeDocuments?route.continue():route.abort('failed'))
  await page.getByRole('button',{name:'返回',exact:true}).tap()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(page.locator('.nurse-station-page')).toBeVisible({timeout:5000})
  expect(homeDocuments).toBe(1)
  await expect(page.locator('.food-label-page')).toHaveCount(0)
})

test('result back clears this scan; entry back works with keyboard and direct entry',async({page})=>{
  await prepare(page);await page.goto('/food-label')
  await page.locator('input[type=file][multiple]').setInputFiles(photo)
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  await page.getByRole('button',{name:'返回',exact:true}).tap()
  await expect(page.getByRole('heading',{name:'配料表扫描',exact:true})).toBeVisible()
  await expect(page.locator('.food-label-photos img')).toHaveCount(0)
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
  await page.getByRole('button',{name:'返回',exact:true}).press('Enter')
  await expect(page.locator('.nurse-station-page')).toBeVisible()
  await page.getByRole('link',{name:/配料表扫描/}).click()
  await expect(page.getByRole('button',{name:'拍摄配料表',exact:true})).toBeVisible()
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
})
for(const width of [375,390,393,430])test(`whole page scroll, 21 rows, no persisted data at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:667});const requests=await prepare(page)
  await page.goto('/food-label');await expect(page.getByRole('heading',{name:'配料表扫描',exact:true})).toBeVisible()
  await expect(page.getByText('不应在核对页展示')).toHaveCount(0)
  await page.screenshot({path:info.outputPath(`entry-${width}.png`)})
  const album=page.locator('input[type=file][multiple]');await album.setInputFiles([photo,{...photo,name:'second.png'},{...photo,name:'third.png'},{...photo,name:'fourth.png'}])
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  await expect(page.locator('.food-label-photos img')).toHaveCount(4)
  await expect(page.locator('.food-label-summary')).toHaveText('已识别21项 · 1项已知冲突')
  await expect(page.getByText(/待确认|可能风险|未发现冲突|标签未完整|请补拍/)).toHaveCount(0)
  await expect(page.locator('.food-label-ingredients .hoho-health-tag')).toHaveCount(21)
  await expect(page.locator('.food-label-photos button')).toHaveAttribute('aria-label','补拍食品标签')
  await expect(page.locator('.food-label-photos button')).toHaveText('')
  expect(await page.locator('.food-label-photos img').evaluateAll(images=>images.every(img=>!img.closest('button,a')&&!img.hasAttribute('tabindex')&&!img.hasAttribute('onclick')))).toBe(true)
  expect((requests[0].photos as unknown[]).length).toBe(4)
  await page.screenshot({path:info.outputPath(`result-${width}.png`)})
  await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded();await expect(page.locator('.food-label-ingredients li').last()).toBeVisible()
  await page.screenshot({path:info.outputPath(`bottom-${width}.png`)})
  await page.addStyleTag({content:'html {font-size:200% !important}'});await page.getByRole('button',{name:'重新拍摄',exact:true}).scrollIntoViewIfNeeded()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  const persisted=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(persisted).not.toContain('Original ingredient');expect(persisted).not.toContain('data:image')
  await page.reload();await expect(page.getByRole('button',{name:'拍摄配料表',exact:true})).toBeVisible();await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
})
test('supplement appends, retake resets, cancel and late responses do not recover data',async({page})=>{
  const requests=await prepare(page);await page.goto('/food-label');const album=page.locator('input[type=file][multiple]'),camera=page.locator('input[capture=environment]')
  await album.setInputFiles([]);expect(requests.length).toBe(0)
  await album.setInputFiles(photo);await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  await camera.setInputFiles(photo);await expect.poll(()=>requests.length).toBe(2);expect((requests[1].photos as unknown[]).length).toBe(1);expect(requests[1].continuation).toBe('opaque-synthetic-continuation');expect(requests[1].scanId).toBe(requests[0].scanId)
  await page.getByRole('button',{name:'重新拍摄',exact:true}).click();await expect(page.getByRole('button',{name:'拍摄配料表',exact:true})).toBeVisible();await expect(page.locator('.food-label-photos img')).toHaveCount(0)
  await camera.setInputFiles(photo);await expect.poll(()=>requests.length).toBe(3);expect((requests[2].photos as unknown[]).length).toBe(1)
  await page.goto('/nurse-station');await page.goto('/food-label');await expect(page.getByRole('button',{name:'拍摄配料表',exact:true})).toBeVisible()
})
test('member switching and late requests cannot restore another member result',async({page})=>{
  await prepare(page);await page.goto('/food-label')
  let release:()=>void=()=>{},started:()=>void=()=>{}
  const waiting=new Promise<void>(resolve=>{started=resolve}),hold=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/food-label/check',async route=>{started();await hold;try{const input=route.request().postDataJSON();await route.fulfill({json:{...input,ingredients:rows,contains:[],advisory:[],title:'旧结果',counts:'旧统计',scope:'旧范围',tone:'warning'}})}catch{/* The browser cancels the old request. */}})
  await page.locator('input[type=file][multiple]').setInputFiles(photo);await waiting
  await page.evaluate(async()=>{const store=await import('/src/store/useAppStore.ts');store.useAppStore.getState().setCurrentMemberId('different-synthetic-child',{sync:false})})
  await expect(page.getByRole('button',{name:'拍摄配料表',exact:true})).toBeVisible();release()
  await expect(page.getByText('旧结果')).toHaveCount(0);await expect(page.locator('.food-label-photos img')).toHaveCount(0)
})

for(const language of ['zh-CN','en-US'])for(const sourceLanguage of ['zh','en'])test(`per-ingredient original and translation: UI ${language}, source ${sourceLanguage}`,async({page})=>{
  const original=sourceLanguage==='zh'?'大米':'Rice',chinese='大米',english='Rice'
  await prepare(page,language,[{original,chinese,english,sourceLanguage,status:'pending',reason:'不应显示'}] as typeof rows)
  await page.goto('/food-label');await page.locator('input[type=file][multiple]').setInputFiles(photo)
  await expect(page.locator('.food-label-row-heading strong')).toHaveText(original)
  const same=language.startsWith(sourceLanguage)
  await expect(page.locator('.food-label-translation')).toHaveCount(same?0:1)
  if(!same)await expect(page.locator('.food-label-translation')).toHaveText(language.startsWith('zh')?chinese:english)
  await expect(page.locator('.hoho-health-tag')).toHaveText(language.startsWith('zh')?'核对未完成':'Check incomplete')
  await expect(page.locator('.food-label-summary')).toHaveText(language.startsWith('zh')?'已识别1项 · 0项已知冲突':'1 ingredients identified · 0 known conflicts')
})

test('plus tile follows 1, 2 and 3 photos in the same three-column grid',async({page})=>{
  await prepare(page);await page.goto('/food-label')
  const album=page.locator('input[type=file][multiple]'),camera=page.locator('input[capture=environment]')
  for(let count=1;count<=3;count++){
    await (count===1?album:camera).setInputFiles(photo)
    await expect(page.locator('.food-label-photos img')).toHaveCount(count)
    const tiles=await page.locator('.food-label-photos > *').evaluateAll(elements=>elements.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})))
    expect(tiles[count].height).toBe(68);expect(tiles[count].width).toBeCloseTo(tiles[0].width,1)
    expect(tiles[count].y).toBe(count<3?tiles[0].y:tiles[0].y+76)
  }
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'补拍食品标签',exact:true}).click();expect((await chooser).isMultiple()).toBe(false)
})

test('no recognized ingredients and genuine failures remain truthful in the result box',async({page})=>{
  await prepare(page);await page.goto('/food-label')
  await page.route('**/api/food-label/check',route=>route.fulfill({status:422,json:{error:{code:'FOOD_NO_INGREDIENTS',message:'未识别到成分'}}}))
  await page.locator('input[type=file][multiple]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('未识别到成分')
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
  await page.route('**/api/food-label/check',route=>route.fulfill({status:503,json:{error:{code:'AI_NETWORK_ERROR',message:'图片识别连接失败，请重新拍摄'}}}))
  await page.locator('input[capture=environment]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('图片识别连接失败，请重新拍摄')
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(0)
  await page.route('**/api/food-label/check',route=>{const input=route.request().postDataJSON();return route.fulfill({json:{taskId:input.taskId,memberId:input.memberId,ingredients:rows,failure:'read'}})})
  await page.locator('input[capture=environment]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('已识别21项 · 1项已知冲突部分照片识别失败')
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
})

test('root display has one major tag, specific reasons and no fake zero after archive failure',async({page})=>{
  await prepare(page);await page.goto('/food-label')
  const roots=[{original:'面包（小麦粉、牛奶、鸡蛋）',chinese:'面包（小麦粉、牛奶、鸡蛋）',sourceLanguage:'zh',status:'known',reasonTranslations:{zh:'牛奶匹配已记录的牛奶过敏。',en:'Milk matches the recorded allergy.'}}, {original:'Mustard',chinese:'芥末',sourceLanguage:'en',status:'common'}, {original:'明胶',chinese:'明胶',sourceLanguage:'zh',status:'possible',reasonTranslations:{zh:'明胶未注明具体原料，需核实是否来自鱼类。',en:'The source of gelatin is unknown.'}}]
  await page.route('**/api/food-label/check',route=>{const input=route.request().postDataJSON();return route.fulfill({json:{taskId:input.taskId,memberId,ingredients:rows,displayIngredients:roots,conflictCount:1,assessmentComplete:true}})})
  await page.locator('input[multiple]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('已识别3项 · 1项已知冲突')
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(3)
  await expect(page.locator('.food-label-ingredients .hoho-health-tag')).toHaveText(['已知冲突','常见过敏原','可能风险'])
  await expect(page.locator('.food-label-explanation')).toHaveCount(2)
  await page.route('**/api/food-label/check',route=>{const input=route.request().postDataJSON();return route.fulfill({json:{taskId:input.taskId,memberId,ingredients:rows,displayIngredients:roots,conflictCount:null,assessmentComplete:false,failure:'profile'}})})
  await page.locator('input[capture]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('过敏记录读取失败，已保留识别成分，核对未完成')
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(3)
  await page.route('**/api/food-label/check',route=>route.fulfill({status:503,json:{error:{code:'AI_NETWORK_ERROR',message:'图片识别连接失败，请重新拍摄'}}}))
  await page.locator('input[capture]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('图片识别连接失败，请重新拍摄')
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(3)
})

test('late supplement response cannot replace the newest result of the same member',async({page})=>{
  await prepare(page);await page.goto('/food-label');await page.locator('input[multiple]').setInputFiles(photo)
  await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  let release:()=>void=()=>{},started:()=>void=()=>{},count=0
  const hold=new Promise<void>(resolve=>release=resolve),waiting=new Promise<void>(resolve=>started=resolve)
  await page.route('**/api/food-label/check',async route=>{
    const input=route.request().postDataJSON(),old=++count===1
    if(old){started();await hold}
    try{await route.fulfill({json:{taskId:input.taskId,memberId,ingredients:old?rows:[{original:'最新成分',chinese:'最新成分',sourceLanguage:'zh',status:'clear',reason:''}],assessmentComplete:true,conflictCount:old?1:0}})}catch{/* Superseded requests are aborted. */}
  })
  await page.locator('input[capture]').setInputFiles(photo);await waiting
  await page.locator('input[capture]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('已识别1项 · 0项已知冲突')
  release();await expect(page.locator('.food-label-ingredients li')).toHaveCount(1)
  await expect(page.locator('.food-label-row-heading strong')).toHaveText('最新成分')
})

test('expired continuation recovers once with existing photos, without losing the result or creating model retries',async({page})=>{
  const requests=await prepare(page);await page.goto('/food-label')
  await page.locator('input[multiple]').setInputFiles(photo);await expect(page.locator('.food-label-ingredients li')).toHaveCount(21)
  let count=0;const recovery:Record<string,unknown>[]=[]
  await page.route('**/api/food-label/check',route=>{
    const input=route.request().postDataJSON();recovery.push(input)
    return ++count===1?route.fulfill({status:409,json:{error:{code:'FOOD_CONTINUATION_EXPIRED'}}}):route.fulfill({json:{taskId:input.taskId,memberId,ingredients:rows,continuation:'new-receipt'}})
  })
  await page.locator('input[capture]').setInputFiles(photo)
  await expect(page.locator('.food-label-summary')).toHaveText('已识别21项 · 1项已知冲突')
  expect(count).toBe(2);expect((recovery[0].photos as unknown[]).length).toBe(1);expect((recovery[1].photos as unknown[]).length).toBe(2)
  expect(recovery[1].continuation).toBeUndefined();expect(recovery[1].scanId).toBe(requests[0].scanId)
  await expect(page.locator('.food-label-photos img')).toHaveCount(2)
})

test('each ingredient has exactly one bounded assessment label, including incomplete OCR at 393px',async({page},info)=>{
  await page.setViewportSize({width:393,height:852})
  const ingredients=[
    {original:'大米（≥60%）',chinese:'大米（≥60%）',sourceLanguage:'zh',status:'clear',reason:''},
    {original:'面包（小麦粉、牛奶、鸡蛋）',chinese:'面包（小麦粉、牛奶、鸡蛋）',sourceLanguage:'zh',status:'known',reason:'牛奶匹配已记录的牛奶过敏。'},
    {original:'芥末',chinese:'芥末',sourceLanguage:'zh',status:'common',reason:''},
    {original:'食品添加剂（明胶、5′-呈味核苷酸二钠）',chinese:'食品添加剂（明胶、5′-呈味核苷酸二钠）',sourceLanguage:'zh',status:'possible',reason:'明胶未注明具体原料，需核实是否来自鱼类。'},
    {original:'模糊的配料文字',chinese:'模糊的配料文字',sourceLanguage:'zh',status:'pending',reason:''}
  ]
  await prepare(page,'zh-CN',ingredients)
  await page.goto('/food-label');await page.locator('input[multiple]').setInputFiles(photo)
  await expect(page.locator('.food-label-ingredients .hoho-health-tag')).toHaveText(['未见已知冲突','已知冲突','常见过敏原','可能风险','核对未完成'])
  await expect(page.locator('.food-label-explanation')).toHaveCount(2)
  await expect(page.locator('.food-label-summary')).toHaveText('已识别5项 · 1项已知冲突')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('all-assessment-states-393.png'),fullPage:true})
})
