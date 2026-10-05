import test from 'node:test'
import assert from 'node:assert/strict'
import { visitAISources,visitAISummaryInput } from './visit-ai-summary.mjs'
import { normalizeMedicalSummary } from '../ai/providers/openai-provider.mjs'
test('已知性别年龄进入去标识输入，发生日期不能被录入日期替代',()=>{
 const report={member:{name:'合成人物',gender:'female',birthday:'2024-01-01'},dataAsOf:'2026-09-28T00:00:00Z',timezone:'Asia/Shanghai',complaint:'皮肤红点',question:'核对经过',focusSourceIds:['record:spot'],sources:[{id:'record:spot',code:'SRC-001',category:'course',text:'大腿有红点',occurredAt:'2026-09-23T18:30:00Z',createdAt:'2026-09-27T00:00:00Z',identity:'家长记录'}]}
 const input=visitAISummaryInput(report),serialized=JSON.stringify(input)
 assert.match(serialized,/女/);assert.match(serialized,/2岁8个月/);assert.match(serialized,/2026-09-24/);assert.doesNotMatch(serialized,/合成人物/)
 const quote=input.sections.find(s=>s.id==='record').lines[0]
 const good={overview:'9月24日大腿有红点',keyPoints:[{text:'9月24日大腿有红点',sectionId:'record',quote}],missingInformation:[]}
 assert.doesNotThrow(()=>normalizeMedicalSummary(good,input))
 assert.throws(()=>normalizeMedicalSummary({...good,keyPoints:[{...good.keyPoints[0],text:'9月27日大腿有红点'}]},input),/date/i)
 assert.throws(()=>normalizeMedicalSummary({...good,missingInformation:['性别和年龄尚未提供']},input),/known/i)
})
test('焦点、正反向明确关联都纳入，无关背景不发送，原文不截断',()=>{const report={member:{name:'测试人物'},complaint:'皮疹',question:'核对经过',focusSourceIds:['focus'],sources:[{id:'focus',category:'record',relatedSourceIds:['visit'],text:'原文'.repeat(600),identity:'家长记录'},{id:'profile',category:'history',relatedSourceIds:['focus'],text:'相关背景',identity:'档案'},{id:'visit',category:'visits',text:'医生原话',identity:'医生'},{id:'unrelated',category:'history',text:'无关背景',identity:'档案'}]};assert.deepEqual(visitAISources(report).map(s=>s.id),['focus','profile','visit']);assert.match(JSON.stringify(visitAISummaryInput(report)),new RegExp('原文'.repeat(600)));assert.doesNotMatch(JSON.stringify(visitAISummaryInput(report)),/无关背景/)})
