import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readdir} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {RecognitionJobs} from './recognition-jobs.mjs'
import {recognitionOwnerLifecycle} from './recognition-lifecycle.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {FamilyMemberService} from '../members/family-member-service.mjs'
import {HealthEventService} from '../events/health-event-service.mjs'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {AIBusinessService} from './business/service.mjs'
const delay=ms=>new Promise(r=>setTimeout(r,ms))
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function until(fn){for(let i=0;i<300;i++){const v=await fn();if(v)return v;await delay(10)}throw new Error('Timed out waiting for task')}
async function setup(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-recognition-')),members=new FamilyMemberRepository(directory),member=await members.create({accountId:'synthetic',name:'虚构测试',relationship:'child'}),events=new HealthEventService({dataDirectory:directory}),calls=[]
 const model={provider:{name:'test',model:'strict-v1',visionModel:'vision-v1'},structured:async input=>{calls.push(input.task);if(input.task==='document-page')return {value:{text:'脸颊发红',status:'readable'},diagnostics:{}};const source=JSON.parse(input.input).sources[0];return {value:{items:[{category:'symptom',title:'观察记录',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:source.text,quote:source.text,sourceId:source.id,page:source.page}]}]},diagnostics:{}}}}
 const frontModel={structured:async input=>{calls.push(input.task);const data=JSON.parse(input.input[0].content[0].text);return {value:{reply:'收到这次观察。',contextId:data.history.at(-1)?.id??'new',action:'record'},diagnostics:{}}}}
 const business=new AIBusinessService({dataDirectory:directory,model,logger:{info(){}}}),front=new FrontDeskRecord({dataDirectory:directory,events,business,model:frontModel}),audio={transcribe:async()=>{calls.push('asr');return {transcript:'脸颊发红'}}}
 const jobs=new RecognitionJobs({dataDirectory:directory,events,business,frontDesk:front,audio,autoStart:false,logger:{warn(){}}});business.assertRecognitionCurrent=d=>jobs.assertCurrent(d)
 t.after(async()=>{await jobs.close();await until(()=>!jobs.active.size);jobs.db.close();await rm(directory,{recursive:true,force:true})})
 const submit=(id,text)=>jobs.submit('synthetic',member.id,{id:'task-1',mode:'front',input:{id,kind:'text',text},options:{task:'record',smartRecord:true,selectedOccurredAt:new Date().toISOString()}})
 const snapshot=()=>jobs.get('synthetic',member.id,'task-1')
 return {directory,member,events,business,front,model,frontModel,audio,jobs,calls,submit,snapshot}
}
test('manual front-card revisions queue organization and require explicit save for the same saved record',async t=>{
 const f=await setup(t),accountId='synthetic',memberId=f.member.id,contextId='manual-context',at=new Date(Date.now()-60000).toISOString(),subject={kind:'current',memberId,confirmed:true,confirmedBy:'selection'}
 await f.front.store.update(()=>({contexts:[{id:contextId,accountId,memberId,continuousRecord:true,version:1,evidenceVersion:1,firstDescribedAt:at,createdAt:at,updatedAt:at,subject}],messages:[{id:'original',accountId,memberId,contextId,kind:'text',text:'手臂有点痒',status:'completed',acceptedInput:true,at,inputAt:Date.parse(at),subject,files:[],voices:[]}]}))
 const first=await f.front.continuous(accountId,memberId,contextId,{action:'save_current',expectedVersion:1,confirmed:true})
 const edited=await f.front.continuous(accountId,memberId,contextId,{action:'edit_current',expectedVersion:1,text:'现在手臂不痒了',title:'手臂情况',occurredAt:at})
 assert.ok(edited.recognitionJob.id);assert.equal(edited.feedback.text,'内容已修改')
 const same=await f.jobs.organizeContext(accountId,memberId,contextId,2);assert.equal(same.id,edited.recognitionJob.id)
 const completed=await until(async()=>{const job=await f.jobs.get(accountId,memberId,same.id);if(job.state==='failed')assert.fail(JSON.stringify(job.error));return ['ready','needs_review'].includes(job.state)&&job})
 assert.ok(completed.review.items.length);assert.equal(f.calls.filter(task=>task==='front-desk-record').length,0)
 const pending=await f.front.continuous(accountId,memberId,contextId)
 assert.equal((await f.business.records.getOwnedRecord(accountId,first.saved.recordId)).content,'手臂有点痒')
 const card=await f.front.continuous(accountId,memberId,contextId,{action:'save_current',expectedVersion:pending.version,confirmed:true}),record=await f.business.records.getOwnedRecord(accountId,first.saved.recordId)
 assert.equal(card.saved.recordId,first.saved.recordId);assert.equal(record.content,'现在手臂不痒了');assert.ok(record.aiProvenance.structuredItems.length);assert.match(record.sourceText,/手臂有点痒/)
 assert.equal((await f.business.records.repository.findByAccountId(accountId)).length,1)
})
test('another instance cannot publish a task with a live owner lease',async t=>{
 const f=await setup(t),other=new RecognitionJobs({dataDirectory:f.directory,events:f.events,business:f.business,frontDesk:f.front,audio:f.audio,autoStart:false,logger:{warn(){}}})
 let publications=0;other.publish=async()=>{publications++}
 try{
  f.jobs.put({id:'leased-publication',accountId:'synthetic',memberId:f.member.id,scopeKey:'front',mode:'front',state:'publishing',stage:'publishing',owner:f.jobs.owner,leaseUntil:Date.now()+30000,cancelEpoch:0,inputRevision:1,resultRevision:0,inputs:[],options:{},commandIds:[]})
  other.kick();await delay(20)
  assert.equal(publications,0);assert.equal(other.active.size,0)
  const expired=f.jobs.raw('leased-publication');f.jobs.put({...expired,leaseUntil:Date.now()-1})
  other.kick();await delay(20)
  assert.equal(publications,1);assert.equal(other.raw('leased-publication').owner,other.owner);assert.equal(other.raw('leased-publication').cancelEpoch,1)
  f.jobs.publicationFailed('leased-publication',{code:'STALE_PUBLISHER'})
  assert.equal(other.raw('leased-publication').state,'publishing')
 }finally{await other.close();await until(()=>!other.active.size);other.db.close()}
})
test('durable ACK, idempotent input, latest revision and formal save guard',async t=>{
 const f=await setup(t),ack=await f.submit('first','脸颊发红');assert.equal(ack.inputRevision,1);assert.equal(ack.resultRevision,0)
 const ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j});assert.equal(ready.review.inputText,'脸颊发红')
 assert.equal((await f.submit('first','脸颊发红')).inputRevision,1)
 await assert.rejects(()=>f.submit('first','修改原消息'),{code:'RECOGNITION_INPUT_CONFLICT'})
 await f.submit('second','没有呕吐')
 await assert.rejects(()=>f.business.save('synthetic',f.member.id,ready.review.id,{version:ready.review.version,confirmed:true}),{code:'RECOGNITION_REVISION_CONFLICT'})
 const latest=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j.resultRevision===2&&j});assert.equal(latest.review.inputText,'脸颊发红\n没有呕吐')
 const saved=await f.business.save('synthetic',f.member.id,latest.review.id,{version:latest.review.version,confirmed:true});assert.equal(saved.state,'saved')
 assert.equal((await f.business.save('synthetic',f.member.id,latest.review.id,{version:latest.review.version,confirmed:true})).result.count,saved.result.count)
 assert.equal((await f.snapshot()).review.state,'saved')
})
test('pause ACK does not wait for supplier and late reply cannot revive discarded input',async t=>{
 const f=await setup(t),entered=deferred(),response=deferred();f.frontModel.structured=async()=>{entered.resolve();await response.promise;return {value:{reply:'迟到回复',contextId:'new',action:'record'},diagnostics:{}}}
 await f.submit('first','脸颊发红');await entered.promise
 const paused=await f.jobs.command('synthetic',f.member.id,'task-1',{id:'pause-1',type:'pause'});assert.equal(paused.state,'paused')
 assert.equal((await f.jobs.command('synthetic',f.member.id,'task-1',{id:'pause-1',type:'pause'})).cancelEpoch,paused.cancelEpoch)
 await f.jobs.command('synthetic',f.member.id,'task-1',{id:'discard-1',type:'discard'});response.resolve();await until(()=>!f.jobs.active.size)
 assert.equal((await f.snapshot()).state,'discarded');assert.equal((await f.front.store.read()).messages.some(m=>m.text==='迟到回复'),false)
 await assert.rejects(()=>f.submit('another','新内容'),{code:'RECOGNITION_DISCARDED'})
})
test('OCR survives raw checkpoint and extraction failure; changed model invalidates cache',async t=>{
 const f=await setup(t),image=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer(),files=[{name:'合成.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+image.toString('base64')}]
 let d=await f.business.prepare('synthetic',f.member.id,{text:'脸颊发红',files})
 d=await f.business.prepare('synthetic',f.member.id,{id:d.id,version:d.version,text:'脸颊发红，没有呕吐',deferRecognition:true})
 assert.equal((await f.business.get('synthetic',f.member.id,d.id)).sources.filter(s=>s.id!=='input').length,1)
 d=await f.business.prepare('synthetic',f.member.id,{id:d.id,version:d.version,text:d.inputText});assert.equal(f.calls.filter(c=>c==='document-page').length,1)
 const original=f.model.structured;f.model.structured=async input=>{if(input.task==='draft-extraction')throw new Error('simulated failure');return original(input)}
 await assert.rejects(()=>f.business.prepare('synthetic',f.member.id,{id:d.id,version:d.version,text:d.inputText+'。补充'}))
 d=await f.business.read('synthetic',f.member.id,d.id);f.model.structured=original
 d=await f.business.prepare('synthetic',f.member.id,{id:d.id,version:d.version,text:d.inputText});assert.equal(f.calls.filter(c=>c==='document-page').length,1)
 f.model.provider.visionModel='vision-v2';await f.business.prepare('synthetic',f.member.id,{id:d.id,version:d.version,text:d.inputText+'。再次补充'});assert.equal(f.calls.filter(c=>c==='document-page').length,2)
})
test('successful ASR is reused when organization alone fails',async t=>{
 const f=await setup(t),wave=Buffer.alloc(364);wave.write('RIFF');wave.write('WAVE',8)
 const asset=await f.jobs.upload('synthetic',f.member.id,{buffer:wave,mimeType:'audio/wav',name:'合成.wav'})
 let failing=true;const original=f.model.structured;f.model.structured=async input=>{if(failing)throw new Error('organization unavailable');return original(input)}
 await f.jobs.submit('synthetic',f.member.id,{id:'task-1',mode:'front',input:{id:'voice-1',kind:'voice',text:'',assetIds:[asset.id],asrAssetId:asset.id},options:{smartRecord:true,selectedOccurredAt:new Date().toISOString()}})
 await until(async()=>{const j=await f.snapshot();return j.state==='failed'});assert.equal(f.calls.filter(c=>c==='asr').length,1)
 failing=false;await f.jobs.command('synthetic',f.member.id,'task-1',{id:'retry-1',type:'retry'})
 await until(async()=>{const j=await f.snapshot();return j.state==='ready'});assert.equal(f.calls.filter(c=>c==='asr').length,1)
 assert.equal((await f.front.latest('synthetic',f.member.id)).messages.filter(m=>m.kind==='voice').length,1)
})
test('new input fences old extraction and publishes the newest revision',async t=>{
 const f=await setup(t),entered=deferred(),release=deferred(),original=f.model.structured;let once=true
 f.model.structured=async input=>{if(once){once=false;entered.resolve();await release.promise}return original(input)}
 await f.submit('first','脸颊发红');await entered.promise;await f.submit('second','没有呕吐');release.resolve()
 const latest=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j.resultRevision===2&&j});assert.equal(latest.review.inputText,'脸颊发红\n没有呕吐')
})
test('cross-owner isolation and deletion clean tasks, events and private originals',async t=>{
 const f=await setup(t),asset=await f.jobs.upload('synthetic',f.member.id,{buffer:Buffer.from('private synthetic original'),mimeType:'image/png',name:'test.png'})
 assert.throws(()=>f.jobs.asset('foreign',f.member.id,asset.id),{code:'RECOGNITION_ASSET_NOT_FOUND'})
 await f.submit('first','脸颊发红');await until(async()=>{const j=await f.snapshot();return j.state==='ready'})
 await recognitionOwnerLifecycle(f.directory,'synthetic',{memberId:f.member.id})
 assert.equal(f.jobs.all().length,0);assert.equal(f.jobs.db.prepare('SELECT count(*) AS n FROM events').get().n,0);assert.deepEqual(await readdir(path.join(f.directory,'recognition-originals')),[])
})
test('restart pauses unknown in-flight calls and publication retry never invokes a model again',async t=>{
 const f=await setup(t),original=f.front.checkpoint.bind(f.front);let failOnce=true
 f.front.checkpoint=async(...args)=>{if(failOnce){failOnce=false;throw new Error('simulated storage publication failure')}return original(...args)}
 await f.submit('first','脸颊发红');await until(async()=>{const j=await f.snapshot();return j.state==='failed'})
 const calls=f.calls.length;assert.ok(f.jobs.db.prepare('SELECT document FROM outbox WHERE job_id=?').get('task-1'))
 await f.jobs.command('synthetic',f.member.id,'task-1',{id:'retry-publication',type:'retry'})
 await until(async()=>{const j=await f.snapshot();return j.state==='ready'});assert.equal(f.calls.length,calls)
 const j=f.jobs.raw('task-1');j.state='running';j.stage='transcribing';j.owner='stopped-process';j.leaseUntil=0;f.jobs.put(j);f.jobs.kick()
 assert.equal((await f.snapshot()).state,'paused');assert.equal(f.calls.length,calls)
})
test('discard before create persists a tombstone and rejects a late task POST',async t=>{
 const f=await setup(t);await f.jobs.command('synthetic',f.member.id,'task-1',{id:'discard-before-create',type:'discard'})
 await assert.rejects(()=>f.submit('first','迟到的上传'),{code:'RECOGNITION_DISCARDED'});assert.equal(f.calls.length,0)
})
test('a cancelled operation during preparation cannot create a recoverable draft',async t=>{
 const f=await setup(t),controller=new AbortController(),original=f.business.prune.bind(f.business)
 f.business.prune=async()=>{await original();controller.abort()}
 await assert.rejects(()=>f.business.prepare('synthetic',f.member.id,{text:'脸颊发红',deferRecognition:true},controller.signal))
 assert.equal((await f.business.store.read()).drafts.length,0)
})
test('expiry retries from retained originals without reviving a discarded job',async t=>{
 const f=await setup(t);await f.submit('first','脸颊发红');let ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j})
 const originalId=ready.review.id
 await f.business.store.update(data=>({...data,drafts:data.drafts.map(d=>d.id===originalId?{...d,expiresAt:'2000-01-01T00:00:00Z'}:d)}))
 assert.equal((await f.snapshot()).state,'failed')
 await f.jobs.command('synthetic',f.member.id,'task-1',{id:'retry-expired',type:'retry'})
 ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j});assert.notEqual(ready.review.id,originalId)
 await f.jobs.command('synthetic',f.member.id,'task-1',{id:'discard-after-expiry',type:'discard'})
 await f.jobs.command('synthetic',f.member.id,'task-1',{id:'retry-after-discard',type:'retry'});assert.equal((await f.snapshot()).state,'discarded')
})
test('deleting a member while an upload is writing cannot publish a late private original',async t=>{
 const f=await setup(t),upload=f.jobs.upload('synthetic',f.member.id,{buffer:Buffer.alloc(1024*1024),mimeType:'image/png',name:'合成.png'}).then(value=>({value}),error=>({error}))
 await new FamilyMemberService({dataDirectory:f.directory}).delete('synthetic',f.member.id)
 const result=await upload;assert.equal(result.error?.status,404)
 assert.equal(f.jobs.db.prepare('SELECT count(*) AS n FROM assets').get().n,0);assert.deepEqual(await readdir(path.join(f.directory,'recognition-originals')),[])
})
test('ASR failure does not silently retry on new text; user explicitly selects usable text',async t=>{
 const f=await setup(t),wave=Buffer.alloc(364);wave.write('RIFF');wave.write('WAVE',8)
 const asset=await f.jobs.upload('synthetic',f.member.id,{buffer:wave,mimeType:'audio/wav',name:'合成.wav'});let asrCalls=0
 f.audio.transcribe=async()=>{asrCalls++;throw Object.assign(new Error('synthetic unavailable'),{code:'ASR_TIMEOUT'})}
 await f.jobs.submit('synthetic',f.member.id,{id:'task-1',mode:'front',input:{id:'voice-1',kind:'voice',text:'',assetIds:[asset.id],asrAssetId:asset.id},options:{smartRecord:true,selectedOccurredAt:new Date().toISOString()}})
 await until(async()=>{const j=await f.snapshot();return j.state==='failed'})
 await f.submit('text-1','没有呕吐')
 const ready=await until(async()=>{const j=await f.snapshot();return j.state==='needs_review'&&j});assert.equal(asrCalls,1);assert.equal(ready.unresolvedInputs.length,1)
 await assert.rejects(()=>f.business.save('synthetic',f.member.id,ready.review.id,{version:ready.review.version,confirmed:true}),{code:'RECOGNITION_REVISION_CONFLICT'})
 const selected=await f.jobs.command('synthetic',f.member.id,'task-1',{id:'use-text',type:'use_text'});assert.equal(selected.state,'ready');assert.equal(selected.unresolvedInputs.length,0)
 assert.equal((await f.business.save('synthetic',f.member.id,ready.review.id,{version:ready.review.version,confirmed:true})).state,'saved')
})
test('long polling observes updates before or after subscription and releases all listeners',async t=>{
 const f=await setup(t),entered=deferred(),release=deferred(),original=f.frontModel.structured
 t.after(()=>release.resolve());f.frontModel.structured=async input=>{entered.resolve();await release.promise;return original(input)}
 await f.submit('first','脸颊发红');await entered.promise
 let j=f.jobs.raw('task-1'),oldSeq=j.seq;f.jobs.put({...j,stage:'reading'})
 const alreadyChanged=await f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:oldSeq,waitMs:25000});assert.equal(alreadyChanged.stage,'reading')
 const pending=f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:alreadyChanged.seq,waitMs:25000})
 await until(()=>f.jobs.waiters.size===1);j=f.jobs.raw('task-1');f.jobs.put({...j,stage:'organizing'})
 assert.equal((await pending).stage,'organizing');assert.equal(f.jobs.waiters.size,0)
 release.resolve();const ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j})
 assert.equal((await f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:ready.seq,waitMs:25000})).state,'ready');assert.equal(f.jobs.waiters.size,0)
})
test('long polling has a bounded wait, accepts cancellation and validates sequence parameters',async t=>{
 const f=await setup(t),entered=deferred(),release=deferred(),original=f.frontModel.structured
 t.after(()=>release.resolve());f.frontModel.structured=async input=>{entered.resolve();await release.promise;return original(input)}
 await f.submit('first','脸颊发红');await entered.promise
 const seq=f.jobs.raw('task-1').seq,started=Date.now()
 const timed=await f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:seq,waitMs:20});assert.equal(timed.seq,seq);assert.ok(Date.now()-started>=15);assert.equal(f.jobs.waiters.size,0)
 const controller=new AbortController(),pending=f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:seq,waitMs:25000,signal:controller.signal}),rejected=assert.rejects(()=>pending,{name:'AbortError'})
 await until(()=>f.jobs.waiters.size===1);controller.abort();await rejected;assert.equal(f.jobs.waiters.size,0)
 await assert.rejects(()=>f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:-1,waitMs:10}),{code:'RECOGNITION_WAIT_INVALID'})
 release.resolve()
})
test('a waiting GET cannot return old private data after member deletion',async t=>{
 const f=await setup(t),entered=deferred(),release=deferred(),original=f.frontModel.structured
 t.after(()=>release.resolve());f.frontModel.structured=async input=>{entered.resolve();await release.promise;return original(input)}
 await f.submit('first','脸颊发红');await entered.promise
 const pending=f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:f.jobs.raw('task-1').seq,waitMs:25000}),rejected=assert.rejects(()=>pending,{code:'RECOGNITION_NOT_FOUND'})
 await until(()=>f.jobs.waiters.size===1)
 await new FamilyMemberService({dataDirectory:f.directory}).delete('synthetic',f.member.id)
 await rejected;assert.equal(f.jobs.waiters.size,0);release.resolve()
})
test('ready front response includes its published context and verified review without private original bytes',async t=>{
 const f=await setup(t),image=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer()
 const asset=await f.jobs.upload('synthetic',f.member.id,{buffer:image,mimeType:'image/png',name:'合成.png'})
 await f.jobs.submit('synthetic',f.member.id,{id:'task-1',mode:'front',input:{id:'image-1',kind:'image',text:'脸颊发红',assetIds:[asset.id]},options:{smartRecord:true,selectedOccurredAt:new Date().toISOString()}})
 const ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j})
 assert.equal(ready.frontDesk.context.id,ready.contextId);assert.equal(ready.frontDesk.context.draftId,ready.review.id);assert.equal(ready.frontDesk.context.review.version,ready.review.version)
 assert.equal(JSON.stringify(ready.frontDesk).includes('data:image'),false);assert.equal(ready.frontDesk.context.messages.filter(m=>m.kind==='image')[0].files.length,1)
})
test('structured jobs preserve profile batch identity through deferred and final preparation',async t=>{
 const f=await setup(t)
 await f.jobs.submit('synthetic',f.member.id,{id:'task-1',mode:'structured',scopeKey:'profile-upload',input:{id:'batch-1',kind:'text',text:'脸颊发红'},options:{task:'archive',profileBatch:true,profileBatchId:'profile-batch-1'}})
 const ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j}),draft=await f.business.get('synthetic',f.member.id,ready.review.id)
 assert.equal(draft.profileBatch,true);assert.equal(draft.profileBatchId,'profile-batch-1');assert.equal(ready.review.profileBatchId,'profile-batch-1')
})

