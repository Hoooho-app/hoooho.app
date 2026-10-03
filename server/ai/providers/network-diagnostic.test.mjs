import {test} from 'node:test'
import assert from 'node:assert/strict'
import {diagnoseBailianNetwork,safeNetworkCause} from './network-diagnostic.mjs'
const env={BAILIAN_API_KEY:'not-a-real-credential',BAILIAN_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1',ASR_PROVIDER:'bailian',BAILIAN_ASR_MODEL:'qwen3-asr-flash'}
test('diagnostic is finite, HEAD only, no authorization/body/key, addresses bounded to one per family',async()=>{
 const seen=[];const r=await diagnoseBailianNetwork({env,lookup:async()=>[{address:'127.0.0.1',family:4},{address:'127.0.0.2',family:4},{address:'::1',family:6}],tlsProbe:async(host,target)=>({success:true,stage:'tls',...target}),httpProbe:async(url,target)=>{seen.push(target);return {success:true,httpStatus:401}},fetchImpl:async(url,options)=>{assert.equal(options.method,'HEAD');assert.equal(options.headers,undefined);assert.equal(options.body,undefined);return {status:405}}})
 assert.equal(seen.length,2);assert.equal(r.modelRequests,0);assert.equal(r.nonInferenceHTTPAttempts,4);assert.equal(JSON.stringify(r).includes(env.BAILIAN_API_KEY),false)
})
test('DNS failure prevents subsequent network calls; missing configuration never probes',async()=>{
 const no=()=>{throw new Error('must not call')};const r=await diagnoseBailianNetwork({env,lookup:async()=>{throw Object.assign(new Error('secret'),{code:'ENOTFOUND'})},fetchImpl:no,tlsProbe:no,httpProbe:no});assert.equal(r.results.length,1);assert.equal(r.nonInferenceHTTPAttempts,0);assert.equal(r.results[0].error.code,'ENOTFOUND');assert.equal(JSON.stringify(r).includes('secret'),false);assert.deepEqual(await diagnoseBailianNetwork({env:{},fetchImpl:no}),{configurationValid:false,modelRequests:0})
})
test('nested aggregate causes expose only network fields, never input, messages, headers or stacks',()=>{
 const original=Object.assign(new TypeError('credential and medical input'),{cause:{code:'ETIMEDOUT',errors:[{code:'ETIMEDOUT',address:'::1',port:443,syscall:'connect',message:'private',headers:{Authorization:'private'}}]}})
 assert.deepEqual(safeNetworkCause(original),{name:'TypeError',cause:{code:'ETIMEDOUT',errors:[{code:'ETIMEDOUT',syscall:'connect',address:'::1',port:443}]}})
})
test('a broken probe cannot discard the remaining stage evidence',async()=>{
 const r=await diagnoseBailianNetwork({env,lookup:async()=>[{address:'127.0.0.1',family:4}],tlsProbe:async()=>{throw new TypeError('private')},httpProbe:async()=>{throw new TypeError('private')},fetchImpl:async()=>({status:401})});assert.equal(r.results.length,5);assert.equal(r.results[1].success,false);assert.equal(r.results[2].success,false);assert.equal(r.results.at(-1).success,true);assert.doesNotMatch(JSON.stringify(r),/private/)
})
test('actual refused IPv6 lookup completes asynchronously and is handled; production narrow mode makes only two HEADs',async()=>{
 const local=await diagnoseBailianNetwork({env,lookup:async()=>[{address:'::1',family:6}],fetchImpl:async()=>({status:401}),timeoutMs:100});assert.equal(local.results.length,5);assert.equal(local.results[2].success,false)
 let heads=0;const narrow=await diagnoseBailianNetwork({env,lookup:async()=>[{address:'::1',family:6}],includeAddressProbes:false,tlsProbe:async()=>{throw new Error('must not run')},httpProbe:async()=>{throw new Error('must not run')},fetchImpl:async()=>{heads++;return {status:401}}});assert.equal(heads,2);assert.equal(narrow.nonInferenceHTTPAttempts,2)
})
