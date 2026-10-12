import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeMedicalSummary,OpenAIProvider} from '../ai/providers/openai-provider.mjs'
import {BailianProvider} from '../ai/providers/bailian-provider.mjs'
import {situationRaw,situationOutput} from '../../tests/visit-sheet/current-situation-v2.fixture.mjs'
import {MedicalSummaryService} from '../ai/medical-summary-service.mjs'
import {visitAISummaryInput} from './visit-ai-summary.mjs'
import {safeSituationEmphasis} from './current-situation-output.mjs'
const input={sections:[{id:'record',title:'当前记录',lines:[`[record:focus] ${situationRaw}`]}],currentSituationSources:[{id:'record:focus',text:situationRaw,occurredAt:'2026-10-13T00:00:00Z'}]}
const ordinaryOutput=()=>({overview:'今早有点头晕，无头痛，体温正常；颈部和腿部有皮肤观察。',keyPoints:[{text:'有点头晕但无头痛，体温正常',sectionId:'record',quote:situationRaw}],missingInformation:[]})
test('V2原话在同一摘要链路成为概览、症状、饮食，保留否定与家属猜测',()=>{
 const result=normalizeMedicalSummary(situationOutput(),input).currentSituation
 assert.notEqual(result.description[0].text,situationRaw);assert.equal(result.symptoms.length,3);assert.equal(result.diet.length,2)
 assert.match(result.description[0].text,/无头痛/);assert.match(result.symptoms[1].note,/家属怀疑/);assert.equal(result.symptoms[2].text,'正常。');assert.deepEqual(result.treatment,[])
})
test('V2数据校验拒绝跨成员来源、无依据数值、反转否定、确诊、缺结构',()=>{
 const mutations=[r=>{r.currentSituation.symptoms[0].text='早上起床后头痛，无发烧。';r.currentSituation.symptoms[0].quote='早上起来的时候就开始其实有点头晕但不是头疼，发烧也不发烧';r.currentSituation.symptoms[0].emphasis=[]},r=>r.currentSituation.symptoms[1].label='肺炎',r=>r.currentSituation.symptoms[1].label='确诊湿疹',r=>r.currentSituation.symptoms[1].label='严重过敏反应',r=>r.currentSituation.symptoms[1].label='湿疹',r=>r.currentSituation.symptoms[0].sourceId='record:foreign',r=>r.currentSituation.symptoms[2].text='37.5℃',r=>r.currentSituation.symptoms[0].text='有头痛',r=>r.currentSituation.symptoms[1].note='确诊湿疹',r=>delete r.currentSituation,r=>r.currentSituation.description[0].text='严重头晕，确诊热疹',r=>r.currentSituation.extra='not-allowed',r=>{r.currentSituation.description[0].text='湿疹';r.currentSituation.description[0].quote='湿疹'}]
 for(const change of mutations){const result=situationOutput();change(result);assert.throws(()=>normalizeMedicalSummary(result,input))}
})

test('强调提示安全归一化保留完整事实，不能突出被否定症状或不存在的文字',()=>{
 const response=situationOutput();response.currentSituation.symptoms[0].emphasis=['头痛','模型额外片段','无头痛']
 const result=normalizeMedicalSummary(response,input).currentSituation.symptoms[0]
 assert.equal(result.text,response.currentSituation.symptoms[0].text);assert.deepEqual(result.emphasis,['无头痛']);assert.deepEqual(result.sourceIds,['record:focus'])
 assert.deepEqual(safeSituationEmphasis('有头痛，无发烧。',['有头痛','无发烧']),['有头痛','无发烧'])
 assert.deepEqual(safeSituationEmphasis('早上有头痛。晚上无头痛。',['头痛','无头痛']),['无头痛'])
 assert.deepEqual(safeSituationEmphasis('无头痛，无发热，体温正常。',['头痛','发热','体温正常']),['体温正常'])
 assert.deepEqual(safeSituationEmphasis('没有明显头疼，未发热。',['没有明显头疼','未发热']),['没有明显头疼','未发热'])
 assert.deepEqual(safeSituationEmphasis('无头痛。无头痛。',['无头痛'],0.5),[])
 assert.deepEqual(safeSituationEmphasis('有点头晕，无头痛。',['','无头痛','无头痛'],0.5),['无头痛'])
 for(const emphasis of ['not-array',[1],['a','b','c','d']]){const invalid=situationOutput();invalid.currentSituation.symptoms[0].emphasis=emphasis;assert.throws(()=>normalizeMedicalSummary(invalid,input),error=>error.validation.stage==='schema_validation')}
 for(const text of ['37.5℃','确诊湿疹']){const invalid=situationOutput();invalid.currentSituation.symptoms[2].text=text;invalid.currentSituation.symptoms[2].emphasis=['不存在的片段'];assert.throws(()=>normalizeMedicalSummary(invalid,input))}
})

