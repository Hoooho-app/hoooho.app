import {expect,test} from '@playwright/test'
import source from '../../src/features/body-location/child-data/locations.json' with {type:'json'}
import {choose,complete,global,noOverflow,openRegion,picker,prepare,screenshot,token} from './helpers'

test('surfaces, coarse coexistence, discard, failed save, persisted editing and session refresh',async({page},info)=>{
  const form=await prepare(page);await form.getByLabel('哪里不舒服',{exact:true}).fill(`定位器验收${info.project.name}：眼下发红，足弓发痒`);await form.getByLabel('手动补充症状部位').fill('旧手工位置保留');await form.locator('.child-body-open').click()
  const p=picker(page);await expect(p.locator('[data-asset="assets/girl-front.png"]')).toBeVisible()
  await openRegion(page,'face');await choose(page,'face_lower_eyelid_left');await screenshot(page,'face-selected')
  await openRegion(page,'foot_left');await p.getByRole('button',{name:'足底',exact:true}).click();await choose(page,'foot_left_arch');await expect(p.locator('[data-zone-id="foot_left_arch"]')).toHaveAttribute('data-selected','true');await screenshot(page,'foot-selected')
  await p.getByRole('button',{name:'脚背',exact:true}).click();await expect(p.locator('[data-zone-id="foot_left_arch"]')).toHaveCount(0)
  await global(page);await p.getByRole('button',{name:'背面',exact:true}).click();await expect(p.locator('[data-asset="assets/girl-back.png"]')).toBeVisible();await screenshot(page,'girl-back-multiselect')
  await openRegion(page,'hand_right');await choose(page,'hand_right_thumb_whole');await choose(page,'hand_right_index_whole');await p.getByRole('button',{name:'只记录右手',exact:true}).click()
  await expect(p.locator('.locator-selected-line')).toContainText('已选 5 处')
  await p.getByRole('button',{name:'手背',exact:true}).click();await choose(page,'hand_right_index_nail');await expect(p.locator('.locator-selected-line')).toContainText('已选 6 处');await screenshot(page,'right-hand-dorsal');await noOverflow(page,p)
  await complete(page);await expect(form.locator('.symptom-location-tags')).toContainText('具体位置待补充');await expect(form.locator('.symptom-location-tags')).not.toContainText('号区域');await screenshot(page,'form-result')
  await form.locator('.child-body-open').click();await p.getByRole('button',{name:'查看全部',exact:true}).click()
  const selected=page.getByRole('dialog',{name:'已选 6 处',exact:true});await selected.getByRole('button',{name:'清空全部',exact:true}).click();await page.getByRole('alertdialog',{name:'清空全部部位？'}).getByRole('button',{name:'确认清空',exact:true}).click();await page.keyboard.press('Escape')
  await p.getByRole('button',{name:'关闭身体部位定位器',exact:true}).click();await page.getByRole('alertdialog',{name:'放弃本次部位修改？'}).getByRole('button',{name:'放弃修改',exact:true}).click();await expect(p).toHaveCount(0);await expect(form.locator('.symptom-location-tags')).toContainText('左足弓区域')
  await page.route('**/api/quick-records',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'验收保存失败'}})}),{times:1});await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form.getByRole('alert')).toBeVisible();await expect(form.locator('.symptom-location-tags')).toContainText('左下眼睑')
  const saving=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/quick-records');await form.getByRole('button',{name:'保存',exact:true}).click();const response=await saving;expect(response.status()).toBe(201);const saved=await response.json()
  const read=await page.request.get(`http://127.0.0.1:4197/api/events/${saved.eventId}/records?view=time`,{headers:{Authorization:`Bearer ${token()}`}});expect(read.ok()).toBe(true)
  const record=(await read.json()).find((r:any)=>r.journal?.symptom?.narrative?.includes(`定位器验收${info.project.name}`))
  expect(record.journal.symptom.locations.map((v:any)=>v.id)).toEqual(['face_lower_eyelid_left','foot_left_arch','hand_right_thumb_whole','hand_right_index_whole','hand_right_whole','hand_right_index_nail'])
  expect(record.journal.symptom.locations[1]).toMatchObject({surface:'plantar',bodySide:'left',precision:'region',dictionaryVersion:'2.0.0',schemaVersion:'1.0.0',modelAtSelection:'girl'})
  expect(record.journal.symptom.locations[4]).toMatchObject({bodySide:'right',surface:'unspecified',precision:'category'})
  expect(record.journal.symptom.locations.every((l:any)=>!l.markedArea)).toBe(true)
  await expect(form).toHaveCount(0);await page.reload();await page.locator(`[data-record-id="${record.id}"]`).click()
  const detail=page.getByRole('dialog',{name:'症状记录详情',exact:true});await expect(detail).toContainText('左足弓区域');await expect(detail).not.toContainText('号区域');await detail.getByRole('button',{name:'编辑症状记录',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'编辑症状记录',exact:true});await editor.getByRole('textbox',{name:'记录内容',exact:true}).fill('历史编辑草稿保留');await editor.locator('.child-body-open').click();await openRegion(page,'face');await choose(page,'face_lower_eyelid_right')
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(800);await expect(p.locator('.locator-selected-line')).toContainText('已选 7 处')
  await p.getByRole('button',{name:'查看全部',exact:true}).click();await page.getByRole('dialog',{name:'已选 7 处',exact:true}).getByRole('button',{name:'清空全部',exact:true}).click();await page.getByRole('alertdialog',{name:'清空全部部位？'}).getByRole('button',{name:'确认清空',exact:true}).click();await page.keyboard.press('Escape');await complete(page)
  await expect(editor.getByRole('textbox',{name:'记录内容',exact:true})).toHaveValue('历史编辑草稿保留');await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0)
  const updated=await page.request.get(`http://127.0.0.1:4197/api/events/${saved.eventId}/records?view=time`,{headers:{Authorization:`Bearer ${token()}`}});const result=(await updated.json()).find((r:any)=>r.id===record.id)
  expect(result.journal.symptom.locations).toEqual([]);expect(result.journal.symptom.locationText).toBe('旧手工位置保留')
})

