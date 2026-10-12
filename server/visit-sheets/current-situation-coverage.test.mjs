import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeMedicalSummary} from '../ai/providers/openai-provider.mjs'
import {situationRaw,situationOutput} from '../../tests/visit-sheet/current-situation-v2.fixture.mjs'

// Captured from one owned, synthetic Staging request. This is a content-quality
// regression fixture, not a replacement provider response or production fact.
const stagingBaseline={
 description:'早上起来的时候就开始其实有点头晕但不是头疼，发烧也不发烧，然后体温是正常的。脖子那里有一个小红点，腿部其实也是有点小疹子。昨天新添加了牛肉。',
 symptoms:[{text:'头晕'},{text:'无头痛'},{kind:'temperature',text:'体温正常'},{text:'脖子小红点',note:'家属估计是痱子，不确定是热疹还是湿疹'},{text:'腿部小疹子'}],
 diet:[{text:'昨天新添加了牛肉'}],
}
const textOf=rows=>rows.map(row=>row.text).join('\n')
function quality(value){
 const description=Array.isArray(value.description)?textOf(value.description):value.description
 const symptoms=textOf(value.symptoms),diet=textOf(value.diet)
 const dizziness=value.symptoms.find(row=>/头晕/.test(row.text))?.text??''
 const skin=value.symptoms.filter(row=>/红点|疹子/.test(row.text)).map(row=>row.text).join('\n')
 return {
  conciseOverview:description.length<situationRaw.length&&!/起来的时候|其实|然后|那里/.test(description),
  onsetOnSymptom:/早上|今早|起床/.test(dizziness),
  degreeOnSymptom:/有点|轻微|轻度|略/.test(dizziness),
  negativeHeadache:/无头痛|不是头疼|没有头痛/.test(symptoms),
  normalTemperature:value.symptoms.some(row=>row.kind==='temperature'&&/正常/.test(row.text)&&!/[0-9]/.test(row.text)),
  neckObserved:/颈|脖/.test(skin),neckCount:/一个/.test(skin),
  legObserved:/腿/.test(skin),legDegree:/少量|有点/.test(skin),
  attributedUncertainty:value.symptoms.some(row=>/家属|家长/.test(row.note??'')&&/估计|怀疑|不确定/.test(row.note)&&/痱子|热疹|湿疹/.test(row.note)),
  habitualFood:/平时|日常|常吃|常规|熟悉/.test(diet),
  newFood:/新添加|首次|第一次/.test(diet)&&/牛肉/.test(diet),
 }
}
test('真实合成输出回归先复现遗漏；完整参考保留12项事实与展示质量',()=>{
 const baseline=quality(stagingBaseline)
 assert.deepEqual(Object.keys(baseline).filter(key=>!baseline[key]),['conciseOverview','onsetOnSymptom','degreeOnSymptom','neckCount','legDegree','habitualFood'])
 const input={sections:[{id:'record',lines:[`[record:focus] ${situationRaw}`]}],currentSituationSources:[{id:'record:focus',text:situationRaw}]}
 const verified=normalizeMedicalSummary(situationOutput(),input).currentSituation
 assert.deepEqual(Object.values(quality(verified)),Array(12).fill(true))
})

test('不同来源的普通饮食及新增食物都保留，不能拼接跨来源引文',()=>{
 const symptoms='午睡醒来后有点咳嗽，但没有发热。'
 const diet='昨晚只吃平时常吃的粥和青菜，第一次加了鸡蛋。'
 const sources=[{id:'record:symptom',text:symptoms},{id:'record:diet',text:diet}]
 const line=(text,quote,sourceId)=>({text,quote,sourceId,emphasis:[]})
 const response={currentSituation:{
  description:[line('午睡醒来后有点咳嗽，没有发热。',symptoms,sources[0].id)],
  symptoms:[{...line('午睡醒来后有点咳嗽，没有发热。',symptoms,sources[0].id),label:'咳嗽',kind:'symptom',note:'',noteQuote:''}],
  diet:[line('昨晚吃平时常吃的粥和青菜。','昨晚只吃平时常吃的粥和青菜',sources[1].id),line('第一次加了鸡蛋。','第一次加了鸡蛋',sources[1].id)],
  changes:[],treatment:[],keywords:[line('咳嗽','有点咳嗽',sources[0].id)],
 }}
 const input={sections:[{id:'record',lines:sources.map(source=>`[${source.id}] ${source.text}`)}],currentSituationSources:sources}
 const result=normalizeMedicalSummary(response,input).currentSituation
 assert.equal(result.diet.length,2);assert.match(textOf(result.diet),/粥和青菜/);assert.match(textOf(result.diet),/第一次加了鸡蛋/)
 assert.ok(result.diet.every(row=>row.sourceIds[0]===sources[1].id))
 const foreign=structuredClone(response);foreign.currentSituation.diet[0].sourceId=sources[0].id
 assert.throws(()=>normalizeMedicalSummary(foreign,input),error=>error.validation.rule==='quote_not_in_source')
 const spliced=structuredClone(response);spliced.currentSituation.description[0].quote=symptoms+diet
 assert.throws(()=>normalizeMedicalSummary(spliced,input),error=>error.validation.rule==='quote_not_in_source')
 const noDiet=structuredClone(response);noDiet.currentSituation.diet=[]
 const noDietInput={...input,currentSituationSources:[sources[0]]}
 assert.deepEqual(normalizeMedicalSummary(noDiet,noDietInput).currentSituation.diet,[])
 const dietOnly=structuredClone(response)
 dietOnly.currentSituation.description=[line('昨晚吃平时常吃的粥和青菜，第一次加了鸡蛋。',diet,sources[1].id)]
 dietOnly.currentSituation.symptoms=[];dietOnly.currentSituation.keywords=[]
 const dietOnlyResult=normalizeMedicalSummary(dietOnly,{...input,currentSituationSources:[sources[1]]}).currentSituation
 assert.deepEqual(dietOnlyResult.symptoms,[]);assert.deepEqual(dietOnlyResult.keywords,[])
 assert.equal(dietOnlyResult.diet.length,2);assert.match(textOf(dietOnlyResult.description),/粥和青菜/)
})
