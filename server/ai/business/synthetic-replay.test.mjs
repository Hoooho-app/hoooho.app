import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {AIBusinessService} from './service.mjs'
import {LocalFactProvider} from '../providers/local-fact-provider.mjs'
import {isCurrentPositiveSymptom} from '../health-fact-policy.mjs'
import {validateExtraction} from './contract.mjs'
import {captureSyntheticOutput,replaySyntheticCapture} from './synthetic-replay.mjs'
import {assertSyntheticRequest} from './synthetic-replay.mjs'
import {syntheticImageFixtureId} from './synthetic-contract.mjs'
import {syntheticCases,syntheticFixtureId,syntheticText} from './fixtures/synthetic-evidence-cases.mjs'
const input={text:syntheticText,syntheticReplay:syntheticFixtureId,timezone:'Asia/Shanghai',task:'record'}
const referenceNow='2026-10-02T18:08:06.804Z'
const wrap=output=>captureSyntheticOutput({input,context:{gender:'male',existingContext:[]},output,diagnostics:{provider:'bailian',model:'qwen3.7-plus',requestId:'synthetic_fixture_not_actual_response'},referenceNow,timezone:'Asia/Shanghai'})
const expected={
 'broad-quote-scope':['negation_scope','/items/1/fields/0'],
 'wrong-source-quote':['quote_not_in_source','/items/1/fields/0'],
 'negation-value-dropped':['negation_scope','/items/0/fields/0'],
 'negation-prefix-cropped':['negation_prefix','/items/0/fields/0'],
 'negated-fact-omitted':['negated_fact_coverage','/items'],
 'model-new-fact':['value_not_in_quote','/items/2/fields/0']}

for(const c of syntheticCases())test(`人工对照 ${c.id} 独立回放；不冒称历史真实响应`,async()=>{
 const capture=wrap(c.output),result=await replaySyntheticCapture(capture)
 assert.equal(result.status,c.expected==='pass'?'pass':'reject')
 if(c.expected==='reject'){
  assert.equal(result.code,'AI_EVIDENCE_MISMATCH');assert.equal(result.validation.rule,expected[c.id][0]);assert.equal(result.validation.fieldPath,expected[c.id][1])
  assert.doesNotMatch(JSON.stringify(result.validation),/呕吐|恶心|今天/)
 }else{
  const facts=(await new LocalFactProvider().organize(result.items.flatMap(i=>i.fields).map(f=>f.value).join('。'))).facts
  assert.ok(facts.some(f=>f.name==='呕吐'&&f.polarity==='negated'));assert.ok(!facts.some(f=>f.name==='呕吐'&&isCurrentPositiveSymptom(f)));assert.ok(facts.some(f=>f.name==='恶心'&&isCurrentPositiveSymptom(f)))
 }
})

