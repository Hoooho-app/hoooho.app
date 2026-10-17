import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePhotos } from './photoAnalysis'
import { reuseRecognitionPhoto } from '../ai-business/recognitionJobs'

test('already uploaded drug/vaccine photos reuse owned originals without decoding or sending their bytes again', async () => {
  const previous=globalThis.fetch,calls:{path:string;body:unknown}[]=[],controller=new AbortController()
  const files=[new File(['not decoded'],'first.png',{type:'image/png'}),new File(['not decoded'],'second.png',{type:'image/png'})]
  const sources=[{quickRecordDraftId:'draft',photoId:'photo-first'},{quickRecordDraftId:'draft',photoId:'photo-second'}]
  globalThis.fetch=async(input,init)=>{
    const path=String(input),body=JSON.parse(String(init?.body));if(path==='/api/ai/telemetry')return new Response('{}');calls.push({path,body})
    if(path.endsWith('/recognition-assets'))return new Response(JSON.stringify({id:`asset-${body.photoId}`}))
    assert.deepEqual(body.input.assetIds,['asset-photo-first','asset-photo-second'])
    return new Response(JSON.stringify({id:body.id,state:'ready',review:{items:[]}}))
  }
  try{
    const result=await analyzePhotos('member','synthetic',files,controller.signal,()=>{},()=>{},sources)
    assert.deepEqual(result,{items:[],partial:false})
    assert.equal(calls.length,3);assert.deepEqual(calls.slice(0,2).map(call=>call.body),sources)
    assert.ok(calls.every(call=>!JSON.stringify(call.body).includes('base64')))
  }finally{globalThis.fetch=previous}
})
test('incomplete uploaded references never fall back to uploading private file bytes', async () => {
  const previous=globalThis.fetch;let calls=0
  globalThis.fetch=async()=>{calls++;throw new Error('must not upload')}
  try{
    await assert.rejects(analyzePhotos('member','synthetic',[new File(['x'],'photo.png')],new AbortController().signal,()=>{},()=>{},[]),/尚未上传完成/)
    assert.equal(calls,0)
  }finally{globalThis.fetch=previous}
})
test('server ownership rejection is surfaced without retrying the original upload', async () => {
  const previous=globalThis.fetch;let calls=0
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'原件不属于当前人物'}}),{status:404})}
  try{
    await assert.rejects(reuseRecognitionPhoto('other-member','synthetic',{quickRecordDraftId:'draft',photoId:'private-photo'}),/原件不属于当前人物/)
    assert.equal(calls,1)
  }finally{globalThis.fetch=previous}
})
