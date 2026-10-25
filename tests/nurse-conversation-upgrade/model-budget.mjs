// Local evaluation preload only: production imports none of these hooks.
import https from 'node:https'
import http from 'node:http'
import {syncBuiltinESMExports} from 'node:module'
import path from 'node:path'
import os from 'node:os'
export function syntheticOutputCaptureAllowed(environment){
 const directory=path.resolve(environment.DATA_DIRECTORY??'.'),temp=path.dirname(directory)
 return environment.HOOOHO_EVAL_CAPTURE_MODEL_OUTPUT==='1'&&environment.HOOOHO_EVAL_SYNTHETIC_ONLY==='1'&&environment.NODE_ENV==='development'&&environment.HOST==='127.0.0.1'&&path.basename(directory)==='data'&&path.dirname(temp)===path.resolve(os.tmpdir())&&/^hoooho-nurse-(?:conversation|flow)-eval-/u.test(path.basename(temp))
}
export function completionOutputText(data){
 const content=data?.choices?.[0]?.message?.content
 if(typeof content==='string')return content.slice(0,120000)
 if(Array.isArray(content))return content.filter(part=>typeof part?.text==='string').map(part=>part.text).join('').slice(0,120000)
 return (Array.isArray(data?.output)?data.output:[]).flatMap(item=>Array.isArray(item?.content)?item.content:[]).filter(part=>part?.type==='output_text'&&typeof part.text==='string').map(part=>part.text).join('').slice(0,120000)
}
export function installModelBudget({environment=process.env,fetchTarget=globalThis,httpsTarget=https,httpTarget=http,emit=value=>process.send?.(value)}={}){
 const limit=Number(environment.HOOOHO_EVAL_MAX_MODEL_REQUESTS)
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Explicit bounded model request count required')
 const allowedHosts=new Set(['BAILIAN_BASE_URL','ASR_BASE_URL','BAILIAN_ASR_BASE_URL'].flatMap(key=>{try{return [new URL(environment[key]).hostname]}catch{return []}}))
 const local=host=>['127.0.0.1','localhost','::1','[::1]'].includes(host)
 let calls=0
 const reserve=url=>{
  if(local(url.hostname))return null
  if(url.protocol!=='https:'||!allowedHosts.has(url.hostname))throw Object.assign(new Error('Evaluation will not call an unconfigured external host'),{code:'EVAL_EXTERNAL_HOST_BLOCKED'})
  if(calls>=limit)throw Object.assign(new Error('Evaluation model request budget exhausted'),{code:'EVAL_MODEL_BUDGET'})
  const number=++calls,started=Date.now();emit({type:'model-request',number})
  let complete=false
  return {finish(metadata){if(complete)return;complete=true;emit({type:'model-result',number,elapsedMs:Date.now()-started,...metadata})}}
 }
 const tokenCount=value=>Number.isInteger(value)&&value>=0&&value<100000000?value:null
 const usage=data=>({inputTokens:tokenCount(data?.usage?.input_tokens??data?.usage?.prompt_tokens),outputTokens:tokenCount(data?.usage?.output_tokens??data?.usage?.completion_tokens),...(syntheticOutputCaptureAllowed(environment)?{outputText:completionOutputText(data)}:{})})
 const nativeFetch=fetchTarget.fetch
 fetchTarget.fetch=async function(input,init){
  const url=new URL(typeof input==='string'?input:input.url??String(input)),reservation=reserve(url)
  if(!reservation)return nativeFetch.call(fetchTarget,input,init)
  try{const response=await nativeFetch.call(fetchTarget,input,init);let tokens={};try{tokens=usage(await response.clone().json())}catch{}reservation.finish({status:response.status,...tokens});return response}
  catch(error){reservation.finish({errorCode:error.code??'NETWORK_FAILURE'});throw error}
 }
 const patch=(target,protocol)=>{
  const nativeRequest=target.request,nativeGet=target.get
  target.request=function(...args){
   const first=args[0],url=first instanceof URL?first:typeof first==='string'?new URL(first):new URL(`${protocol}//${first.hostname??first.host??'localhost'}${first.port?`:${first.port}`:''}${first.path??'/'}`)
   const reservation=reserve(url)
   if(!reservation)return nativeRequest.apply(target,args)
   let request
   try{request=nativeRequest.apply(target,args)}catch(error){reservation.finish({errorCode:error.code??'NETWORK_FAILURE'});throw error}
   request.once('error',error=>reservation.finish({errorCode:error.code??'NETWORK_FAILURE'}))
   request.once('response',incoming=>{
    const chunks=[];let size=0,overflow=false
    incoming.on('data',chunk=>{size+=chunk.length;if(size<=1024*1024)chunks.push(Buffer.from(chunk));else overflow=true})
    incoming.once('error',error=>reservation.finish({status:incoming.statusCode,errorCode:error.code??'NETWORK_FAILURE'}))
    incoming.once('end',()=>{let tokens={};try{if(!overflow)tokens=usage(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{}reservation.finish({status:incoming.statusCode,...tokens})})
   })
   return request
  }
  target.get=function(...args){const request=target.request(...args);request.end();return request}
  return ()=>{target.request=nativeRequest;target.get=nativeGet}
 }
 const restoreHttps=patch(httpsTarget,'https:'),restoreHttp=patch(httpTarget,'http:')
 return {get count(){return calls},restore(){fetchTarget.fetch=nativeFetch;restoreHttps();restoreHttp()}}
}
// Imported as --import by the isolated app. Unit tests inject inert transports.
if(process.env.HOOOHO_EVAL_MAX_MODEL_REQUESTS){installModelBudget();syncBuiltinESMExports()}
