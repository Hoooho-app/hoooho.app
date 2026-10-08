// Public production checks by default; staging-only opt-in creates one synthetic account.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'
const target=process.env.HELP_ACCEPTANCE_TARGET??'production'
assert.ok(['staging','production'].includes(target))
const live=target==='staging'&&process.env.RUN_HELP_ACCEPTANCE==='1'
const base=target==='staging'?'https://hooohoapp-staging.up.railway.app':'https://hoooho.com'
const output=path.resolve('.codex-tmp/help-release',target)
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE})
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
const page=await context.newPage(),errors=[]
page.on('pageerror',error=>errors.push(error.name))
const results={target,checks:{},aiCalls:0}
let token
async function api(url,data,method='POST'){
  const r=await context.request.fetch(base+url,{method,headers:{Origin:base,...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{data}),timeout:40_000,maxRetries:0})
  const body=await r.json()
  assert.ok(r.ok(),`${url} ${r.status()} ${body.error?.code??''}`)
  return body
}
try{
  assert.equal((await context.request.get(base+'/api/health')).status(),200)
  const unauthorized=await context.request.post(base+'/api/help/sessions',{data:{}})
  assert.equal(unauthorized.status(),401)
  await page.goto(base+'/help')
  await expect(page.getByRole('radio',{name:'用户手册',exact:true})).toBeVisible()
  await page.getByLabel('搜索教程和问题').fill('录音')
  await expect(page.getByText('录音没反应或转写失败怎么办？',{exact:true})).toBeVisible()
  await page.getByRole('radio',{name:'用户手册',exact:true}).click()
  await page.getByText('智能记录',{exact:true}).click()
  await expect(page.getByText('为什么设计这个功能',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'查看操作帮助',exact:true}).click()
  await expect(page.getByRole('link',{name:'去智能记录',exact:true})).toHaveAttribute('href','/smart-record')
  results.checks.publicHelp='PASS';results.checks.authentication='PASS'
  await page.screenshot({path:path.join(output,'operation-help.png')})
  if(live){
    const registered=await api('/api/auth/register',{nickname:'帮助验收'+randomUUID().slice(0,8),password:randomUUID(),idempotencyKey:randomUUID()})
    token=registered.token
    assert.ok(token)
    let session=await api('/api/help/sessions',{})
    session=await api(`/api/help/sessions/${session.id}/turns`,{text:'我想保存情况单到手机，请告诉我怎么操作。',requestId:randomUUID(),version:session.version})
    results.aiCalls++
    const answer=session.turns.at(-1)
    assert.equal(answer.mode,'ai','Real model reply unavailable')
    assert.ok(answer.articleIds.length>0)
    assert.ok(answer.askResolved,'Solution should request user confirmation')
    assert.doesNotMatch(answer.text,/https?:\/\//)
    results.reply=answer.text
    session=await api(`/api/help/sessions/${session.id}/ratings`,{turnId:answer.id,solved:false,version:session.version})
    assert.equal(session.ratings[0].solved,false)
    assert.match(session.turns.at(-1).text,/继续排查/)
    const restored=await api(`/api/help/sessions/${session.id}`,undefined,'GET')
    assert.equal(restored.version,session.version)
    assert.equal(restored.ratings.length,1)
    await page.goto(base+'/help?view=chat')
    await expect(page.getByText(answer.text,{exact:true})).toBeVisible()
    await expect(page.getByLabel('描述遇到的问题')).toBeVisible()
    await page.getByLabel('描述遇到的问题').fill('这段内容尚未发送')
    await page.getByRole('radio',{name:'用户手册',exact:true}).click()
    await page.getByRole('radio',{name:'帮助',exact:true}).click()
    await expect(page.getByLabel('描述遇到的问题')).toHaveValue('这段内容尚未发送')
    await page.screenshot({path:path.join(output,'real-model-and-feedback.png')})
    results.checks.realModel='PASS';results.checks.feedback='PASS';results.checks.tabContinuity='PASS'
    await api('/api/auth/logout',{})
  }
  assert.deepEqual(errors,[])
  results.checks.runtime='PASS'
  await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2))
  console.log(JSON.stringify(results))
}finally{await browser.close()}
