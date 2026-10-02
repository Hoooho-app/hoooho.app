import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { BailianProvider } from './bailian-provider.mjs'
import { createAIProvider, createAudioProvider } from './provider-factory.mjs'
import { bailianConfiguration } from './provider-config.mjs'
import { withAIAccount } from './call-control.mjs'
import { BusinessModel } from '../business/model.mjs'
import { AIBusinessService } from '../business/service.mjs'
import { prepareDocuments, recognizePage } from '../business/documents.mjs'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { MedicalSummaryService } from '../medical-summary-service.mjs'
import {syntheticEvidenceProof} from '../business/synthetic-evidence-proof.mjs'

const baseUrl='https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const env={AI_PROVIDER:'bailian',BAILIAN_API_KEY:'synthetic-credential',BAILIAN_BASE_URL:baseUrl}
const requestId='01234567-1234-1234-1234-123456789abc'
const silent={info(){},warn(){}}
const schema={type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string'}}}
const success=value=>Response.json({id:`chatcmpl-${requestId}`,choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:11,completion_tokens:22}},{headers:{'x-request-id':requestId}})
const provider=(fetchImpl,extras={})=>new BailianProvider({env,fetchImpl,logger:silent,...extras})
const modelFor=(fetchImpl,extras={})=>new BusinessModel({provider:provider(fetchImpl,extras),logger:silent})
const structured=model=>model.structured({task:'synthetic',schema,instructions:'只整理资料',input:'SYNTHETIC_MEDICAL_INPUT'})

test('仅进程内白名单能力允许捕获schema失败的内容；不进入供应商请求或日志',async()=>{
 const traces=[],logs=[];let body
 const model=modelFor(async(_url,init)=>{body=JSON.parse(init.body);return success({text:12})},{logger:{info:(...a)=>logs.push(a),warn:(...a)=>logs.push(a)}})
 const options={task:'synthetic',schema,instructions:'test',input:'test',onSyntheticOutput:e=>traces.push(e)}
 await assert.rejects(()=>model.structured({...options,syntheticEvidence:true}),{code:'AI_OUTPUT_INVALID'});assert.equal(traces.length,0)
 await assert.rejects(()=>model.structured({...options,syntheticEvidence:syntheticEvidenceProof}),{code:'AI_OUTPUT_INVALID'})
 assert.equal(traces.length,1);assert.equal(traces[0].structuredText,'{"text":12}');assert.equal(traces[0].requestId,requestId)
 assert.equal(body.syntheticEvidence,undefined);assert.equal(body.onSyntheticOutput,undefined);assert.doesNotMatch(JSON.stringify(logs),/structuredText/)
})

test('配置默认北京 qwen3.7-plus；兼容 Base URL 与 endpoint 不混用，拒绝不安全/外域/凭据/原生接口',()=>{
  assert.equal(bailianConfiguration({env}).model,'qwen3.7-plus')
  assert.equal(bailianConfiguration({env}).visionModel,'qwen3.7-plus')
  for(const url of ['http://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',baseUrl+'/chat/completions','https://example.com/compatible-mode/v1','https://dashscope.aliyuncs.com/api/v1','https://user:secret@dashscope.aliyuncs.com/compatible-mode/v1',baseUrl+'?token=secret','https://fixture.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1']){
    assert.throws(()=>bailianConfiguration({env:{...env,BAILIAN_BASE_URL:url}}),error=>{assert.equal(error.code,'AI_BASE_URL_INVALID');assert.doesNotMatch(error.message,/user:secret|token=secret/);return true})
  }
  assert.throws(()=>bailianConfiguration({env:{...env,BAILIAN_TIMEOUT_MS:'-1'}}))
})

