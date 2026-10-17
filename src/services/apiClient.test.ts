import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest, ApiRequestError } from './apiClient'
import { registerSessionRecoveryHandler, invalidateSessionRecoveryRequests } from './sessionRecoveryCoordinator'
import { resetBrowserRecoveryState, useBrowserRecoveryState } from './browserRecoveryState'

test('a transcription response never broadcasts a health-data mutation',async()=>{
 const nativeFetch=globalThis.fetch,originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window')
 const events=new EventTarget();let broadcasts=0;events.addEventListener('hoooho-data-changed',()=>broadcasts++)
 Object.defineProperty(globalThis,'window',{configurable:true,value:events})
 globalThis.fetch=async()=>Response.json({transcript:'synthetic'})
 try{assert.deepEqual(await apiRequest('/api/ai/audio/transcriptions',{method:'POST',token:'synthetic',body:{}}),{transcript:'synthetic'});assert.equal(broadcasts,0)}
 finally{globalThis.fetch=nativeFetch;if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window')}
})
test('cancelling during session recovery ends the request and never retries after a late token',async()=>{
 const nativeFetch=globalThis.fetch;let release!:(token:string)=>void,calls=0
 invalidateSessionRecoveryRequests();registerSessionRecoveryHandler(()=>new Promise(resolve=>{release=resolve}))
 globalThis.fetch=async()=>{calls++;return Response.json({error:{code:'UNAUTHORIZED'}},{status:401})}
 const controller=new AbortController()
 try{
  const request=apiRequest('/api/ai/audio/transcriptions',{method:'POST',signal:controller.signal})
  while(!release)await new Promise(resolve=>setTimeout(resolve,0))
  const rejected=assert.rejects(request,{name:'AbortError'});controller.abort();await rejected
  release('late-token');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1)
 }finally{globalThis.fetch=nativeFetch;invalidateSessionRecoveryRequests();registerSessionRecoveryHandler(async()=>null)}
})

test('credential validation errors preserve the session and allow a corrected submission', async () => {
 const nativeFetch=globalThis.fetch
 let recoveryCalls=0
 invalidateSessionRecoveryRequests();resetBrowserRecoveryState()
 useBrowserRecoveryState.setState({contextAccountId:'synthetic-account'})
 registerSessionRecoveryHandler(async()=>{recoveryCalls++;return 'recovered-token'})
 try {
  for(const code of ['CODE_INCORRECT','CODE_ATTEMPTS_EXCEEDED','INVALID_CURRENT_PASSWORD','INVALID_CREDENTIALS']) {
   let calls=0
   globalThis.fetch=async()=>{calls++;return calls===1?Response.json({error:{code,message:'validation rejected'}},{status:401}):Response.json({success:true})}
   await assert.rejects(apiRequest('/api/account/password',{method:'POST',token:'current-token',body:{password:'new-fixture-password',code:'000000'}}),(error:unknown)=>error instanceof ApiRequestError&&error.code===code&&error.status===401)
   assert.equal(calls,1,'a rejected credential is not automatically submitted again')
   assert.equal(recoveryCalls,0)
   assert.equal(useBrowserRecoveryState.getState().reauthenticationRequired,false)
   assert.deepEqual(await apiRequest('/api/account/password',{method:'POST',token:'current-token',body:{password:'new-fixture-password',code:'123456'}}),{success:true})
  }
 } finally {globalThis.fetch=nativeFetch;invalidateSessionRecoveryRequests();registerSessionRecoveryHandler(async()=>null);resetBrowserRecoveryState()}
})

test('a restored session receiving a credential error stays usable for correction', async () => {
 const nativeFetch=globalThis.fetch
 let calls=0,recoveries=0
 invalidateSessionRecoveryRequests();resetBrowserRecoveryState()
 useBrowserRecoveryState.setState({contextAccountId:'synthetic-account'})
 registerSessionRecoveryHandler(async()=>{recoveries++;return 'fresh-token'})
 globalThis.fetch=async(_input,init)=>{
  calls++
  if(calls===1)return Response.json({error:{code:'UNAUTHORIZED'}},{status:401})
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer fresh-token')
  return Response.json({error:{code:'CODE_INCORRECT',message:'验证码错误'}},{status:401})
 }
 try {
  await assert.rejects(apiRequest('/api/account/password',{method:'POST',token:'expired-token',body:{code:'000000'}}),(error:unknown)=>error instanceof ApiRequestError&&error.code==='CODE_INCORRECT'&&error.status===401)
  assert.equal(calls,2);assert.equal(recoveries,1)
  assert.equal(useBrowserRecoveryState.getState().reauthenticationRequired,false)
 } finally {globalThis.fetch=nativeFetch;invalidateSessionRecoveryRequests();registerSessionRecoveryHandler(async()=>null);resetBrowserRecoveryState()}
})

test('actual unauthorized sessions still recover, including unclassified legacy 401 responses', async () => {
 const nativeFetch=globalThis.fetch
 invalidateSessionRecoveryRequests();resetBrowserRecoveryState()
 registerSessionRecoveryHandler(async()=> 'fresh-token')
 try {
  for(const error of [{code:'UNAUTHORIZED'},{}]) {
   let calls=0
   globalThis.fetch=async(_input,init)=>{
    calls++
    if(calls===1)return Response.json({error},{status:401})
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer fresh-token')
    return Response.json({success:true})
   }
   assert.deepEqual(await apiRequest('/api/account/profile',{token:'expired-token'}),{success:true})
   assert.equal(calls,2)
  }
 } finally {globalThis.fetch=nativeFetch;invalidateSessionRecoveryRequests();registerSessionRecoveryHandler(async()=>null);resetBrowserRecoveryState()}
})

test('a genuinely unauthorized retry still suspends the expired session', async () => {
 const nativeFetch=globalThis.fetch
 invalidateSessionRecoveryRequests();resetBrowserRecoveryState()
 useBrowserRecoveryState.setState({contextAccountId:'synthetic-account'})
 registerSessionRecoveryHandler(async()=> 'still-invalid-token')
 globalThis.fetch=async()=>Response.json({error:{code:'UNAUTHORIZED'}},{status:401})
 try {
  await assert.rejects(apiRequest('/api/account/profile',{token:'expired-token'}),(error:unknown)=>error instanceof ApiRequestError&&error.code==='SESSION_EXPIRED')
  assert.equal(useBrowserRecoveryState.getState().reauthenticationRequired,true)
 } finally {globalThis.fetch=nativeFetch;invalidateSessionRecoveryRequests();registerSessionRecoveryHandler(async()=>null);resetBrowserRecoveryState()}
})
