import test from 'node:test'
import assert from 'node:assert/strict'
import { BailianASRProvider } from './bailian-asr-provider.mjs'
import { createAudioProvider } from './provider-factory.mjs'
import { AudioTranscriptionService } from '../audio-transcription-service.mjs'
const env={AI_PROVIDER:'bailian',ASR_PROVIDER:'bailian',TTS_PROVIDER:'none',BAILIAN_API_KEY:'synthetic-asr-credential',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'}
const requestId='01234567-1234-1234-1234-123456789abc',silent={info(){},warn(){}}
const audio={mimeType:'audio/webm',buffer:Buffer.from('SYNTHETIC_AUDIO')}
const response=(content='今天没有呕吐，只是恶心',finish_reason='stop')=>Response.json({id:`chatcmpl-${requestId}`,choices:[{finish_reason,message:{content}}],usage:{prompt_tokens:100,completion_tokens:12,seconds:4}},{headers:{'x-request-id':requestId}})
test('百炼独立ASR协议复用北京兼容地址，保留原音频、ITN关闭、一次请求与安全用量',async()=>{
 let calls=0;const logs=[],provider=new BailianASRProvider({env,logger:{info:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)},fetchImpl:async(url,init)=>{
  calls++;assert.equal(url,`${env.BAILIAN_BASE_URL}/chat/completions`);assert.equal(init.redirect,'error');const body=JSON.parse(init.body)
  assert.equal(body.model,'qwen3-asr-flash');assert.deepEqual(body.asr_options,{enable_itn:false});assert.equal(body.stream,false)
  assert.equal(body.messages.length,1);assert.equal(body.messages[0].role,'user');assert.equal(body.messages[0].content[0].input_audio.data,`data:audio/webm;base64,${audio.buffer.toString('base64')}`)
  for(const key of ['enable_thinking','max_tokens','response_format','tools'])assert.equal(body[key],undefined)
  return response()
 }})
 const result=await provider.transcribeAudio(audio);assert.equal(result.transcript,'今天没有呕吐，只是恶心');assert.equal(result.model,'qwen3-asr-flash');assert.equal(result.diagnostics.requestId,requestId);assert.equal(result.diagnostics.audioSeconds,4);assert.equal(calls,1)
 assert.doesNotMatch(JSON.stringify(logs),/没有呕吐|SYNTHETIC_AUDIO|synthetic-asr-credential|Authorization/)
})
test('仅显式百炼ASR配置启用，不读取旧OpenAI密钥，不伪装文字模型或TTS',()=>{
 assert.equal(createAudioProvider('ASR',{env:{...env,ASR_PROVIDER:'none'}}),null)
 assert.equal(createAudioProvider('ASR',{env,logger:silent}).model,'qwen3-asr-flash')
 assert.equal(createAudioProvider('TTS',{env}),null)
 assert.equal(new AudioTranscriptionService({env,logger:silent}).capabilities().tts.configured,false)
 assert.equal(createAudioProvider('ASR',{env:{...env,BAILIAN_ASR_MODEL:'qwen3.7-plus'}}).configurationError.code,'ASR_CONFIGURATION_INVALID')
 assert.equal(createAudioProvider('ASR',{env:{...env,BAILIAN_API_KEY:'',OPENAI_API_KEY:'old-key'}}).configurationError.code,'AI_NOT_CONFIGURED')
})
for(const [status,code,expected] of [[401,'InvalidApiKey','AUTHENTICATION'],[403,'AccessDenied.Unpurchased','PERMISSION'],[404,'ModelNotFound','MODEL_NOT_FOUND'],[403,'AllocationQuota.FreeTierOnly','FREE_QUOTA_EXHAUSTED'],[429,'Throttling','RATE_LIMIT'],[403,'InsufficientBalance','CREDIT_BALANCE']])test(`ASR ${code}准确区分、不自动重试、不记录回显原文`,async()=>{
 let calls=0;const logs=[],provider=new BailianASRProvider({env,logger:{info:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)},fetchImpl:async()=>{calls++;return Response.json({error:{code,message:'synthetic-asr-credential 私有病情原文'}},{status,headers:{'x-request-id':requestId,'Retry-After':'3'}})}})
 await assert.rejects(()=>provider.transcribeAudio(audio),e=>{assert.equal(e.code,`ASR_BAILIAN_${expected}`);assert.equal(e.upstream.httpStatus,status);assert.equal(e.upstream.requestId,requestId);assert.equal(e.upstream.retryAfter,'3');return true})
 assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(logs),/私有病情|synthetic-asr-credential|Authorization/)
})
test('ASR 空转写、截断、非文本、无效信封、网络超时均不伪造文字',async()=>{
 for(const [fetchImpl,code] of [[async()=>response(''),'ASR_NO_SPEECH'],[async()=>response('partial','length'),'ASR_OUTPUT_INCOMPLETE'],[async()=>response([{text:'不可直接采用'}]),'ASR_OUTPUT_INVALID'],[async()=>new Response('invalid'),'ASR_OUTPUT_INVALID'],[async()=>{throw Object.assign(new Error('raw-sensitive'),{cause:{code:'ETIMEDOUT'}})},'ASR_NETWORK_ERROR']]){
  let calls=0;const p=new BailianASRProvider({env,logger:silent,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args)}})
  await assert.rejects(()=>p.transcribeAudio(audio),{code});assert.equal(calls,1)
 }
})
test('Safari MP4未转码和超大小在出站前拒绝；取消信号传递',async()=>{
 let calls=0;const p=new BailianASRProvider({env,logger:silent,fetchImpl:async(_url,init)=>{calls++;assert.equal(init.signal.aborted,true);throw new DOMException('Aborted','AbortError')}})
 await assert.rejects(()=>p.transcribeAudio({...audio,mimeType:'audio/mp4'}),{code:'ASR_AUDIO_FORMAT_UNSUPPORTED'})
 await assert.rejects(()=>p.transcribeAudio({...audio,buffer:Buffer.alloc(8*1024*1024)}),{code:'ASR_AUDIO_TOO_LARGE'});assert.equal(calls,0)
 const controller=new AbortController();controller.abort();await assert.rejects(()=>p.transcribeAudio(audio,controller.signal),{code:'ASR_CANCELLED'});assert.equal(calls,0)
})

test('普通音频连续进入同一真实ASR协议，不依赖测试文字、账户或捕获白名单',async()=>{
 let calls=0;const texts=['昨晚睡得不好，今天早上精神还可以。','下午吃了半碗粥，喝了一百毫升奶。','右胳膊有一点红，暂时没有发烧。']
 const service=new AudioTranscriptionService({env,logger:silent,fetchImpl:async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.messages[0].content[0].type,'input_audio');assert.equal(body.model,'qwen3-asr-flash');assert.equal(body.messages.length,1);assert.equal(body.syntheticReplay,undefined);return response(texts[calls++])}})
 for(let i=0;i<texts.length;i++){const result=await service.transcribe({mimeType:'audio/webm',dataUrl:`data:audio/webm;base64,${Buffer.from('different-ordinary-audio-'+i).toString('base64')}`},'normal-account');assert.equal(result.transcript,texts[i]);assert.equal(result.provider,'bailian')}
 assert.equal(calls,3)
})