test('缺配置失败可定位；local 不调用模型，非法供应商不启动其他模型，ASR/TTS 不复用文字模型',async()=>{
  const missing=createAIProvider({env:{AI_PROVIDER:'bailian'},fetchImpl:()=>{throw new Error('must not call')}})
  await assert.rejects(()=>missing.summarizeMedicalPreparation({}),{code:'AI_NOT_CONFIGURED'})
  assert.equal(createAIProvider({env:{AI_PROVIDER:'local'}}),null)
  await assert.rejects(()=>createAIProvider({env:{AI_PROVIDER:'unknown'}}).organize('test'),{code:'AI_CONFIGURATION_INVALID'})
  assert.equal(createAudioProvider('ASR',{env:{...env,OPENAI_API_KEY:'unused-old-key'}}),null)
  assert.equal(createAudioProvider('TTS',{env:{...env,OPENAI_API_KEY:'unused-old-key'}}),null)
  await assert.rejects(()=>modelFor(()=>success({text:'ok'})).speak('合成回复'),{code:'TTS_NOT_CONFIGURED'})
})

test('文字适配 Chat Completions、顶层 enable_thinking=false、严格 schema、无工具/流式/重试，安全记录真实元数据',async()=>{
  let calls=0,body,url,init;const logs=[]
  const model=modelFor(async(u,i)=>{calls++;url=u;init=i;body=JSON.parse(i.body);return success({text:'ok'})},{logger:{info:(...x)=>logs.push(x),warn:(...x)=>logs.push(x)}})
  const result=await structured(model)
  assert.equal(calls,1);assert.equal(url,baseUrl+'/chat/completions');assert.equal(init.redirect,'error')
  assert.equal(body.model,'qwen3.7-plus');assert.equal(body.enable_thinking,false);assert.equal(body.stream,false)
  assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true)
  assert.equal(body.tools,undefined);assert.equal(body.input,undefined);assert.equal(body.store,undefined);assert.ok(body.max_tokens<=8000)
  assert.equal(result.value.text,'ok');assert.equal(result.diagnostics.provider,'bailian');assert.equal(result.diagnostics.requestId,requestId)
  assert.equal(result.diagnostics.inputTokens,11);assert.equal(result.diagnostics.outputTokens,22)
  assert.doesNotMatch(JSON.stringify(logs),/synthetic-credential|SYNTHETIC_MEDICAL_INPUT|Authorization/)
})

test('免费额度、鉴权、权限、模型、余额、限流和图片失败分别分类，诊断脱敏且每种只调用一次',async()=>{
  for(const [status,code,kind] of [[403,'AllocationQuota.FreeTierOnly','free_quota_exhausted'],[401,'InvalidApiKey','authentication'],[403,'Model.AccessDenied','permission'],[404,'ModelNotFound','model_not_found'],[400,'Arrearage','credit_balance'],[429,'Throttling.RateQuota','rate_limit'],[429,'Throttling.AllocationQuota','quota_unknown'],[400,'InvalidImageFormat','image_unavailable']]){
    let calls=0;const logs=[]
    const p=provider(async()=>{calls++;return Response.json({error:{code,type:code,message:'synthetic-credential Authorization SYNTHETIC_MEDICAL_INPUT'},request_id:requestId},{status,headers:{'retry-after':'10'}})},{logger:{info:(...x)=>logs.push(x),warn:(...x)=>logs.push(x)}})
    await assert.rejects(()=>new MedicalSummaryService({provider:p,logger:silent}).generate({sections:[]}),error=>{
      assert.equal(error.upstream.httpStatus,status);assert.equal(error.upstream.errorCode,code);assert.equal(error.upstream.failureKind,kind);assert.equal(error.upstream.requestId,requestId);assert.equal(error.upstream.retryAfter,'10')
      assert.doesNotMatch(JSON.stringify(error),/synthetic-credential|Authorization|SYNTHETIC_MEDICAL_INPUT/);return true
    });assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(logs),/synthetic-credential|Authorization|SYNTHETIC_MEDICAL_INPUT/)
  }
})