for(const model of ['boy','girl'] as const)test(`all ${model} dictionary entries remain reachable with fixed image and scoped text drawer`,async({page},info)=>{
  test.skip(info.project.name!=='iphone-se','Full dictionary traversal on SE; responsive workflow in every project')
  const form=await prepare(page,`body-${model}`);await form.locator('.child-body-open').click();const p=picker(page);await expect(p.locator(`[data-asset="assets/${model}-front.png"]`)).toBeVisible();await screenshot(page,`${model}-front`)
  await p.getByRole('button',{name:'背面',exact:true}).click();await screenshot(page,`${model}-back`)
  let reached=0
  for(const region of source.regions){
    await openRegion(page,region.id);await p.getByRole('button',{name:'用文字选择',exact:true}).click();const d=page.getByRole('dialog',{name:'用文字选择',exact:true}),expected=region.items.filter(i=>i.sex.includes(model)).map(i=>i.id)
    await expect(d.locator('[data-location-id]')).toHaveCount(expected.length);expect(await d.locator('[data-location-id]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-location-id')))).toEqual(expect.arrayContaining(expected))
    expect(await d.locator('[data-location-id]').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44))).toBe(true)
    await d.locator(`[data-location-id="${expected.at(-1)}"]`).click();await expect(d.locator(`[data-location-id="${expected.at(-1)}"]`)).toHaveAttribute('aria-pressed','true');await d.locator(`[data-location-id="${expected.at(-1)}"]`).click();reached+=expected.length;await page.keyboard.press('Escape');await noOverflow(page,p)
    if(['head','hand_left','foot_right','knee_left'].includes(region.id)){await screenshot(page,`${model}-${region.id}-${region.views[0]}`);if(region.views.includes('back')&&region.id==='head'){await p.getByRole('button',{name:'背面',exact:true}).click();await screenshot(page,`${model}-head-back`)}}
  }
  expect(reached).toBe(model==='boy'?561:562);await global(page);await page.keyboard.press('Escape');await expect(p).toHaveCount(0);await expect(form).toBeVisible()
})

