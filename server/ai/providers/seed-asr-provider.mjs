import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { configurationError, requireDomesticTrial } from './provider-config.mjs'
import { controlledCall } from './call-control.mjs'
import { linkedAISignal } from './telemetry.mjs'
import { assertSeedHomeEnabled } from './seed-home-scope.mjs'

const unavailable = () => configurationError('豆包语音暂不可用，请重试或继续文字记录','ASR_SEED_UNAVAILABLE')
const maxPcm = 91*32000
export const seedASRModel = 'seed-asr-2.0'
const endpoint = 'wss://openspeech.bytedance.com/api/v3/sauc/'
const rawHeaders = (apiKey,id) => ({'X-Api-Key':apiKey,'X-Api-Resource-Id':'volc.seedasr.sauc.duration','X-Api-Request-Id':id,'X-Api-Connect-Id':id})

export function seedASRConfiguration(env=process.env, seedHome=false) {
  if (seedHome) assertSeedHomeEnabled(env)
  else requireDomesticTrial(env)
  const apiKey = env.DOUBAO_ASR_API_KEY?.trim()
  if(!apiKey)throw configurationError('Seed TestFlight 尚未配置豆包语音转写','ASR_NOT_CONFIGURED')
  return {apiKey}
}

function frame(type,flags,json,bytes) {
  const payload=gzipSync(bytes),header=Buffer.alloc(8)
  header[0]=0x11;header[1]=(type<<4)|flags;header[2]=(json?0x10:0)|1
  header.writeUInt32BE(payload.length,4)
  return Buffer.concat([header,payload])
}
const initial = streaming => frame(1,0,true,Buffer.from(JSON.stringify({
  audio:{format:'pcm',codec:'raw',rate:16000,bits:16,channel:1},
  request:{model_name:'bigmodel',enable_itn:false,enable_punc:true,enable_ddc:false,show_utterances:false,...(streaming?{enable_nonstream:true}:{})}
})))
const audioFrame = (audio,last=false) => frame(2,last?2:0,false,audio)

export function decodeSeedASRFrame(data) {
  const bytes=Buffer.from(data), kind=bytes[1]>>4,flags=bytes[1]&15
  if(bytes.length<8||bytes.length>128000||bytes[0]!==0x11||kind!==9||![0,1,2,3].includes(flags))throw unavailable()
  const offset=4+(flags&1?4:0)
  if(bytes.length<offset+4||bytes.readUInt32BE(offset)!==bytes.length-offset-4)throw unavailable()
  const raw=bytes.subarray(offset+4),compression=bytes[2]&15
  if(bytes[2]>>4!==1||![0,1].includes(compression))throw unavailable()
  const value=JSON.parse((compression?gunzipSync(raw,{maxOutputLength:128000}):raw).toString())
  if(!value||typeof value!=='object'||Array.isArray(value)||value.result?.text!=null&&typeof value.result.text!=='string'||(value.result?.text?.length??0)>15000)throw unavailable()
  return {text:value.result?.text,final:!!(flags&2)}
}

async function defaultSocket(url,options) {
  const {default:WebSocket}=await import('ws')
  return new WebSocket(url,options)
}
const optionsFor = (apiKey,id,agent) => ({headers:rawHeaders(apiKey,id),agent,handshakeTimeout:10000,maxPayload:128000,followRedirects:false})

// Adapt the supplier binary protocol to the existing preview's local events.
// The final text still comes from the original recording, not the preview.
export function seedLiveSocket(factory,config,agent) {
  const raw=factory(endpoint+'bigmodel_async',optionsFor(config.apiKey,randomUUID(),agent))
  const socket=new EventEmitter(),emit=body=>socket.emit('message',Buffer.from(JSON.stringify(body)))
  let acknowledged=false
  Object.defineProperty(socket,'bufferedAmount',{get:()=>raw.bufferedAmount})
  socket.close=()=>raw.close()
  socket.send=payload=>{
    const event=JSON.parse(payload)
    raw.send(event.type==='session.update'?initial(true):audioFrame(Buffer.from(event.audio,'base64')))
  }
  raw.on('open',()=>socket.emit('open'))
  raw.on('error',()=>socket.emit('error',unavailable()))
  raw.on('close',()=>socket.emit('close'))
  raw.on('message',data=>{
    try{
      const result=decodeSeedASRFrame(data)
      if(!acknowledged){acknowledged=true;emit({type:'session.updated'})}
      if(result.text!==undefined)emit({type:'conversation.item.input_audio_transcription.text',item_id:'seed-preview',text:result.text,stash:''})
    }catch{emit({type:'error'})}
  })
  return socket
}

