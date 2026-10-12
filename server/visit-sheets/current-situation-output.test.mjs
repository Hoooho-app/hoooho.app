import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeMedicalSummary,OpenAIProvider} from '../ai/providers/openai-provider.mjs'
import {BailianProvider} from '../ai/providers/bailian-provider.mjs'
import {situationRaw,situationOutput} from '../../tests/visit-sheet/current-situation-v2.fixture.mjs'
import {MedicalSummaryService} from '../ai/medical-summary-service.mjs'
import {visitAISummaryInput} from './visit-ai-summary.mjs'
const input={sections:[{id:'record',title:'当前记录',lines:[`[record:focus] ${situationRaw}`]}],currentSituationSources:[{id:'record:focus',text:situationRaw,occurredAt:'2026-10-13T00:00:00Z'}]}
test('V2原话在同一摘要链路成为概览、症状、饮食，保留否定与家属猜测',()=>{
 const result=normalizeMedicalSummary(situationOutput(),input).currentSituation
 assert.notEqual(result.description[0].text,situationRaw);assert.equal(result.symptoms.length,3);assert.equal(result.diet.length,2)
 assert.match(result.description[0].text,/无头痛/);assert.match(result.symptoms[1].note,/家属怀疑/);assert.equal(result.symptoms[2].text,'正常。');assert.deepEqual(result.treatment,[])
})
test('V2数据校验拒绝跨成员来源、无依据数值、反转否定、确诊、缺结构',()=>{
 const mutations=[r=>{r.currentSituation.symptoms[0].text='早上起床后头痛，无发烧。';r.currentSituation.symptoms[0].quote='早上起来的时候就开始其实有点头晕但不是头疼，发烧也不发烧';r.currentSituation.symptoms[0].emphasis=[]},r=>r.currentSituation.symptoms[1].label='肺炎',r=>r.currentSituation.symptoms[1].label='确诊湿疹',r=>r.currentSituation.symptoms[1].label='严重过敏反应',r=>r.currentSituation.symptoms[1].label='湿疹',r=>r.currentSituation.symptoms[0].sourceId='record:foreign',r=>r.currentSituation.symptoms[2].text='37.5℃',r=>r.currentSituation.symptoms[0].text='有头痛',r=>r.currentSituation.symptoms[1].note='确诊湿疹',r=>delete r.currentSituation,r=>r.currentSituation.description[0].text='严重头晕，确诊热疹',r=>r.currentSituation.symptoms[0].emphasis=['头痛'],r=>r.currentSituation.extra='not-allowed',r=>{r.currentSituation.description[0].text='湿疹';r.currentSituation.description[0].quote='湿疹'}]
 for(const change of mutations){const result=situationOutput();change(result);assert.throws(()=>normalizeMedicalSummary(result,input))}
})
test('仅目前情况请求扩展现有严格JSON schema，普通摘要契约保持原样',async()=>{
 let body;const provider=new OpenAIProvider({apiKey:'test',fetchImpl:async(_,init)=>{body=JSON.parse(init.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(situationOutput())}]}]})}})
 const result=await provider.summarizeMedicalPreparation(input);assert.equal(result.currentSituation.symptoms.length,3);assert.ok(body.text.format.schema.properties.currentSituation);assert.equal(body.store,false)
 await provider.summarizeMedicalPreparation({sections:input.sections});assert.equal(body.text.format.schema.properties.currentSituation,undefined)
})

