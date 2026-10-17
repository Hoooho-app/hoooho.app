import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const origin=process.argv[2]
assert(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(origin))
const target=origin.includes('staging')?'staging':'production',out=`outputs/quick-search/${target}`
await mkdir(out,{recursive:true})
const browser=await chromium.launch({args:['--no-sandbox']})
const context=await browser.newContext({baseURL:origin,viewport:{width:375,height:667},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),errors=[],builds=new Set(),report={target,syntheticOnly:true,realMicrophone:'NOT_VERIFIED',checks:[]}
let token='',memberId='',accountId=''
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const build=r.headers()['x-hoooho-client-build'];if(build)builds.add(build)})
async function api(path,method='GET',data){const r=await context.request.fetch(path,{method,data,headers:{...(token?{Authorization:`Bearer ${token}`}:{})},timeout:30000});assert(r.ok(),`${method} ${path}: ${r.status()}`);return r.json()}
try{
 assert.equal((await api('/api/health')).status,'ok')
 const session=await api('/api/auth/register','POST',{nickname:`searchqa${randomUUID().replaceAll('-','').slice(0,12)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token;accountId=session.user.id
 memberId=(await api('/api/members','POST',{name:'查找验收（虚构资料）',relationship:'child'})).id
 await api('/api/auth/current-member','POST',{memberId})
 const create=async(content,days,category)=>api('/api/quick-records','POST',{memberId,content,title:content,rawText:content,occurredAt:new Date(Date.now()-days*86400000).toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),journal:{categories:[category],timePrecision:'exact'}})
 await create('脸颊湿疹、发痒，原始说明仍然保留。',2,'symptom')
 await create('午餐鸡胸和里脊',3,'diet');await create('晚餐牛肉粥',4,'diet')
 await create('宝贝喝牛奶、吃鸡蛋和水果果肉',5,'diet')
 for(let n=1;n<=10;n++)await create(`公园散步，户外第${n}次观察，原始资料的完整说明。`,n,'activity')
 await create('旧的户外活动',25,'activity');await create('旧的湿疹',80,'symptom')
 await page.addInitScript(({token,accountId,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,accountId,memberId})
 // Release operator publishes after local verification. Poll only the new layout,
 // never make repeated AI calls or change any real member's data.
 const deadline=Date.now()+15*60000
 while(true){
  await page.goto('/quick-search',{waitUntil:'domcontentloaded',timeout:60000});await page.getByLabel('查找记录文字').fill('最近两个月皮肤情况')
  try{await page.locator('.journal-search-results--lookup').waitFor({state:'visible',timeout:15000});break}catch(error){if(Date.now()>deadline)throw error}
 }
 const input=page.getByLabel('查找记录文字'),rows=page.locator('.journal-search-result')
 await input.fill('查找最近两个月的皮肤情况');await expect(rows).toHaveCount(1);await expect(rows).toContainText('湿疹')
 await input.fill('查找最近两个月吃的所有的肉');await expect(rows).toHaveCount(2)
 await input.fill('最近两周有没有那个，所有的户外活动都调出来');await expect(rows).toHaveCount(10)
 report.checks.push('skin semantics','meat semantics without milk/egg matches','outdoor fuzzy speech and date boundary')
 for(const [width,height] of [[320,568],[375,667],[390,844]]){
  await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const metrics=await rows.evaluateAll(elements=>elements.map(el=>({height:el.getBoundingClientRect().height,whiteSpace:getComputedStyle(el.querySelector('span')).whiteSpace,time:el.querySelector('time').textContent})))
  assert(metrics.every(m=>m.height>=44&&m.height<=52&&m.whiteSpace==='nowrap'&&/\d+\/\d+.*\d\d:\d\d/.test(m.time)))
  await expect(page.getByRole('button',{name:'按住说话',exact:true})).toBeInViewport()
  await page.screenshot({path:`${out}/${width}.png`})
 }
 await rows.first().click();await expect(page.getByRole('dialog')).toContainText('原始资料的完整说明')
 await page.getByRole('button',{name:/关闭/}).last().click();await expect(input).toHaveValue('最近两周有没有那个，所有的户外活动都调出来')
 report.checks.push('single-line rows at 320/375/390px','original record detail','query retained')
 await input.fill('最近两周草莓');await expect(rows).toHaveCount(0);await expect(page.getByText('没有找到相关记录',{exact:true})).toBeVisible()
 assert.deepEqual(errors,[]);report.builds=[...builds];report.errors=errors;report.status='PASS'
}catch(error){report.status='FAILED';report.error=error.message;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error}
finally{
 if(token&&memberId){const member=(await api('/api/members')).find(m=>m.id===memberId);if(member?.accountId===accountId&&member.name==='查找验收（虚构资料）'){await api(`/api/members/${memberId}`,'DELETE');report.cleanup='synthetic member removed'}}
 await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close()
}
