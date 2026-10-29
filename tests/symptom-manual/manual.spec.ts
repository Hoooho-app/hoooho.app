import {expect,test,type Page} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {mkdir} from 'node:fs/promises'

const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:'Bearer '+token}
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
async function open(page:Page){
  await page.addInitScript(token=>{
    sessionStorage.setItem('hoooho-auth-token',token)
    if(!sessionStorage.getItem('manual-initialized')){
      localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))
      sessionStorage.setItem('manual-initialized','true')
    }
  },token)
  await page.goto('/nurse-station')
  await enterManual(page)
  return page.getByRole('dialog',{name:'记录症状',exact:true})
}
async function enterManual(page:Page){
  if(new URL(page.url()).pathname!=='/nurse-station')await page.goto('/nurse-station')
  const keyboard=page.getByRole('button',{name:'改用文字',exact:true}),entry=page.getByRole('button',{name:'记录症状',exact:true})
  await expect(keyboard.or(entry)).toBeVisible()
  if(await keyboard.isVisible())await keyboard.click()
  await entry.click()
}
for(const width of [320,375,390,430])test(`manual form has a compact attachment row with a right-aligned add action at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:667})
  const form=await open(page)
  await expect(form.locator('.symptom-record-save,.symptom-record-toolbar,.hoho-dialogue-composer')).toHaveCount(0)
  await expect(form.getByRole('button',{name:/按住|语音|拍照/})).toHaveCount(0)
  await expect(form.getByRole('button',{name:'保存记录',exact:true})).toBeInViewport()
  await expect(form.locator('header').getByRole('button',{name:'保存记录',exact:true})).toBeVisible()
  const order=await form.locator('.symptom-record-scroll').evaluate(el=>Array.from(el.children).map(child=>child.querySelector('h2,strong')?.textContent).filter(Boolean))
  expect(order.join('|')).toMatch(/症状描述.*症状部位.*补充信息.*附件.*发生时间/)
  const geometry=await form.getByRole('region',{name:'附件',exact:true}).evaluate(el=>{
    const card=el.getBoundingClientRect(),button=el.querySelector('button')!.getBoundingClientRect(),heading=el.querySelector('h2')!.getBoundingClientRect()
    return {right:card.right-button.right,height:button.height,cardHeight:card.height,alignment:Math.abs(heading.top+heading.height/2-button.top-button.height/2)}
  })
  expect(geometry.right).toBeLessThan(20);expect(geometry.height).toBeGreaterThanOrEqual(44)
  expect(geometry.cardHeight).toBeLessThan(68);expect(geometry.alignment).toBeLessThan(2)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await mkdir('outputs/symptom-manual',{recursive:true})
  await page.screenshot({path:`outputs/symptom-manual/manual-${width}.png`})
})

test('three sources select the matching system input, cancellation keeps text and PDF is rejected',async({page})=>{
  const form=await open(page),text=form.getByLabel('哪里不舒服')
  await text.fill('合成手填：左肘窝发红')
  for(const [source,accept,capture]of [['拍照','image/*',true],['拍视频','video/*',true],['从相册选择','image/*,video/*',false]]as const){
    await form.getByRole('button',{name:'添加附件',exact:true}).click()
    const menu=page.getByRole('dialog',{name:'添加附件',exact:true})
    await expect(menu.getByRole('button',{name:/^拍照$|^拍视频$|^从相册选择$/})).toHaveCount(3)
    await expect(menu.getByRole('button',{name:/文件/})).toHaveCount(0)
    const chooser=page.waitForEvent('filechooser');await menu.getByRole('button',{name:source,exact:true}).click()
    const files=await chooser
    expect(await files.element().getAttribute('accept')).toBe(accept)
    expect(await files.element().getAttribute('capture')).toBe(capture?'environment':null)
    await files.setFiles([])
    await expect(menu).toHaveCount(0)
    await expect(text).toHaveValue('合成手填：左肘窝发红')
    await expect(form.locator('.quick-record-photo')).toHaveCount(0)
  }
  let uploads=0;page.on('request',r=>{if(r.method()==='POST'&&/\/media$/.test(new URL(r.url()).pathname))uploads++})
  await form.getByLabel('选择照片').setInputFiles({name:'not-a-photo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF synthetic')})
  await expect(form.getByRole('alert')).toContainText('请选择照片或视频')
  expect(uploads).toBe(0);await expect(text).toHaveValue('合成手填：左肘窝发红')
})

test('photo and video survive reopen and save failure, then persist with the manual record',async({page,request})=>{
  let form=await open(page)
  const reviewRequests:string[]=[]
  page.on('request',r=>{if(/\/media\/[^/]+\/review$/.test(new URL(r.url()).pathname))reviewRequests.push(r.method())})
  const narrative='合成手动附件验收：左肘窝发红、发痒'
  await form.getByLabel('哪里不舒服').fill(narrative)
  await form.getByLabel('手动补充症状部位').fill('左肘窝')
  await form.getByRole('button',{name:/补充信息/}).click();await form.getByRole('button',{name:'中度',exact:true}).click()
  const photoUpload=page.waitForResponse(r=>r.request().method()==='POST'&&/\/media$/.test(new URL(r.url()).pathname))
  await form.getByLabel('选择照片').setInputFiles({name:'manual-photo.png',mimeType:'image/png',buffer:pixel})
  const uploaded=await photoUpload,photoResult=await uploaded.json()
  expect(uploaded.request().headers()['x-hoooho-media-review']).toBe('skip')
  expect(photoResult.review).toBeUndefined()
  await expect(form.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(1)
  const attachment=form.getByRole('region',{name:'附件',exact:true})
  await expect(attachment.locator('.quick-record-photos__heading,.media-item-details')).toHaveCount(0)
  await expect(attachment.getByText(/manual-photo|原件|口述|画面|MB|已添加/)).toHaveCount(0)
  await expect(attachment.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  await mkdir('outputs/symptom-manual',{recursive:true})
  await page.screenshot({path:'outputs/symptom-manual/manual-photo-only.png'})
  await form.getByRole('button',{name:'查看照片 1',exact:true}).click()
  const photoPreview=page.getByRole('dialog',{name:'照片预览',exact:true})
  await expect(photoPreview).toBeVisible();await photoPreview.getByRole('button',{name:'关闭大图预览',exact:true}).click()
  await form.getByLabel('拍摄视频').setInputFiles('public/tutorials/recordings/create-event.webm')
  await expect(form.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(2)
  await expect(form.locator('.media-item-details,.quick-record-photos__heading')).toHaveCount(0)
  expect(reviewRequests).toHaveLength(0)
  page.on('dialog',d=>void d.accept())
  await form.getByRole('button',{name:'返回',exact:true}).click()
  await page.reload();await enterManual(page)
  form=page.getByRole('dialog',{name:'记录症状',exact:true})
  await expect(form.getByLabel('哪里不舒服')).toHaveValue(narrative)
  await expect(form.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(2)
  await form.getByRole('button',{name:'查看视频 2',exact:true}).click()
  const preview=page.getByRole('dialog',{name:'视频预览',exact:true});await expect(preview).toBeVisible();await preview.getByRole('button',{name:'关闭大图预览',exact:true}).click()
  let fail=true
  await page.route('**/api/quick-records',r=>fail?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成保存失败'}})}):r.continue())
  await form.getByRole('button',{name:'保存记录',exact:true}).click()
  await expect(form.getByText('合成保存失败',{exact:true})).toBeVisible()
  await expect(form.getByLabel('哪里不舒服')).toHaveValue(narrative)
  await expect(form.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(2)
  fail=false
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quick-records'&&r.request().method()==='POST')
  await form.getByRole('button',{name:'保存记录',exact:true}).click()
  const response=await saved;expect(response.status()).toBe(201)
  const result=await response.json();await expect(form).toHaveCount(0)
  const records=await(await request.get(`/api/events/${result.eventId}/records`,{headers})).json()
  const record=records.find((r:any)=>r.id===result.recordId)
  expect(record.content).toBe(narrative);expect(record.journal.symptom.locationText).toBe('左肘窝');expect(record.journal.symptom.impactLevel).toBe('some')
  const attachments=await(await request.get(`/api/events/${result.eventId}/attachments`,{headers})).json()
  expect(attachments.filter((a:any)=>a.recordId===result.recordId)).toHaveLength(2)
  for(const item of attachments.filter((a:any)=>a.recordId===result.recordId))expect(item.mediaReview).toBeFalsy()
  expect(reviewRequests).toHaveLength(0)
})

test('failed attachment retries and removes without clearing manually entered text',async({page})=>{
  const form=await open(page);await form.getByLabel('哪里不舒服').fill('合成原文不丢失')
  let fail=true
  await page.route('**/api/quick-records/*/media',r=>fail?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成上传失败'}})}):r.continue())
  await form.getByLabel('选择照片').setInputFiles({name:'retry.png',mimeType:'image/png',buffer:pixel})
  await expect(form.getByRole('button',{name:'重试上传 retry.png',exact:true})).toBeVisible()
  fail=false;await form.getByRole('button',{name:'重试上传 retry.png',exact:true}).click()
  await expect(form.locator('.quick-record-photo[data-status="uploaded"]')).toHaveCount(1)
  await form.getByRole('button',{name:'删除照片 1',exact:true}).click()
  await expect(form.locator('.quick-record-photo')).toHaveCount(0)
  await expect(form.getByLabel('哪里不舒服')).toHaveValue('合成原文不丢失')
})

test('new native capability is single-flight, cancel-safe and ignores results after leaving',async({page})=>{
  await page.addInitScript(()=>{
    const fixture=window as any;fixture.__manualPickerCalls=[]
    fixture.hooohoNativeAttachments=Object.assign((options:any)=>{fixture.__manualPickerCalls.push(options);return new Promise((resolve,reject)=>{fixture.__manualPickResolve=resolve;fixture.__manualPickReject=reject})},{supportsMediaOnly:true})
  })
  let form=await open(page);await form.getByLabel('哪里不舒服').fill('合成原生取消正文')
  await form.getByRole('button',{name:'添加附件',exact:true}).click()
  await expect(form.getByRole('button',{name:'添加附件',exact:true})).toBeDisabled()
  await expect(form.getByRole('button',{name:'保存记录',exact:true})).toBeDisabled()
  expect(await page.evaluate(()=>(window as any).__manualPickerCalls)).toEqual([{mediaOnly:true}])
  await page.evaluate(()=>(window as any).__manualPickReject(new DOMException('cancel','AbortError')))
  await expect(form.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  await expect(form.getByLabel('哪里不舒服')).toHaveValue('合成原生取消正文')
  await expect(form.getByRole('alert')).toHaveCount(0)
  await form.getByRole('button',{name:'添加附件',exact:true}).click()
  page.on('dialog',d=>void d.accept());await form.getByRole('button',{name:'返回',exact:true}).click()
  await page.evaluate(()=>(window as any).__manualPickResolve({files:[new File(['late'],'late.png',{type:'image/png'})],origin:'library'}))
  await enterManual(page);form=page.getByRole('dialog',{name:'记录症状',exact:true})
  await expect(form.getByLabel('哪里不舒服')).toHaveValue('合成原生取消正文')
  await expect(form.locator('.quick-record-photo')).toHaveCount(0)
})

test('old native picker falls back to three choices without invoking its file menu',async({page})=>{
  await page.addInitScript(()=>{(window as any).hooohoNativeAttachments=()=>{throw new Error('The old four-source menu must not be used')}})
  const form=await open(page);await form.getByRole('button',{name:'添加附件',exact:true}).click()
  const menu=page.getByRole('dialog',{name:'添加附件',exact:true})
  await expect(menu.getByRole('button',{name:'拍照',exact:true})).toBeVisible()
  await expect(menu.getByRole('button',{name:'拍视频',exact:true})).toBeVisible()
  await expect(menu.getByRole('button',{name:'从相册选择',exact:true})).toBeVisible()
  await expect(menu.getByRole('button',{name:/文件/})).toHaveCount(0)
})
