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
  onsetOnSymptom:/今早|早上|早晨|清晨|晨起/.test(dizziness)&&/开始|出现|初现|起病|起床后|起来后|醒来后|睡醒后|晨起/.test(dizziness),
  degreeOnSymptom:/有点|有些|稍(?:微)?|轻微|轻度|少许|些许|一点/.test(dizziness),
  negativeHeadache:/(?:无|没有|不是|不|未)(?:明显|出现|有)?头(?:痛|疼)|头(?:痛|疼)(?:没有|不)/.test(symptoms),
  normalTemperature:value.symptoms.some(row=>row.kind==='temperature'&&/正常/.test(row.text)&&!/[0-9]/.test(row.text)),
  neckObserved:/颈|脖/.test(skin),neckCount:/一个/.test(skin),
  legObserved:/腿/.test(skin),legDegree:/少量|有点|有些|稍(?:微)?|少许|些许/.test(skin),
  attributedUncertainty:value.symptoms.some(row=>/家属|家长|记录者|用户|本人/.test(row.note??'')&&/怀疑|估计|猜测|猜想|推测|可能|疑似|不确定|不知道|待核对/.test(row.note)&&/痱子|热疹|湿疹/.test(row.note)),
  habitualFood:/平时|日常|常吃|通常|原有|常规|既往|以往|以前|食用过|吃过|熟悉/.test(diet),
  newFood:/新添加|新加|首次|初次|第一次/.test(diet)&&/牛肉/.test(diet),
  overviewBodyObservations:/(?:颈|脖)/.test(description)&&/腿/.test(description),
 }
}
test('真实合成输出回归先复现遗漏；完整参考保留13项事实与展示质量',()=>{
 const baseline=quality(stagingBaseline)
 assert.deepEqual(Object.keys(baseline).filter(key=>!baseline[key]),['conciseOverview','onsetOnSymptom','degreeOnSymptom','neckCount','legDegree','habitualFood'])
 const input={sections:[{id:'record',lines:[`[record:focus] ${situationRaw}`]}],currentSituationSources:[{id:'record:focus',text:situationRaw}]}
 const verified=normalizeMedicalSummary(situationOutput(),input).currentSituation
 assert.deepEqual(Object.values(quality(verified)),Array(13).fill(true))
})

test('内容评估识别同义程度及记录者归属，开始动作和程度遗漏仍失败',()=>{
 const input={currentSituationSources:[{id:'record:focus',text:situationRaw}]},value=situationOutput()
 value.currentSituation.symptoms[0].text='晨起后开始有些头晕，无头疼。'
 value.currentSituation.symptoms[1].text='颈部有一个小红点，腿部有些小疹子。'
 value.currentSituation.symptoms[1].note='记录者推测是痱子，也不确定是否为热疹或湿疹。'
 value.currentSituation.diet[0].text='吃的是平时原有食物。';value.currentSituation.diet[1].text='新加了牛肉。'
 assert.deepEqual(Object.values(quality(normalizeMedicalSummary(value,input).currentSituation)),Array(13).fill(true))
 const missing=structuredClone(value);missing.currentSituation.symptoms[0].text='早上有些头晕，无头疼。'
 assert.equal(quality(normalizeMedicalSummary(missing,input).currentSituation).onsetOnSymptom,false)
 missing.currentSituation.symptoms[0].text='晨起后开始头晕，无头疼。'
 assert.equal(quality(normalizeMedicalSummary(missing,input).currentSituation).degreeOnSymptom,false)
})

test('真实未验证预览的标签长引文复现否定校验，精确症状引文保持严格核验',()=>{
 const input={sections:[{id:'record',lines:[`[record:focus] ${situationRaw}`]}],currentSituationSources:[{id:'record:focus',text:situationRaw}]}
 const value=situationOutput()
 value.currentSituation.keywords[0].quote='早上起来的时候就开始其实有点头晕但不是头疼'
 assert.throws(()=>normalizeMedicalSummary(value,input),error=>error.validation.fieldPath==='/currentSituation/keywords/0/text'&&error.validation.rule==='negative_lost')
 value.currentSituation.keywords[0].quote='有点头晕'
 assert.equal(normalizeMedicalSummary(value,input).currentSituation.keywords[0].text,'头晕')
 const observed=structuredClone(value)
 observed.currentSituation.symptoms[0].text='头晕：早上起来的时候开始，不是头疼。'
 const baseline=quality(normalizeMedicalSummary(observed,input).currentSituation)
 assert.equal(baseline.degreeOnSymptom,false)
 assert.equal(quality(normalizeMedicalSummary(value,input).currentSituation).degreeOnSymptom,true)
 const negated=structuredClone(value)
 negated.currentSituation.keywords[0].text='头痛';negated.currentSituation.keywords[0].quote='不是头疼'
 assert.throws(()=>normalizeMedicalSummary(negated,input))
})

test('真实未验证预览的饮食误入症状复现拒绝，食品保留在饮食块',()=>{
 const input={sections:[{id:'record',lines:[`[record:focus] ${situationRaw}`]}],currentSituationSources:[{id:'record:focus',text:situationRaw}]}
 const value=situationOutput(),food={text:'昨天饮食均为平时吃的东西，新添加了牛肉。',sourceId:'record:focus',quote:'昨天没给他吃太多什么不正常的东西，都是他平时吃的东西，只有牛肉是新添加的',emphasis:[],label:'饮食',kind:'symptom',note:'',noteQuote:''}
 value.currentSituation.symptoms.push(food,structuredClone(food))
 assert.throws(()=>normalizeMedicalSummary(value,input),error=>error.validation.fieldPath==='/currentSituation/symptoms/3/label'&&error.validation.rule==='unverified_label')
 value.currentSituation.symptoms.splice(3)
 const result=normalizeMedicalSummary(value,input).currentSituation
 assert.equal(result.symptoms.length,3);assert.equal(result.diet.length,2)
 assert.deepEqual(Object.values(quality(result)),Array(13).fill(true))
 const missingOverview=structuredClone(result)
 missingOverview.description=[{text:'早上起来时开始有点头晕，无头疼。体温正常，无发烧。'}]
 assert.equal(quality(missingOverview).overviewBodyObservations,false)
})

test('真实预览的合并否定、第一人称猜测与遗漏体温仍须分别核对',()=>{
 const input={currentSituationSources:[{id:'record:focus',text:situationRaw}]}
 const observed=situationOutput();observed.currentSituation.description[0].text='早上起来时出现头晕，无头痛及发烧，体温正常。'
 assert.throws(()=>normalizeMedicalSummary(observed,input),error=>error.validation.rule==='negative_subject_lost')
 const unattributed=situationOutput();unattributed.currentSituation.symptoms[1].note='我估计是痱子，不知道是热疹还是湿疹'
 assert.throws(()=>normalizeMedicalSummary(unattributed,input),error=>error.validation.rule==='guess_attribution_missing')
 const missing=situationOutput();missing.currentSituation.symptoms.splice(2);missing.currentSituation.symptoms[0].text='早上起来时开始头晕，不是头疼。'
 const checks=quality(normalizeMedicalSummary(missing,input).currentSituation)
 assert.equal(checks.degreeOnSymptom,false);assert.equal(checks.normalTemperature,false)
 assert.deepEqual(Object.values(quality(normalizeMedicalSummary(situationOutput(),input).currentSituation)),Array(13).fill(true))
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