test('现有百炼摘要适配器核验同一V2结构，仍只发起一次模型调用',async()=>{
 let calls=0,body
 const provider=new BailianProvider({env:{AI_PROVIDER:'bailian',BAILIAN_API_KEY:'fixture-only',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'},logger:{info(){},warn(){}},fetchImpl:async(_,init)=>{calls++;body=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(situationOutput())}}]})}})
 const result=await provider.summarizeMedicalPreparation(input)
 assert.equal(calls,1);assert.equal(result.currentSituation.diet.length,2);assert.ok(body.response_format.json_schema.schema.properties.currentSituation)
})

test('V2校验诊断穿过摘要服务，仅记录固定字段和规则，不记录原话或无效模型正文',async()=>{
 const fixtures=[
  {change:r=>r.currentSituation.symptoms[0].sourceId='private-invalid-source',path:'/currentSituation/symptoms/0/sourceId',rule:'unknown_source'},
  {change:r=>r.currentSituation.symptoms[1].label='private-invalid',path:'/currentSituation/symptoms/1/label',rule:'unverified_label'},
  {change:r=>r.currentSituation.symptoms[2].text='37.5℃',path:'/currentSituation/symptoms/2/text',rule:'unverified_number'},
  {change:r=>r.currentSituation['private-invalid-key']='private-invalid-body',path:'/currentSituation',reason:'additionalProperties'},
 ]
 for(const fixture of fixtures){
  const logs=[],body=situationOutput();fixture.change(body);let calls=0
  const provider=new BailianProvider({env:{BAILIAN_API_KEY:'fixture-only-secret',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'},logger:{info(){},warn(){}},fetchImpl:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]})}})
  const service=new MedicalSummaryService({provider,logger:{warn:(...args)=>logs.push(args)}})
  await assert.rejects(()=>service.generate(input),error=>{
   assert.equal(error.code,'AI_MEDICAL_SUMMARY_UNAVAILABLE')
   assert.equal(error.validation.fieldPath,fixture.path)
   if(fixture.rule)assert.equal(error.validation.rule,fixture.rule)
   if(fixture.reason)assert.equal(error.validation.reason,fixture.reason)
   assert.doesNotMatch(JSON.stringify(error),/private-invalid|fixture-only-secret|牛肉|头晕|37\.5/)
   return true
  })
  assert.equal(calls,1);assert.equal(logs.length,1)
  assert.doesNotMatch(JSON.stringify(logs),/private-invalid|fixture-only-secret|牛肉|头晕|37\.5/)
 }
})

test('V2真实章节元数据与裸来源使用不同引用契约，不接受拼接引文或来源id冒充sectionId',async()=>{
 const sourceId='record:synthetic-source-with-real-line-metadata'
 const summaryInput=visitAISummaryInput({member:{name:'合成姓名',gender:'female',birthday:'2025-01-01'},dataAsOf:'2026-10-13T00:00:00Z',timezone:'Asia/Shanghai',complaint:'头晕与皮肤观察',question:'',focusSourceIds:[sourceId],sources:[{id:sourceId,category:'record',code:'SRC-001',identity:'家长记录',text:situationRaw,occurredAt:'2026-10-13T00:00:00Z',createdAt:'2026-10-13T00:01:00Z'}]})
 summaryInput.currentSituationSources=[{id:sourceId,text:situationRaw}]
 const valid=situationOutput(sourceId),fullLine=summaryInput.sections.find(section=>section.id==='record').lines[0]
 assert.doesNotThrow(()=>normalizeMedicalSummary(valid,summaryInput))
 valid.keyPoints[0].quote=fullLine;assert.doesNotThrow(()=>normalizeMedicalSummary(valid,summaryInput))
 const wrongSection=situationOutput(sourceId);wrongSection.keyPoints[0].sectionId=sourceId
 assert.throws(()=>normalizeMedicalSummary(wrongSection,summaryInput),error=>error.validation.fieldPath==='/keyPoints/0/sectionId'&&error.validation.rule==='unknown_section')
 const spliced=situationOutput(sourceId);spliced.keyPoints[0].quote=`[${sourceId}] ${situationRaw}`
 assert.throws(()=>normalizeMedicalSummary(spliced,summaryInput),error=>error.validation.fieldPath==='/keyPoints/0/quote'&&error.validation.rule==='quote_not_contiguous_in_section')
 let body;const provider=new OpenAIProvider({apiKey:'fixture',fetchImpl:async(_,init)=>{body=JSON.parse(init.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(valid)}]}]})}})
 await provider.summarizeMedicalPreparation(summaryInput)
 assert.deepEqual(body.text.format.schema.properties.keyPoints.items.properties.sectionId.enum,summaryInput.sections.filter(s=>s.lines.length).map(s=>s.id))
 assert.match(body.instructions,/两类引用契约不同/)
 await provider.summarizeMedicalPreparation({sections:summaryInput.sections})
 assert.equal(body.text.format.schema.properties.keyPoints.items.properties.sectionId.enum,undefined)
 assert.doesNotMatch(body.instructions,/两类引用契约不同/)
 const otherInput=structuredClone(summaryInput)
 otherInput.sections.find(s=>s.id==='record').id='otherRecord';valid.keyPoints[0].sectionId='otherRecord'
 await provider.summarizeMedicalPreparation(otherInput)
 assert.deepEqual(body.text.format.schema.properties.keyPoints.items.properties.sectionId.enum,['basic','current','otherRecord'])
 const invalidText=situationOutput(sourceId);invalidText.keyPoints[0].text=' '
 assert.throws(()=>normalizeMedicalSummary(invalidText,summaryInput),error=>error.validation.fieldPath==='/keyPoints/0/text'&&error.validation.rule==='invalid_evidence_text')
 let calls=0;const emptyProvider=new OpenAIProvider({apiKey:'fixture',fetchImpl:async()=>{calls++;throw new Error('must not call')}})
 await assert.rejects(()=>emptyProvider.summarizeMedicalPreparation({sections:[],currentSituationSources:summaryInput.currentSituationSources}),error=>error.code==='INVALID_AI_SUMMARY')
 assert.equal(calls,0)
})
