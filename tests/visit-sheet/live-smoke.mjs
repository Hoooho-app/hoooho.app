import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium, devices } from '@playwright/test'

const baseURL = process.argv[2]
if (!['https://hoooho.com', 'https://staging.hoooho.com', 'https://hooohoapp-staging.up.railway.app'].includes(baseURL)) throw new Error('Explicit verified target required')
const browser=await chromium.launch()
const context=await browser.newContext({...devices['iPhone SE (3rd gen)'],timezoneId:'Asia/Shanghai'})
const page=await context.newPage(), failures=[]
page.on('pageerror',()=>failures.push('pageerror'))
page.on('response',r=>{if(r.status()>=500)failures.push(`${new URL(r.url()).pathname}: ${r.status()}`)})
await mkdir('outputs/visit-sheet',{recursive:true})
const prefix=`outputs/visit-sheet/${new URL(baseURL).hostname}`
let memberId,eventId,recordIds=[]
async function api(url,body,method='POST'){
  return page.evaluate(async({url,body,method})=>{
    const session=await(await fetch('/api/auth/session')).json()
    const response=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`,'X-Hoooho-Timezone':'Asia/Shanghai'},...(body===undefined?{}:{body:JSON.stringify(body)})})
    if(!response.ok)throw new Error(`smoke ${method} ${url}: ${response.status}`)
    return response.json()
  },{url,body,method})
}
try{
  assert.equal((await context.request.get(`${baseURL}/api/health`)).status(),200)
  await page.goto(`${baseURL}/login`)
  await page.getByRole('tab',{name:'注册',exact:true}).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`情况单验收${randomUUID().slice(0,6)}`)
  await page.getByPlaceholder('设置一个密码').fill(randomUUID())
  await page.getByRole('button',{name:'注册并进入'}).click()
  await page.waitForURL(/nurse-station/)
  memberId=(await api('/api/members',{name:'情况单验收（合成）',relationship:'child',birthday:'2024-01-01',gender:'female'})).id
  await api('/api/auth/current-member',{memberId})
  const occurredAt=new Date(Date.now()-86400000).toISOString()
  eventId=(await api('/api/events',{memberId,title:'发布验收合成事件',category:'other',startTime:occurredAt})).id
  const record=await api(`/api/events/${eventId}/records`,{type:'note',sourceType:'user_record',content:'发布验收：肘窝皮肤发红',occurredAt,journal:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'发布验收：肘窝皮肤发红',locations:[],descriptors:[],impactLevel:'little'}}})
  recordIds.push(record.id)
  await page.goto(`${baseURL}/nurse-station`)
  await page.getByRole('button',{name:'就诊情况单',exact:true}).click()
  await page.getByRole('heading',{name:'病情数据',exact:true}).waitFor()
  const initial=await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')
  assert.equal(initial.report.complaintSourceId,`record:${record.id}`)
  assert.equal(initial.report.chapters.length,9)
  await page.screenshot({path:`${prefix}-auto.png`})
  await page.getByRole('button',{name:'更改',exact:true}).click()
  await page.getByLabel('自己填写主诉').check()
  await page.getByLabel('本次主诉（家长陈述）').fill('合成验收：希望核对下一次记录')
  await page.getByRole('button',{name:'保存并更新情况单'}).click()
  await page.getByRole('heading',{name:'合成验收：希望核对下一次记录',exact:true}).waitFor()
  await page.goto(`${baseURL}/health-events`)
  await page.getByRole('button',{name:'就诊情况单，孩子情况快速整理',exact:true}).click()
  await page.getByRole('heading',{name:'病情数据',exact:true}).waitFor()
  const updated=await api(`/api/members/${memberId}/visit-sheet`,undefined,'GET')
  assert.equal(updated.report.id,initial.report.id);assert.equal(updated.report.version,initial.report.version+1);assert.equal(updated.report.focus.mode,'custom')
  for(const title of ['病程','体温','过敏与排敏','用药','成长与日常','既往与家族','就诊检查','附件与依据']){
    await page.getByRole('button',{name:'章节目录',exact:true}).click()
    await page.getByRole('dialog',{name:'章节目录'}).getByRole('button',{name:new RegExp(title)}).click()
    await page.getByRole('heading',{name:title,exact:true}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  }
  for(const width of [375,390,430]){await page.setViewportSize({width,height:667});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  await page.setViewportSize(devices['iPhone SE (3rd gen)'].viewport)
  await page.getByRole('button',{name:'导出情况单',exact:true}).click()
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'保存离线 HTML'}).click();const download=await pending;const file=`${prefix}-report.html`;await download.saveAs(file)
  const html=await readFile(file,'utf8');assert.match(html,/合成验收：希望核对下一次记录/);assert.match(html,/发布验收：肘窝皮肤发红/);assert.ok(!html.includes('Bearer'))
  await page.screenshot({path:`${prefix}-export.png`})
  assert.deepEqual(failures,[])
  console.log(JSON.stringify({target:baseURL,health:'PASS',bothEntries:'PASS',autoGenerate:'PASS',persistedFocus:'PASS',nineChapters:'PASS',offlineExport:'PASS',widths:[375,390,430],runtimeErrors:0}))
}catch(error){await page.screenshot({path:`${prefix}-failure.png`}).catch(()=>{});throw error}
finally{
  // Only identifiers created above in this isolated synthetic account are removed.
  for(const id of recordIds)await api(`/api/records/${id}`,undefined,'DELETE')
  if(eventId)await api(`/api/events/${eventId}`,undefined,'DELETE')
  if(memberId)await api(`/api/members/${memberId}`,undefined,'DELETE')
  if(memberId)console.log('Removed only this smoke run\'s synthetic records, event and member; isolated account/report audit remains.')
  await context.close();await browser.close()
}