test('家长或家属猜测保持相邻备注与原文引用，具体诊断及错误引用仍拒绝',()=>{
 for(const note of ['家长猜测是痱子，也可能是热疹或湿疹。','家属推测是痱子，也不确定是否为热疹或湿疹。','记录者猜想是痱子或热疹、湿疹。']){
  const value=situationOutput();value.currentSituation.symptoms[1].note=note
  assert.equal(normalizeMedicalSummary(value,input).currentSituation.symptoms[1].note,note)
 }
 const cases=[{note:'家长猜测是痱子。',noteQuote:'',field:'noteQuote',rule:'missing_guess_quote'},{note:'家长猜测是痱子。',noteQuote:'private-noncontiguous-quote',field:'noteQuote',rule:'guess_quote_not_in_source'},{note:'家长确诊湿疹。',field:'text',rule:'uncertainty_lost'},{note:'猜测是痱子。',field:'note',rule:'guess_attribution_missing'}]
 for(const mutation of cases){const value=situationOutput();const row=value.currentSituation.symptoms[1];row.note=mutation.note;if(Object.hasOwn(mutation,'noteQuote'))row.noteQuote=mutation.noteQuote;assert.throws(()=>normalizeMedicalSummary(value,input),error=>error.validation.fieldPath===`/currentSituation/symptoms/1/${mutation.field}`&&error.validation.rule===mutation.rule)}
 for(const note of ['妈妈猜测是痱子。','爸爸推测是痱子。','父母猜想是痱子。']){const value=situationOutput();value.currentSituation.symptoms[1].note=note;assert.throws(()=>normalizeMedicalSummary(value,input),error=>error.validation.rule==='guess_attribution_missing')}
 const certain=situationOutput();certain.currentSituation.symptoms[2].note='家属描述体温正常。';certain.currentSituation.symptoms[2].noteQuote='体温是正常的'
 assert.throws(()=>normalizeMedicalSummary(certain,input),error=>error.validation.fieldPath==='/currentSituation/symptoms/2/note'&&error.validation.rule==='guess_uncertainty_lost')
})
test('目前情况仅请求严格局部结构，普通摘要契约与连续调用保持隔离',async()=>{
 const bodies=[];const provider=new OpenAIProvider({apiKey:'test',fetchImpl:async(_,init)=>{const body=JSON.parse(init.body);bodies.push(body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(body.text.format.schema.properties.currentSituation?situationOutput():ordinaryOutput())}]}]})}})
 const result=await provider.summarizeMedicalPreparation(input);assert.equal(result.currentSituation.symptoms.length,3);assert.deepEqual(Object.keys(result),['currentSituation'])
 const ordinary=await provider.summarizeMedicalPreparation({sections:input.sections});assert.equal(ordinary.overview,ordinaryOutput().overview);assert.equal(ordinary.currentSituation,undefined)
 await provider.summarizeMedicalPreparation(input);assert.equal(bodies.length,3)
 for(const body of [bodies[0],bodies[2]]){assert.deepEqual(body.text.format.schema.required,['currentSituation']);assert.deepEqual(Object.keys(body.text.format.schema.properties),['currentSituation']);assert.equal(body.text.format.schema.additionalProperties,false);assert.equal(body.store,false);assert.match(body.instructions,/仅返回 \{currentSituation\}/);assert.doesNotMatch(body.instructions,/overview 用一到三句话/);assert.equal(body.text.format.name,'hoooho_medical_summary')}
 assert.deepEqual(bodies[1].text.format.schema.required,['overview','keyPoints','missingInformation']);assert.equal(bodies[1].text.format.schema.properties.currentSituation,undefined);assert.match(bodies[1].instructions,/overview 用一到三句话/);assert.doesNotMatch(bodies[1].instructions,/仅返回 \{currentSituation\}/)
 assert.deepEqual(bodies[0].text.format.schema,bodies[2].text.format.schema)
 for(const body of bodies)assert.match(body.instructions,/不要把姓名或其他身份信息重复写入摘要/)
})