test('ready GET and latest publish fresh user edits with a new stable sequence',async t=>{
 const f=await setup(t);await f.submit('first','脸颊发红')
 const ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j})
 const edited=await f.business.edit('synthetic',f.member.id,ready.review.id,{version:ready.review.version,itemId:ready.review.items[0].id,field:'title',value:'用户新标题'})
 const fresh=await f.jobs.get('synthetic',f.member.id,'task-1',{afterSeq:ready.seq,waitMs:25000})
 assert.equal(fresh.review.version,edited.version);assert.equal(fresh.review.items[0].title,'用户新标题');assert.ok(fresh.seq>ready.seq)
 assert.equal(fresh.frontDesk.context.review.version,edited.version);assert.equal(fresh.frontDesk.context.review.items[0].title,'用户新标题')
 assert.equal((await f.snapshot()).seq,fresh.seq)
 const latest=await f.jobs.latest('synthetic',f.member.id)
 assert.equal(latest.review.version,edited.version);assert.equal(latest.seq,fresh.seq)
 const next=await f.business.edit('synthetic',f.member.id,edited.id,{version:edited.version,itemId:edited.items[0].id,field:'title',value:'另一次用户修改'})
 const latestEdited=await f.jobs.latest('synthetic',f.member.id)
 assert.equal(latestEdited.review.version,next.version);assert.equal(latestEdited.frontDesk.context.review.items[0].title,'另一次用户修改');assert.ok(latestEdited.seq>fresh.seq)
})
test('fresh review hydration cannot revive a discarded job or overwrite a new input revision',async t=>{
 const f=await setup(t);await f.submit('first','脸颊发红')
 const ready=await until(async()=>{const j=await f.snapshot();return j.state==='ready'&&j}),read=f.business.read.bind(f.business)
 f.business.read=async(...args)=>{
  const value=await read(...args),current=f.jobs.raw('task-1')
  f.jobs.put({...current,state:'queued',stage:'queued',inputRevision:current.inputRevision+1,review:null})
  return value
 }
 const changed=await f.snapshot();assert.equal(changed.state,'queued');assert.equal(changed.inputRevision,ready.inputRevision+1);assert.equal(changed.review,null)
 // The next test transition represents a ready result being discarded while its
 // asynchronous draft read is in progress. No stale hydration may revive it.
 const current=f.jobs.raw('task-1');f.jobs.put({...current,state:'ready',stage:'ready',inputRevision:ready.inputRevision,resultRevision:ready.resultRevision,review:ready.review})
 f.business.read=async(...args)=>{const value=await read(...args);const current=f.jobs.raw('task-1');f.jobs.put({...current,state:'discarded',stage:'discarded',cancelEpoch:(current.cancelEpoch??0)+1});return value}
 const discarded=await f.snapshot();assert.equal(discarded.state,'discarded');assert.equal(f.jobs.raw('task-1').state,'discarded')
 f.business.read=read
})

