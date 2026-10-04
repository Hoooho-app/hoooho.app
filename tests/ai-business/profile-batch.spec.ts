import { expect,test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
const photo=async(name='合成照片.png')=>({name,mimeType:'image/png',buffer:await sharp({create:{width:50,height:50,channels:3,background:'#fff'}}).png().toBuffer()})
test.beforeEach(async({page,request})=>{await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}});await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))},token)})
test('批量原生入口、多选/追加/拍照/取消/移除、视频拒绝与一次整理保存',async({page,request})=>{
  const text='2026-09-29\n牛奶\n待排查\n父亲\n疑似哮喘\n阑尾切除术\n乙肝疫苗\n第2剂'
  const make=(category:string,archiveCategory:string,fields:Record<string,string>)=>({category,archiveCategory,subject:'current',title:'合成资料',timeText:'2026-09-29',relationKey:null,fields:Object.entries(fields).map(([name,value])=>({name,value,quote:value,sourceId:'@first',page:1}))})
  await request.post('http://127.0.0.1:4198/draft-data',{data:{ocrText:text,items:[make('vaccination','vaccination',{vaccineName:'乙肝疫苗',doseOriginal:'第2剂'}),make('other','surgery',{historyName:'阑尾切除术'}),make('other','family-history',{relationship:'父亲',historyName:'疑似哮喘'}),make('examination','allergy',{allergen:'牛奶',allergyStatus:'待排查'})]}})
  await page.goto('/health-profile');const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage()
  let picker=page.waitForEvent('filechooser');await page.locator('.health-profile-smart-record').click();await(await picker).setFiles([await photo(),{name:'合成双页.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())}])
  const sheet=page.getByRole('dialog',{name:'上传资料'});await expect(sheet.locator('li')).toHaveCount(2)
  const before=await(await request.get('http://127.0.0.1:4198/status')).json()
  picker=page.waitForEvent('filechooser');await sheet.getByRole('button',{name:'继续添加',exact:true}).click();await(await picker).setFiles([]);await expect(sheet.locator('li')).toHaveCount(2)
  picker=page.waitForEvent('filechooser');await sheet.getByRole('button',{name:'继续拍照',exact:true}).click();await(await picker).setFiles(await photo('追加.png'));await expect(sheet.locator('li')).toHaveCount(3)
  picker=page.waitForEvent('filechooser');await sheet.getByRole('button',{name:'继续添加',exact:true}).click();await(await picker).setFiles({name:'伪装图片.png',mimeType:'image/png',buffer:Buffer.from('video')});await expect(sheet.getByRole('alert')).toContainText('仅支持');await expect(sheet.locator('li')).toHaveCount(3)
  expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls).toBe(before.calls)
  await sheet.getByRole('button',{name:'移除追加.png',exact:true}).click();await expect(sheet.locator('li')).toHaveCount(2)
  await expect(page.getByLabel('拍摄资料照片')).toHaveAttribute('capture','environment');await expect(page.getByLabel('选择上传资料')).toHaveAttribute('multiple','');await expect(page.getByLabel('选择上传资料')).not.toHaveAttribute('accept',/video|audio/)
  await sheet.getByRole('button',{name:'开始整理',exact:true}).click()
  const result=page.getByRole('dialog',{name:'整理结果'});await expect(result.getByRole('button',{name:'保存到档案',exact:true})).toBeEnabled();expect(await result.locator('h3').allTextContents()).toEqual(['过敏史','家族史','手术史','疫苗接种记录']);await expect(result.getByText('资料归属：空资料（虚构）',{exact:true})).toBeVisible()
  for(const width of [375,320,390,430]){await page.setViewportSize({width,height:667});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`outputs/profile-batch/review-${width}.png`,fullPage:true})}
  const draft=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(draft.pages.length).toBe(3);expect((await request.get(`/api/members/child-a/ai-drafts/${draft.id}`,{headers})).status()).toBe(404)
  expect((await(await request.get('http://127.0.0.1:4198/status')).json()).calls-before.calls).toBe(4) // Three OCR pages, one context extraction.
  await result.getByRole('button',{name:'保存到档案',exact:true}).click();await expect(page.getByText('资料已整理到档案',{exact:true})).toBeVisible()
  const saved=await(await request.get(`/api/members/empty-child/ai-drafts/${draft.id}`,{headers})).json();expect((await(await request.post(`/api/members/empty-child/ai-drafts/${draft.id}/save`,{headers,data:{version:draft.version,confirmed:true}})).json()).result).toEqual(saved.result)
  const attachments=await(await request.get(`/api/events/${saved.result.records[0].eventId}/attachments`,{headers})).json();expect(attachments.filter((f:any)=>draft.pages.some((p:any)=>p.id===`file-${f.contentHash.slice(0,24)}`)).length).toBe(2)
})
test('识别失败保留资料、重试成功可核对，取消不写档案',async({page,request})=>{
  await request.get('http://127.0.0.1:4198/failure');await page.goto('/health-profile');const picker=page.waitForEvent('filechooser');await page.locator('.health-profile-smart-record').click();await(await picker).setFiles(await photo('失败可重试.png'))
  const sheet=page.getByRole('dialog',{name:'上传资料'});await sheet.getByRole('button',{name:'开始整理',exact:true}).click();await expect(sheet.getByRole('alert')).toBeVisible();await expect(sheet.locator('li')).toHaveCount(1);await expect(page.getByRole('button',{name:'保存到档案',exact:true})).toHaveCount(0)
  const failed=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(failed.state).toBe('failed');expect(failed.pages.length).toBe(1)
  await request.get('http://127.0.0.1:4198/success');await sheet.getByRole('button',{name:'开始整理',exact:true}).click();await expect(page.getByRole('dialog',{name:'整理结果'})).toBeVisible();await page.getByRole('dialog',{name:'整理结果'}).getByRole('button',{name:'关闭整理结果',exact:true}).click();expect((await request.get(`/api/members/empty-child/ai-drafts/${failed.id}`,{headers})).status()).toBe(404)
})