test('neutral fallback, failed image and profile fetch preserve typed symptoms and text selection',async({page},info)=>{
  test.skip(info.project.name!=='iphone-se')
  const form=await prepare(page,'body-unknown');await form.getByLabel('哪里不舒服',{exact:true}).fill('中性兜底保留原文');await form.locator('.child-body-open').click();const p=picker(page)
  await expect(p.locator('[data-asset="neutral-front.png"]')).toBeVisible();await expect(p.getByRole('link',{name:'补全孩子档案'})).toHaveCount(0);await screenshot(page,'neutral-front');await p.getByRole('button',{name:'背面',exact:true}).click();await expect(p.locator('[data-asset="neutral-back.png"]')).toBeVisible();await screenshot(page,'neutral-back')
  await page.route('**/body-locator/v1/hand-left.png',r=>r.abort());await openRegion(page,'hand_left');await expect(p.getByText('图片暂时无法加载')).toBeVisible();await choose(page,'hand_left_palm_center');await expect(p.locator('.locator-selected-line')).toContainText('已选 1 处')
  await page.unroute('**/body-locator/v1/hand-left.png');await p.getByRole('button',{name:'重试图片',exact:true}).click();await expect(p.locator('.locator-zone')).not.toHaveCount(0)
  await page.route('**/api/members/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":{"message":"fixture unavailable"}}'}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(p.getByRole('button',{name:/档案暂时无法读取/})).toBeVisible();await expect(p.locator('.locator-selected-line')).toContainText('已选 1 处')
  await complete(page);await expect(form.getByLabel('哪里不舒服',{exact:true})).toHaveValue('中性兜底保留原文')
})

test('browser back, Escape, drawer removal and clear confirmation never commit an abandoned draft',async({page},info)=>{
  test.skip(info.project.name!=='iphone-se')
  const form=await prepare(page);await form.locator('.child-body-open').click();const p=picker(page);await openRegion(page,'hand_left');await choose(page,'hand_left_palm_center');await global(page)
  await page.goBack();const confirmation=page.getByRole('alertdialog',{name:'放弃本次部位修改？'});await expect(confirmation).toBeVisible();await expect(page).toHaveURL(/health-events/);await confirmation.getByRole('button',{name:'继续选择',exact:true}).click()
  await page.keyboard.press('Escape');await expect(confirmation).toBeVisible();await confirmation.getByRole('button',{name:'放弃修改',exact:true}).click();await expect(p).toHaveCount(0);await expect(form.locator('.symptom-location-tags')).toHaveCount(0)
  await form.locator('.child-body-open').click();await complete(page);await expect(form).toBeVisible()
})

test('legacy unknown identifiers, manual location and original marked area survive historical editing',async({page},info)=>{
  test.skip(info.project.name!=='iphone-se')
  await prepare(page,'body-boy');const legacy={id:'unknown-legacy-point',label:'旧图原部位',locationNumber:1,locationLayer:'surface',bodyRegion:'old-region',bodySide:'left',bodyView:'front',localRegion:'旧图原坐标描述',markedArea:'旧图 x=12 y=34'}
  const response=await page.request.post('http://127.0.0.1:4197/api/quick-records',{headers:{Authorization:`Bearer ${token()}`},data:{memberId:'body-boy-iphone-se',content:'旧部位兼容验收',occurredAt:new Date(Date.now()-5000).toISOString(),inputChannel:'text',idempotencyKey:crypto.randomUUID(),title:'旧部位兼容',journal:{categories:['symptom'],symptom:{narrative:'旧部位兼容验收',symptomCategory:'skin',keywords:[],locations:[legacy],locationText:'衣领接触处',descriptors:[],linkedRecordIds:{}}}}});expect(response.status()).toBe(201);const saved=await response.json()
  await page.goto(`/health-events?eventId=${saved.eventId}&recordId=${saved.recordId}`);const detail=page.getByRole('dialog',{name:'症状记录详情',exact:true});await expect(detail).toContainText('衣领接触处');await detail.getByRole('button',{name:'编辑症状记录',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'编辑症状记录',exact:true});await editor.locator('.child-body-open').click();await picker(page).getByRole('button',{name:'查看全部',exact:true}).click();await expect(page.getByRole('dialog',{name:'已选 1 处',exact:true})).toContainText('旧图原部位');await page.keyboard.press('Escape');await complete(page);await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toHaveCount(0)
  const records=await page.request.get(`http://127.0.0.1:4197/api/events/${saved.eventId}/records?view=time`,{headers:{Authorization:`Bearer ${token()}`}});expect((await records.json()).find((r:any)=>r.id===saved.recordId).journal.symptom.locations[0]).toEqual(legacy)
})