// Append to server/ai/recognition-jobs.test.mjs after its existing setup(t).
// Uses the actual setup fields: front, frontModel, business, jobs, member,
// snapshot, submit. No new imports or provider-summary mocks are required.
const semanticTestDecision=overrides=>({intent:'record',subject:'current',status:'ready',topic:'injury',question:null,unresolvedItems:[],media:'none',...overrides})
const semanticTestQuestion=overrides=>({text:'目前还有出血吗？',slot:'observation',predicate:'bleeding',unit:null,options:[],...overrides})
const semanticTestReply=(decision,contextId='new')=>({value:{reply:'嗯，我了解了。',contextId,action:'record',questionId:null,emergency:{currentChild:false,quote:''},decision},diagnostics:{provider:'semantic-integration-fixture'}})
const semanticTestRaw=context=>context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed'&&m.recordable!==false).map(m=>m.text).filter(Boolean).join('\n')
const semanticTestSubmit=(f,id,text,extra={})=>f.jobs.submit('synthetic',f.member.id,{id:'task-1',mode:'front',input:{id,kind:'text',text,...extra},options:{task:'record',smartRecord:true,semanticVersion:2,selectedOccurredAt:new Date().toISOString()}})
const semanticTestTerminal=(f,revision)=>until(async()=>{const j=await f.snapshot();return j.inputRevision===revision&&['ready','failed'].includes(j.state)&&j})
const semanticTestFront=(f,id,text,extra={})=>f.front.submit('synthetic',f.member.id,{id,protocolVersion:2,kind:'text',text,...extra})

