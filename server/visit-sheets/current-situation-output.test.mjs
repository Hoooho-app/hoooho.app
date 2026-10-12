import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeMedicalSummary,OpenAIProvider} from '../ai/providers/openai-provider.mjs'
import {BailianProvider} from '../ai/providers/bailian-provider.mjs'
import {situationRaw,situationOutput} from '../../tests/visit-sheet/current-situation-v2.fixture.mjs'
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
