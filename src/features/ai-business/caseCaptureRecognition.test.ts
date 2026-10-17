import assert from 'node:assert/strict'
import test from 'node:test'
import { casePhotoKey, recognizeCasePhotos, type CaseRecognitionCache, type CaseRecognitionDraft } from './caseCaptureRecognition'
import { packCaptureDraft, unpackCaptureDraft } from './captureDraft'

function transport() {
  const calls:{path:string;method:string;body:unknown}[]=[]
  let version=0,uploads=0
  const fetch:typeof globalThis.fetch=async(input,init)=>{
    const path=String(input),method=init?.method??'GET',body=typeof init?.body==='string'?JSON.parse(init.body):init?.body
    calls.push({path,method,body})
    if(path.includes('/recognition-assets'))return new Response(JSON.stringify({id:String(++uploads).padStart(64,'0')}))
    if(method==='GET')return new Response(JSON.stringify({id:'exact-draft',version,state:'ready',items:[]}))
    return new Response(JSON.stringify({id:'exact-draft',version:++version,state:body.deferRecognition?'changed':'ready',items:[]}))
  }
  return {calls,fetch}
}
test('appending a photo sends only new binary bytes and retains the checkpoint then recognize contract on the exact preceding version',async()=>{
  const original=globalThis.fetch,t=transport(),cache:CaseRecognitionCache={assets:{}},first=new File(['first'],'a.png',{type:'image/png'}),second=new File(['second'],'b.png',{type:'image/png'})
  const options={memberId:'member',token:'synthetic',text:'没有呕吐',signal:new AbortController().signal,cache,onAsset:()=>{},onOriginal:()=>{},onPrepared:()=>{}}
  globalThis.fetch=t.fetch
  try{
    await recognizeCasePhotos({...options,files:[first]})
    await recognizeCasePhotos({...options,files:[first,second]})
    const uploads=t.calls.filter(call=>call.path.includes('/recognition-assets')),posts=t.calls.filter(call=>call.path.endsWith('/ai-drafts')&&call.method==='POST').map(call=>call.body as Record<string,unknown>)
    assert.equal(uploads.length,2);assert.equal(posts.length,4)
    assert.deepEqual(posts.map(post=>post.deferRecognition===true),[true,false,true,false])
    assert.deepEqual(posts[2].assetIds,[String(1).padStart(64,'0'),String(2).padStart(64,'0')]);assert.equal(posts[2].id,'exact-draft');assert.equal(posts[2].version,2);assert.equal(posts[3].version,3)
    assert.ok(posts.every(post=>!('files' in post)&&!JSON.stringify(post).includes('base64')))
    assert.equal(Object.keys(cache.assets).length,2)
  }finally{globalThis.fetch=original}
})
test('first-save interruption keeps the acknowledged raw draft and original files without starting recognition or deleting the draft',async()=>{
  const original=globalThis.fetch,t=transport(),controller=new AbortController(),cache:CaseRecognitionCache={assets:{}},file=new File(['original'],'a.png',{type:'image/png'})
  let acknowledged:CaseRecognitionDraft|undefined
  globalThis.fetch=t.fetch
  try{
    await assert.rejects(recognizeCasePhotos({memberId:'member',token:'synthetic',text:'原话',files:[file],signal:controller.signal,cache,onAsset:()=>{},onOriginal:draft=>{acknowledged=draft;controller.abort()},onPrepared:()=>assert.fail('must not recognize after first-save interruption')}),{name:'AbortError'})
    assert.equal(acknowledged?.state,'changed');assert.equal(cache.draft?.id,'exact-draft')
    assert.equal(t.calls.filter(call=>call.path.endsWith('/ai-drafts')&&call.method==='POST').length,1);assert.ok(t.calls.every(call=>call.method!=='DELETE'))
    const persisted=unpackCaptureDraft(await packCaptureDraft({text:'原话',files:[file],occurredAt:'2026-10-01T08:00',timeUnknown:false,requestId:'stable-save',aiDraftId:acknowledged!.id,caseRecognitionDraft:cache.draft,recognitionAssets:cache.assets}))
    assert.equal(persisted.aiDraftId,'exact-draft');assert.deepEqual(persisted.caseRecognitionDraft,cache.draft);assert.deepEqual(persisted.recognitionAssets,cache.assets);assert.equal(await persisted.files[0].text(),'original')
  }finally{globalThis.fetch=original}
})
test('different bytes with identical picker metadata cannot reuse the wrong original',async()=>{
  const one=new File(['one'],'same.png',{type:'image/png',lastModified:1}),two=new File(['two'],'same.png',{type:'image/png',lastModified:1})
  assert.equal(one.size,two.size);assert.notEqual(await casePhotoKey(one),await casePhotoKey(two))
})
test('expired persisted assets invalidate their references once; an explicit retry uploads the preserved original again',async()=>{
  const original=globalThis.fetch,t=transport(),file=new File(['still preserved'],'a.png',{type:'image/png'}),key=await casePhotoKey(file)
  const cache:CaseRecognitionCache={assets:{[key]:'f'.repeat(64),'unrelated-key':'e'.repeat(64)}},changes:[string,string][]=[]
  let expired=true,failedCheckpoints=0
  globalThis.fetch=async(input,init)=>{
    if(expired&&String(input).endsWith('/ai-drafts')&&init?.method==='POST'){
      expired=false;failedCheckpoints++
      return new Response(JSON.stringify({error:{code:'RECOGNITION_ASSET_NOT_FOUND',message:'原件已过期'}}),{status:404})
    }
    return t.fetch(input,init)
  }
  const options={memberId:'member',token:'synthetic',text:'原话',files:[file],signal:new AbortController().signal,cache,onAsset:(key:string,id:string)=>changes.push([key,id]),onOriginal:()=>{},onPrepared:()=>{}}
  try{
    await assert.rejects(recognizeCasePhotos(options),{code:'RECOGNITION_ASSET_NOT_FOUND'})
    assert.equal(cache.assets[key],undefined);assert.equal(cache.assets['unrelated-key'],'e'.repeat(64));assert.deepEqual(changes,[[key,'']])
    assert.equal(t.calls.length,0);assert.equal(failedCheckpoints,1)
    const result=await recognizeCasePhotos(options)
    assert.equal(result.state,'ready');assert.equal(t.calls.filter(call=>call.path.includes('/recognition-assets')).length,1)
    assert.equal(t.calls.filter(call=>call.path.endsWith('/ai-drafts')&&call.method==='POST').length,2)
    assert.equal(await file.text(),'still preserved');assert.ok(cache.assets[key]);assert.equal(changes.length,2)
  }finally{globalThis.fetch=original}
})
