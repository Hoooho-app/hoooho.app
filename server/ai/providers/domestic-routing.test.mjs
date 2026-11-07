import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createAIProvider,createAudioProvider } from './provider-factory.mjs'
import { createDialogueProvider } from './dialogue-provider.mjs'
import { recognizePage } from '../business/documents.mjs'
import { LiveAudioPreviewService } from '../live-audio-preview.mjs'
import { BusinessModel } from '../business/model.mjs'
import { AIBusinessService } from '../business/service.mjs'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const env={HOOOHO_DOMESTIC_AI_TRIAL:'synthetic-only',AI_PROVIDER:'ark',ARK_API_KEY:'fake-ark-key',
  ASR_PROVIDER:'seed',DOUBAO_ASR_API_KEY:'fake-voice-key',DOCUMENT_OCR_PROVIDER:'paddle',
  PADDLE_OCR_URL:'http://127.0.0.1:8080/layout-parsing',BAILIAN_API_KEY:'must-not-use'}
const reply={type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string'}}}
const request=(provider,options={})=>provider.fetch(`${provider.baseUrl}/responses`,{task:options.task,body:JSON.stringify({
  input:options.input??'虚构：昨晚没有发烧，今天最高38.5度',text:{format:{type:'json_schema',name:'synthetic',schema:reply}}
})})
const image='data:image/png;base64,AAAA'

test('Ark uses only the pinned mainland endpoint and validates a structured image result',async()=>{
  const calls=[]
  const provider=createDialogueProvider({env,fetchImpl:async(url,init)=>{
    calls.push({url,headers:init.headers,redirect:init.redirect,body:JSON.parse(init.body)})
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"text":"体温计显示38.5℃"}'}}]})
  }})
  assert.equal(provider.name,'ark')
  const result=await request(provider,{input:[{role:'user',content:[{type:'input_image',image_url:image}]}]})
  assert.equal((await result.json()).output[0].content[0].text,'{"text":"体温计显示38.5℃"}')
  assert.equal(calls[0].url,'https://ark.cn-beijing.volces.com/api/v3/chat/completions')
  assert.equal(calls[0].headers.Authorization,'Bearer fake-ark-key')
  assert.equal(calls[0].body.model,'doubao-seed-2-1-pro-260915')
  assert.equal(calls[0].body.thinking.type,'disabled')
  assert.equal(calls[0].redirect,'error')
  await assert.rejects(request(provider,{task:'document-page'}),{code:'AI_MODALITY_NOT_CONFIGURED'})
  await assert.rejects(request(provider,{task:'front-desk-visual-source'}),{code:'AI_MODALITY_NOT_CONFIGURED'})
  await assert.rejects(request(provider,{input:[{role:'user',content:[{type:'input_image',image_url:'https://example.test/private.png'}]}]}),{code:'AI_INPUT_INVALID'})
  assert.equal(calls.length,1)
})

test('Ark refusal/malformed schema never falls back; key presence alone never enables production',async()=>{
  let calls=0
  const fetchImpl=async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:'{"text":38.5}'}}]})}
  const p=createAIProvider({env,fetchImpl})
  await assert.rejects(request(p),{code:'AI_OUTPUT_INVALID'})
  assert.equal(calls,1)
  for(const extra of [{NODE_ENV:'production'},{RAILWAY_ENVIRONMENT_ID:'prod'},{HOOOHO_DOMESTIC_AI_TRIAL:undefined}]){
    const disabled=createDialogueProvider({env:{...env,...extra},fetchImpl})
    assert.equal(disabled.name,'unconfigured')
    assert.equal(disabled.configurationError.code,'AI_DOMESTIC_TRIAL_ONLY')
    assert.equal(createAudioProvider('ASR',{env:{...env,...extra}}).name,'unconfigured')
  }
  assert.equal(calls,1)
})

test('private OCR keeps rows on its own endpoint; timeout, redirects and missing OCR never call vision',async()=>{
  const page={id:'fictional-report',page:1,name:'合成检查单',hash:'fixture',mimeType:'image/png',dataUrl:image}
  let local=0
  const fixture={env,structured(){assert.fail('document bytes may never be sent to Seed')},ocrFetch:async(url,init)=>{
    local++
    assert.equal(url,env.PADDLE_OCR_URL);assert.equal(init.redirect,'error')
    assert.deepEqual(JSON.parse(init.body),{file:'AAAA',fileType:1,visualize:false})
    return Response.json({errorCode:0,result:{layoutParsingResults:[{markdown:{text:'项目|结果|单位\n白细胞|6.2|×10⁹/L\n血红蛋白|121|g/L'}}]}})
  }}
  const result=await recognizePage(page,fixture)
  assert.equal(result.status,'uncertain')
  assert.match(result.text,/白细胞\|6\.2\|×10⁹\/L\n血红蛋白\|121\|g\/L/)
  assert.equal(result.diagnostics.provider,'paddleocr')
  await assert.rejects(recognizePage(page,{...fixture,ocrFetch:async()=>new Response(null,{status:302})}),{code:'AI_OCR_UNAVAILABLE'})
  await assert.rejects(recognizePage(page,{...fixture,env:{...env,PADDLE_OCR_URL:'https://example.test/layout-parsing'}}),{code:'AI_OCR_UNAVAILABLE'})
  assert.equal(local,1)
})

