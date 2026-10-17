import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveBusinessAssetInput} from './asset-input.mjs'

const id=n=>String(n).padStart(64,'0')
function setup(){
  let reads=0
  const jobs={scope:async(account,member)=>{if(account!=='owner'||member!=='child')throw Object.assign(new Error('人物不存在'),{status:404})},asset:(account,member,key)=>{if(account!=='owner'||member!=='child'||![id(1),id(2)].includes(key))throw Object.assign(new Error('原件不属于当前人物'),{status:404});return {mimeType:'image/png',bytes:8}},materialize:async(scope,ids)=>{reads++;assert.deepEqual(scope,{accountId:'owner',memberId:'child'});return ids.map(key=>({name:`${key}.png`,mimeType:'image/png',dataUrl:'data:image/png;base64,b3JpZ2luYWw='}))}}
  return {jobs,reads:()=>reads}
}
test('asset transport preserves source order, original bytes and business parameters without a recognition job binding',async()=>{
  const f=setup(),input={assetIds:[id(2),id(1)],id:'exact-draft',version:7,text:'原话',eventId:'existing-case',sourceIdentity:'pending',deferRecognition:true}
  const result=await resolveBusinessAssetInput(f.jobs,'owner','child',input)
  assert.deepEqual(result.files.map(file=>file.name),[`${id(2)}.png`,`${id(1)}.png`]);assert.equal(result.files[0].dataUrl,'data:image/png;base64,b3JpZ2luYWw=');assert.equal(result.id,'exact-draft');assert.equal(result.version,7);assert.equal(result.eventId,'existing-case');assert.equal(result.deferRecognition,true);assert.equal(result.sourceIdentity,'pending');assert.ok(!('assetIds' in result));assert.ok(!('recognitionBinding' in result));assert.equal(f.reads(),1)
  const legacy={files:[],text:'原本路径'};assert.equal(await resolveBusinessAssetInput(f.jobs,'owner','child',legacy),legacy)
})
test('invalid, duplicate, foreign and oversized references are rejected before reading any bytes',async()=>{
  const f=setup()
  for(const input of [{assetIds:[]},{assetIds:[id(1)],files:[]},{assetIds:[id(1),id(1)]},{assetIds:['../../private']},{assetIds:Array.from({length:13},(_,n)=>id(n+1))}])await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'owner','child',input),{code:'AI_DRAFT_ASSET_INVALID'})
  await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'owner','child',{assetIds:[id(3)]}),{status:404})
  await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'foreign','child',{assetIds:[id(1)]}),{status:404})
  await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'owner','other-child',{assetIds:[id(1)]}),{status:404})
  f.jobs.asset=()=>({mimeType:'image/png',bytes:16*1024*1024});await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'owner','child',{assetIds:[id(1)]}),{status:413})
  f.jobs.asset=()=>({mimeType:'audio/wav',bytes:8});await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'owner','child',{assetIds:[id(1)]}),{status:415});assert.equal(f.reads(),0)
})
test('cancellation during materialization cannot reach business preparation',async()=>{
  const f=setup(),controller=new AbortController();f.jobs.materialize=async()=>{controller.abort();return []}
  await assert.rejects(()=>resolveBusinessAssetInput(f.jobs,'owner','child',{assetIds:[id(1)]},controller.signal),{name:'AbortError'})
})
