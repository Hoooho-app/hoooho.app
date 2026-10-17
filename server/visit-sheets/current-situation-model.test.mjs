import assert from 'node:assert/strict'
import test from 'node:test'
import { MedicalSummaryService } from '../ai/medical-summary-service.mjs'
import { BailianProvider } from '../ai/providers/bailian-provider.mjs'
import { normalizeMedicalSummary } from '../ai/providers/openai-provider.mjs'
import { currentSituationPassages, restoreCurrentSituationEvidence } from './current-situation-model.mjs'
import { situationRaw,situationOutput } from '../../tests/visit-sheet/current-situation-v2.fixture.mjs'

const input={currentSituationSources:[{id:'record:focus',text:situationRaw}]}
function compactFixture(value=situationOutput(),sources=input.currentSituationSources){
  const {byId}=currentSituationPassages(sources)
  const refs=(sourceId,quote)=>{
    const source=sources.find(source=>source.id===sourceId),start=source.text.indexOf(quote),end=start+quote.length
    const matches=[...byId.values()].filter(passage=>passage.source===source&&passage.start<end&&passage.end>start)
    return {from:matches[0].id,through:matches.at(-1).id}
  }
  return {currentSituation:Object.fromEntries(Object.entries(value.currentSituation).map(([key,rows])=>[key,rows.map(row=>{
    const result={text:row.text,...refs(row.sourceId,row.quote),emphasis:row.emphasis}
    if(key==='symptoms'){const note=row.note?refs(row.sourceId,row.noteQuote):{from:'',through:''};Object.assign(result,{label:row.label,kind:row.kind,note:row.note,noteFrom:note.from,noteThrough:note.through})}
    return result
  })]))}
}

test('摘要专属传输回填连续原话与来源，省去重复引文并保留安全强调',async()=>{
  const compact=compactFixture(),original=situationOutput();let calls=0,body
  const provider=new BailianProvider({env:{BAILIAN_API_KEY:'fixture-only',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'},logger:{info(){},warn(){}},fetchImpl:async(_,init)=>{calls++;body=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(compact)}}]})}})
  const result=await new MedicalSummaryService({provider}).generate(input,'account-a')
  assert.equal(calls,1);assert.equal(result.provider,'bailian');assert.equal(result.model,'qwen3.7-plus-2026-05-26')
  assert.equal(body.stream,false);assert.equal(body.enable_thinking,false);assert.equal(body.max_tokens,5000)
  assert.ok(JSON.stringify(compact).length<JSON.stringify(original).length*0.8)
  assert.doesNotMatch(JSON.stringify(body.response_format.json_schema.schema),/sourceId|quote/)
  assert.match(result.currentSituation.description[0].text,/有点头晕/)
  assert.ok(result.currentSituation.description[0].emphasis.includes('无头痛'))
  assert.match(result.currentSituation.symptoms[1].note,/家属怀疑/)
  assert.equal(result.currentSituation.symptoms[2].kind,'temperature')
  assert.ok(result.currentSituation.diet.some(row=>/平时/.test(row.text)))
  assert.ok(result.currentSituation.diet.some(row=>/牛肉/.test(row.text)))
})

test('已知共享否定失效只在原话分别明确否定时展开，原校验仍拒绝反转和猜测',()=>{
  const value=situationOutput();value.currentSituation.description[0].text='今早有点头晕，无头痛及发烧，体温正常。'
  assert.throws(()=>normalizeMedicalSummary(value,input),error=>error.validation.rule==='negative_subject_lost')
  const restored=restoreCurrentSituationEvidence(compactFixture(value),currentSituationPassages(input.currentSituationSources).byId)
  assert.match(normalizeMedicalSummary(restored,input).currentSituation.description[0].text,/无头痛，无发烧/)
  for(const raw of ['没有头痛，但是有发烧。','昨晚无头痛，现在头痛，未发烧。','没有头痛，不确定是不是发烧。']){
    const sources=[{id:'record:focus',text:raw}],line={text:'无头痛及发烧。',from:'p0',through:[...currentSituationPassages(sources).byId.keys()].at(-1)}
    const compact={currentSituation:{description:[line],symptoms:[],diet:[],changes:[],treatment:[],keywords:[]}}
    assert.throws(()=>restoreCurrentSituationEvidence(compact,currentSituationPassages(sources).byId),error=>error.validation.rule==='shared_negative_not_supported')
  }
})

test('短证据ID不允许跨来源、倒序、未知编号或借用另一来源的猜测',()=>{
  const sources=[...input.currentSituationSources,{id:'record:foreign',text:'家属怀疑湿疹。'}],{byId}=currentSituationPassages(sources)
  for(const change of [r=>r.currentSituation.description[0].from='private-unknown',r=>r.currentSituation.description[0].through=[...byId.keys()].at(-1),r=>{const row=r.currentSituation.description[0];[row.from,row.through]=[row.through,row.from]},r=>{const row=r.currentSituation.symptoms[1];row.noteFrom=row.noteThrough=[...byId.keys()].at(-1)}]){
    const value=compactFixture();change(value)
    assert.throws(()=>restoreCurrentSituationEvidence(value,byId),error=>error.validation.stage==='source_validation')
  }
  const number=compactFixture();number.currentSituation.symptoms[2].text='37.5℃'
  assert.throws(()=>normalizeMedicalSummary(restoreCurrentSituationEvidence(number,currentSituationPassages(input.currentSituationSources).byId),input),/Unverified summary number/)
})

test('紧凑传输的无效字段/数值仍只有一次调用，诊断和日志不泄漏模型正文',async()=>{
  for(const change of [value=>value.currentSituation.symptoms[2].text='37.5℃',value=>value.currentSituation.symptoms[1].label='private-invalid-label',value=>value.currentSituation.symptoms[0].from='private-invalid-source']){
    const output=compactFixture();change(output);const logs=[];let calls=0
    const provider=new BailianProvider({env:{BAILIAN_API_KEY:'fixture-secret',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'},logger:{info(){},warn(){}},fetchImpl:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})}})
    const service=new MedicalSummaryService({provider,logger:{warn:(...args)=>logs.push(args)}})
    await assert.rejects(()=>service.generate(input),error=>{assert.equal(error.code,'AI_MEDICAL_SUMMARY_UNAVAILABLE');assert.ok(error.validation);assert.equal(error.preview.status,'unverified');assert.doesNotMatch(JSON.stringify(error),/private-invalid|fixture-secret|37\.5|头晕|牛肉/);return true})
    assert.equal(calls,1);assert.equal(logs.length,1);assert.doesNotMatch(JSON.stringify(logs),/private-invalid|fixture-secret|37\.5|头晕|牛肉/)
  }
})
