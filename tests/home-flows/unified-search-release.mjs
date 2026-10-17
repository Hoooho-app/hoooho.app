import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
const [origin, commit, speechFile] = process.argv.slice(2)
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(origin))
assert(/^[a-f0-9]{40}$/.test(commit ?? ''))
const target = origin.includes('staging') ? 'staging' : 'production', out = `outputs/unified-search/${target}`
await mkdir(out, { recursive: true })
const report = { target, commit, physicalIPhone: 'NOT_VERIFIED', checks: [], supplierMeasurements: [] }
const proxyUrl = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null
const proxy = proxyUrl ? { server: `${proxyUrl.protocol}//${proxyUrl.host}`, ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : {}) } : undefined
const browser = await chromium.launch({ proxy, args: ['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] })
const sessionFile = `/tmp/hoooho-unified-search-${target}-session.json`
let savedSession
try { savedSession = JSON.parse(await readFile(sessionFile, 'utf8')) } catch(error) { if(error.code !== 'ENOENT') throw error }
const context = await browser.newContext({ ...(savedSession?.storageState ? {storageState:savedSession.storageState} : {}), baseURL: origin, viewport: { width:375,height:667 }, isMobile:true, hasTouch:true, permissions:['microphone'], timezoneId:'Asia/Shanghai', serviceWorkers:'block' })
const page = await context.newPage(), errors = []
page.on('pageerror', error => errors.push(error.message))
let token='', accountId='', memberId='', release=()=>{}
async function api(path, method='GET', data) {
 for(let attempt=0; ;attempt++) {
  const response = await context.request.fetch(path,{method,data,headers:token?{Authorization:`Bearer ${token}`}:{},timeout:35000})
  if(method==='GET' && response.status()>=500 && attempt<2) continue
  if(!response.ok()){const body=await response.json().catch(()=>({}));throw new Error(`${method} ${path}: ${response.status()}${Number.isFinite(body.error?.retryAfter)?`; retry after ${body.error.retryAfter}s`:''}`)}
  return response.json()
 }
}
try {
 assert.equal((await api('/api/health')).status,'ok')
 if(!savedSession?.token){
  const registration=savedSession?.registration??{nickname:`searchqa${randomUUID().replaceAll('-','').slice(0,10)}`,password:randomUUID(),idempotencyKey:randomUUID()}
  await writeFile(sessionFile,JSON.stringify({registration}),{mode:0o600})
  const session=await api('/api/auth/register','POST',registration)
  savedSession={registration,token:session.token,accountId:session.user.id,storageState:await context.storageState()}
  await writeFile(sessionFile,JSON.stringify(savedSession),{mode:0o600})
 }
 token=savedSession.token;accountId=savedSession.accountId
 assert.equal((await api('/api/ai/audio/capabilities')).runtime.commit,commit)
 memberId=(await api('/api/members','POST',{name:'统一查找验收（虚构）',relationship:'child'})).id
 await api('/api/auth/current-member','POST',{memberId})
 await api('/api/quick-records','POST',{memberId,title:'合成皮肤观察',content:'脸颊湿疹、发痒，合成验收原始记录。',rawText:'脸颊湿疹、发痒，合成验收原始记录。',occurredAt:new Date(Date.now()-86400000).toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:['symptom'],timePrecision:'exact'}})
 await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,accountId,memberId})
 let indexes=0,calls=0,payload
 page.on('request',r=>{if(r.url().includes('/journal-index')) indexes++})
 const gate=new Promise(resolve=>{release=resolve})
 await page.route('**/api/ai/audio/transcriptions',async route=>{calls++;payload=route.request().postDataJSON();if(calls===1)await gate;await route.fulfill({json:{transcript:'最近两个月皮肤情况'}}).catch(()=>{})})
 await page.goto('/health-events?view=day&sort=asc',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'搜索健康日历'}).click()
 const input=page.getByLabel('查找记录文字'),hold=page.getByRole('button',{name:'按住说话',exact:true})
 await expect(input).toHaveValue('');await expect(hold).toBeInViewport()
 await expect(page.locator('.quick-search-progress')).toHaveCount(0)
 await input.fill('最近两个月皮肤情况');await expect(page.locator('.journal-search-result')).toHaveCount(1)
 const before=indexes,box=await hold.boundingBox()
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up()
 await expect.poll(()=>calls).toBe(1)
 await expect(page.locator('.quick-search-progress')).toContainText('正在识别你说的话')
 assert.equal(payload.mimeType,'audio/webm');const bytes=Buffer.from(payload.dataUrl.split(',')[1],'base64');assert.equal(bytes.subarray(0,4).toString('hex'),'1a45dfa3');assert(bytes.length<24000)
 for(const width of [320,375,390]){await page.setViewportSize({width,height:667});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await expect(page.locator('.quick-search-progress__label')).toBeInViewport();await expect(page.locator('.quick-search-footer button')).toBeInViewport();await page.screenshot({path:`${out}/calendar-search-${width}.png`})}
 release();await expect(input).toHaveValue('最近两个月皮肤情况');await expect(page.locator('.journal-search-result')).toHaveCount(1);assert.equal(indexes,before)
 await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page).toHaveURL(/view=day/);assert.equal(new URL(page.url()).searchParams.get('sort'),'asc')
 await page.getByRole('button',{name:'搜索健康日历'}).click();await expect(input).toHaveValue('')
 await page.goto('/quick-search',{waitUntil:'domcontentloaded'});await expect(input).toHaveValue('');await expect(hold).toBeInViewport()
 await input.fill('最近两个月皮肤情况');await expect(page.locator('.journal-search-result')).toHaveCount(1)
 await page.locator('.journal-search-result').click();await expect(page.getByRole('dialog')).toContainText('合成验收原始记录')
 await page.getByRole('button',{name:/关闭/}).last().click();await expect(input).toHaveValue('最近两个月皮肤情况')
 report.checks.push('runtime commit','calendar and home share voice/fuzzy lookup','compressed WebM bytes','ASR does not reload journal','calendar view/sort return','fresh reentry','320/375/390px waiting and voice controls','original detail')
 if(speechFile){
  const buffer=await readFile(speechFile),mimeType=speechFile.endsWith('.m4a')?'audio/mp4':speechFile.endsWith('.webm')?'audio/webm':'audio/wav',started=Date.now()
  const result=await api('/api/ai/audio/transcriptions','POST',{memberId,mimeType,name:'synthetic-speech',dataUrl:`data:${mimeType};base64,${buffer.toString('base64')}`})
  assert(result.transcript?.trim());assert.equal(result.runtime.commit,commit)
  report.supplierMeasurements.push({audio:'synthetic English speech; one sample, not a percentile',mimeType,bytes:buffer.length,asrRoundTripMs:Date.now()-started,provider:result.provider,model:result.model,requestId:result.requestId})
 }
 assert.deepEqual(errors,[]);report.status='PASS'
} catch(error) { report.status='FAILED';report.error=error.message;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1 }
finally {
 release()
 try { if(token&&memberId){const member=(await api('/api/members')).find(m=>m.id===memberId);if(member?.accountId===accountId&&member.name==='统一查找验收（虚构）'){await api(`/api/members/${memberId}`,'DELETE');report.cleanup='synthetic member removed'}} }
 catch(error){report.status='FAILED';report.cleanupError=error.message;process.exitCode=1}
 await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close()
}
