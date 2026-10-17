import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
const headers={Authorization:`Bearer ${token}`}
let memberId:string
const control=process.env.VISIT_CONTROL_URL??'http://127.0.0.1:4298'
test.beforeEach(async({page,request})=>{
 memberId=(await(await request.post('/api/members',{headers,data:{name:'首页验收（虚构）',relationship:'child'}})).json()).id
 await request.get(`${control}/success`)
 await request.post(`${control}/draft-data`,{data:{items:null}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
})
async function saveSymptom(page:any){
 await page.goto('/smart-record?source=front-desk')
 await page.getByRole('button',{name:'改用文字'}).click()
 await page.getByLabel('对话输入').fill('今天头皮出现皮疹，反复抓挠')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.getByRole('button',{name:'直接记录',exact:true}).last().click()
 await expect(page.getByRole('region',{name:'症状合并建议'})).toBeVisible()
}
test('home restores situation sheet and real symptom detail, filling SE and taller viewports',async({page,request},info)=>{
 await request.post(`/api/members/${memberId}/case-records`,{headers,data:{requestId:crypto.randomUUID(),text:'头皮发痒，反复抓挠',occurredAt:new Date(Date.now()-60000).toISOString(),files:[],journal:{categories:['symptom']}}})
 await page.goto('/nurse-station')
 await expect(page.getByRole('region',{name:'症状事件'})).toContainText('头皮发痒，反复抓挠')
 await expect(page.locator('.home-symptom-meta')).toContainText('最近记录')
 await expect(page.getByRole('region',{name:'症状事件'}).getByText(/已记录\s*\d+\s*条/)).toHaveCount(0)
 await expect(page.locator('.home-followup-count')).toHaveText('1 项')
 await expect(page.getByRole('button',{name:'合并这两项',exact:true})).toHaveCount(0)
 await expect(page.getByRole('region',{name:'症状合并建议'})).toHaveCount(0)
 const heights:number[]=[]
 for(const size of [{width:375,height:667},{width:393,height:852},{width:320,height:568}]){
  await page.setViewportSize(size)
  const journal=page.locator('.home-flow-card.nurse-home-dialogue')
  const rect=(await journal.boundingBox())!;heights.push(rect.height)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  const metrics=await page.locator('.nurse-station-scroll').evaluate(el=>({overflow:el.scrollHeight>el.clientHeight+1,bottom:el.getBoundingClientRect().bottom,padding:parseFloat(getComputedStyle(el).paddingBottom)}))
  if(size.width!==320){expect(metrics.overflow,JSON.stringify({size,metrics,rect})).toBe(false);expect(metrics.bottom-rect.y-rect.height).toBeLessThanOrEqual(metrics.padding+2)}
  for(const label of ['情况单','智能记录'])expect((await page.getByRole('button',{name:label,exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({path:info.outputPath(`home-${size.width}-${size.height}.png`)})
 }
 expect(heights[1]).toBeGreaterThan(heights[0]+80)
 await page.getByRole('button',{name:'情况单',exact:true}).click()
 await expect(page).toHaveURL(/\/visit-summary/)
})
test('merge is offered inside the saved smart record and preserves both original records',async({page,request},info)=>{
 await request.post(`/api/members/${memberId}/case-records`,{headers,data:{requestId:crypto.randomUUID(),text:'头皮发痒',occurredAt:new Date(Date.now()-60000).toISOString(),files:[],journal:{categories:['symptom']}}})
 await saveSymptom(page)
 const prompt=page.getByRole('region',{name:'症状合并建议'})
 await expect(prompt).toContainText('原文、图片和时间都会保留')
 await page.screenshot({path:info.outputPath('smart-record-merge.png')})
 await prompt.getByRole('button',{name:'合并到该事件',exact:true}).click()
 await expect(prompt).toHaveCount(0)
 const data=await(await request.get(`/api/members/${memberId}/cases`,{headers})).json()
 expect(data.active).toHaveLength(1);expect(data.active[0].followup.recordCount).toBe(2)
 const records=await(await request.get(`/api/members/${memberId}/cases/${data.active[0].event.id}/records`,{headers})).json()
 expect(records).toHaveLength(2)
 expect(records.map((r:any)=>r.content).join(' ')).toContain('头皮发痒')
 await page.goto('/nurse-station');await expect(page.getByRole('region',{name:'症状事件'})).toContainText('1 项')
 await expect(page.getByRole('region',{name:'症状合并建议'})).toHaveCount(0)
})
test('keep separate persists the decision without merging',async({page,request})=>{
 await request.post(`/api/members/${memberId}/case-records`,{headers,data:{requestId:crypto.randomUUID(),text:'头皮发痒',occurredAt:new Date(Date.now()-60000).toISOString(),files:[],journal:{categories:['symptom']}}})
 await saveSymptom(page)
 await page.getByRole('button',{name:'保持独立',exact:true}).click()
 await expect(page.getByRole('region',{name:'症状合并建议'})).toHaveCount(0)
 const data=await(await request.get(`/api/members/${memberId}/cases`,{headers})).json()
 expect(data.active).toHaveLength(2)
 expect(data.active.some((i:any)=>i.event.caseSeparateIds?.length)).toBe(true)
})