function decodePcm(audio,signal) {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted()
    const command=spawn('ffmpeg',['-nostdin','-v','error','-threads','1','-i','pipe:0','-map','0:a:0','-vn','-t','92','-ac','1','-ar','16000','-f','s16le','pipe:1'],{stdio:['pipe','pipe','ignore'],signal,windowsHide:true})
    const chunks=[];let size=0,overflow=false
    command.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxPcm){overflow=true;command.kill();return}chunks.push(chunk)})
    command.stdin.on('error',()=>{})
    command.on('error',()=>reject(signal.aborted?signal.reason:unavailable()))
    command.on('close',status=>{
      if(overflow)reject(configurationError('录音超过时长限制','ASR_AUDIO_TOO_LONG'))
      else if(status!==0||size<2||size%2)reject(configurationError('录音无法解码，请重试或继续输入文字','ASR_AUDIO_INVALID'))
      else resolve(Buffer.concat(chunks,size))
    })
    command.stdin.end(audio.buffer)
  })
}

export class SeedASRProvider {
  name='seed-asr'
  model=seedASRModel
  constructor(options={}) {
    this.env=options.env??process.env;this.config=seedASRConfiguration(this.env, options.seedHome === true)
    this.socketFactory=options.seedSocketFactory??defaultSocket
    this.prepareAudio=options.prepareSeedAudio??decodePcm
  }
  async transcribeAudio(audio,parent) {
    const linked=linkedAISignal(parent), deadline=AbortSignal.timeout(40000), signal=linked?AbortSignal.any([linked,deadline]):deadline
    try{
      const pcm=await this.prepareAudio(audio,signal)
      if(!Buffer.isBuffer(pcm)||!pcm.length||pcm.length>maxPcm||pcm.length%2)throw unavailable()
      return await controlledCall(async()=>{
        signal.throwIfAborted()
        const requestId=randomUUID(),socket=await this.socketFactory(endpoint+'bigmodel_nostream',optionsFor(this.config.apiKey,requestId))
        return await new Promise((resolve,reject)=>{
          let settled=false,acked=false
          const finish=(error,result)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);try{socket.close()}catch{};error?reject(error):resolve(result)}
          const abort=()=>finish(signal.reason)
          socket.on('error',()=>finish(unavailable()))
          socket.on('close',()=>finish(unavailable()))
          socket.on('open',()=>{if(!settled)try{socket.send(initial(false))}catch{finish(unavailable())}})
          socket.on('message',data=>{
            if(settled)return
            try{
              const next=decodeSeedASRFrame(data)
              if(next.final){
                if(!acked||!next.text?.trim())return finish(configurationError('未识别到可用的最终语音','ASR_NO_SPEECH'))
                return finish(null,{transcript:next.text,model:this.model,diagnostics:{requestId,supplierRequestAttempted:true,supplierResponseReceived:true}})
              }
              if(!acked){
                acked=true
                for(let i=0;i<pcm.length;i+=6400)socket.send(audioFrame(pcm.subarray(i,i+6400),i+6400>=pcm.length))
              }
            }catch{finish(unavailable())}
          })
          signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
        })
      },this.env)
    }catch(error){
      if(linked?.aborted)throw configurationError('已取消语音转写','ASR_CANCELLED')
      if(deadline.aborted)throw configurationError('语音转写超时，请重试','ASR_TIMEOUT')
      throw error?.code?.startsWith('ASR_')?error:unavailable()
    }
  }
}