test('semantic v2 symbols and emoji persist interaction without any dialogue or extraction call',async t=>{
 const f=await setup(t);let dialogueCalls=0,prepareCalls=0
 f.frontModel.structured=async()=>{dialogueCalls++;assert.fail('symbols must not invoke dialogue')}
 f.business.prepare=async()=>{prepareCalls++;assert.fail('symbols must not create a draft')}
 const symbols=['。','！！！','？','……','👍','😭']
 for(const [index,text] of symbols.entries()){
  await semanticTestSubmit(f,`symbols-${index}`,text)
  const ready=await semanticTestTerminal(f,index+1)
  assert.equal(ready.state,'ready',JSON.stringify(ready.error));assert.equal(ready.resultRevision,index+1)
  assert.equal(ready.review,null);assert.equal(ready.frontDesk.context.decision.organize,false)
  assert.equal(semanticTestRaw(ready.frontDesk.context),'')
  assert.equal(ready.frontDesk.context.messages.find(m=>m.id===`symbols-${index}`).recordable,false)
 }
 assert.equal(dialogueCalls,0);assert.equal(prepareCalls,0)
 assert.equal((await f.business.store.read()).drafts.length,0)
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,0)
})

for(const scenario of [
 {name:'unrelated chat',text:'这个软件怎么换头像',decision:semanticTestDecision({intent:'chat',topic:'general'})},
 {name:'explicit other person',text:'哥哥昨天发烧了',decision:semanticTestDecision({intent:'clarify',subject:'other',status:'ask',topic:'fever',question:semanticTestQuestion({text:'这条情况是要记录哪位成员的？',slot:'subject',predicate:null})})}
])test(`semantic v2 ${scenario.name} cannot extract and cannot leak into a later current-member fact`,async t=>{
 const f=await setup(t);let prepareCalls=0
 f.frontModel.structured=async()=>semanticTestReply(scenario.decision)
 f.business.prepare=async()=>{prepareCalls++;assert.fail('non-recordable interaction must not extract')}
 await semanticTestSubmit(f,'non-recordable',scenario.text)
 const ready=await semanticTestTerminal(f,1)
 assert.equal(ready.state,'ready',JSON.stringify(ready.error));assert.equal(ready.review,null)
 assert.equal(ready.frontDesk.context.decision.organize,false)
 assert.equal(ready.frontDesk.context.messages.find(m=>m.id==='non-recordable').recordable,false)
 assert.equal(semanticTestRaw(ready.frontDesk.context),'');assert.equal(prepareCalls,0)
 assert.equal((await f.business.store.read()).drafts.length,0)
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,0)
 const contextId=ready.frontDesk.context.id
 f.frontModel.structured=async()=>semanticTestReply(semanticTestDecision({topic:'skin'}),contextId)
 const continued=await semanticTestFront(f,'current-member','宝宝今天脸颊发红',{contextId})
 const raw=semanticTestRaw(continued.context)
 assert.equal(raw,'宝宝今天脸颊发红')
 const evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,contextId,raw)
 assert.deepEqual(evidence.observations,[]);assert.deepEqual(evidence.context,[])
 assert.equal(continued.context.messages.find(m=>m.id==='non-recordable').text,scenario.text,'original stays in conversation')
})