test('direct save and switching children preserve only the corresponding member draft',async({page},info)=>{
  test.skip(info.project.name!=='iphone-se')
  const form=await prepare(page);await form.getByLabel('哪里不舒服',{exact:true}).fill('女孩专属未保存描述');await form.locator('.child-body-open').click();await openRegion(page,'face');await choose(page,'face_lower_eyelid_left');await complete(page)
  page.on('dialog',d=>d.accept());await form.getByRole('button',{name:'关闭',exact:true}).click()
  const switchChild=async(name:string)=>{await page.getByRole('button',{name:'打开菜单',exact:true}).click();await page.getByRole('button',{name:'打开我的孩子',exact:true}).click();await page.getByRole('dialog',{name:'我的孩子',exact:true}).getByRole('button',{name:`切换到${name}`,exact:true}).first().click();await expect(page.getByRole('dialog',{name:'我的孩子',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'记一下',exact:true}).click();await page.getByRole('dialog',{name:'记一下',exact:true}).getByRole('button',{name:'记录症状',exact:true}).click()}
  await switchChild('男孩验收');await expect(form.getByLabel('哪里不舒服',{exact:true})).toHaveValue('');await expect(form.locator('.symptom-location-tags')).toHaveCount(0);await form.getByLabel('哪里不舒服',{exact:true}).fill('男孩直接保存');await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form).toHaveCount(0)
  await switchChild('女孩验收');await expect(form.getByLabel('哪里不舒服',{exact:true})).toHaveValue('女孩专属未保存描述');await expect(form.locator('.symptom-location-tags')).toContainText('左下眼睑')
})

test('twenty selections keep footer fixed and all side/surface assets have overlay evidence',async({page},info)=>{
  test.skip(info.project.name!=='iphone-se'&&info.project.name!=='mobile-320')
  const form=await prepare(page);await form.locator('.child-body-open').click();const p=picker(page);await openRegion(page,'hand_left')
  const footer=await p.locator('.hoho-bottom-sheet__footer').boundingBox(),stage=await p.locator('.locator-stage').boundingBox()
  await p.getByRole('button',{name:'用文字选择',exact:true}).click();const d=page.getByRole('dialog',{name:'用文字选择',exact:true}),items=source.regions.find(r=>r.id==='hand_left')!.items.filter(i=>i.sex.includes('girl')).slice(2,22)
  for(const item of items)await d.locator(`[data-location-id="${item.id}"]`).click()
  await d.locator('[data-location-id]').nth(22).click();await page.keyboard.press('Escape');await expect(p.locator('.locator-selected-line')).toContainText('已选 20 处');expect(await p.locator('.hoho-bottom-sheet__footer').boundingBox()).toEqual(footer);expect(await p.locator('.locator-stage').boundingBox()).toEqual(stage);await noOverflow(page,p)
  await p.getByRole('button',{name:'查看全部',exact:true}).click();const selected=page.getByRole('dialog',{name:'已选 20 处',exact:true});await expect(selected.locator('.locator-selected-tags > div')).toHaveCount(20);await screenshot(page,'twenty-selected-drawer');await selected.getByRole('button',{name:'移除左掌心',exact:true}).click();await page.keyboard.press('Escape');await expect(p.locator('.locator-selected-line')).toContainText('已选 19 处')
  const overlayStyle=await page.addStyleTag({content:'.locator-zone { fill: rgba(26,122,108,.3) !important; stroke: #1a7a6c !important; stroke-width: .004 !important; }'})
  for(const part of ['hand_left','hand_right','foot_left','foot_right','head','knee_left','knee_right']){
    await openRegion(page,part)
    const surfaces=part.startsWith('hand')?['手掌','手背']:part.startsWith('foot')?['脚背','足底','内侧','外侧']:['正面','背面']
    for(const surface of surfaces){await p.getByRole('button',{name:surface,exact:true}).click();await expect(p.locator('.locator-canvas')).toBeVisible();await p.locator('.locator-zone').evaluateAll(nodes=>nodes.forEach(n=>n.setAttribute('data-selected','true')));await screenshot(page,`overlay-${part}-${surface}`)}
  }
  await overlayStyle.evaluate(el=>el.remove())
  // Internal zoom is triggered by a tiny graphic target; no invisible enlarged hit boxes.
  await openRegion(page,'hand_left');await p.getByRole('button',{name:'手掌',exact:true}).click();await p.locator('[data-zone-id="hand_left_index_palmar"]').click();await expect(p.getByRole('button',{name:'返回局部图',exact:true})).toBeVisible();await screenshot(page,'finger-local-zoom');await p.getByRole('button',{name:'返回局部图',exact:true}).click()
})
