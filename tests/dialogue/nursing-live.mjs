// Live-provider acceptance: isolated synthetic records only, fixed official origin.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const base='https://hoooho.com',out='outputs/nursing-record-production',expectedCommit=process.argv[3]
assert.match(expectedCommit??'',/^[a-f0-9]{40}$/)
if(process.argv[2]!==base)throw new Error('Pass the official Production origin explicitly')
await mkdir(out,{recursive:true})
let token,browser;const cookies=new Map(),members=[],checks=[],errors=[]
const result={syntheticOnly:true,physicalIPhone:'NOT_VERIFIED',checks}
async function api(route,method='GET',data){
 const r=await fetch(base+route,{method,headers:{Origin:base,...(token?{Authorization:`Bearer ${token}`} :{}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(120000)})
 for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],at=pair.indexOf('=');if(at>0)cookies.set(pair.slice(0,at),pair.slice(at+1))}
 const v=await r.json();assert.ok(r.ok,`${method} ${route}: ${r.status} ${v.error?.code??''}`);return v
}
try{
 assert.equal((await api('/api/health')).status,'ok')
 const live=await (await fetch(base)).text(),entry=live.match(/src="([^" ]+\/index-[^" ]+\.js)"/)?.[1]
 assert.ok(entry,'deployed frontend entry exists')
 const bundle=await (await fetch(base+entry)).text();assert.ok(bundle.includes(expectedCommit),'deployed frontend must contain the accepted commit')
 checks.push('matching deployed frontend commit')
 const session=await api('/api/auth/register','POST',{nickname:`护理验收${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
 const member=await api('/api/members','POST',{name:'护理记录验收（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'});members.push(member.id)
 await api('/api/auth/current-member','POST',{memberId:member.id})
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']})
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
 await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:'hoooho.com',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})))
 const page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(({token,user,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,currentMemberId:memberId,members:[]},version:5}))},{token,user:session.user,memberId:member.id})
 await page.goto(base+'/nurse-station');await page.getByRole('button',{name:'改用文字',exact:true}).click()
 const original='今天早上身上有点东西，老挠'
 await page.getByLabel('对话输入').fill(original);await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled({timeout:120000})
 let front=await api(`/api/members/${member.id}/front-desk-record`)
 assert.equal(front.interview.question.id,'skin-location');checks.push('real provider selects a concrete body-location question')
 await page.getByLabel('对话输入').fill('还有一段尚未发送的补充')
 await page.getByRole('button',{name:'四肢',exact:true}).click()
 await expect(page.getByRole('button',{name:'四肢',exact:true})).toHaveCount(0,{timeout:120000})
 await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled({timeout:120000})
 await expect(page.getByLabel('对话输入')).toHaveValue('还有一段尚未发送的补充')
 front=await api(`/api/members/${member.id}/front-desk-record`)
 if(front.interview.status==='asking'){
  await page.getByRole('button',{name:'没注意',exact:true}).click()
  await expect(page.getByLabel('回答当前问题')).toHaveCount(0,{timeout:120000})
 }
 await expect(page.getByRole('button',{name:'立即保存',exact:true})).toBeEnabled({timeout:120000})
 front=await api(`/api/members/${member.id}/front-desk-record`)
 assert.ok(front.interview.turnCount<=3);assert.notEqual(front.interview.status,'asking')
 checks.push('bound answers preserve unsent input and unknown ends ordinary questions')
 await page.getByRole('button',{name:'核对记录',exact:true}).click()
 await expect(page.getByLabel('整理后的描述')).toContainText('抓挠')
 assert.equal(await page.locator('details.smart-record-originals').getAttribute('open'),null)
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/professional-review.png`})
 await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('button',{name:'查看',exact:true})).toBeVisible()
 front=await api(`/api/members/${member.id}/front-desk-record`)
 const saved=front.review??await api(`/api/members/${member.id}/ai-drafts/${front.draftId}`)
 for(const ref of saved.result.records){const records=await api(`/api/events/${ref.eventId}/records`),record=records.find(r=>r.id===ref.recordId);assert.equal(record.content,record.aiProvenance.professionalSummary.text);assert.ok(record.sourceText.includes(original))}
 checks.push('professional summary first, folded originals, mobile widths and formal persistence')
 const second=await api('/api/members','POST',{name:'咳嗽问答验收（虚构）',relationship:'child',birthday:'2024-01-01'});members.push(second.id)
 const route=`/api/members/${second.id}/front-desk-record`
 const first=await api(route,'POST',{id:randomUUID(),kind:'text',text:'孩子昨晚开始咳嗽'})
 assert.equal(first.context.interview.question.id,'resp-effort')
 const answer=await api(route,'POST',{id:randomUUID(),kind:'text',text:'没有',answerTo:{contextId:first.context.id,questionId:'resp-effort'}})
 assert.equal(answer.context.id,first.context.id)
 const raw=answer.context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed').map(m=>m.text).join('\n')
 const draft=await api(`/api/members/${second.id}/ai-drafts`,'POST',{text:raw,smartRecord:true,frontDeskRecord:true,frontContextId:answer.context.id})
 assert.match(draft.items.map(i=>i.professionalSummary?.text??'').join('\n'),/家长未见孩子有明显呼吸费力/)
 checks.push('real provider plus bound short answer retains the specific negative observation')
 const sleep=await api(`/api/members/${second.id}/ai-drafts`,'POST',{text:'这两晚孩子睡觉时哭闹，安抚后能继续睡，没有观察到醒来。',smartRecord:true,frontDeskRecord:true})
 assert.ok(sleep.items.some(i=>i.category==='sleep'));assert.ok(!sleep.items.some(i=>i.category==='symptom'));assert.ok(!sleep.items.some(i=>i.fields.some(f=>/夜醒/.test(f.value))))
 checks.push('sleep-only crying stays a sleep observation without an invented awakening or pain')
 assert.deepEqual(errors,[]);result.status='PASS'
}catch(e){result.status='FAILED';result.message=e.message;process.exitCode=1}
finally{
 result.cleanup=[]
 for(const memberId of members)await api(`/api/members/${memberId}`,'DELETE').then(()=>result.cleanup.push('synthetic member removed')).catch(()=>result.cleanup.push('synthetic member cleanup requires follow-up'))
 await browser?.close();await writeFile(`${out}/acceptance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}