test('semantic v2 dynamic short answer binds displayed question and exact raw range, then retires on a later same-property update',async t=>{
 const f=await setup(t),at=Date.now()-10000,initial='小脚趾踢破了'
 let selected='new',decision=semanticTestDecision({status:'ask',question:semanticTestQuestion()}),dialogueCalls=0
 f.frontModel.structured=async()=>{dialogueCalls++;return semanticTestReply(decision,selected)}
 const first=await semanticTestFront(f,'dynamic-first',initial,{inputAt:at})
 selected=first.context.id
 const question=first.context.interview.question
 assert.match(question.id,/^semantic:/);assert.equal(question.text,'目前还有出血吗？')
 assert.equal(question.semantic.predicate,'bleeding')
 const answerTo={contextId:selected,questionId:question.id}
 const explained=await semanticTestFront(f,'dynamic-question-mark','？',{inputAt:at+1,answerTo})
 assert.equal(explained.context.interview.question.id,question.id)
 assert.equal(explained.context.interview.turnCount,first.context.interview.turnCount)
 assert.equal(explained.context.messages.find(m=>m.id==='dynamic-question-mark').recordable,false)
 assert.equal(dialogueCalls,1)
 decision=semanticTestDecision()
 const answered=await semanticTestFront(f,'dynamic-answer','没有',{inputAt:at+2,answerTo})
 let raw=semanticTestRaw(answered.context),evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,selected,raw)
 const bound=evidence.context.find(a=>a.sourceMessageId==='dynamic-answer')
 assert.equal(bound.status,'active');assert.equal(bound.questionDescriptor.id,question.id)
 assert.equal(bound.questionDescriptor.semantic.predicate,'bleeding')
 assert.equal(bound.rawStart,initial.length+1);assert.equal(raw.slice(bound.rawStart,bound.rawEnd),'没有')
 assert.equal(evidence.observations.length,1);assert.equal(evidence.observations[0].polarity,'no')
 assert.match(evidence.observations[0].text,/出血/);assert.doesNotMatch(evidence.observations[0].text,/疼痛|正常/)
 const unrelated=await semanticTestFront(f,'dynamic-unrelated','今天喝了奶',{inputAt:at+3,contextId:selected})
 raw=semanticTestRaw(unrelated.context);evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,selected,raw)
 assert.equal(evidence.context.find(a=>a.sourceMessageId==='dynamic-answer').status,'active','unrelated fact must not retire bleeding answer')
 const updated=await semanticTestFront(f,'dynamic-update','刚才又开始出血了',{inputAt:at+4,contextId:selected})
 raw=semanticTestRaw(updated.context);evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,selected,raw)
 assert.equal(evidence.context.find(a=>a.sourceMessageId==='dynamic-answer').status,'superseded')
 assert.equal(evidence.observations.some(a=>a.sourceMessageId==='dynamic-answer'),false)
 assert.equal(evidence.superseded.find(a=>a.sourceMessageId==='dynamic-answer').answerText,'没有')
})

test('semantic v2 dynamic onset correction supersedes only its earlier bound time and retains source range',async t=>{
 const f=await setup(t),at=Date.now()-10000
 let selected='new',decision=semanticTestDecision({status:'ask',question:semanticTestQuestion({text:'这次是什么时候开始的？',slot:'onset',predicate:null})})
 f.frontModel.structured=async()=>semanticTestReply(decision,selected)
 const first=await semanticTestFront(f,'onset-first','小脚趾踢破了',{inputAt:at});selected=first.context.id
 const question=first.context.interview.question
 decision=semanticTestDecision()
 await semanticTestFront(f,'onset-answer','昨天开始',{inputAt:at+1,answerTo:{contextId:selected,questionId:question.id}})
 const corrected=await semanticTestFront(f,'onset-correction','时间说错了，是今天',{inputAt:at+2,contextId:selected})
 const raw=semanticTestRaw(corrected.context),evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,selected,raw)
 assert.equal(evidence.context.find(a=>a.sourceMessageId==='onset-answer').status,'superseded')
 const retired=evidence.superseded.find(a=>a.sourceMessageId==='onset-answer')
 assert.equal(raw.slice(retired.rawStart,retired.rawEnd),'昨天开始')
 assert.equal(retired.questionDescriptor.semantic.slot,'onset')
 assert.equal(evidence.context.some(a=>a.sourceMessageId==='onset-correction'&&a.status==='active'),false,'free correction is not forged as another bound answer')
})

