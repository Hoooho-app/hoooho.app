import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import net from 'node:net'
import {createBailianTransport} from './bailian-transport.mjs'
const base='https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
function mockRequest(callback){return (url,options,onResponse)=>{
 const request=new EventEmitter();request.destroy=()=>{};request.end=body=>queueMicrotask(()=>callback({url,options,body,request,onResponse}));return request
}}
test('scoped connection window 1000ms, verified TLS, original URL/body, response and pooled consecutive calls; no global setting',async()=>{
 const before=net.getDefaultAutoSelectFamilyAttemptTimeout();let calls=0,lastAgent
 const fetch=createBailianTransport(base,{requestImpl:mockRequest(({url,options,body,onResponse})=>{
  calls++;assert.equal(url.href,base+'/chat/completions');assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent.options.rejectUnauthorized,true);assert.equal(options.agent.options.autoSelectFamily,true);assert.equal(options.agent.options.autoSelectFamilyAttemptTimeout,1000);assert.equal(options.agent.options.keepAlive,true);if(lastAgent)assert.equal(options.agent,lastAgent);lastAgent=options.agent;assert.equal(body,'ordinary-audio');
  const incoming=new PassThrough();incoming.statusCode=200;incoming.headers={'x-request-id':'fixture-id'};onResponse(incoming);incoming.end('{"transcript":"synthetic ordinary result"}')
 })})
 for(let i=0;i<3;i++){const result=await fetch(base+'/chat/completions',{method:'POST',body:'ordinary-audio'});assert.equal(result.headers.get('x-request-id'),'fixture-id');assert.equal((await result.json()).transcript,'synthetic ordinary result')}
 assert.equal(calls,3);assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(),before)
})
test('wrong destination and pre-cancel never send; redirects do not follow',async()=>{
 let calls=0;const fetch=createBailianTransport(base,{requestImpl:mockRequest(({onResponse})=>{calls++;const incoming=new PassThrough();incoming.statusCode=302;incoming.headers={location:'https://elsewhere.invalid'};onResponse(incoming);incoming.end()})})
 await assert.rejects(()=>fetch('https://elsewhere.invalid/chat/completions'),{code:'AI_TRANSPORT_TARGET_INVALID'});await assert.rejects(()=>fetch(base+'/chat/completions',{signal:AbortSignal.abort()}),{name:'AbortError'});assert.equal(calls,0);await assert.rejects(()=>fetch(base+'/chat/completions'),{code:'AI_TRANSPORT_REDIRECT'});assert.equal(calls,1)
})
test('connect and response-body failure keep safe phase evidence, never retry or log original error',async()=>{
 let calls=0;const connect=createBailianTransport(base,{requestImpl:mockRequest(({request})=>{calls++;request.emit('error',Object.assign(new Error('private raw message'),{code:'ETIMEDOUT',address:'47.94.20.201',port:443,syscall:'connect'}))})})
 await assert.rejects(()=>connect(base+'/chat/completions'),error=>{assert.equal(error.transportDiagnostic.stage,'dns_tcp');assert.equal(error.transportDiagnostic.httpResponseReceived,false);assert.equal(error.transportDiagnostic.cause.code,'ETIMEDOUT');assert.doesNotMatch(JSON.stringify(error.transportDiagnostic),/private/);return true});assert.equal(calls,1)
 const body=createBailianTransport(base,{requestImpl:mockRequest(({onResponse})=>{const incoming=new PassThrough();incoming.statusCode=200;incoming.headers={};onResponse(incoming);setImmediate(()=>incoming.destroy(Object.assign(new Error('private medical'),{code:'ECONNRESET'})))})})
 const result=await body(base+'/chat/completions');await assert.rejects(()=>result.json(),error=>{assert.equal(error.transportDiagnostic.stage,'response_body');assert.equal(error.transportDiagnostic.httpResponseReceived,true);return true})
})
