import https from 'node:https'
import {Readable} from 'node:stream'
import {safeNetworkCause} from './network-diagnostic.mjs'

// Production evidence: Beijing IPv4 TCP takes ~271ms; native fetch gives
// each address only 250ms and hits intermittent aggregate ETIMEDOUT while
// IPv6 has no route. Scope the window to Bailian, not the process/network.
const agent=new https.Agent({keepAlive:true,maxSockets:10,maxFreeSockets:2,autoSelectFamily:true,autoSelectFamilyAttemptTimeout:1000,rejectUnauthorized:true})
export function createBailianTransport(baseUrl,{requestImpl=https.request,connectionAgent=agent}={}) {
  const expected=new URL(baseUrl+'/chat/completions')
  return (input,init={})=>new Promise((resolve,reject)=>{
    const url=new URL(input)
    if(url.href!==expected.href||url.protocol!=='https:'||url.username||url.password) return reject(Object.assign(new Error('Unexpected Bailian transport target'),{code:'AI_TRANSPORT_TARGET_INVALID'}))
    if(init.signal?.aborted)return reject(init.signal.reason??new DOMException('Cancelled','AbortError'))
    const started=Date.now(),metadata={stage:'dns_tcp',addressFamilyAttemptTimeoutMs:1000,httpResponseReceived:false}
    const fail=error=>{error.transportDiagnostic={...metadata,elapsedMs:Date.now()-started,cause:safeNetworkCause(error)};reject(error)}
    const request=requestImpl(url,{method:init.method??'GET',headers:init.headers,agent:connectionAgent,rejectUnauthorized:true,signal:init.signal},incoming=>{
      metadata.stage='response_body';metadata.httpResponseReceived=true;metadata.httpStatus=incoming.statusCode
      if(incoming.statusCode>=300&&incoming.statusCode<400){incoming.resume();request.destroy();fail(Object.assign(new TypeError('Redirect rejected'),{code:'AI_TRANSPORT_REDIRECT'}));return}
      incoming.prependListener('error',error=>{error.transportDiagnostic={...metadata,elapsedMs:Date.now()-started,cause:safeNetworkCause(error)}})
      const headers=new Headers();for(const [name,value] of Object.entries(incoming.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):String(value))
      const response=new Response(init.method==='HEAD'||[204,205,304].includes(incoming.statusCode)?null:Readable.toWeb(incoming),{status:incoming.statusCode,headers})
      if(init.method==='HEAD')incoming.resume()
      Object.defineProperty(response,'transportDiagnostic',{value:metadata})
      resolve(response)
    })
    request.on('socket',socket=>{
      if(!socket.connecting){metadata.stage='http_wait';metadata.reusedSocket=true}
      socket.once('connect',()=>{metadata.stage='tls';metadata.tcpMs=Date.now()-started;metadata.address=socket.remoteAddress;metadata.family=socket.remoteFamily})
      socket.once('secureConnect',()=>{metadata.stage='http_wait';metadata.tlsMs=Date.now()-started})
    })
    request.once('error',fail)
    request.end(init.body)
  })
}
