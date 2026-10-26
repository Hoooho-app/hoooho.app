import test from 'node:test'
import assert from 'node:assert/strict'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import path from 'node:path'
import vm from 'node:vm'
import {captureSavedFlow,recoveryCheckpoint} from './screenshots.mjs'
const guide={id:'draft:real-record:journal',recordId:'real-record',eventId:'real-event',memberId:'real-member',text:'睡眠已记好，可在健康随记查看。',url:'/health-events?memberId=real-member&eventId=real-event&recordId=real-record'}
const job={id:'real-job',operationReceipt:{state:'saved'},frontDesk:{context:{id:'real-context',version:4}}}
function inertBrowser({overflow=false,inference=false}={}){
 const observed={screenshots:[],closed:false},origin='http://127.0.0.1:4196';let url=origin+'/nurse-station',input='',dismissed=false
 const button=name=>({waitFor:async()=>{},boundingBox:async()=>({x:40,y:300,width:120,height:44}),count:async()=>name==='知道了'&&dismissed?0:1,click:async()=>{if(name==='查看记录')url=new URL(guide.url,origin).href;if(name==='知道了')dismissed=true}})
 const bubble={waitFor:async()=>{},locator:()=>({innerText:async()=>guide.text}),getByRole:(_role,{name})=>button(name),scrollIntoViewIfNeeded:async()=>{}}
 const textbox={count:async()=>1,fill:async value=>{input=value},waitFor:async()=>{},inputValue:async()=>input}
 const page={setDefaultTimeout(){},on(){},goto:async value=>{url=value},locator:()=>bubble,getByLabel:()=>textbox,getByRole:(_role,{name})=>button(name),evaluate:async()=>({width:375,height:667,scrollWidth:overflow?430:375,scale:1}),screenshot:async value=>{observed.screenshots.push(value)},waitForURL:async predicate=>{assert(predicate(new URL(url)))},url:()=>url,goBack:async()=>{url=origin+'/nurse-station'}}
 const context={addCookies:async value=>{observed.cookies=value},addInitScript:async(callback,payload)=>{observed.restore=payload;observed.initialize=callback},newPage:async()=>page,request:{get:async()=>({body:async()=>Buffer.from('<html>inert test page</html>')})},route:async(_pattern,handler)=>{if(inference)await handler({request:()=>({url:()=>origin+'/api/members/real-member/recognition-jobs',method:()=>'POST'}),abort:async()=>{observed.aborted=true},continue:async()=>{}})}}
 const preset={viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'inert iPhone SE preset'}
 return {observed,browserTestDouble:{devices:{'iPhone SE':preset},chromium:{launch:async options=>{observed.launch=options;return {newContext:async options=>{observed.context=options;return context},close:async()=>{observed.closed=true}}}}}}
}
const args={base:'http://127.0.0.1:4196',output:path.resolve('tests/nurse-conversation-upgrade/results/inert-browser-unit'),kind:'sleep',job,guides:[guide],token:'synthetic-unit-token',user:{id:'real-account'},member:{id:'real-member'}}
test('screenshots flag alone cannot start a browser, local app or model without live',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['tests/nurse-conversation-upgrade/run-flow.mjs','--screenshots']);const result=JSON.parse(stdout.trim());assert.equal(result.status,'NOT_RUN');assert.equal(result.modelRequests,0)
 const help=await promisify(execFile)(process.execPath,['tests/nurse-conversation-upgrade/run-flow.mjs','--help']);assert(help.stdout.includes('--screenshots'))
})
test('browser recovery contains only exact account/member/job/context identities, with no fabricated guide or dialogue',()=>{
 const checkpoint=recoveryCheckpoint(job,1000);assert.equal(checkpoint.metadata.recognitionJobId,'real-job');assert.equal(checkpoint.metadata.frontContextId,'real-context');assert.equal(checkpoint.metadata.frontContextVersion,4)
 for(const field of ['savedGuides','smartReview','conversationTurns','recognitionSnapshot'])assert.equal(checkpoint.metadata[field],undefined)
 assert.throws(()=>recoveryCheckpoint({...job,operationReceipt:null}))
})
test('inert browser validates exact iPhone SE Chrome options, real identity restoration, record URL, back/input and dismiss boundaries',async()=>{
 const fixture=inertBrowser(),result=await captureSavedFlow({...args,browserTestDouble:fixture.browserTestDouble})
 assert.equal(result.status,'PASS');assert.equal(fixture.observed.launch.headless,true);assert.equal(fixture.observed.context.isMobile,true);assert.equal(fixture.observed.context.deviceScaleFactor,2);assert.deepEqual(fixture.observed.context.viewport,{width:375,height:667})
 assert.equal(fixture.observed.restore.user.id,'real-account');assert.equal(fixture.observed.restore.member.id,'real-member');assert.equal(fixture.observed.restore.checkpoint.metadata.recognitionJobId,'real-job');assert.equal(fixture.observed.screenshots.length,1);assert.equal(fixture.observed.closed,true)
 assert(result.checks.includes('return preserved unsent input'));assert(result.checks.includes('dismiss stayed in chat and preserved input'));assert(result.openedUrl.includes('recordId=real-record'))
 const values=new Map(),storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null},sandbox={sessionStorage:storage,localStorage:storage,payload:fixture.observed.restore}
 vm.runInNewContext(`(${fixture.observed.initialize.toString()})(payload)`,sandbox)
 const key='hoooho-capture-checkpoint:home-smart:real-account:real-member:new';values.set(key,'actual unsent draft must survive a full document return')
 vm.runInNewContext(`(${fixture.observed.initialize.toString()})(payload)`,sandbox);assert.equal(values.get(key),'actual unsent draft must survive a full document return')
})
test('browser failures or attempted inference are reported FAIL and cannot substitute a unit fixture for real screenshots',async()=>{
 for(const condition of [{overflow:true},{inference:true}]){const fixture=inertBrowser(condition),result=await captureSavedFlow({...args,browserTestDouble:fixture.browserTestDouble});assert.equal(result.status,'FAIL');assert.equal(fixture.observed.closed,true)}
 await assert.rejects(()=>captureSavedFlow({...args,base:'https://hoooho.com',browserTestDouble:inertBrowser().browserTestDouble}))
})
