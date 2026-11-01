import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'
import { billingDefinition } from '../../shared/ops-billing-catalog.mjs'
import { billingHealth, billingFieldRows } from './billing-health.mjs'
import { inspectBillingPage, parseBillingValue, readBoundBillingFields } from './billing-page-reader.mjs'
import { BillingBrowserWorker, allowedBillingUrl } from '../../ops-browser-worker/core.mjs'
import { OpsService } from './ops-service.mjs'
import { syntheticLogin, syntheticIframeLogin } from '../../tests/ops-workspace/capture-login.mjs'
const actor = 'a'.repeat(64)
const bill = '<main style="padding:20px;min-height:500px"><h1>Billing</h1><div><span>Prepaid balance</span><strong>USD 12.50</strong></div><div><span>Current charges</span><strong>USD 4.25</strong></div><div><span>Next billing date</span><strong>2026-12-12</strong></div><div><span>Storage used</span><strong>2 GB</strong></div><div><span>Total storage</span><strong>10 GB</strong></div><div><span>Current plan</span><strong>Pro</strong></div><div><span>synthetic@example.test</span></div></main>'
const now = new Date('2026-11-01T04:00:00Z')
const health = (facts, extra={}) => billingHealth({ id: 'railway', enabled:true, status:'success', frequency:'daily', observation:{observedAt:now.toISOString(),facts},...extra },now)
const fixture = async t => { const directory=await mkdtemp(path.join(tmpdir(),'live-billing-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory }
test('different billing structures expose relevant fields; domain renewal has no balance or quota placeholder',()=>{
  assert.deepEqual(billingDefinition({id:'godaddy-domain'}).fields,['dueAt'])
  assert.equal(billingDefinition({id:'railway-volume'}).category,'infrastructure')
  assert.ok(billingDefinition({id:'railway-volume'}).fields.includes('storageUsed'))
  assert.equal(billingDefinition({id:'chatgpt-codex'}).category,'ai-agents')
  assert.ok(!billingDefinition({id:'chatgpt-codex'}).fields.includes('balance'))
  const rows=billingFieldRows({id:'godaddy-domain',observation:{facts:{dueAt:'2028-07-31T09:55:50Z',dueKind:'domain-expiry'}}},{state:'ready'})
  assert.equal(rows.length,1);assert.equal(rows[0].state,'available')
})
test('postpaid balance zero, included quota exhaustion and a billing cycle end are not arrears or service expiry',()=>{
  assert.equal(health({balance:0,currency:'USD',balanceMode:'postpaid'}).reasons.length,0)
  assert.equal(health({balance:0,currency:'USD',balanceMode:'prepaid'}).level,'critical')
  assert.equal(health({quotaRemaining:0,quotaLimit:100,quotaKind:'included'}).level,'warning')
  assert.equal(health({metrics:{billingPeriodEnd:{value:'2026-10-31'},currentCost:{value:4,currency:'USD'}}}).reasons.length,0)
  const charge=health({metrics:{nextChargeAt:{value:'2026-11-03'}}});assert.equal(charge.level,'notice');assert.equal(charge.reasons[0].code,'upcoming-charge')
  assert.equal(health({metrics:{storageUsed:{value:96,unit:'GB'},storageLimit:{value:100,unit:'GB'}}}).level,'critical')
})
test('classification and mixed billing modes persist without changing project ownership or snapshots',async t=>{
  const service=new OpsService({dataDirectory:await fixture(t)})
  const before=await service.get('railway')
  await service.update('railway',{category:'operations',billingModes:['subscription','metered']})
  const updated=await service.get('railway');assert.equal(updated.category,'operations');assert.deepEqual(updated.billingModes,['subscription','metered']);assert.equal(updated.projectId,before.projectId);assert.equal(updated.latestSnapshotId,before.latestSnapshotId)
  await assert.rejects(service.update('railway',{category:'wrong'}),e=>e.code==='INVALID_BILLING_CATEGORY')
  await assert.rejects(service.update('railway',{billingModes:['metered','metered']}),e=>e.code==='INVALID_BILLING_MODES')
})
test('billing values reject ambiguous currency/date and unrelated label values',()=>{
  assert.equal(parseBillingValue('balance','$12.50',null),null)
  assert.equal(parseBillingValue('currentCost','Available balance USD 12','USD'),null)
  assert.equal(parseBillingValue('dueAt','11/12/2026','USD'),null)
  assert.deepEqual(parseBillingValue('nextChargeAt','Next billing date December 12, 2026','USD'),{value:'2026-12-12'})
  assert.equal(parseBillingValue('balance','USD 12 / USD 20','USD'),null)
})
test('real DOM reader uses nearest semantic label, preserves currency/unit, masks private text and refuses stale label binding',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent(bill)
  const found=await inspectBillingPage(page,{currency:'USD'})
  assert.equal(found.candidates.find(c=>c.key==='balance')?.parsed.value,12.5)
  assert.equal(found.candidates.find(c=>c.key==='currentCost')?.parsed.value,4.25)
  assert.equal(found.candidates.find(c=>c.key==='storageUsed')?.parsed.unit,'GB')
  assert.ok(found.maskSelectors.length>3)
  const fields=Object.fromEntries(found.candidates.map(c=>[c.key,c]));const profile={...found,fields,currency:'USD'}
  const metrics=await readBoundBillingFields(page,profile);assert.equal(metrics.balance.value,12.5)
  await page.getByText('Prepaid balance',{exact:true}).evaluate(el=>el.textContent='Unrelated total')
  assert.equal((await readBoundBillingFields(page,profile)).balance,undefined)
})
test('isolated authorization requires consent, handles stale page actions, persists approved login and rereads after restart',async t=>{
  const directory=await fixture(t);let launches=0
  const launchFactory=async dir=>{launches++;const context=await chromium.launchPersistentContext(dir,{headless:true,viewport:{width:1280,height:800},args:['--no-sandbox']});await context.route('https://railway.com/**',async route=>{const authenticated=(await context.cookies()).some(c=>c.name==='synthetic_auth'&&c.value==='1');await route.fulfill({contentType:'text/html',body:authenticated?bill:'<main><button style="width:200px;height:80px" onclick="document.cookie=\'synthetic_auth=1;path=/;Secure\';location.reload()">Authenticate</button></main>'})});return context}
  const worker=await new BillingBrowserWorker({directory,launchFactory,storageKey:'b'.repeat(64)}).init();t.after(()=>worker.close())
  assert.equal(allowedBillingUrl('railway','http://127.0.0.1/admin'),false);assert.equal(allowedBillingUrl('railway','https://foreign.example.test'),false)
  await assert.rejects(worker.start({sourceId:'railway',actor,consent:false}),e=>e.code==='CAPTURE_CONSENT_REQUIRED');assert.equal(launches,0)
  const session=await worker.start({sourceId:'railway',actor,consent:true})
  await assert.rejects(worker.action(session.id,{action:'text',text:'synthetic',epoch:session.epoch+10}),e=>e.code==='CAPTURE_PAGE_CHANGED')
  await assert.rejects(worker.start({sourceId:'figma',actor,consent:true}),e=>e.code==='CAPTURE_BUSY')
  await worker.action(session.id,{action:'click',x:60,y:40,epoch:session.epoch})
  await worker.lease.page.getByText('Current charges',{exact:true}).waitFor()
  const inspected=await worker.analyze(session.id,{currency:'USD'})
  assert.ok(inspected.analysis.candidates.length>=4)
  await assert.rejects(worker.commit(session.id,{version:inspected.analysis.version,fields:['balance'],privacyConfirmed:false}))
  await worker.commit(session.id,{version:inspected.analysis.version,fields:inspected.analysis.candidates.map(c=>c.key),privacyConfirmed:true})
  await assert.rejects(worker.state(session.id),e=>e.code==='CAPTURE_SESSION_ENDED')
  const result=await worker.capture('railway');assert.equal(result.facts.balance,12.5);assert.equal(result.facts.balanceMode,'prepaid');assert.equal(result.facts.metrics.currentCost.value,4.25);assert.ok(result.dataUrl.startsWith('data:image/png;base64,'))
  await worker.close()
  const restarted=await new BillingBrowserWorker({directory,launchFactory,storageKey:'b'.repeat(64)}).init();t.after(()=>restarted.close());assert.equal((await restarted.capture('railway')).facts.balance,12.5)
})

test('Aliyun modern cost homepage can be verified, saved and reread while login and unrelated hosts stay excluded',async t=>{
  const directory=await fixture(t)
  const home='https://billing-cost.console.aliyun.com/home'
  const launchFactory=async dir=>{const context=await chromium.launchPersistentContext(dir,{headless:true,viewport:{width:1280,height:800},args:['--no-sandbox']});await context.route('https://**.aliyun.com/**',route=>route.fulfill({contentType:'text/html',body:route.request().url()===home?bill.replaceAll('USD','CNY'):'<main><label>Account</label><input aria-label="Account"/><button>Log in</button></main>'}));return context}
  const worker=await new BillingBrowserWorker({directory,launchFactory,storageKey:'c'.repeat(64)}).init();t.after(()=>worker.close())
  assert.equal(allowedBillingUrl('aliyun',home),true)
  for(const url of ['http://billing-cost.console.aliyun.com/home','https://billing-cost.console.aliyun.com.evil.test/home','https://other.console.aliyun.com/home','https://user:secret@billing-cost.console.aliyun.com/home','https://billing-cost.console.aliyun.com:8443/home'])assert.equal(allowedBillingUrl('aliyun',url),false)
  assert.equal(allowedBillingUrl('railway',home),false)
  let session=await worker.start({sourceId:'aliyun',actor,consent:true});assert.equal(session.url,home)
  const closedId=session.id;await worker.lease.page.close();session=await worker.start({sourceId:'aliyun',actor,consent:true});assert.notEqual(session.id,closedId);assert.equal(session.url,home)
  assert.equal((await worker.probe()).verified,true);assert.equal((await worker.state(session.id)).id,session.id)
  await worker.context.close();await assert.rejects(worker.state(session.id),e=>e.code==='CAPTURE_SESSION_ENDED');await assert.rejects(worker.probe(),e=>e.code==='CAPTURE_ENGINE_UNAVAILABLE');session=await worker.start({sourceId:'aliyun',actor,consent:true});assert.equal(session.url,home)
  const login=await worker.action(session.id,{action:'navigate',url:'https://account.aliyun.com/login/login.htm',epoch:session.epoch})
  await assert.rejects(worker.analyze(session.id,{currency:'CNY'}),/请先完成登录/)
  await worker.action(session.id,{action:'navigate',url:home,epoch:login.epoch})
  const inspected=await worker.analyze(session.id,{currency:'CNY'})
  assert.equal(inspected.analysis.candidates.find(c=>c.key==='balance').parsed.currency,'CNY')
  await worker.commit(session.id,{version:inspected.analysis.version,fields:['balance','currentCost'],privacyConfirmed:true})
  const result=await worker.capture('aliyun')
  assert.equal(result.facts.balance,12.5);assert.equal(result.facts.currency,'CNY');assert.equal(result.facts.metrics.currentCost.value,4.25)
})

test('cross-origin frame focus supports direct typing without exposing field contents and rejects stale targets',async t=>{
  const directory=await fixture(t)
  const launchFactory=async dir=>{const context=await chromium.launchPersistentContext(dir,{headless:true,viewport:{width:1280,height:800},args:['--no-sandbox']});await context.route('https://**.aliyun.com/**',route=>route.fulfill({contentType:'text/html',body:new URL(route.request().url()).searchParams.has('verified')?bill:new URL(route.request().url()).hostname==='account.aliyun.com'?syntheticLogin('https://billing-cost.console.aliyun.com/home?verified=1'):syntheticIframeLogin}));return context}
  const worker=await new BillingBrowserWorker({directory,launchFactory,storageKey:'d'.repeat(64)}).init();t.after(()=>worker.close())
  let state=await worker.start({sourceId:'aliyun',actor,consent:true})
  state=await worker.action(state.id,{action:'click',x:140,y:160,epoch:state.epoch})
  assert.equal(state.control.label,'Username or email address');assert.equal(state.control.rect.x,120);assert.equal(state.control.rect.y,140)
  const usernameId=state.control.id
  state=await worker.action(state.id,{action:'fill',controlId:usernameId,text:'合成-admin@example.test',epoch:state.epoch})
  assert.equal(await worker.lease.page.frameLocator('iframe').getByLabel('Username or email address').inputValue(),'合成-admin@example.test')
  const first=await worker.frame(state.id);assert.ok(first.imageDataUrl.startsWith('data:image/jpeg;base64,'));assert.equal(first.session.control.id,usernameId);assert.ok(!JSON.stringify(first.session).includes('合成-admin@'))
  state=await worker.action(state.id,{action:'key',key:'Tab',epoch:state.epoch});assert.equal(state.control.type,'password')
  await assert.rejects(worker.action(state.id,{action:'fill',controlId:usernameId,text:'wrong-target',epoch:state.epoch}),e=>e.code==='CAPTURE_FOCUS_CHANGED')
  assert.equal(await worker.lease.page.frameLocator('iframe').getByLabel('Password',{exact:true}).inputValue(),'')
  state=await worker.action(state.id,{action:'fill',controlId:state.control.id,text:'合成-only-P4ss!',epoch:state.epoch})
  assert.equal(await worker.lease.page.frameLocator('iframe').getByLabel('Password',{exact:true}).inputValue(),'合成-only-P4ss!')
  const frame=await worker.frame(state.id);assert.ok(!JSON.stringify(frame.session).includes('P4ss'));assert.equal(frame.session.control.hasValue,true)
  state=await worker.action(state.id,{action:'key',key:'Shift+Tab',epoch:state.epoch});assert.equal(state.control.label,'Username or email address')
  state=await worker.action(state.id,{action:'key',key:'Tab',epoch:state.epoch});await worker.action(state.id,{action:'key',key:'Enter',epoch:state.epoch});await worker.lease.page.getByRole('heading',{name:'Billing',exact:true}).waitFor();assert.equal((await worker.state(state.id)).control,null)
})

test('private capture HTTP boundary exposes no profiles or images without its server credential',async t=>{
  const { createBillingBrowserServer }=await import('../../ops-browser-worker/http-server.mjs')
  const secret='synthetic-private-capture-token-00000000000000000'
  let calls=0
  const server=createBillingBrowserServer({secret,worker:{metadata:()=>{calls++;return{profiles:{}}}}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  const base=`http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(base+'/health')).status,200)
  assert.equal((await fetch(base+'/metadata')).status,401)
  assert.equal((await fetch(base+'/sessions/aaaaaaaa-aaaa/image',{headers:{Authorization:'Bearer wrong'}})).status,401)
  assert.equal(calls,0)
  assert.equal((await fetch(base+'/metadata',{headers:{Authorization:`Bearer ${secret}`}})).status,200)
  assert.equal(calls,1)
})
