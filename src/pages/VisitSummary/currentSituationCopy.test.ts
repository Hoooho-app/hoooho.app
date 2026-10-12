import assert from 'node:assert/strict'
import test from 'node:test'
import {currentSituationText,descriptionParts} from './currentSituationCopy'
import {doctorBriefText} from './reportCopy'
import type {VisitSheet} from '../../types/visitSheet'
test('重点复制使用当前人工修改，保持分块顺序和完整否定高亮',()=>{
 const r={member:{name:'合成人物'},timezone:'Asia/Shanghai',version:1,dataAsOf:'2026-10-12',scope:'当前情况',focusSourceIds:[],sources:[],chapters:[],complaint:'头晕',question:'原本问题',currentSituation:{scopeKey:'case',description:'有点头晕。无头痛。体温正常。昨日新添加牛肉。',symptoms:[{text:'无头痛',emphasize:true,sourceIds:[]},{text:'体温正常',emphasize:true,kind:'temperature',sourceIds:[]}],diet:[{text:'昨日新添加牛肉',sourceIds:[]}],changes:[],treatment:[],raw:[{text:'完整原话，不是摘要',sourceId:'raw'}]}} as unknown as VisitSheet
 const parts=descriptionParts(r)
 assert.deepEqual(parts.filter(p=>p.emphasize).map(p=>p.text),['无头痛','体温正常','昨日新添加牛肉'])
 assert.equal(parts.map(p=>p.text).join(''),r.currentSituation!.description)
 const copy=currentSituationText(r);assert.ok(copy.indexOf('情况描述')<copy.indexOf('症状表现'));assert.ok(copy.indexOf('症状表现')<copy.indexOf('近期饮食'));assert.doesNotMatch(copy,/未处理|无变化|未提供/)
 r.currentSituation!.description='人工修改：无头痛'
 assert.match(doctorBriefText(r),/情况描述：人工修改：无头痛/);assert.match(doctorBriefText(r),/本次想问：\n原本问题/)
 assert.equal(r.currentSituation!.raw[0].text,'完整原话，不是摘要')
})