test('超时、截断、拒绝、工具调用、缺字段、额外字段、非法JSON均不入业务且不重试',async()=>{
  for(const response of [()=>{throw Object.assign(new Error('synthetic-credential SYNTHETIC_MEDICAL_INPUT'),{name:'TimeoutError'})},()=>Response.json({choices:[{finish_reason:'length',message:{content:'SECRET'}}]}),()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'SECRET'}}]}),()=>Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{arguments:'SECRET'}]}}]}),()=>success({other:'SECRET'}),()=>success({text:'ok',extra:'SECRET'}),()=>Response.json({choices:[{finish_reason:'stop',message:{content:'SECRET'}}]})]){
    let calls=0;await assert.rejects(()=>structured(modelFor(async()=>{calls++;return response()})),error=>{assert.match(error.code,/^AI_/);assert.doesNotMatch(JSON.stringify(error),/synthetic-credential|SYNTHETIC_MEDICAL_INPUT|SECRET/);return true});assert.equal(calls,1)
  }
})

test('图片用内联数据且视觉模型独立；不接受外链、原生PDF、超额输入',async()=>{
  let body;const model=modelFor(async(_url,init)=>{body=JSON.parse(init.body);return success({text:'ok'})},{visionModel:'qwen3.7-plus'})
  await model.structured({task:'image',schema,instructions:'合成',vision:true,input:[{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,AA=='}]}]})
  assert.equal(body.messages[1].content[0].type,'image_url');assert.equal(body.messages[1].content[0].image_url.url,'data:image/png;base64,AA==')
  for(const content of [[{type:'input_image',image_url:'https://example.com/private.png'}],[{type:'input_file',file_data:'data:application/pdf;base64,AA=='}],[{type:'input_text',text:'a'.repeat(66000)}]])await assert.rejects(()=>model.structured({task:'image',schema,instructions:'test',input:[{role:'user',content}]}))
})

test('两页PDF本地逐页转图，原文件、来源页码不变；百炼不收到PDF或公开链接',async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
  for(let i=0;i<2;i++){const p=pdf.addPage([200,100]);p.drawText(`SYNTHETIC PAGE ${i+1}`,{x:10,y:60,size:12,font})}
  const file={name:'synthetic.pdf',mimeType:'application/pdf',dataUrl:`data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}`}
  const prepared=await prepareDocuments([file]);let calls=0
  const model=modelFor(async(_url,init)=>{calls++;const body=JSON.parse(init.body),part=body.messages[1].content[1];assert.equal(part.type,'image_url');assert.match(part.image_url.url,/^data:image\/png;base64,/);const stats=await sharp(Buffer.from(part.image_url.url.split(',')[1],'base64')).stats();assert.ok(stats.channels[0].stdev>0);return success({text:`合成第${calls}页`,status:'readable'})})
  for(const page of prepared.pages){const result=await recognizePage(page,model);assert.equal(result.page,page.page);assert.equal(result.id,prepared.documents[0].id);assert.equal(result.diagnostics.provider,'bailian')}
  assert.equal(calls,2);assert.equal(prepared.documents[0].dataUrl,file.dataUrl)
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>recognizePage(prepared.pages[0],model,cancelled.signal));assert.equal(calls,2)
})

test('应用草稿：当前账号成员隔离、来源确认、重复提交幂等、取消不保存、失败保留原稿与用户编辑',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-bailian-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const member=await new FamilyMemberRepository(directory).create({accountId:'synthetic-account',name:'合成孩子',relationship:'self'})
  let calls=0,fail=false
  const model=modelFor(async(_url,init)=>{calls++;if(fail)return Response.json({error:{code:'AllocationQuota.FreeTierOnly'}},{status:403});const body=JSON.parse(init.body),source=JSON.parse(body.messages[1].content[0].text).sources[0];return success({items:[{category:'symptom',title:'合成观察',timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'symptom',value:source.text,quote:source.text,sourceId:source.id,page:source.page}]}]})})
  const svc=new AIBusinessService({dataDirectory:directory,model})
  await assert.rejects(()=>svc.prepare('foreign-account',member.id,{text:'不得发送'}),{status:404});assert.equal(calls,0)
  const input={text:'没有呕吐'},draft=await svc.prepare('synthetic-account',member.id,input)
  assert.equal(draft.generation.provider,'bailian');assert.equal(draft.generation.requestId,requestId)
  assert.equal(draft.state,'ready');await svc.prepare('synthetic-account',member.id,input);assert.equal(calls,1)
  await assert.rejects(()=>svc.save('synthetic-account',member.id,draft.id,{version:draft.version,confirmed:false}))
  const edited=await svc.edit('synthetic-account',member.id,draft.id,{version:draft.version,itemId:draft.items[0].id,field:'symptom',value:'家长更正：没有呕吐'})
  fail=true;await assert.rejects(()=>svc.prepare('synthetic-account',member.id,{id:draft.id,version:edited.version,text:'没有呕吐，稍后补充'}))
  const previous=await svc.read('synthetic-account',member.id,draft.id);assert.equal(previous.state,'failed');assert.equal(previous.items[0].fields[0].value,'家长更正：没有呕吐')
  await svc.cancel('synthetic-account',member.id,draft.id);assert.equal((await svc.records.repository.findByAccountId('synthetic-account')).length,0)
  fail=false;const next=await svc.prepare('synthetic-account',member.id,input),saved=await svc.save('synthetic-account',member.id,next.id,{version:next.version,confirmed:true})
  const record=await svc.records.repository.findById(saved.result.records[0].recordId);assert.equal(record.aiProvenance.provider,'bailian');assert.equal(record.aiProvenance.model,'qwen3.7-plus');assert.equal(record.aiProvenance.sources[0].quote,'没有呕吐')
  await svc.save('synthetic-account',member.id,next.id,{version:next.version,confirmed:true});assert.equal((await svc.records.repository.findByAccountId('synthetic-account')).length,1)
})

