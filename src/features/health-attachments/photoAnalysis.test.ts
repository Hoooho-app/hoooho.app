import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePhotos } from './photoAnalysis'
import { reuseRecognitionPhoto } from '../ai-business/recognitionJobs'
import type {SmartRecordItem} from '../ai-business/smartRecordTypes'

test('ready upload tasks preserve candidates and expose pending state from each review layer',async()=>{
 const previous=globalThis.fetch,field={name:'medicationName',value:'合成药名',sources:[{quote:'合成药名'}]}
 const item:SmartRecordItem={id:'one',category:'medication',title:'合成原件',subjectConfirmed:true,timeText:null,time:{resolvedStart:null,precision:'unknown'},fields:[field]}
 try{
  for(const patch of [{items:[{...item,needsReview:true}]},{items:[{...item,unassigned:true}]},{items:[{...item,occurrenceUncertain:true}]},{documentWarnings:['缺第2页']},{unmappedRows:[{text:'尚未识别的行'}]},{sources:[{status:'uncertain'}]}]){
   globalThis.fetch=async(input,init)=>{
    const url=String(input);if(url==='/api/ai/telemetry')return new Response('{}')
    if(url.endsWith('/recognition-assets'))return new Response(JSON.stringify({id:'asset'}))
    const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:body.id,state:'ready',review:{items:[item],...patch}}))
   }
   const result=await analyzePhotos('member','synthetic',[new File(['unused'],'a.png')],new AbortController().signal,()=>{},()=>{},[{quickRecordDraftId:'draft',photoId:'photo'}])
   assert.equal(result.partial,true);assert.equal(result.items.length,1);assert.equal(result.items[0].fields[0].value,field.value)
  }
 }finally{globalThis.fetch=previous}
})

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
