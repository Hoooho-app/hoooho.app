import assert from 'node:assert/strict'
import test from 'node:test'
import {buildVisitSheet} from './report-model.mjs'
import {visitFixture} from './fixtures.mjs'
import {shanghaiWeek,weeklyTemperature} from './weekly-temperature.mjs'
import {normalizeMedicalSummary} from '../ai/providers/openai-provider.mjs'
const now=new Date('2026-10-14T02:00:00Z')

test('描述合并和人工编辑后，另一句的强调不能拆开无头痛，缓存正文与原话保留',()=>{
 const f=visitFixture(),raw='早上有头痛。晚上无头痛。',sourceId='record:focus'
 f.records=[{id:'focus',accountId:f.member.accountId,eventId:'event-a',type:'symptom',content:raw,sourceText:raw,occurredAt:'2026-10-13T00:00:00Z'}]
 const focus={mode:'source',sourceId},before=buildVisitSheet(f,{focus},now)
 const line=(text,emphasis)=>({text,quote:text,sourceId,emphasis})
 const value=normalizeMedicalSummary({currentSituation:{description:[line('早上有头痛。',['头痛']),line('晚上无头痛。',[])],symptoms:[],diet:[],changes:[],treatment:[],keywords:[]}},{currentSituationSources:[{id:sourceId,text:raw}]}).currentSituation
 const preferences={focus,currentSituationResults:{[before.photoKey]:{fingerprint:before.currentSituation.sourceFingerprint,value,provider:'bailian',model:'fixture'}}}
 const report=buildVisitSheet(f,preferences,now)
 assert.equal(report.currentSituation.description,raw);assert.deepEqual(report.currentSituation.descriptionEmphasis,[]);assert.equal(report.currentSituation.raw[0].text,raw)
 const edited=buildVisitSheet(f,{...preferences,currentSituationEdits:{[before.photoKey]:{description:'用户编辑：无头痛。'}}},now)
 assert.equal(edited.currentSituation.description,'用户编辑：无头痛。');assert.deepEqual(edited.currentSituation.descriptionEmphasis,[]);assert.equal(edited.currentSituation.raw[0].text,raw)
})

test('重新查询跨周或发生时间编辑/删除后，不能保留旧周曲线资格',()=>{
 const f=visitFixture();f.records=['a','b'].map((id,i)=>({id,eventId:'event-a',type:'temperature',content:'体温 37℃',occurredAt:`2026-10-12T0${i}:00:00Z`,createdAt:'2026-10-14T00:00:00Z'}))
 assert.equal(weeklyTemperature(f,now).points.length,2)
 assert.equal(weeklyTemperature(f,new Date('2026-10-18T16:00:00Z')).points.length,0)
 f.records[0].occurredAt='2026-10-11T15:59:59Z'
 assert.deepEqual(weeklyTemperature(f,now).points.map(p=>p.sourceId),['record:b'])
 f.records[1].deletedAt='2026-10-14T01:00:00Z'
 assert.equal(weeklyTemperature(f,now).points.length,0)
})

