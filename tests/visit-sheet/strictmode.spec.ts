import {expect,test} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
test('开发 StrictMode 重开导出不复用取消信号，Vite 照片真实上传可保存',async({page})=>{
  const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'child-a',members:[],profile:null},version:5}))},token)
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/visit-summary');await expect(page.locator('#chapter-overview h1')).toBeVisible()
  await page.getByRole('button',{name:'编辑完整资料',exact:true}).click();await page.getByRole('button',{name:'添加 / 调整影像',exact:true}).click()
  const picker=page.getByRole('dialog',{name:'添加 / 调整影像'})
  const buffer=await(await page.request.get('/api/events/event-a/attachments/v5-image-0/content',{headers:{Authorization:`Bearer ${token}`}})).body()
  await picker.getByLabel('选择要上传的影像').setInputFiles({name:'StrictMode合成.png',mimeType:'image/png',buffer})
  await expect(picker.getByText(/上传完成，待保存/)).toBeVisible()
  await picker.getByRole('button',{name:'保存影像选择'}).click();await expect(picker).toHaveCount(0)
  for(let i=0;i<2;i++){
    await page.getByRole('button',{name:'导出情况单',exact:true}).click()
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存离线情况单（HTML）',exact:true}).click();await download
    await page.getByRole('dialog',{name:'导出情况单'}).getByRole('button',{name:'返回导出情况单',exact:true}).click()
  }
  expect(errors).toEqual([])
})

test('开发 StrictMode 上传等待中切换孩子，迟到图片不串成员',async({page})=>{
  const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'child-a',members:[],profile:null},version:5}))},token)
  await page.goto('/visit-summary');await expect(page.locator('#chapter-overview h1')).toBeVisible()
  const buffer=await(await page.request.get('/api/events/event-a/attachments/v5-image-0/content',{headers})).body()
  let release!:()=>void,uploaded!:()=>void,draftId='';const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>uploaded=r)
  await page.route('**/api/quick-records/*/photos',async route=>{if(route.request().method()!=='POST')return route.continue();draftId=new URL(route.request().url()).pathname.split('/')[3];const response=await route.fetch();uploaded();await gate;await route.fulfill({response}).catch(()=>{})})
  await page.getByRole('button',{name:'编辑完整资料',exact:true}).click();await page.getByRole('button',{name:'添加 / 调整影像',exact:true}).click();await page.getByLabel('选择要上传的影像').setInputFiles({name:'不能串孩子.png',mimeType:'image/png',buffer});await ready
  await page.evaluate(async()=>{const modulePath='/src/store/useAppStore.ts';const {useAppStore}=await import(/* @vite-ignore */ modulePath);useAppStore.getState().setCurrentMemberId('empty-child',{sync:false})})
  await expect(page.locator('.visit-reading-person')).toContainText('空资料（虚构）');release()
  await expect(page.getByRole('dialog',{name:'添加 / 调整影像'})).toHaveCount(0)
  await expect.poll(async()=>{const response=await page.request.get(`/api/quick-records/${draftId}/photos`,{headers:{...headers,'X-Hoooho-Member-Id':'child-a'}});return(await response.json()).length}).toBe(0)
  const state=await(await page.request.get('/api/members/empty-child/visit-sheet',{headers})).json()
  expect(state.report.member.name).toBe('空资料（虚构）');expect(state.report.photos).toHaveLength(0)
  await expect(page.locator('.visit-photos img')).toHaveCount(0)
})