test('账号限流与并发限制拒绝额外实际调用，不通过更换模型绕过',async()=>{
  let calls=0;const limited=modelFor(async()=>{calls++;return success({text:'ok'})},{env:{...env,AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1'}})
  await withAIAccount('synthetic-limit',()=>structured(limited));await assert.rejects(()=>withAIAccount('synthetic-limit',()=>structured(limited)),{code:'AI_ACCOUNT_CALL_LIMIT'});assert.equal(calls,1)
  let release,started;const ready=new Promise(r=>{started=r}),pending=new Promise(r=>{release=r})
  const concurrent=modelFor(async()=>{started();await pending;return success({text:'ok'})},{env:{...env,AI_MAX_CONCURRENT_CALLS:'1'}})
  const first=structured(concurrent);await ready;await assert.rejects(()=>structured(concurrent),{code:'AI_CONCURRENCY_LIMIT'});release();await first
})

test('摘要业务仍复用去标识化输入、引用校验，不把百炼推断作为确诊',async()=>{
  let input;const p=provider(async(_url,init)=>{input=JSON.parse(init.body);return success({overview:'疑似食物相关，尚未确诊。',keyPoints:[{text:'疑似食物相关，尚未确诊',sectionId:'record',quote:'疑似食物相关，尚未确诊'}],missingInformation:[]})})
  const result=await new MedicalSummaryService({provider:p,logger:silent}).generate({sections:[{id:'record',title:'合成来源',lines:['[record:synthetic] 疑似食物相关，尚未确诊','姓名：合成孩子']}]},'synthetic-summary')
  assert.equal(result.provider,'bailian');assert.equal(result.keyPointEvidence[0].sourceId,'record:synthetic');assert.doesNotMatch(JSON.stringify(input.messages[1]),/姓名|合成孩子/)
})
