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