test('a private report remains attached to its failed-review draft and its OCR text never reaches cloud extraction',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'hoooho-domestic-fixture-'))
  t.after(()=>rm(directory,{recursive:true,force:true}))
  const account='synthetic',member=await new FamilyMemberRepository(directory).create({accountId:account,name:'虚构孩子',relationship:'child'})
  const dataUrl='data:image/png;base64,'+(await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer()).toString('base64')
  let attempts=0
  const model={env,provider:{name:'ark',apiKey:'fixture'},ocrFetch:async()=>{
    attempts++
    return Response.json({errorCode:0,result:{layoutParsingResults:[{markdown:{text:'血红蛋白｜121｜g/L'}}]}})
  },structured(){assert.fail('private OCR text must not be sent to an external model')}}
  const service=new AIBusinessService({dataDirectory:directory,model,logger:{info(){}}})
  await assert.rejects(service.prepare(account,member.id,{task:'visit',files:[{name:'合成报告.png',mimeType:'image/png',dataUrl}]}),{code:'AI_DOCUMENT_REVIEW_LOCAL'})
  const draft=await service.latest(account,member.id)
  assert.equal(draft.state,'failed')
  assert.equal((await service.get(account,member.id,draft.id)).documents[0].dataUrl,dataUrl)
  assert.equal(draft.sources[0].text,'血红蛋白｜121｜g/L')
  assert.equal(draft.sources[0].status,'uncertain')
  assert.equal(draft.items.length,0)
  await assert.rejects(service.read('other-account',member.id,draft.id),{status:404})
  await assert.rejects(service.prepare(account,member.id,{id:draft.id,version:draft.version,task:'visit'}),{code:'AI_DOCUMENT_REVIEW_LOCAL'})
  assert.equal(attempts,1)
})

function response(text,final=false){
  const payload=gzipSync(Buffer.from(JSON.stringify(text===undefined?{}:{result:{text}})))
  const header=Buffer.alloc(12);header[0]=0x11;header[1]=final?0x93:0x91;header[2]=0x11
  header.writeInt32BE(final?-1:1,4);header.writeUInt32BE(payload.length,8)
  return Buffer.concat([header,payload])
}
class Socket extends EventEmitter {
  bufferedAmount=0
  sent=[]
  send(frame){this.sent.push(frame);if(frame[1]===0x10)setImmediate(()=>this.emit('message',response()));else if(frame[1]===0x22)setImmediate(()=>this.emit('message',response('昨晚没有发烧，今天最高38.5度',true)))}
  close(){this.closed=true}
}

test('final Seed audio waits for the last frame; no member details or filename is sent',async()=>{
  const socket=new Socket()
  const p=createAudioProvider('ASR',{env,prepareSeedAudio:async()=>Buffer.alloc(6402),seedSocketFactory:(url,init)=>{
    assert.equal(url,'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream')
    assert.equal(init.headers['X-Api-Key'],'fake-voice-key')
    assert.equal(init.headers['X-Api-Resource-Id'],'volc.seedasr.sauc.duration')
    setImmediate(()=>socket.emit('open'));return socket
  }})
  const result=await p.transcribeAudio({name:'不应外发的文件名.m4a'})
  assert.equal(result.transcript,'昨晚没有发烧，今天最高38.5度')
  assert.deepEqual(socket.sent.map(f=>f[1]),[0x10,0x20,0x22])
  assert.equal(gunzipSync(socket.sent[2].subarray(8)).length,2)
  assert.doesNotMatch(gunzipSync(socket.sent[0].subarray(8)).toString(),/文件名/)
  assert.equal(socket.closed,true)
})

test('live Seed previews are replaceable and closed on cancellation, not final evidence',async t=>{
  const socket=new Socket(),service=new LiveAudioPreviewService({env,assertMember:async()=>{},socketFactory:(url,init)=>{
    assert.match(url,/bigmodel_async$/);assert.equal(init.followRedirects,false)
    setImmediate(()=>socket.emit('open'));return socket
  }})
  t.after(()=>service.destroy())
  const session=await service.open('synthetic-account','synthetic-member')
  service.append('synthetic-account',session.id,{sequence:0,audio:'AAA='})
  socket.emit('message',response('昨晚发烧'))
  socket.emit('message',response('昨晚没有发烧'))
  assert.equal(service.read('synthetic-account',session.id).text,'昨晚没有发烧')
  assert.equal(service.close('synthetic-account',session.id).state,'closed')
  assert.equal(socket.closed,true)
})

test('a blank final response does not promote an earlier partial transcript',async()=>{
  class MissingFinal extends Socket {
    send(frame) {
      this.sent.push(frame)
      if(frame[1]===0x10)setImmediate(()=>this.emit('message',response()))
      if(frame[1]===0x22)setImmediate(()=>{this.emit('message',response('昨晚发烧'));this.emit('message',response(undefined,true))})
    }
  }
  const socket=new MissingFinal()
  const provider=createAudioProvider('ASR',{env,prepareSeedAudio:async()=>Buffer.alloc(2),seedSocketFactory:()=>{
    setImmediate(()=>socket.emit('open'));return socket
  }})
  await assert.rejects(provider.transcribeAudio({}),{code:'ASR_NO_SPEECH'})
  assert.equal(socket.closed,true)
})

test('independent routes have no implicit TTS or old-provider fallback',()=>{
  const provider=createAIProvider({env})
  assert.equal(new BusinessModel({env,provider}).audioProvider,null)
})