test('semantic v2 unknown short answer ends ordinary questions with explicit incompleteness rather than denial',async t=>{
 const f=await setup(t),at=Date.now()-10000
 let selected='new',decision=semanticTestDecision({status:'ask',question:semanticTestQuestion({text:'这次是什么时候开始的？',slot:'onset',predicate:null})})
 f.frontModel.structured=async()=>semanticTestReply(decision,selected)
 const first=await semanticTestFront(f,'unknown-first','小脚趾踢破了',{inputAt:at});selected=first.context.id
 decision=semanticTestDecision({status:'incomplete',unresolvedItems:['具体开始时间不清楚']})
 const done=await semanticTestFront(f,'unknown-answer','不知道',{inputAt:at+1,answerTo:{contextId:selected,questionId:first.context.interview.question.id}})
 assert.equal(done.context.interview.question,null);assert.equal(done.context.interview.status,'ready')
 assert.equal(done.context.interview.stopReason,'user_finished');assert.equal(done.context.decision.organize,true)
 const evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,selected,semanticTestRaw(done.context))
 assert.deepEqual(evidence.unresolvedItems,['具体开始时间不清楚'])
 assert.equal(evidence.observations.length,1);assert.equal(evidence.observations[0].polarity,'unknown')
 assert.match(evidence.observations[0].text,/开始时间.*不清楚/);assert.doesNotMatch(evidence.observations[0].text,/没有|正常/)
})

test('semantic v2 new input preserves the protocol of a retained failed v1 input during ordered retry',async t=>{
 const f=await setup(t),versions=[],submit=f.front.submit.bind(f.front);let firstAttempt=true
 f.front.submit=async(...args)=>{versions.push([args[2].id,args[2].protocolVersion]);return submit(...args)}
 f.frontModel.structured=async()=>{
  if(firstAttempt){firstAttempt=false;throw new Error('synthetic first dialogue failure')}
  return {value:{reply:'嗯，我了解了。',contextId:'new',action:'record',questionId:null,emergency:{currentChild:false,quote:''}},diagnostics:{provider:'legacy-fixture'}}
 }
 f.business.prepare=async()=>assert.fail('final courtesy interaction must gate extraction')
 await f.submit('legacy-input','脸颊发红')
 const failed=await semanticTestTerminal(f,1);assert.equal(failed.state,'failed')
 assert.equal((await f.front.store.read()).messages.find(m=>m.id==='legacy-input').protocolVersion,1)
 await semanticTestSubmit(f,'semantic-input','谢谢')
 const ready=await semanticTestTerminal(f,2)
 assert.equal(ready.state,'ready',JSON.stringify(ready.error));assert.equal(ready.resultRevision,2)
 assert.deepEqual(versions,[['legacy-input',1],['legacy-input',1],['semantic-input',2]])
 assert.deepEqual(f.jobs.raw('task-1').inputs.map(i=>i.protocolVersion),[1,2])
 assert.equal(ready.review,null)
 const messages=(await f.front.store.read()).messages
 assert.equal(messages.filter(m=>m.id==='legacy-input').length,1)
 assert.equal(messages.find(m=>m.id==='semantic-input').recordable,false)
})

// Append after the semanticTest* helpers in recognition-jobs.test.mjs.
// Real FrontDeskRecord/AIBusinessService/RecognitionJobs; only provider outputs
// are injected. This covers save eligibility, not just visible review reuse.
async function semanticReadyInteractionFixture(f){
 const original=f.model.structured
 f.frontModel.structured=async()=>semanticTestReply(semanticTestDecision({topic:'skin'}))
 f.model.structured=async input=>{
  if(input.task==='professional-summary-generate'){
   f.calls.push(input.task)
   const data=JSON.parse(input.input)
   return {value:{items:data.items.map(p=>({itemId:p.itemId,title:'脸颊发红',claims:p.facts.map(c=>({text:c.text,factIds:c.factIds}))}))},diagnostics:{provider:'synthetic'}}
  }
  if(input.task==='professional-summary-verify'){
   f.calls.push(input.task)
   const data=JSON.parse(input.input)
   return {value:{items:data.candidates.map(c=>({itemId:c.itemId,titleSupported:true,complete:true,missingFacts:[],problems:[],claims:c.claims.map((_,index)=>({index,supported:true}))}))},diagnostics:{provider:'synthetic'}}
  }
  return original(input)
 }
 await semanticTestSubmit(f,'ready-original','脸颊发红')
 const initial=await semanticTestTerminal(f,1)
 assert.equal(initial.state,'ready',JSON.stringify(initial.error))
 assert.equal(initial.review.items[0].professionalSummary.version,'professional-summary-v2')
 f.jobs.assertCurrent(await f.business.get('synthetic',f.member.id,initial.review.id))
 return initial
}

test('semantic v2 ready draft survives courtesy without regeneration and remains saveable with idempotent retry',async t=>{
 const f=await setup(t),initial=await semanticReadyInteractionFixture(f)
 const calls=[...f.calls],version=initial.review.version,summary=structuredClone(initial.review.items[0].professionalSummary)
 f.business.prepare=async()=>assert.fail('courtesy must reuse the verified fact projection without preparation')
 await semanticTestSubmit(f,'courtesy-after-ready','谢谢')
 const current=await semanticTestTerminal(f,2)
 assert.equal(current.state,'ready',JSON.stringify(current.error));assert.equal(current.resultRevision,2)
 assert.equal(current.review?.id,initial.review.id);assert.equal(current.review.version,version)
 assert.deepEqual(current.review.items[0].professionalSummary,summary)
 assert.deepEqual(f.calls,calls,'courtesy must not call extraction, summary generation, or verification again')
 const draft=await f.business.get('synthetic',f.member.id,initial.review.id)
 assert.deepEqual(draft.recognitionBinding,{jobId:'task-1',revision:2})
 f.jobs.assertCurrent(draft)
 const restored=await f.front.snapshot('synthetic',f.member.id,initial.contextId)
 assert.equal(restored.review.id,initial.review.id);assert.equal(restored.review.version,version)
 assert.deepEqual(restored.review.items[0].professionalSummary,summary)
 const saved=await f.business.save('synthetic',f.member.id,initial.review.id,{version,confirmed:true})
 const retried=await f.business.save('synthetic',f.member.id,initial.review.id,{version,confirmed:true})
 assert.equal(saved.state,'saved');assert.deepEqual(retried.result,saved.result)
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,1)
 assert.deepEqual(f.calls,calls)
})

