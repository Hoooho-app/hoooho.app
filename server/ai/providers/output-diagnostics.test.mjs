import test from 'node:test'
import assert from 'node:assert/strict'
import { BailianProvider } from './bailian-provider.mjs'
import { BusinessModel } from '../business/model.mjs'
import { recognizePage } from '../business/documents.mjs'
import { MedicalSummaryError } from '../medical-summary-service.mjs'
import { validateExtraction } from '../business/contract.mjs'
import { schemaFailureDiagnostic } from './output-diagnostics.mjs'

// Synthetic protocol fixtures, never labelled as the original production reply.
const env={BAILIAN_API_KEY:'fixture-credential',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'}
const id='req_fixture_output_stage'
const reply=(content,finish_reason='stop')=>Response.json({choices:[{finish_reason,message:{content}}]},{headers:{'x-request-id':id}})
const schema={type:'object',additionalProperties:false,required:['text','status'],properties:{text:{type:'string'},status:{type:'string',enum:['readable','uncertain','blank']}}}
const fixtures=[
 {stage:'response_unpack',path:'/',reason:'invalid_json',response:()=>new Response('fixture medical raw NOT_JSON',{headers:{'x-request-id':id}})},
 {stage:'response_unpack',path:'/choices/0/message/content',reason:'missing_content',response:()=>Response.json({choices:[]},{headers:{'x-request-id':id}})},
 {stage:'json_parse',path:'/choices/0/message/content',reason:'invalid_json',response:()=>reply('```json\n{"text":"fixture medical raw"}\n```')},
 {stage:'schema_validation',path:'/status',reason:'required',response:()=>reply('{"text":"fixture medical raw"}')},
 {stage:'schema_validation',path:'/status',reason:'enum',response:()=>reply('{"text":"fixture medical raw","status":"secret medical value"}')},
 {stage:'schema_validation',path:'/text',reason:'type',response:()=>reply('{"text":12,"status":"readable"}')},
 {stage:'schema_validation',path:'/',reason:'additionalProperties',response:()=>reply('{"text":"fixture medical raw","status":"readable","secret medical key":"fixture medical raw"}')},
 {stage:'output_truncation',path:'/choices/0/finish_reason',reason:'length_limit',response:()=>reply('{"text":"fixture medical raw"','length')},
]
for(const f of fixtures)test(`安全诊断 ${f.stage}/${f.reason} 不接受无效结果、仅一次请求`,async()=>{
 let calls=0;const logs=[]
 const provider=new BailianProvider({env,fetchImpl:async()=>{calls++;return f.response()},logger:{info:(...args)=>logs.push(args),warn:(...args)=>logs.push(args)}})
 const model=new BusinessModel({provider,logger:{info(){},warn(){}}})
 await assert.rejects(()=>model.structured({task:'document-page',schema,instructions:'fixture',input:'fixture medical raw'}),error=>{
  assert.deepEqual(error.validation,{stage:f.stage,fieldPath:f.path,reason:f.reason});assert.equal(error.upstream.requestId,id);assert.equal(error.upstream.httpStatus,200)
  assert.doesNotMatch(JSON.stringify(error),/fixture-credential|fixture medical raw|secret medical/)
  assert.deepEqual(new MedicalSummaryError('unavailable','AI_MEDICAL_SUMMARY_UNAVAILABLE',error).validation,error.validation)
  return true
 });assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(logs),/fixture-credential|fixture medical raw|secret medical/)
 assert.match(JSON.stringify(logs),new RegExp(f.stage));assert.equal(logs.length,1)
})
test('OCR 请求有明确对象字段契约，不修改 json_schema、不补默认 status/事实',async()=>{
 let captured,calls=0
 const provider=new BailianProvider({env,fetchImpl:async(_url,init)=>{captured=JSON.parse(init.body);calls++;return reply('{"text":"合成页原文","status":"readable"}')},logger:{info(){},warn(){}}})
 const model=new BusinessModel({provider,logger:{info(){},warn(){}}})
 const page={id:'synthetic',page:1,name:'synthetic.png',hash:'synthetic',mimeType:'image/png',dataUrl:'data:image/png;base64,U1lOVEhFVElD'}
 const result=await recognizePage(page,model);assert.equal(result.text,'合成页原文');assert.equal(result.status,'readable')
 assert.equal(captured.response_format.type,'json_schema');assert.equal(captured.response_format.json_schema.strict,true);assert.match(captured.messages[0].content,/JSON 对象/);assert.match(captured.messages[0].content,/readable、uncertain、blank/);assert.equal(calls,1)
})

test('来源校验记录精确字段路径，不把来源原文写入诊断',()=>{
 const raw='fixture medical raw'
 const item={category:'symptom',title:'fixture',timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'symptom',value:'not in source',sourceId:'s',page:1,quote:raw}]}
 assert.throws(()=>validateExtraction({items:[item]},[{id:'s',page:1,text:raw}]),error=>{
  assert.deepEqual(error.validation,{stage:'source_validation',fieldPath:'/items/0/fields/0',reason:'source_mismatch'})
  assert.doesNotMatch(JSON.stringify(error),/fixture medical raw|not in source/);return true
 })
})

test('嵌套 schema 路径只保留固定字段与索引，未知字段不进入日志',()=>{
 const nested={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{fields:{type:'array',items:schema}}}}}}
 assert.deepEqual(schemaFailureDiagnostic(nested,{instancePath:'/items/0/fields/2/secret medical raw',keyword:'type'}),{stage:'schema_validation',fieldPath:'/items/0/fields/2/[redacted]',reason:'type'})
})