test('同文主诉分组时原话来源优先当前选择，不能错指较早记录',()=>{
 const f=visitFixture();f.records=[{id:'old',eventId:'event-a',type:'symptom',content:'今早有点头晕',sourceText:'今早有点头晕',occurredAt:'2026-10-12T00:00:00Z'},{id:'selected',eventId:'event-a',type:'symptom',content:'今早有点头晕',sourceText:'今早有点头晕',occurredAt:'2026-10-13T00:00:00Z'}]
 const report=buildVisitSheet(f,{focus:{mode:'source',sourceId:'record:selected'}},now)
 assert.equal(report.currentSituation.raw[0].sourceId,'record:selected')
})
test('上海周一边界、有效发生时间、同温不同记录和重复身份',()=>{
  assert.deepEqual(shanghaiWeek(new Date('2026-10-11T15:59:59Z')),{from:'2026-10-04T16:00:00.000Z',to:'2026-10-11T16:00:00.000Z'})
  assert.deepEqual(shanghaiWeek(new Date('2026-10-11T16:00:00Z')),{from:'2026-10-11T16:00:00.000Z',to:'2026-10-18T16:00:00.000Z'})
  const f=visitFixture(),measure=(id,at,content='体温 37℃',extra={})=>({id,eventId:'event-a',type:'temperature',content,occurredAt:at,createdAt:at,...extra})
  f.records=[];assert.equal(weeklyTemperature(f,now).points.length,0)
  f.records=[measure('a','2026-10-11T16:00:00Z')];assert.equal(weeklyTemperature(f,now).points.length,1)
  f.records.push(measure('b','2026-10-13T08:00:00Z'),f.records[0],measure('normal','2026-10-12T08:00:00Z','体温正常，未发热'),measure('missing',null),measure('old','2026-10-11T15:59:59Z'),measure('future','2026-10-18T16:00:00Z'),measure('deleted','2026-10-12T08:00:00Z',undefined,{deletedAt:'2026-10-13'}),measure('foreign','2026-10-12T08:00:00Z',undefined,{eventId:'foreign'}),measure('invalid','2026-10-12T08:00:00Z','体温 37℃',{journal:{symptom:{symptomSpecificData:{currentTemperature:NaN}},timePrecision:'unknown'}}))
  f.records.reverse()
  assert.deepEqual(weeklyTemperature(f,now).points.map(p=>[p.sourceId,p.value]),[['record:a',37],['record:b',37]])
  f.records=f.records.filter(r=>r.id!=='b');assert.equal(weeklyTemperature(f,now).points.length,1)
  f.member={...f.member,id:'child-b'};assert.deepEqual(weeklyTemperature(f,now).points,[])
})
test('完整否定、程度与猜测来自保存事实，饮食不生成因果，原文保留',()=>{
  const f=visitFixture(),raw='今早起床后有点头晕。无头痛。体温正常。颈部一个小红点，腿部少量小疹子。家属怀疑湿疹。昨日新添加牛肉。'
  f.records=[{id:'focus',eventId:'event-a',type:'symptom',content:raw,sourceText:raw,occurredAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',journal:{categories:['symptom'],symptom:{narrative:raw,linkedRecordIds:{diet:['diet']}}}},{id:'diet',eventId:'event-a',type:'note',content:'昨日新添加牛肉',occurredAt:'2026-10-12T00:00:00Z',journal:{categories:['diet'],timeLabel:'昨日',diet:{firstTryFoods:['牛肉']}}}]
  f.organizations=[{recordId:'focus',sourceRecordUpdatedAt:f.records[0].updatedAt,healthAIOutput:{facts:[['symptom','今早起床后有点头晕','affirmed'],['symptom','无头痛','negated'],['temperature','体温正常','affirmed'],['symptom','颈部一个小红点，腿部少量小疹子','affirmed'],['concern','家属怀疑湿疹','uncertain']].map(([type,originalText,polarity])=>({type,originalText,name:originalText,polarity,bodyPart:type==='concern'?'皮肤':null,subject:'event_subject'}))}}]
  const r=buildVisitSheet(f,{focus:{mode:'source',sourceId:'record:focus'}},now),s=r.currentSituation
  assert.equal(s.raw[0].text,raw)
  assert.ok(s.description.includes('无头痛'));assert.ok(s.description.includes('有点头晕'));assert.ok(s.description.includes('昨日，新添加牛肉'))
  assert.ok(!s.description.includes('怀疑湿疹'))
  assert.ok(s.symptoms.some(l=>l.text==='家属怀疑湿疹'))
  assert.ok(s.symptoms.find(l=>l.text==='无头痛').emphasize)
  assert.deepEqual(s.treatment,[])
  assert.ok(!JSON.stringify(s).includes('过敏'))
  assert.deepEqual(weeklyTemperature(f,now).points,[])
  const edited=buildVisitSheet(f,{...r,currentSituationEdits:{[s.scopeKey]:{description:'手动重点：无头痛',symptoms:'手动症状'}}},now)
  assert.equal(edited.currentSituation.description,'手动重点：无头痛');assert.equal(edited.currentSituation.symptoms[0].text,'手动症状');assert.deepEqual(edited.currentSituation.diet,s.diet);assert.deepEqual(edited.currentSituation.raw,s.raw)
  const switched=buildVisitSheet(f,{...edited,focus:{mode:'custom',text:'另一次关注'}},now)
  assert.notEqual(switched.currentSituation.description,edited.currentSituation.description)
  const back=buildVisitSheet(f,{...switched,focus:r.focus},now)
  assert.equal(back.currentSituation.description,edited.currentSituation.description)
  f.organizations[0].sourceRecordUpdatedAt='old';f.records[0].journal.symptom.linkedRecordIds={}
  const legacy=buildVisitSheet(f,{focus:r.focus},now)
  assert.equal(legacy.currentSituation.description,raw);assert.deepEqual(legacy.currentSituation.symptoms,[]);assert.deepEqual(legacy.currentSituation.diet,[])
})
test('已确认整理事项的同一组饮食、已做处理可读取，无关饮食不纳入',()=>{
 const f=visitFixture(),at='2026-10-13T00:00:00Z',raw='颈部有点红。昨日新添加牛肉。涂过保湿霜，效果不确定。'
 f.records=[{id:'sym',eventId:'event-a',type:'symptom',content:'颈部有点红',sourceText:raw,occurredAt:at,journal:{categories:['symptom'],symptom:{narrative:'颈部有点红'},aiNurse:{turns:[{id:'u',role:'user',text:raw}],professionalNotes:[{category:'prior_action',text:'涂过保湿霜，效果不确定',sourceTurnIds:['u'],certainty:'uncertain'}]}},aiProvenance:{confirmed:true,groupKey:'confirmed-group',category:'symptom',fields:[{name:'symptom',value:'颈部有点红',sources:[{quote:'颈部有点红'}]}]}},{id:'diet',eventId:'event-a',type:'note',content:'牛肉',sourceText:raw,occurredAt:at,aiProvenance:{confirmed:true,groupKey:'confirmed-group',category:'diet',timeText:'昨日',fields:[{name:'food',value:'新添加牛肉',sources:[{quote:'昨日新添加牛肉'}]}]}},{id:'other-diet',eventId:'event-a',type:'note',content:'无关香蕉',occurredAt:at,journal:{categories:['diet'],diet:{foods:['香蕉']}}}]
 const r=buildVisitSheet(f,{focus:{mode:'source',sourceId:'record:sym'}},now)
 assert.deepEqual(r.currentSituation.diet.map(l=>l.text),['昨日，新添加牛肉'])
 assert.deepEqual(r.currentSituation.treatment.map(l=>l.text),['涂过保湿霜，效果不确定'])
 assert.ok(!JSON.stringify(r.currentSituation).includes('香蕉'))
})