for(const scenario of [
 {name:'new health fact requiring clarification',text:'现在手臂也起了红点',decision:semanticTestDecision({topic:'skin',status:'ask',question:semanticTestQuestion({text:'手臂的红点是什么时候出现的？',slot:'onset',predicate:null})})},
 {name:'model-classified unrelated chat',text:'这个软件怎么换头像',decision:semanticTestDecision({intent:'chat',topic:'general'})},
 {name:'explicit other-person clarification',text:'哥哥今天发烧了',decision:semanticTestDecision({intent:'clarify',subject:'other',status:'ask',topic:'fever',question:semanticTestQuestion({text:'这条情况是要记录哪位成员的？',slot:'subject',predicate:null})})}
])test(`semantic v2 ${scenario.name} cannot retain the former draft save binding`,async t=>{
 const f=await setup(t),initial=await semanticReadyInteractionFixture(f),calls=[...f.calls]
 f.frontModel.structured=async()=>semanticTestReply(scenario.decision,initial.contextId)
 f.business.prepare=async()=>assert.fail('blocked or clarification turn must not extract')
 await semanticTestSubmit(f,'blocked-after-ready',scenario.text,{contextId:initial.contextId})
 const current=await semanticTestTerminal(f,2)
 assert.equal(current.state,'ready',JSON.stringify(current.error));assert.equal(current.resultRevision,2)
 assert.equal(current.review,null);assert.equal(current.draftId,null)
 const restored=await f.front.snapshot('synthetic',f.member.id,initial.contextId)
 assert.equal(restored.review,undefined)
 const old=await f.business.get('synthetic',f.member.id,initial.review.id)
 assert.equal(old.recognitionBinding.revision,1,'blocked turn must not silently rebind the old facts')
 assert.throws(()=>f.jobs.assertCurrent(old),{code:'RECOGNITION_REVISION_CONFLICT'})
 await assert.rejects(()=>f.business.save('synthetic',f.member.id,old.id,{version:old.version,confirmed:true}),{code:'RECOGNITION_REVISION_CONFLICT'})
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,0)
 assert.deepEqual(f.calls,calls)
})

// Append to recognition-jobs.test.mjs after its existing semanticTest* helpers.
// No new imports. sharp, setup(t), and real front/business are already available.
function semanticOwnerModel(f,topic='fever'){
 const state={contextId:'new',requests:[],decision:semanticTestDecision({intent:'clarify',subject:'unknown',subjectResolution:null,status:'ask',topic,question:semanticTestQuestion({text:'这说的是哪位成员？',slot:'subject',predicate:null})})}
 f.frontModel.structured=async input=>{state.requests.push(JSON.parse(input.input[0].content[0].text));return semanticTestReply(state.decision,state.contextId)}
 return state
}
const semanticOwnerQuestion=()=>semanticTestQuestion({text:'这说的是哪位成员？',slot:'subject',predicate:null})

test('semantic v2 unknown then other then unrelated current cannot transfer the earlier symptom',async t=>{
 const f=await setup(t),state=semanticOwnerModel(f),at=Date.now()-10000
 const first=await semanticTestFront(f,'owner-unknown','发烧了',{inputAt:at});state.contextId=first.context.id
 const question=first.context.interview.question,source=first.context.messages.find(m=>m.id==='owner-unknown')
 assert.equal(source.recordable,false);assert.equal(source.semanticSubject,'unknown')
 assert.equal(question.semantic.subjectGroupId,source.semanticSubjectGroupId);assert.equal(semanticTestRaw(first.context),'')
 state.decision=semanticTestDecision({intent:'clarify',subject:'other',subjectResolution:'other',status:'ask',topic:'fever',question:semanticOwnerQuestion()})
 const other=await semanticTestFront(f,'owner-is-other','哥哥',{inputAt:at+1,answerTo:{contextId:state.contextId,questionId:question.id}})
 const resolved=other.context.messages.find(m=>m.id==='owner-unknown')
 assert.equal(resolved.semanticSubject,'other');assert.equal(resolved.recordable,false);assert.equal(resolved.subjectResolvedBy,'owner-is-other')
 assert.equal(other.context.interview.question.semantic.subjectGroupId,question.semantic.subjectGroupId)
 state.decision=semanticTestDecision({topic:'diet',subjectResolution:null})
 const current=await semanticTestFront(f,'owner-new-current','宝宝今天喝了奶',{inputAt:at+2,answerTo:{contextId:state.contextId,questionId:other.context.interview.question.id}})
 const raw=semanticTestRaw(current.context)
 assert.equal(raw,'宝宝今天喝了奶')
 assert.equal(current.context.messages.find(m=>m.id==='owner-unknown').semanticSubject,'other')
 const evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,state.contextId,raw)
 assert.equal(evidence.semanticVersion,2);assert.deepEqual(evidence.mediaHashes,[])
 assert.equal(current.context.messages.find(m=>m.id==='owner-unknown').text,'发烧了','original conversation is retained')
})

test('semantic v2 explicit bound current resolution retrieves only its unknown subject group and supplies the bound descriptor to the model',async t=>{
 const f=await setup(t),state=semanticOwnerModel(f),at=Date.now()-10000
 const first=await semanticTestFront(f,'owner-current-unknown','发烧了',{inputAt:at});state.contextId=first.context.id
 const question=first.context.interview.question,answerTo={contextId:state.contextId,questionId:question.id}
 state.decision=semanticTestDecision({topic:'fever',subjectResolution:'current'})
 const current=await semanticTestFront(f,'owner-confirm-current','这次发烧的是宝宝',{inputAt:at+1,answerTo})
 const source=current.context.messages.find(m=>m.id==='owner-current-unknown')
 assert.equal(source.semanticSubject,'current');assert.equal(source.recordable,true);assert.equal(source.subjectResolvedBy,'owner-confirm-current')
 assert.equal(source.semanticSubjectGroupId,question.semantic.subjectGroupId)
 const raw=semanticTestRaw(current.context)
 assert.equal(raw,'发烧了\n这次发烧的是宝宝')
 const latest=state.requests.at(-1).latest
 assert.deepEqual(latest.answerTo,answerTo);assert.equal(latest.answerQuestion.id,question.id)
 assert.equal(latest.answerQuestion.semantic.subjectGroupId,source.semanticSubjectGroupId)
 await f.business.frontAnswerObservations('synthetic',f.member.id,state.contextId,raw)
})

