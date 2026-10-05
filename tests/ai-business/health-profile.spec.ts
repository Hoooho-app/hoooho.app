import { expect,test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
test.beforeEach(async({page,request})=>{await request.get('http://127.0.0.1:4198/success');await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}});await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))},token)})
test('HP首页实机尺寸、顺序与全部真实入口，失败数量不伪装零',async({page})=>{
  await page.goto('/health-profile');await expect(page.getByText(/待排查 \d+ · 已明确 \d+/)).toBeVisible()
  const labels=['过敏史','慢性病史','家族史','手术史','疫苗接种记录']
  expect(await page.locator('.health-profile-entry strong').allTextContents()).toEqual(labels)
  await expect(page.getByRole('heading',{name:'孩子档案',exact:true})).toHaveCount(1)
  await expect(page.locator('header').getByRole('heading',{name:'孩子档案',exact:true})).toBeVisible()
  const smart=page.locator('.health-profile-smart-record')
  await expect(smart.locator('strong')).toHaveText('上传资料')
  await expect(smart.locator('small')).toHaveText('报告、病历、接种回执，自动整理到各项档案')
  await expect(smart.locator('svg')).toHaveCount(1)
  await expect(smart.locator('svg')).toHaveClass(/lucide-upload/)
  const smartStyle=await smart.evaluate(el=>{const title=el.querySelector('strong')!,caption=el.querySelector('small')!;return {height:el.getBoundingClientRect().height,title:parseFloat(getComputedStyle(title).fontSize),caption:parseFloat(getComputedStyle(caption).fontSize)}})
  expect(smartStyle.height).toBeGreaterThanOrEqual(44);expect(smartStyle.height).toBeLessThan(92)
  expect(smartStyle.title).toBe(16);expect(smartStyle.caption).toBe(12)
  const native=page.waitForEvent('filechooser');await smart.focus();await page.keyboard.press('Enter');await(await native).setFiles([]);await expect(page).toHaveURL(/health-profile$/);await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/health-profile')
  await expect(page.getByText(/暂未开放|更多健康档案|家族遗传史/)).toHaveCount(0)
  for(const [width,height] of [[375,667],[320,667],[390,844],[430,932],[1280,800]]){
    await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await expect(smart.locator('small br')).toHaveCount(0)
    if(width>=375)expect(await smart.locator('small').evaluate(el=>el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight))).toBeLessThan(1.1)
    const button=page.locator('.health-profile-smart-record');const box=await button.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(height)
    expect(await page.locator('.health-profile-entry').evaluateAll(rows=>rows.every(r=>r.getBoundingClientRect().height>=44))).toBe(true)
    await page.screenshot({path:`outputs/health-profile/home-${width}.png`,fullPage:true})
  }
  await page.setViewportSize({width:375,height:667})
  for(const [label,path] of labels.map((label,i)=>[label,['allergy','chronic','family-history','surgery','vaccination'][i]])){
    await page.goto('/health-profile');await page.getByRole('button',{name:new RegExp(label)}).click();await expect(page).toHaveURL(new RegExp(`/health-profile/${path}`));await expect(page.getByRole('heading',{name:label,exact:true}).first()).toBeVisible()
  }
  await page.goto('/health-profile');await page.getByRole('button',{name:'就诊情况单，孩子情况快速整理'}).click();await expect(page).toHaveURL(/visit-summary/)
  await page.goto('/health-profile');await expect(page.locator('.health-profile-smart-record')).toBeVisible();await page.addStyleTag({content:'html{font-size:24px}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.health-profile-smart-record').scrollIntoViewIfNeeded();await expect(page.locator('.health-profile-smart-record')).toBeVisible()
  let calls=0;await page.route('**/api/auth/profile-sections',route=>++calls===1?route.fallback():route.fulfill({status:503,json:{error:{message:'合成加载失败'}}}));await page.goto('/health-profile');await expect(page.getByText('数量暂不可用，点击查看')).toBeVisible();await expect(page.getByText('待排查 0 · 已明确 0')).toHaveCount(0)
})
test('多页资料核对后归档多个栏目、真实统计刷新、原件保留与重复提交',async({page,request})=>{
  const text='2026-09-29\n牛奶\n待排查\n父亲\n疑似哮喘\n阑尾切除术\n乙肝疫苗\n第2剂'
  const make=(category:string,archiveCategory:string,fields:Record<string,string>)=>({category,archiveCategory,subject:'current',title:'合成资料',timeText:'2026-09-29',relationKey:null,fields:Object.entries(fields).map(([name,value])=>({name,value,quote:value,sourceId:'@first',page:1}))})
  await request.post('http://127.0.0.1:4198/draft-data',{data:{ocrText:text,items:[make('examination','allergy',{allergen:'牛奶',allergyStatus:'待排查'}),make('other','family-history',{relationship:'父亲',historyName:'疑似哮喘'}),make('other','surgery',{historyName:'阑尾切除术'}),make('vaccination','vaccination',{vaccineName:'乙肝疫苗',doseOriginal:'第2剂'})]}})
  await page.goto('/health-profile/smart-record');await page.getByRole('button',{name:'上传与智能识别'}).click();const sheet=page.getByRole('dialog',{name:'智能整理记录'})
  const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();await sheet.getByLabel('上传资料',{exact:true}).setInputFiles({name:'合成双页.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())})
  await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('button',{name:'已核对，一次保存 4 条'})).toBeEnabled()
  await expect(sheet.getByText('资料归属：空资料（虚构）。核对并确认后才会写入正式档案。')).toBeVisible()
  await expect(sheet.getByRole('combobox',{name:'归档位置',exact:true})).toHaveCount(4)
  await page.screenshot({path:'outputs/health-profile/review.png',fullPage:true})
  const draft=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json()
  expect((await request.get(`/api/members/child-a/ai-drafts/${draft.id}`,{headers})).status()).toBe(404)
  await sheet.getByRole('button',{name:'已核对，一次保存 4 条'}).click();await expect(sheet.getByText('已保存 4 条记录',{exact:true})).toBeVisible()
  const saved=await(await request.get(`/api/members/empty-child/ai-drafts/${draft.id}`,{headers})).json()
  const repeat=await(await request.post(`/api/members/empty-child/ai-drafts/${draft.id}/save`,{headers,data:{version:draft.version,confirmed:true}})).json();expect(repeat.result).toEqual(saved.result)
  const profileResponse=await page.request.get('/api/auth/profile-sections',{headers});expect(profileResponse.ok()).toBe(true);const profiles=await profileResponse.json()
  expect(profiles.find((p:any)=>p.memberId==='empty-child'&&p.sectionId==='allergy').records[0].currentStatus).toBe('investigating')
  expect(profiles.find((p:any)=>p.memberId==='empty-child'&&p.sectionId==='family-history').records[0].healthIssues[0].name).toBe('疑似哮喘')
  expect(profiles.filter((p:any)=>p.memberId==='empty-child'&&p.sectionId==='vaccination').length).toBe(0)
  await sheet.getByRole('button',{name:'完成',exact:true}).click();await page.goto('/health-profile');await expect(page.getByText('待排查 1 · 已明确 0')).toBeVisible()
  await page.goto('/health-profile/vaccination');await page.getByRole('button',{name:'1岁',exact:true}).click();await page.getByRole('button',{name:'编辑乙肝疫苗',exact:true}).click();await expect(page.getByLabel('疫苗名称',{exact:true})).toHaveValue('乙肝疫苗');await page.getByLabel('疫苗名称',{exact:true}).fill('乙肝疫苗（已核对）');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('乙肝疫苗（已核对）（第2剂）',{exact:true})).toBeVisible()
  await page.goto('/health-profile/smart-record');await page.getByRole('button',{name:/牛奶/}).click();await page.getByRole('button',{name:'读取原件 1'}).click();await expect(page.getByRole('link',{name:'查看原件 1'})).toHaveAttribute('href',/^blob:/)
})
test('服务不可用保留可重试原件、取消不保存、手动保存不冒充AI',async({page,request})=>{
  await request.get('http://127.0.0.1:4198/failure');await page.goto('/health-profile/smart-record');await page.getByRole('button',{name:'上传与智能识别'}).click();const sheet=page.getByRole('dialog',{name:'智能整理记录'})
  const buffer=await sharp({create:{width:50,height:50,channels:3,background:'#fff'}}).png().toBuffer()
  await sheet.getByLabel('上传资料',{exact:true}).setInputFiles({name:'合成失败资料.png',mimeType:'image/png',buffer});await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('button',{name:'保留原件，手动补充'})).toBeVisible()
  const draft=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();expect(draft.state).toBe('failed')
  await expect(sheet.getByRole('button',{name:/已核对，一次保存/})).toHaveCount(0)
  await sheet.getByRole('button',{name:'保留原件，手动补充'}).click();await sheet.getByRole('button',{name:'已核对，一次保存 1 条'}).click();await expect(sheet.getByText('已保存 1 条记录',{exact:true})).toBeVisible();await page.screenshot({path:'outputs/health-profile/manual-fallback.png'})
  const saved=await(await request.get(`/api/members/empty-child/ai-drafts/${draft.id}`,{headers})).json();const attachments=await(await request.get(`/api/events/${saved.result.records[0].eventId}/attachments`,{headers})).json();expect(attachments[0].analysis.status).toBe('unavailable');expect(attachments[0].analysis.provider).toBe('manual')
  await sheet.getByRole('button',{name:'完成',exact:true}).click();await page.getByRole('button',{name:'上传与智能识别'}).click();await sheet.getByLabel('原始记录内容').fill('取消合成输入');await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('alert')).toBeVisible();const cancelled=await(await request.get('/api/members/empty-child/ai-drafts',{headers})).json();await sheet.getByRole('button',{name:'取消草稿'}).click();expect((await request.get(`/api/members/empty-child/ai-drafts/${cancelled.id}`,{headers})).status()).toBe(404)
})
