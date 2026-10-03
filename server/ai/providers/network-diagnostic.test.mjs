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
