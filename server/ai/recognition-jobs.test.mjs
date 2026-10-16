import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readdir} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {RecognitionJobs} from './recognition-jobs.mjs'
import {recognitionOwnerLifecycle} from './recognition-lifecycle.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
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
