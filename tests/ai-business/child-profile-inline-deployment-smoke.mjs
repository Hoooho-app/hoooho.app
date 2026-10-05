// Opt-in actual deployment acceptance. Creates only synthetic owned children;
// uses no model substitute, secret dump or direct live storage mutation.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,devices,expect} from '@playwright/test'
const baseURL=process.argv[2]
assert.ok(['https://hooohoapp-staging.up.railway.app','https://hoooho.com'].includes(baseURL))
const environment=baseURL.includes('-staging.')?'staging':'production'
const output=`outputs/child-profile-inline/${environment}`
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context=await browser.newContext({...devices['iPhone SE'],baseURL,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
const page=await context.newPage(),created=[],errors=[]
let token,member,session
page.on('pageerror',()=>errors.push('pageerror'))
page.on('response',r=>{if(r.status()>=500)errors.push(`5xx ${new URL(r.url()).pathname}`)})
async function response(path,method='GET',data){return page.evaluate(async({path,method,data,token})=>{const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(30000)});return {status:r.status,text:await r.text()}},{path,method,data,token})}
async function api(path,method='GET',data){const r=await response(path,method,data);assert.ok(r.status<400,`HTTP ${r.status} ${method} ${path.replace(/[0-9a-f-]{30,}/g,':id')}`);return JSON.parse(r.text)}
async function list(kind,id=member.id){return api(`/api/members/${id}/profile-list/${kind}`)}
async function command(kind,input){return api(`/api/members/${member.id}/profile-list/${kind}`,'POST',{key:randomUUID(),...input})}
try{
  await page.goto(baseURL+'/api/health');assert.equal((await response('/')).status,200);assert.equal((await response('/api/health')).status,200)
  session=await api('/api/auth/register','POST',{nickname:`inlineqa${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
  member=await api('/api/members','POST',{name:'五页验收（合成）',birthday:'2024-12-20',gender:'female',relationship:'child'});created.push(member.id)
  const other=await api('/api/members','POST',{name:'隔离验收（合成）',birthday:'2024-12-20',gender:'male',relationship:'child'});created.push(other.id)
  await api('/api/auth/current-member','POST',{memberId:member.id})
  await page.addInitScript(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId:member.id,accountId:session.user.id})
  await api('/api/auth/profile-sections','POST',{memberId:member.id,sectionId:'allergy',revision:0,records:[{id:randomUUID(),name:'牛奶',category:'food',currentStatus:'confirmed',sourceReferences:[{id:'synthetic-source',label:'保留原来源'}]},{id:randomUUID(),name:'待排查原资料',category:'food',currentStatus:'investigating',note:'保留未确认原字段'}]})
  const result={environment,syntheticOnly:true,health:'PASS',routes:[],pendingAllergies:(await list('allergy')).compatibility.pendingAllergies}
  assert.equal(result.pendingAllergies,1)
  for(const kind of ['allergy','chronic','family-history','surgery','vaccination']){
    await page.goto(baseURL+`/health-profile/${kind}`);await expect(page.getByRole('button',{name:'新增',exact:true})).toBeEnabled();await expect(page.locator('form')).toHaveCount(0)
    if(kind==='allergy'){await expect(page.getByText('待排查原资料',{exact:true})).toHaveCount(0);await expect(page.getByText('牛奶',{exact:true})).toBeVisible()}
    for(const [width,height] of [[320,667],[375,667],[390,844],[430,932]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/${kind}-${width}.png`,fullPage:true})}
    await page.setViewportSize({width:375,height:667});await page.getByRole('button',{name:'新增',exact:true}).click();let form=page.locator('form');await form.locator('input[type=text],input:not([type])').fill(`合成${kind}`);await page.screenshot({path:`${output}/${kind}-draft.png`,fullPage:true});await page.reload();form=page.locator('form');await expect(form.locator('input[type=text],input:not([type])')).toHaveValue(`合成${kind}`);await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form).toHaveCount(0)
    const row=page.locator('.inline-profile-item').filter({has:page.getByText(`合成${kind}`,{exact:true})});await row.getByRole('button',{name:`编辑合成${kind}`,exact:true}).click();await page.locator('form').getByRole('button',{name:'取消',exact:true}).click();await row.getByRole('button',{name:`删除合成${kind}`,exact:true}).click();await page.screenshot({path:`${output}/${kind}-delete-confirm.png`,fullPage:true});await row.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByText(`合成${kind}`,{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByText(`合成${kind}`,{exact:true})).toBeVisible();await page.reload();await expect(page.getByText(`合成${kind}`,{exact:true})).toBeVisible()
    assert.equal((await list(kind,other.id)).rows.length,0)
    const font=await page.addStyleTag({content:'html{font-size:24px}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/${kind}-large-font.png`,fullPage:true});await font.evaluate(e=>e.remove());result.routes.push({kind,persistence:'PASS',draftReload:'PASS',cancelDeleteUndo:'PASS',memberIsolation:'PASS',widths:[320,375,390,430],largeFont:'PASS'})
  }
  let chronic=(await list('chronic')).rows[0]
  for(const frequency of ['每天','每周','每月','每季度','每年']){chronic=(await command('chronic',{action:'edit',id:chronic.id,version:chronic.version,name:chronic.name,group:chronic.group,frequency})).rows[0];assert.equal(chronic.frequency,frequency)}
  const relation=await command('family-history',{action:'relation',name:'姑姑'});assert.equal((await list('family-history')).groups.at(-1).id,relation.groups.at(-1).id)
  const vaccine=(await list('vaccination')).rows[0],requestKey=randomUUID(),input={action:'add',name:vaccine.name,group:'2岁',date:'',key:requestKey}
  const added=await command('vaccination',input),repeated=await command('vaccination',input);assert.equal(repeated.rows.length,added.rows.length)
  await command('vaccination',{action:'edit',id:vaccine.id,version:vaccine.version,name:vaccine.name,group:vaccine.group,date:'2025-12-19'});assert.equal((await list('vaccination')).rows.find(r=>r.id===vaccine.id).group,'1岁内')
  await page.goto(baseURL+'/health-profile');const picker=page.waitForEvent('filechooser');await page.locator('.health-profile-smart-record').click();await(await picker).setFiles([]);await expect(page).toHaveURL(/health-profile$/);await expect(page.getByRole('dialog')).toHaveCount(0)
  const raw=await api('/api/auth/profile-sections');assert.equal(raw.find(s=>s.memberId===member.id&&s.sectionId==='allergy').records.find(r=>r.currentStatus==='investigating').note,'保留未确认原字段')
  assert.deepEqual(errors,[]);Object.assign(result,{allFiveFrequencies:'PASS',customRelationshipPersistence:'PASS',vaccinationCalendarGrouping:'PASS',idempotency:'PASS',pendingRetained:'PASS',nativeUploadEntryUnchanged:'PASS',errors,physicalDevice:'iPhone Safari 待实机验证'})
  await writeFile(`${output}/smoke.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(e){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw e}
finally{
  for(const id of created){try{
    const events=await api('/api/events');for(const event of events.filter(e=>e.memberId===id))await api(`/api/events/${event.id}`,'DELETE')
    const sections=await api('/api/auth/profile-sections');for(const s of sections.filter(s=>s.memberId===id))await api('/api/auth/profile-sections','POST',{memberId:id,sectionId:s.sectionId,revision:s.revision,records:[]})
    await api(`/api/members/${id}`,'DELETE')
  }catch{console.log('Exact synthetic child cleanup requires follow-up')}}
  await browser.close()
}
