import test from 'node:test'
import assert from 'node:assert/strict'
import {SymptomMediaJobs} from './symptom-media-jobs.mjs'

const tick=()=>new Promise(r=>setTimeout(r,5))
async function settled(jobs){for(let i=0;i<200&&jobs.active.size;i++)await tick();assert.equal(jobs.active.size,0)}
function setup(overrides={}){
 let data={photos:[{id:'one',accountId:'a',memberId:'m',draftId:'draft',mimeType:'video/mp4',storageKey:'one.mp4'}]}
 const photos={filesDirectory:'.',store:{update:async fn=>{data=fn(data)},read:async()=>data},getOwnedPhoto:async(a,m,d,id)=>{const p=data.photos.find(p=>p.id===id&&p.accountId===a&&p.memberId===m&&p.draftId===d&&!p.consumedAt);if(!p)throw Error('not owned');return p}}
 const logs=[],provider={name:'fixture',apiKey:'fixture',baseUrl:'https://fixture.invalid',fetch:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({observations:[{frame:0,text:'可见表面发红，不能推断疼痛'}],questions:['请核对不同来源和时间']})}]}]})}
 const inputs=async()=>({image:Buffer.from('fixture'),times:[0,3],audio:Buffer.from('fixture'),duration:3})
 const jobs=new SymptomMediaJobs(photos,{provider,inputs,audio:{transcribe:async()=>({transcript:'昨晚开始，没有发烧，之前吐过，今天没有',provider:'fixture'})},logger:{info(...x){logs.push(x)}},...overrides})
 return {jobs,photos,read:()=>data.photos[0],logs}
}
test('audio and visual drafts retain sources, negation and unknown historical date without facts',async()=>{
 const f=setup();await f.jobs.start('a','m','draft','one');await settled(f.jobs)
 const r=f.read().review;assert.equal(r.confirmed,false);assert.equal(r.referenceDate,null);assert.match(r.audio.text,/没有发烧.*今天没有/);assert.match(r.audio.message,/日期未知/);assert.equal(r.vision.observations[0].sourceId,'one');assert.equal(r.vision.observations[0].seconds,0);assert.equal(r.sound.status,'unsupported');assert.deepEqual(r.calls,{audio:1,vision:1,audioSucceeded:1,audioFailed:0,visionSucceeded:1,visionFailed:0,automaticRetries:0});assert.ok(!JSON.stringify(f.logs).includes('昨晚开始'))
 await assert.rejects(()=>f.jobs.start('other','m','draft','one'))
})
test('failed visual stage keeps transcript; manual visual retry does not invoke audio twice',async()=>{
 let attempts=0;const f=setup({provider:{name:'fixture',apiKey:'fixture',baseUrl:'https://fixture.invalid',fetch:async()=>{attempts++;throw Object.assign(Error('画面服务超时'),{code:'VISION_TIMEOUT'})}}})
 await f.jobs.start('a','m','draft','one');await settled(f.jobs);assert.equal(f.read().review.audio.status,'needs_confirmation');assert.equal(f.read().review.vision.status,'failed');assert.equal(attempts,1)
 await f.jobs.start('a','m','draft','one','vision');await settled(f.jobs);assert.equal(f.read().review.calls.audio,0);assert.equal(attempts,2);assert.match(f.read().review.audio.text,/没有发烧/)
})
test('failed audio and no audio never discard usable visual observations',async()=>{
 const failed=setup({audio:{transcribe:async()=>{throw Object.assign(Error('转写服务失败'),{code:'ASR_FAILED'})}}});await failed.jobs.start('a','m','draft','one');await settled(failed.jobs);assert.equal(failed.read().review.audio.status,'failed');assert.equal(failed.read().review.vision.status,'needs_confirmation')
 const silent=setup({inputs:async()=>({image:Buffer.from('fixture'),times:[0],audio:null,duration:3})});await silent.jobs.start('a','m','draft','one');await settled(silent.jobs);assert.equal(silent.read().review.audio.status,'no_audio');assert.equal(silent.read().review.calls.audio,0);assert.equal(silent.read().review.vision.status,'needs_confirmation')
})
test('cancelled old work cannot invoke a provider or clear a replacement job',async()=>{
 let resolveOld,resolveNew,calls=0;const f=setup({inputs:()=>new Promise(r=>{if(!resolveOld)resolveOld=r;else resolveNew=r})});f.jobs.provider.fetch=async()=>{calls++;return Response.json({output:[{content:[{type:'output_text',text:'{"observations":[],"questions":[]}'}]}]})}
 await f.jobs.start('a','m','draft','one');f.jobs.cancel('one');const replacement=await f.jobs.start('a','m','draft','one');resolveOld({image:Buffer.from('fixture'),times:[0],audio:null});await tick();assert.equal(f.jobs.active.get('one'),replacement.jobId);assert.equal(calls,0);resolveNew({image:Buffer.from('fixture'),times:[0],audio:null});await settled(f.jobs);assert.equal(calls,1)
})
test('deleted item is not resurrected by a late provider response',async()=>{
 let release;const f=setup({provider:{name:'fixture',apiKey:'fixture',baseUrl:'https://fixture.invalid',fetch:()=>new Promise(r=>{release=r})}});await f.jobs.start('a','m','draft','one');while(!release)await tick();f.jobs.cancel('one');await f.photos.store.update(()=>({photos:[]}));release(Response.json({output:[{content:[{type:'output_text',text:'{"observations":[],"questions":[]}'}]}]}));await tick();assert.equal((await f.photos.store.read()).photos.length,0)
})
