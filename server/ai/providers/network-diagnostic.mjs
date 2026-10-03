// Server-only, bounded, unauthenticated HEAD probes. Never sends inference,
// audio, keys, headers from application requests, or raw error messages.
import dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import https from 'node:https'
import {bailianConfiguration} from './provider-config.mjs'

export function safeNetworkCause(error, depth=0) {
  if (!error || depth>3) return null
  const result={}
  for (const key of ['code','syscall']) if(typeof error[key]==='string'&&/^[A-Za-z0-9_:-]{1,60}$/.test(error[key]))result[key]=error[key]
  if(net.isIP(error.address??''))result.address=error.address
  if(error.port===443)result.port=443
  if(['AbortError','TimeoutError','AggregateError','TypeError'].includes(error.name))result.name=error.name
  if(error.cause)result.cause=safeNetworkCause(error.cause,depth+1)
  if(Array.isArray(error.errors))result.errors=error.errors.slice(0,4).map(e=>safeNetworkCause(e,depth+1))
  return result
}
const deadline=(promise,ms)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Object.assign(new Error(),{code:'DIAGNOSTIC_TIMEOUT'})),ms)
  promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})
})
const timed=async(stage,task)=>{const start=Date.now();try{const value=await task();return {stage,elapsedMs:Date.now()-start,...value}}catch(error){return {stage,elapsedMs:Date.now()-start,success:false,error:safeNetworkCause(error)}}}
const probeTLS=(host,target,timeout)=>new Promise(resolve=>{
  const start=Date.now();let phase='tcp',settled=false,tcpMs
  const socket=tls.connect({host:target.address,port:443,servername:host,rejectUnauthorized:true})
  const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();resolve({stage:phase,address:target.address,family:target.family,elapsedMs:Date.now()-start,tcpMs,...value})}
  const timer=setTimeout(()=>finish({success:false,error:{code:'DIAGNOSTIC_TIMEOUT'}}),timeout)
  socket.once('connect',()=>{tcpMs=Date.now()-start;phase='tls'})
  socket.once('secureConnect',()=>finish({success:true,authorized:socket.authorized,protocol:socket.getProtocol()}))
  socket.once('error',error=>finish({success:false,error:safeNetworkCause(error)}))
})
const probeHTTP=(url,target,timeout)=>new Promise(resolve=>{
  const start=Date.now();let phase='tcp',settled=false,tcpMs,tlsMs
  const request=https.request(url,{method:'HEAD',agent:false,rejectUnauthorized:true,autoSelectFamily:false,family:target.family,lookup:(_host,options,callback)=>queueMicrotask(()=>options.all?callback(null,[target]):callback(null,target.address,target.family))},response=>{
    phase='http_headers';response.on('error',()=>{});response.resume();finish({success:true,httpStatus:response.statusCode})
  })
  const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);request.destroy();resolve({stage:phase,address:target.address,family:target.family,elapsedMs:Date.now()-start,tcpMs,tlsMs,...value})}
  const timer=setTimeout(()=>finish({success:false,error:{code:'DIAGNOSTIC_TIMEOUT'}}),timeout)
  request.on('socket',socket=>{socket.once('connect',()=>{tcpMs=Date.now()-start;phase='tls'});socket.once('secureConnect',()=>{tlsMs=Date.now()-start;phase='http_wait'})})
  request.once('error',error=>finish({success:false,error:safeNetworkCause(error)}));request.end()
})
export async function diagnoseBailianNetwork({env=process.env,lookup=dns.lookup.bind(dns),tlsProbe=probeTLS,httpProbe=probeHTTP,fetchImpl=fetch,fetchLabel='native_fetch',includeAddressProbes=true,timeoutMs=4000}={}) {
  let config;try{config=bailianConfiguration({env})}catch{return {configurationValid:false,modelRequests:0}}
  const url=new URL(config.baseUrl+'/chat/completions'),host=url.hostname
  const report={time:new Date().toISOString(),host,node:process.version,commit:/^[a-f0-9]{40}$/.test(env.RAILWAY_GIT_COMMIT_SHA??'')?env.RAILWAY_GIT_COMMIT_SHA:null,configuration:{valid:true,keyPresent:!!env.BAILIAN_API_KEY,asrProvider:env.ASR_PROVIDER==='bailian'?'bailian':'other',asrModel:env.BAILIAN_ASR_MODEL==='qwen3-asr-flash'?'qwen3-asr-flash':'other'},autoSelectFamily:net.getDefaultAutoSelectFamily(),familyAttemptTimeoutMs:net.getDefaultAutoSelectFamilyAttemptTimeout(),proxyVariablesPresent:['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_USE_ENV_PROXY'].filter(k=>!!env[k]),extraCAConfigured:!!env.NODE_EXTRA_CA_CERTS,tlsVerificationDisabled:env.NODE_TLS_REJECT_UNAUTHORIZED==='0',modelRequests:0,nonInferenceHTTPAttempts:0,results:[]}
  let addresses=[]
  report.results.push(await timed('dns',async()=>{addresses=await deadline(lookup(host,{all:true}),timeoutMs);addresses=addresses.filter(a=>net.isIP(a.address)&&[4,6].includes(a.family));return {success:addresses.length>0,addresses}}))
  // At most the first IPv4 and first IPv6, no broad scans or retries.
  for(const target of includeAddressProbes?[addresses.find(a=>a.family===4),addresses.find(a=>a.family===6)].filter(Boolean):[]){
    report.results.push(await timed('tls_probe',()=>tlsProbe(host,target,timeoutMs)))
    report.nonInferenceHTTPAttempts++
    report.results.push(await timed('http_probe',()=>httpProbe(url,target,timeoutMs)))
  }
  // Same native fetch as the application, twice to observe fresh/reused paths.
  for(let i=0;i<2&&addresses.length;i++){
    report.nonInferenceHTTPAttempts++
    report.results.push(await timed(fetchLabel+'_head_'+(i+1),async()=>{
      const response=await fetchImpl(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(timeoutMs)})
      await response.body?.cancel();return {success:true,httpStatus:response.status}
    }))
  }
  return report
}
