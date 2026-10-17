import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest } from './apiClient'
import { registerSessionRecoveryHandler, invalidateSessionRecoveryRequests } from './sessionRecoveryCoordinator'

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