test('回放拒绝非合成输入、历史医疗上下文、附件和修改后的响应',async()=>{
 const output=syntheticCases()[0].output
 for(const other of [{...input,text:'真实医疗原文'},{...input,files:[{}]},{...input,id:'existing'},{...input,syntheticReplay:'caller-defined'},{...input,timezone:'Europe/London'}])assert.throws(()=>captureSyntheticOutput({input:other,context:{existingContext:[]},output}),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
 assert.throws(()=>captureSyntheticOutput({input,context:{existingContext:[{text:'真实医疗原文'}]},output}),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
 assert.throws(()=>captureSyntheticOutput({input,output}),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
 const capture=wrap(output);capture.output.items[0].fields[0].value='modified';await assert.rejects(()=>replaySyntheticCapture(capture),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
})

async function fixture(t,output){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-synthetic-replay-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const members=new FamilyMemberRepository(dataDirectory),member=await members.create({accountId:'synthetic-replay-owner',name:'虚构人物',relationship:'child',gender:'male'})
 let calls=0
 const service=new AIBusinessService({dataDirectory,now:()=>new Date(referenceNow),model:{async structured(){calls++;return {value:structuredClone(output),diagnostics:{provider:'bailian',model:'qwen3.7-plus',requestId:'synthetic_fixture_not_actual_response'}}}}})
 return {service,member,members,calls:()=>calls}
}

test('合成失败有精确响应回放且保留原稿；诊断不持久化、不改变拒绝判定',async t=>{
 const f=await fixture(t,syntheticCases()[1].output)
 let error;try{await f.service.prepare('synthetic-replay-owner',f.member.id,input)}catch(e){error=e}
 assert.equal(error.code,'AI_EVIDENCE_MISMATCH');assert.equal(error.validation.fieldPath,'/items/1/fields/0');assert.ok(error.details.syntheticReplay);assert.equal(error.upstream.requestId,'synthetic_fixture_not_actual_response')
 assert.equal((await replaySyntheticCapture(error.details.syntheticReplay)).validation.rule,'negation_scope')
 assert.doesNotMatch(JSON.stringify({...error,details:undefined}),/呕吐|恶心/)
 const stored=(await f.service.store.read()).drafts[0];assert.equal(stored.raw,syntheticText);assert.equal(stored.state,'failed');assert.equal(stored.syntheticReplay,undefined)
 assert.equal((await f.service.events.repository.findByAccountId('synthetic-replay-owner')).length,0);assert.equal(f.calls(),1)
 await assert.rejects(()=>f.service.save('synthetic-replay-owner',f.member.id,stored.id,{version:stored.version,confirmed:true}),{status:409})
})

test('普通请求不返回回放；已鉴权成功合成返回捕获，保存不产生额外调用',async t=>{
 const f=await fixture(t,syntheticCases()[0].output)
 const plain=await f.service.prepare('synthetic-replay-owner',f.member.id,{text:syntheticText,timezone:'Asia/Shanghai'})
 assert.equal(plain.syntheticReplay,undefined)
 assert.equal(plain.syntheticReference,undefined)
 await f.service.cancel('synthetic-replay-owner',f.member.id,plain.id)
 const captured=await f.service.prepare('synthetic-replay-owner',f.member.id,input);assert.ok(captured.syntheticReplay)
 assert.equal(captured.syntheticReference.referenceNow,referenceNow);assert.equal(captured.syntheticReference.sources[0].text,syntheticText)
 assert.equal((await replaySyntheticCapture(captured.syntheticReplay)).status,'pass')
 await f.service.save('synthetic-replay-owner',f.member.id,captured.id,{version:captured.version,confirmed:true});assert.equal(f.calls(),2)
})

test('回放标识不能绕过账号成员权限或带入历史医疗资料；零模型调用',async t=>{
 const f=await fixture(t,syntheticCases()[0].output)
 await assert.rejects(()=>f.service.prepare('other-owner',f.member.id,input));assert.equal(f.calls(),0)
 f.service.context=async()=>({gender:'male',existingContext:[{text:'真实医疗原文'}]})
 await assert.rejects(()=>f.service.prepare('synthetic-replay-owner',f.member.id,input),{code:'AI_SYNTHETIC_REPLAY_DENIED'});assert.equal(f.calls(),0)
})

test('同组判断与原validator一致，诊断规则只细分定位而不放宽事实边界',()=>{
 assert.throws(()=>validateExtraction(syntheticCases()[1].output,[{id:'input',page:1,text:syntheticText}]),{code:'AI_EVIDENCE_MISMATCH'})
 assert.equal(validateExtraction(syntheticCases()[0].output,[{id:'input',page:1,text:syntheticText}]).length,2)
})

test('捕获不接收额外headers/credentials字段或疑似凭据文本',()=>{
 const output=syntheticCases()[0].output
 assert.equal(wrap({...output,Authorization:'fixture-credential'}),null)
 const unsafe=structuredClone(output);unsafe.items[0].title='Bearer fixture-credential';assert.equal(wrap(unsafe),null)
})

test('schema/来源通过后journal映射失败也返回合成证据，可离线重放；不持久化',async t=>{
 const output=syntheticCases()[0].output;output.items[1].fields[0].name='reaction'
 const f=await fixture(t,output)
 let error;try{await f.service.prepare('synthetic-replay-owner',f.member.id,input)}catch(e){error=e}
 assert.equal(error.code,'INVALID_JOURNAL_SYMPTOM');assert.ok(error.details.syntheticReplay)
 assert.deepEqual(error.details.syntheticReplay.output,output)
 const replay=await replaySyntheticCapture(error.details.syntheticReplay)
 assert.equal(replay.code,'INVALID_JOURNAL_SYMPTOM');assert.equal(replay.validation.fieldPath,'/items/1/journal')
 assert.equal((await f.service.store.read()).drafts[0].raw,syntheticText);assert.equal(f.calls(),1)
})

test('图片取证只接受固定PNG哈希，拒绝变造图、混入文字和历史上下文',()=>{
 const dataUrl='data:image/png;base64,'+readFileSync(new URL('./fixtures/synthetic-report.png.b64',import.meta.url),'utf8').trim()
 const imageInput={syntheticReplay:syntheticImageFixtureId,task:'report',files:[{mimeType:'image/png',dataUrl}]}
 assert.equal(assertSyntheticRequest(imageInput,{existingContext:[]}),true)
 assert.throws(()=>assertSyntheticRequest({...imageInput,text:'真实原文'}),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
 assert.throws(()=>assertSyntheticRequest({...imageInput,files:[{mimeType:'image/png',dataUrl:dataUrl.slice(0,-8)}]}),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
 assert.throws(()=>assertSyntheticRequest(imageInput,{existingContext:[{}]}),{code:'AI_SYNTHETIC_REPLAY_DENIED'})
})
