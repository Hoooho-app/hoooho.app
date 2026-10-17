import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {AIBusinessService} from './service.mjs'
import {controlledCall} from '../providers/call-control.mjs'
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){for(let n=0;n<200;n++){const value=await fn();if(value)return value;await delay(5)}throw new Error('Timed out')}
async function setup(t,options={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-page-parallel-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(directory).create({accountId:'synthetic',name:'合成测试',relationship:'child'})
 const files=await Promise.all(['#ff0000','#00ff00','#0000ff','#ffff00'].map(async(background,i)=>({name:`合成${i+1}.png`,mimeType:'image/png',dataUrl:'data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background}}).png().toBuffer()).toString('base64')})))
 const model={provider:{name:'test',visionModel:'strict-v1'},structured:async input=>{
  if(input.task==='document-page')return {value:{text:'合成资料',status:'readable'},diagnostics:{}}
  return {value:{items:[{category:'symptom',title:'合成观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'没有呕吐',quote:'没有呕吐',sourceId:'input',page:1}]}]},diagnostics:{}}
 }}
 const service=new AIBusinessService({dataDirectory:directory,model,logger:{info(){}},...options})
 return {service,model,member,files,prepare:input=>service.prepare('synthetic',member.id,{text:'没有呕吐',...input})}
}
test('two OCR workers overlap, checkpoint each completion and preserve source order',async t=>{
 const f=await setup(t),original=f.model.structured,gates=f.files.map(deferred),entered=[],finished=[];let active=0,maxActive=0
 f.model.structured=async input=>{
  if(input.task!=='document-page')return original(input)
  const index=f.files.findIndex(f=>f.dataUrl===input.input[0].content[1].image_url)
  entered.push(index);active++;maxActive=Math.max(active,maxActive);await gates[index].promise;active--;finished.push(index)
  return {value:{text:`合成页面${index+1}`,status:'readable'},diagnostics:{page:index+1}}
 }
 const pending=f.prepare({files:f.files})
 await until(()=>entered.length===2);assert.deepEqual(entered,[0,1]);assert.equal(maxActive,2)
 gates[1].resolve();await until(async()=>{const d=(await f.service.store.read()).drafts[0];return d?.sources.some(s=>s.text==='合成页面2')})
 gates[2].resolve();gates[3].resolve();gates[0].resolve()
 const result=await pending,stored=await f.service.get('synthetic',f.member.id,result.id)
 assert.equal(maxActive,2);assert.equal(stored.callCount,5);assert.deepEqual(result.sources.filter(s=>s.id!=='input').map(s=>s.name),f.files.map(f=>f.name));assert.notDeepEqual(finished,[0,1,2,3])
 assert.equal(stored.sources.length,5)
})
test('first OCR failure stops dispatch; successful in-flight page is checkpointed and reused only on explicit retry',async t=>{
 const f=await setup(t),original=f.model.structured,first=deferred(),second=deferred(),entered=[];let failFirst=true
 f.model.structured=async input=>{
  if(input.task!=='document-page')return original(input)
  const index=f.files.findIndex(f=>f.dataUrl===input.input[0].content[1].image_url);entered.push(index)
  if(index===0&&failFirst){await first.promise;throw new Error('synthetic OCR failure')}
  if(index===1)await second.promise
  return {value:{text:'合成资料',status:'readable'},diagnostics:{}}
 }
 const pending=f.prepare({files:f.files}),rejected=assert.rejects(()=>pending,/synthetic OCR failure/)
 await until(()=>entered.length===2);first.resolve();await delay(10);second.resolve();await rejected
 assert.deepEqual(entered,[0,1]);const failed=await f.service.latest('synthetic',f.member.id)
 assert.equal(failed.state,'failed');assert.deepEqual(failed.sources.filter(s=>s.id!=='input').map(s=>s.name),[f.files[1].name])
 await delay(10);assert.equal(entered.length,2)
 failFirst=false;const result=await f.prepare({id:failed.id,version:failed.version})
 assert.equal(result.state,'ready');assert.equal(entered.filter(i=>i===1).length,1);assert.equal(entered.length,5)
})
test('parallel OCR budget reservations cannot exceed the configured draft-call limit',async t=>{
 const f=await setup(t,{maxDraftCalls:2}),original=f.model.structured;let calls=0
 f.model.structured=async input=>{calls++;await delay(5);return original(input)}
 await assert.rejects(()=>f.prepare({files:f.files}),{code:'AI_DRAFT_CALL_LIMIT'})
 const d=await f.service.latest('synthetic',f.member.id),stored=await f.service.get('synthetic',f.member.id,d.id)
 assert.equal(calls,2);assert.equal(stored.callCount,2);assert.equal(stored.sources.filter(s=>s.id!=='input').length,2)
})
test('OCR workers obey the global supplier slots when another account holds one',async t=>{
 const f=await setup(t),original=f.model.structured,hold=deferred();let active=1,maxActive=1,calls=0
 const occupied=controlledCall(()=>hold.promise,{AI_MAX_CONCURRENT_CALLS:'2'})
 f.model.structured=input=>controlledCall(async()=>{active++;maxActive=Math.max(active,maxActive);calls++;await delay(5);try{return await original(input)}finally{active--}},{AI_MAX_CONCURRENT_CALLS:'2',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1000'})
 // Only OCR calls are queued here; extraction begins after all pages finish.
 const pending=f.prepare({files:f.files.slice(0,2)})
 await until(()=>calls>=1);active--;hold.resolve();await occupied
 await pending;assert.ok(maxActive<=2);assert.equal(calls,3)
})
test('a configured global limit of one keeps page dispatch serial',async t=>{
 const f=await setup(t,{env:{AI_MAX_CONCURRENT_CALLS:'1'}}),original=f.model.structured;let active=0,maxActive=0
 f.model.structured=async input=>{active++;maxActive=Math.max(active,maxActive);await delay(5);try{return await original(input)}finally{active--}}
 await f.prepare({files:f.files});assert.equal(maxActive,1)
})
test('an early reprocess failure retains untouched verified pages even when dispatch is serial',async t=>{
 const f=await setup(t),ready=await f.prepare({files:f.files}),original=f.model.structured
 f.service.pageConcurrency=1;f.model.structured=async input=>{if(input.task==='document-page')throw new Error('synthetic reprocess failure');return original(input)}
 await assert.rejects(()=>f.prepare({id:ready.id,version:ready.version,reprocessPages:[`${ready.pages[0].id}:1`]}),/synthetic reprocess failure/)
 const failed=await f.service.latest('synthetic',f.member.id)
 assert.deepEqual(failed.sources.filter(s=>s.id!=='input').map(s=>s.name),f.files.slice(1).map(f=>f.name))
 let pageCalls=0;f.model.structured=async input=>{if(input.task==='document-page')pageCalls++;return original(input)}
 assert.equal((await f.prepare({id:failed.id,version:failed.version})).state,'ready');assert.equal(pageCalls,1)
})
