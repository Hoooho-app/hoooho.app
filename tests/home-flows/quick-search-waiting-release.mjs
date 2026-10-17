import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const [origin,commit]=process.argv.slice(2)
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(origin))
assert(/^[a-f0-9]{40}$/.test(commit??''))
const target=origin.includes('staging')?'staging':'production',out=`outputs/quick-search-waiting/${target}`
await mkdir(out,{recursive:true})
const report={target,commit,realMicrophone:'NOT_VERIFIED',supplierLatency:'NOT_MEASURED',voiceResponse:'SYNTHETIC_BROWSER_INTERCEPT',checks:[]}
const browser=await chromium.launch({args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
const context=await browser.newContext({baseURL:origin,viewport:{width:375,height:667},isMobile:true,hasTouch:true,permissions:['microphone'],timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
let token='',accountId='',memberId='',release=()=>{}
async function api(path,method='GET',data){const response=await context.request.fetch(path,{method,data,headers:token?{Authorization:`Bearer ${token}`}:{},timeout:30000});assert(response.ok(),`${method} ${path}: ${response.status()}`);return response.json()}
try{
 assert.equal((await api('/api/health')).status,'ok')
 const session=await api('/api/auth/register','POST',{nickname:`waitqa${randomUUID().replaceAll('-','').slice(0,12)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token;accountId=session.user.id
 assert.equal((await api('/api/ai/audio/capabilities')).runtime.commit,commit)
 memberId=(await api('/api/members','POST',{name:'等待交互验收（虚构）',relationship:'child'})).id
 await api('/api/auth/current-member','POST',{memberId})
 await api('/api/quick-records','POST',{memberId,title:'合成皮肤观察',content:'脸颊湿疹、发痒，合成测试原始记录。',rawText:'脸颊湿疹、发痒，合成测试原始记录。',occurredAt:new Date(Date.now()-86400000).toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:['symptom'],timePrecision:'exact'}})
 await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,accountId,memberId})
 let calls=0;const gate=new Promise(resolve=>{release=resolve})
 await page.route('**/api/ai/audio/transcriptions',async route=>{
  calls++
  if(calls===1){await gate;await route.fulfill({status:503,json:{error:{code:'ASR_NETWORK_ERROR',message:'合成网络失败'}}})}
  else await route.fulfill({json:{transcript:'查找最近两个月的皮肤情况'}})
 })
 await page.goto(`/quick-search?release=${commit}`,{waitUntil:'domcontentloaded'})
 const input=page.getByLabel('查找记录文字')
 const key=`lookup:${accountId}:${memberId}`,otherKey=`${accountId}:${memberId}:front-desk`
 await page.evaluate(async({key,otherKey})=>{
  const draft={text:'上次搜索不应恢复',files:[],occurredAt:'',timeUnknown:true,requestId:crypto.randomUUID(),pendingVoice:new File(['legacy audio'],'previous.webm',{type:'audio/webm'})}
  sessionStorage.setItem(`hoooho-capture-checkpoint:${key}`,JSON.stringify({metadata:{...draft,pendingVoice:undefined},files:[],pendingVoice:'legacy'}))
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');store.put(draft,key);store.put({...draft,text:'保留其他记录草稿'},otherKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}
 },{key,otherKey})
 await page.reload({waitUntil:'domcontentloaded'})
 const hold=page.getByRole('button',{name:'按住说话',exact:true})
 const clean=async()=>{await expect(input).toBeEnabled();await expect(input).toHaveValue('');await expect(hold).toBeEnabled();await expect(page.locator('.journal-search-result')).toHaveCount(0);await expect(page.getByText('继续查找',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/重试识别|重新识别|改用文字|改变文字/})).toHaveCount(0)}
 const stored=()=>page.evaluate(async({key,otherKey})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),store=tx.objectStore('drafts'),a=store.get(key),b=store.get(otherKey);tx.oncomplete=()=>resolve({lookup:a.result!==undefined,other:b.result?.text,checkpoint:sessionStorage.getItem(`hoooho-capture-checkpoint:${key}`)});tx.onerror=()=>reject(tx.error)})}finally{db.close()}
 },{key,otherKey})
 await clean();await expect(input).toHaveAttribute('autocomplete','off')
 await expect.poll(stored).toEqual({lookup:false,other:'保留其他记录草稿',checkpoint:null})
 report.checks.push('legacy query/audio and checkpoint removed without changing other drafts')
 await input.fill('最近两周草莓');await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
 assert.equal((await stored()).lookup,false)
 await expect(hold).toBeEnabled()
 const box=await hold.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1200);await page.mouse.up()
 await expect.poll(()=>calls,{timeout:15000}).toBe(1)
 await expect(page.locator('.quick-search-progress')).toContainText('正在识别你说的话')
 await expect(page.getByText('没有找到相关记录',{exact:true})).toHaveCount(0)
 await expect(page.getByText('录音已保留',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'重试识别',exact:true})).toHaveCount(0)
 const lens=page.locator('.quick-search-progress__lens'),before=await lens.evaluate(el=>getComputedStyle(el).transform)
 await page.waitForTimeout(150);assert.notEqual(await lens.evaluate(el=>getComputedStyle(el).transform),before)
 await expect(page.locator('.quick-search-progress__hint')).toBeVisible({timeout:10000})
 for(const [width,height] of [[320,568],[375,667],[390,844]]){
  await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await expect(page.locator('.quick-search-progress__label')).toBeInViewport();await page.screenshot({path:`${out}/waiting-${width}.png`})
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await lens.evaluate(el=>getComputedStyle(el).animationName),'none')
 release();await expect(page.getByRole('alert')).toHaveText('没能识别这段语音，请重新按住说话')
 await expect(page.getByText('继续查找',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:/重试识别|重新识别|改用文字|改变文字/})).toHaveCount(0)
 await expect(hold).toBeEnabled();await expect(input).toBeEnabled()
 await input.fill('最近两周草莓');await expect(page.getByRole('alert')).toHaveCount(0)
 const nextBox=await hold.boundingBox();await page.mouse.move(nextBox.x+nextBox.width/2,nextBox.y+nextBox.height/2);await page.mouse.down();await page.waitForTimeout(1200);await page.mouse.up()
 await expect(input).toHaveValue('查找最近两个月的皮肤情况')
 await expect(page.locator('.journal-search-result')).toHaveCount(1)
 await expect(page.locator('.journal-search-result')).toContainText('湿疹')
 assert.equal(calls,2);assert.equal((await stored()).lookup,false)
 await expect(page.locator('.quick-search-progress')).toHaveCount(0)
 await page.locator('.journal-search-result').click();await expect(page.getByRole('dialog')).toContainText('合成测试原始记录')
 await page.getByRole('button',{name:/关闭/}).last().click();await expect(input).toHaveValue('查找最近两个月的皮肤情况')
 await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page).toHaveURL(/\/nurse-station$/)
 await page.getByRole('button',{name:'快速查找',exact:true}).click();await clean()
 await input.fill('刷新前的皮肤查找');await expect(page.locator('.journal-search-result')).toHaveCount(1)
 await page.reload({waitUntil:'domcontentloaded'});await clean()
 await expect.poll(stored).toEqual({lookup:false,other:'保留其他记录草稿',checkpoint:null})
 report.checks.push('runtime commit','animated waiting without premature empty/retained notice/retry controls','8s hint','320/375/390px layouts','reduced motion','failure allows text and a new recording without recovery controls','automatic fuzzy lookup','original detail retains current query','leaving/reentering and reload start empty','new text and recordings never persisted');assert.deepEqual(errors,[]);report.status='PASS'
}catch(error){report.status='FAILED';report.error=error.message;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error}
finally{
 release()
 if(token&&memberId){const member=(await api('/api/members')).find(m=>m.id===memberId);if(member?.accountId===accountId&&member.name==='等待交互验收（虚构）'){await api(`/api/members/${memberId}`,'DELETE');report.cleanup='synthetic member removed'}}
 await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close()
}