for(const scenario of [
 {name:'unrelated current fact with no resolution',topic:'diet',resolution:null,text:'宝宝今天喝了奶',bound:true},
 {name:'wrong-topic resolution even when bound',topic:'diet',resolution:'current',text:'宝宝今天喝了奶',bound:true},
 {name:'unbound provider resolution',topic:'fever',resolution:'current',text:'宝宝今天发烧了',bound:false}
])test(`semantic v2 ${scenario.name} leaves unresolved material isolated`,async t=>{
 const f=await setup(t),state=semanticOwnerModel(f),at=Date.now()-10000
 const first=await semanticTestFront(f,'owner-pending','发烧了',{inputAt:at});state.contextId=first.context.id
 state.decision=semanticTestDecision({topic:scenario.topic,subjectResolution:scenario.resolution})
 const target=scenario.bound?{answerTo:{contextId:state.contextId,questionId:first.context.interview.question.id}}:{contextId:state.contextId}
 const current=await semanticTestFront(f,'owner-separate-current',scenario.text,{inputAt:at+1,...target})
 const pending=current.context.messages.find(m=>m.id==='owner-pending')
 assert.equal(pending.semanticSubject,'unknown');assert.equal(pending.recordable,false);assert.equal(pending.subjectResolvedBy,undefined)
 const raw=semanticTestRaw(current.context)
 assert.equal(raw,scenario.text)
 await f.business.frontAnswerObservations('synthetic',f.member.id,state.contextId,raw)
})

test('semantic v2 a former other group never upgrades through a later current resolution with the same topic and subject question group',async t=>{
 const f=await setup(t),state=semanticOwnerModel(f),at=Date.now()-10000
 const first=await semanticTestFront(f,'owner-final-other','发烧了',{inputAt:at});state.contextId=first.context.id
 state.decision=semanticTestDecision({intent:'clarify',subject:'other',subjectResolution:'other',status:'ask',topic:'fever',question:semanticOwnerQuestion()})
 const other=await semanticTestFront(f,'owner-final-other-answer','哥哥',{inputAt:at+1,answerTo:{contextId:state.contextId,questionId:first.context.interview.question.id}})
 state.decision=semanticTestDecision({topic:'fever',subjectResolution:'current'})
 const current=await semanticTestFront(f,'owner-new-fever','宝宝今天也发烧了',{inputAt:at+2,answerTo:{contextId:state.contextId,questionId:other.context.interview.question.id}})
 const old=current.context.messages.find(m=>m.id==='owner-final-other')
 assert.equal(old.semanticSubject,'other');assert.equal(old.recordable,false);assert.equal(old.subjectResolvedBy,'owner-final-other-answer')
 assert.equal(semanticTestRaw(current.context),'宝宝今天也发烧了')
})

for(const resolution of ['current','other'])test(`semantic v2 photo-only unknown material is ${resolution==='current'?'retrieved':'excluded'} after explicit ${resolution} attribution`,async t=>{
 const f=await setup(t),state=semanticOwnerModel(f,'skin'),at=Date.now()-10000
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#cc3344'}}).png().toBuffer()
 const photo={name:'synthetic-owner.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}
 const first=await semanticTestFront(f,'owner-photo','',{kind:'image',files:[photo],inputAt:at});state.contextId=first.context.id
 const source=first.context.messages.find(m=>m.id==='owner-photo'),hash=source.files[0].contentHash
 assert.equal(source.recordable,false);assert.ok(hash)
 state.decision=resolution==='current'?semanticTestDecision({topic:'skin',subjectResolution:'current'}):semanticTestDecision({intent:'clarify',subject:'other',subjectResolution:'other',status:'ask',topic:'skin',question:semanticOwnerQuestion()})
 const resolved=await semanticTestFront(f,'owner-photo-answer',resolution==='current'?'照片是宝宝的':'照片是哥哥的',{inputAt:at+1,answerTo:{contextId:state.contextId,questionId:first.context.interview.question.id}})
 const original=resolved.context.messages.find(m=>m.id==='owner-photo')
 assert.equal(original.semanticSubject,resolution);assert.equal(original.recordable,resolution==='current')
 assert.equal(original.files[0].contentHash,hash);assert.equal(original.files[0].dataUrl,photo.dataUrl,'original image remains available in conversation')
 if(resolution==='current'){
  const evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,state.contextId,semanticTestRaw(resolved.context))
  assert.deepEqual(evidence.mediaHashes,[hash])
 }else{
  state.decision=semanticTestDecision({topic:'diet',subjectResolution:null})
  const current=await semanticTestFront(f,'owner-photo-new-current','宝宝今天喝了奶',{inputAt:at+2,answerTo:{contextId:state.contextId,questionId:resolved.context.interview.question.id}})
  const evidence=await f.business.frontAnswerObservations('synthetic',f.member.id,state.contextId,semanticTestRaw(current.context))
  assert.deepEqual(evidence.mediaHashes,[]);assert.equal(semanticTestRaw(current.context),'宝宝今天喝了奶')
 }
})

test('semantic v2 resolving the latest subject group cannot release a different pending group in the same context',async t=>{
 const f=await setup(t),state=semanticOwnerModel(f),at=Date.now()-10000
 const first=await semanticTestFront(f,'owner-group-a','发烧了',{inputAt:at});state.contextId=first.context.id
 const groupA=first.context.interview.question.semantic.subjectGroupId
 state.decision=semanticTestDecision({intent:'clarify',subject:'unknown',subjectResolution:null,status:'ask',topic:'report',question:semanticOwnerQuestion()})
 const second=await semanticTestFront(f,'owner-group-b','报告写体温38.5℃',{inputAt:at+1,contextId:state.contextId})
 const groupB=second.context.interview.question.semantic.subjectGroupId
 assert.notEqual(groupA,groupB)
 state.decision=semanticTestDecision({topic:'report',subjectResolution:'current'})
 const current=await semanticTestFront(f,'owner-group-b-answer','这份报告是宝宝的',{inputAt:at+2,answerTo:{contextId:state.contextId,questionId:second.context.interview.question.id}})
 const a=current.context.messages.find(m=>m.id==='owner-group-a'),b=current.context.messages.find(m=>m.id==='owner-group-b')
 assert.equal(a.semanticSubject,'unknown');assert.equal(a.recordable,false);assert.equal(a.subjectResolvedBy,undefined)
 assert.equal(b.semanticSubject,'current');assert.equal(b.recordable,true);assert.equal(b.subjectResolvedBy,'owner-group-b-answer')
 assert.equal(semanticTestRaw(current.context),'报告写体温38.5℃\n这份报告是宝宝的')
 await f.business.frontAnswerObservations('synthetic',f.member.id,state.contextId,semanticTestRaw(current.context))
})
