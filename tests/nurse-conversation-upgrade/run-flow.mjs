// Actual latest-turn outputs only. No seeded history, generated answer or draft.
import assert from 'node:assert/strict'
import {fork} from 'node:child_process'
import {createServer} from 'node:net'
import {randomUUID,createHash} from 'node:crypto'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {localEvaluationEnvironment} from './environment.mjs'
import {captureRuntime} from './runtime.mjs'
import {completedSleepInput,loadSavedGuideImplementation,requireRealCandidate,assertSavedFlow} from './flow-contract.mjs'
import {captureSavedFlow} from './screenshots.mjs'
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../..')
if(process.argv.includes('--help')){console.log('Usage: node tests/nurse-conversation-upgrade/run-flow.mjs [--live] [--screenshots] [--max-model-requests=20] [--output=tests/nurse-conversation-upgrade/results/flow-unique]\nDefault NOT_RUN. Only fresh local synthetic account/data; existing Bailian only. Max 20 attempts across both real continuous save flows. No seeded dialogues or candidates. Screenshots use background Chrome with the exact iPhone SE preset after actual saves; dist must already be built.');process.exit(0)}
const arg=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const maxCalls=Number(arg('max-model-requests','20'));assert(Number.isInteger(maxCalls)&&maxCalls>=1&&maxCalls<=20)
const output=path.resolve(arg('output',path.join(directory,'results',`flow-${Date.now()}`)))
assert(output.startsWith(path.join(directory,'results')+path.sep),'Reports must stay inside evaluation results')
await mkdir(output,{recursive:true})
const screenshots=process.argv.includes('--screenshots')
const report={status:'NOT_RUN',syntheticOnly:true,seededContext:false,productionRequests:0,modelRequests:0,maxModelRequests:maxCalls,modelReceipts:[],runtime:await captureRuntime(root),http:[],flows:[],uiBrowser:'NOT_RUN',screenshotsRequested:screenshots,clinicalReview:'NOT_PERFORMED',understandingAccuracy:null}
const finish=async()=>{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,modelRequests:report.modelRequests,flows:report.flows.map(flow=>({kind:flow.kind,status:flow.status,recordIds:flow.saved?.records.map(record=>record.recordId)??[],errorCode:flow.errorCode??null})),reason:report.reason??null}))}
if(!process.argv.includes('--live')){report.reason='Explicit --live is required; no application or provider was started.';await finish();process.exit(0)}
const present={provider:process.env.AI_PROVIDER==='bailian',key:Boolean(process.env.BAILIAN_API_KEY?.trim()),baseUrl:Boolean(process.env.BAILIAN_BASE_URL?.trim())}
if(!Object.values(present).every(Boolean)){report.reason='Existing Bailian configuration unavailable; no credential copied or created.';report.configurationPresence=present;await finish();process.exit(0)}
const temp=await mkdtemp(path.join(os.tmpdir(),'hoooho-nurse-flow-eval-')),dataDirectory=path.join(temp,'data');await mkdir(dataDirectory);await writeFile(path.join(dataDirectory,'.cleanup-test-data-2026-08-09-v1'),'{}')
const port=await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port))})}),base=`http://127.0.0.1:${port}`
let child,token='',member,authUser
const cookies=new Map()
async function api(route,method='GET',body,headers={}){
 assert(route.startsWith('/api/'),'Only local API paths accepted')
 const response=await fetch(base+route,{method,headers:{Origin:base,...(cookies.size?{Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)})
 for(const header of response.headers.getSetCookie()){const pair=header.split(';')[0],at=pair.indexOf('=');if(at>0)cookies.set(pair.slice(0,at),pair.slice(at+1))}
 const value=await response.json().catch(()=>null);report.http.push({route,method,status:response.status,errorCode:value?.error?.code??null})
 if(!response.ok)throw Object.assign(new Error('Local flow API failed'),{code:value?.error?.code??'FLOW_HTTP_FAILURE',status:response.status})
 return value
}
async function turn(flow,text,{context,presentedDraft,assetIds=[]}={}){
 const jobId=randomUUID(),messageId=randomUUID(),input={id:messageId,kind:assetIds.length?'image':'text',text,inputAt:Date.now(),assetIds,...(context?{contextId:context.id,expectedContextVersion:context.version}:{}),...(presentedDraft?{presentedDraft:{id:presentedDraft.id,version:presentedDraft.version}}:{})}
 const submitted={id:jobId,mode:'front',scopeKey:'front',input,options:{semanticVersion:3,frontDeskRecord:true,smartRecord:true,followUp:false,timezone:'Asia/Shanghai'}}
 const snapshot={messageId,jobId,userInput:input,modelCallsBefore:report.modelRequests};flow.turns.push(snapshot)
 let job=await api(`/api/members/${member.id}/recognition-jobs`,'POST',submitted),deadline=Date.now()+300000
 while(['queued','running','publishing'].includes(job.state)&&Date.now()<deadline)job=await api(`/api/members/${member.id}/recognition-jobs/${jobId}?afterSeq=${job.seq}&waitMs=25000`)
 snapshot.result=job;snapshot.modelCallsAfter=report.modelRequests;snapshot.replayBody=submitted
 if(!['ready','needs_review'].includes(job.state))throw Object.assign(new Error('Real recognition turn failed or timed out'),{code:job.error?.code??'FLOW_RECOGNITION_NOT_READY'})
 return job
}
try{
 child=fork(path.join(root,'server/app.mjs'),[],{cwd:root,silent:true,windowsHide:true,execArgv:['--import',pathToFileURL(path.join(directory,'model-budget.mjs')).href],env:localEvaluationEnvironment(process.env,{NODE_OPTIONS:'',NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),DATA_DIRECTORY:dataDirectory,AUTH_TOKEN_SECRET:randomUUID()+randomUUID(),HOOOHO_EVAL_MAX_MODEL_REQUESTS:String(maxCalls),HOOOHO_EVAL_CAPTURE_MODEL_OUTPUT:'1',HOOOHO_EVAL_SYNTHETIC_ONLY:'1'})})
 child.stdout?.resume();child.stderr?.resume();child.on('message',message=>{if(message?.type==='model-request')report.modelRequests=message.number;if(message?.type==='model-result')report.modelReceipts.push(message)})
 let healthy=false;for(let attempt=0;attempt<60;attempt++){try{await api('/api/health');healthy=true;break}catch{}await new Promise(resolve=>setTimeout(resolve,250))}assert(healthy,'LOCAL_SERVER_NOT_READY')
 const auth=await api('/api/auth/register','POST',{nickname:`Flow${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=auth.token;authUser=auth.user
 member=await api('/api/members','POST',{name:'SYNTHETIC-CHILD',relationship:'child',birthday:'2024-01-01'});report.member={id:member.id,name:member.name}
 await api('/api/auth/current-member','POST',{memberId:member.id})
 const guideApi=await loadSavedGuideImplementation(root)
 const sleep=completedSleepInput(),vaccinationDate=sleep.wakeDay
 const {default:sharp}=await import('sharp')
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="white"/>${['VACCINATION RECORD','PATIENT: SYNTHETIC-CHILD','VACCINE: HEPATITIS B VACCINE',`VACCINATION DATE: ${vaccinationDate}`,'DOSE NUMBER: 1','STATUS: ADMINISTERED / COMPLETED','Synthetic evaluation document'].map((line,index)=>`<text x="40" y="${80+index*120}" font-family="Arial,sans-serif" font-size="42" fill="black">${line}</text>`).join('')}</svg>`
 const png=await sharp(Buffer.from(svg)).png().toBuffer(),sha256=createHash('sha256').update(png).digest('hex');await writeFile(path.join(output,'synthetic-vaccination.png'),png)
 for(const kind of ['sleep','vaccination']){
  const flow={kind,status:'RUNNING',turns:[]};report.flows.push(flow)
  try{
   let assetIds=[]
   if(kind==='vaccination'){const asset=await api(`/api/members/${member.id}/recognition-assets?${new URLSearchParams({name:'synthetic-vaccination.png',lastModified:String(Date.now())})}`,'POST',png,{'Content-Type':'image/png'});assetIds=[asset.id];flow.asset={id:asset.id,sha256,file:'synthetic-vaccination.png'}}
   const initial=await turn(flow,kind==='sleep'?sleep.text:'这是SYNTHETIC-CHILD的已完成接种记录，请先按图片整理供我核对，暂不保存。',{assetIds})
   let {context,draft}=requireRealCandidate(initial);flow.presentedCandidate={id:draft.id,version:draft.version,contextId:context.id,contextVersion:context.version,sources:draft.sources,items:draft.items}
   assert(draft.items.every(item=>item.category===kind),'WRONG_REAL_CANDIDATE_CATEGORY')
   if(draft.items.some(item=>item.subjectConfirmed!==true)||context.subject?.confirmed!==true){
    const confirmed=await api(`/api/members/${member.id}/front-desk-record/contexts/${context.id}`,'POST',{action:'confirm_subject',expectedVersion:context.version});flow.subjectConfirmation={userButton:`这是${member.name}的记录`,expectedVersion:context.version,result:confirmed};context=confirmed;draft=confirmed.review
    assert(draft?.state==='ready'&&draft.items?.every(item=>item.subjectConfirmed===true),'EXPLICIT_SUBJECT_CONFIRMATION_FAILED')
   }
   const savedJob=await turn(flow,'保存这条',{context,presentedDraft:draft})
   const saved=savedJob.operationReceipt?.savedDraft??savedJob.review,records=saved?.result?.records??[],eventRecords=[]
   for(const eventId of new Set(records.map(record=>record.eventId)))eventRecords.push(...await api(`/api/events/${eventId}/records`))
   const cases=await api(`/api/members/${member.id}/cases?timezone=Asia%2FShanghai`),profile=kind==='vaccination'?await api(`/api/members/${member.id}/profile-list/vaccination`):null
   flow.saved=assertSavedFlow({kind,job:savedJob,memberId:member.id,eventRecords,cases,profileRows:profile?.rows??[],guideApi});flow.readback={eventRecords,cases,profile}
   const beforeReplay=report.modelRequests,last=flow.turns.at(-1),replayed=await api(`/api/members/${member.id}/recognition-jobs`,'POST',last.replayBody)
   assert.deepEqual(replayed.operationReceipt?.recordIds,savedJob.operationReceipt?.recordIds,'REPLAY_CHANGED_OR_LOST_RECEIPT');assert.equal(report.modelRequests,beforeReplay,'REPLAY_CALLED_MODEL_AGAIN')
   flow.idempotentReplay={recordIds:replayed.operationReceipt.recordIds,modelRequests:0};flow.status='API_SAVE_AND_EXACT_GUIDE_PASS'
   if(screenshots){const beforeBrowser=report.modelRequests;flow.browser=await captureSavedFlow({base,output,kind,job:savedJob,guides:flow.saved.guides,token,user:authUser,member,cookies:[...cookies]});assert.equal(report.modelRequests,beforeBrowser,'BROWSER_TRIGGERED_MODEL_CALL');for(const reference of records)assert((await api(`/api/events/${reference.eventId}/records`)).some(record=>record.id===reference.recordId),'DISMISS_REMOVED_SAVED_RECORD')}
  }catch(error){flow.status='FAIL';flow.errorCode=error.code??error.message;flow.failure='No fabricated candidate, subject, time, saved receipt or guide was substituted.'}
 }
 report.uiBrowser=screenshots?report.flows.every(flow=>flow.browser?.status==='PASS')?'PASS':'FAIL':'NOT_RUN'
 report.status=report.flows.every(flow=>flow.status==='API_SAVE_AND_EXACT_GUIDE_PASS')?report.uiBrowser==='PASS'?'API_AND_BROWSER_FLOW_PASS':report.uiBrowser==='FAIL'?'API_FLOW_PASS_UI_FAIL':'API_FLOW_PASS_UI_NOT_RUN':'BLOCKED'
}catch(error){report.status='BLOCKED';report.reason=error.code??error.message}
finally{
 if(child&&!child.killed){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))])}
 assert(path.dirname(temp)===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('hoooho-nurse-flow-eval-'),'Unsafe temporary cleanup target')
 try{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.temporaryDataCleanup='COMPLETE'}catch{report.status='BLOCKED';report.reason='TEMP_SYNTHETIC_DATA_CLEANUP_REQUIRED'}
 await finish()
}