test('目前情况在本地拒绝无效根结构与旧整单额外字段，逐行保留发生日期校验',()=>{
 const invalid=[null,[],{},ordinaryOutput(),{...situationOutput(),overview:'旧整单字段'},{...situationOutput(),privateUnknown:'private-body'},{currentSituation:null},{currentSituation:[]}]
 for(const value of invalid)assert.throws(()=>normalizeMedicalSummary(value,input),error=>error.code==='INVALID_AI_SUMMARY')
 const withFacts={...input,visitFacts:{sources:[{id:'record:focus',text:situationRaw,occurredDate:'2026-10-13'}]}}
 const wrongDate=situationOutput();wrongDate.currentSituation.description[0].text='10月14日起床后有点头晕，无头痛。';wrongDate.currentSituation.description[0].emphasis=[]
 assert.throws(()=>normalizeMedicalSummary(wrongDate,withFacts),error=>error.validation.fieldPath==='/currentSituation/description/0/text'&&error.message==='Unverified occurrence date')
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
  {change:r=>r['private-invalid-key']='private-invalid-body',path:'/',reason:'additionalProperties'},
  {change:r=>r.currentSituation.symptoms[1].noteQuote='private-invalid-quote',path:'/currentSituation/symptoms/1/noteQuote',rule:'guess_quote_not_in_source'},
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
   assert.equal(error.preview.status,'unverified');assert.equal(error.preview.issues[0].fieldPath,fixture.path)
   assert.doesNotMatch(JSON.stringify(error),/private-invalid|fixture-only-secret|牛肉|头晕|37\.5/)
   return true
  })
  assert.equal(calls,1);assert.equal(logs.length,1)
  assert.doesNotMatch(JSON.stringify(logs),/private-invalid|fixture-only-secret|牛肉|头晕|37\.5/)
 }
})

test('目前情况使用裸来源，普通摘要保留真实章节与连续引文校验',async()=>{
 const sourceId='record:synthetic-source-with-real-line-metadata'
 const summaryInput=visitAISummaryInput({member:{name:'合成姓名',gender:'female',birthday:'2025-01-01'},dataAsOf:'2026-10-13T00:00:00Z',timezone:'Asia/Shanghai',complaint:'头晕与皮肤观察',question:'',focusSourceIds:[sourceId],sources:[{id:sourceId,category:'record',code:'SRC-001',identity:'家长记录',text:situationRaw,occurredAt:'2026-10-13T00:00:00Z',createdAt:'2026-10-13T00:01:00Z'}]})
 summaryInput.currentSituationSources=[{id:sourceId,text:situationRaw}]
 const ordinaryInput={sections:summaryInput.sections,visitFacts:summaryInput.visitFacts},valid=ordinaryOutput(),fullLine=summaryInput.sections.find(section=>section.id==='record').lines[0]
 assert.doesNotThrow(()=>normalizeMedicalSummary(situationOutput(sourceId),summaryInput))
 assert.doesNotThrow(()=>normalizeMedicalSummary(valid,ordinaryInput))
 valid.keyPoints[0].quote=fullLine;assert.doesNotThrow(()=>normalizeMedicalSummary(valid,ordinaryInput))
 const wrongSection=ordinaryOutput();wrongSection.keyPoints[0].sectionId=sourceId
 assert.throws(()=>normalizeMedicalSummary(wrongSection,ordinaryInput),error=>error.validation.fieldPath==='/keyPoints/0/sectionId'&&error.validation.rule==='unknown_section')
 const spliced=ordinaryOutput();spliced.keyPoints[0].quote=`[${sourceId}] ${situationRaw}`
 assert.throws(()=>normalizeMedicalSummary(spliced,ordinaryInput),error=>error.validation.fieldPath==='/keyPoints/0/quote'&&error.validation.rule==='quote_not_contiguous_in_section')
 let body;const provider=new OpenAIProvider({apiKey:'fixture',fetchImpl:async(_,init)=>{body=JSON.parse(init.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(body.text.format.schema.properties.currentSituation?situationOutput(sourceId):valid)}]}]})}})
 await provider.summarizeMedicalPreparation(summaryInput)
 assert.deepEqual(Object.keys(body.text.format.schema.properties),['currentSituation'])
 assert.match(body.instructions,/裸text中连续逐字复制/)
 await provider.summarizeMedicalPreparation({sections:summaryInput.sections})
 assert.equal(body.text.format.schema.properties.keyPoints.items.properties.sectionId.enum,undefined)
 assert.doesNotMatch(body.instructions,/裸text中连续逐字复制/)
 const otherInput=structuredClone(summaryInput)
 otherInput.sections.find(s=>s.id==='record').id='otherRecord';valid.keyPoints[0].sectionId='otherRecord'
 await provider.summarizeMedicalPreparation(otherInput)
 assert.deepEqual(Object.keys(body.text.format.schema.properties),['currentSituation'])
 const invalidText=ordinaryOutput();invalidText.keyPoints[0].text=' '
 assert.throws(()=>normalizeMedicalSummary(invalidText,ordinaryInput),error=>error.validation.fieldPath==='/keyPoints/0/text'&&error.validation.rule==='invalid_evidence_text')
 let calls=0;const emptyProvider=new OpenAIProvider({apiKey:'fixture',fetchImpl:async()=>{calls++;throw new Error('must not call')}})
 await assert.rejects(()=>emptyProvider.summarizeMedicalPreparation({sections:[],currentSituationSources:summaryInput.currentSituationSources}),error=>error.code==='INVALID_AI_SUMMARY')
 assert.equal(calls,0)
})
