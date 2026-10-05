import test from 'node:test'
import assert from 'node:assert/strict'
import {doctorBriefText,matchingSources} from './reportCopy'
import type {VisitSheet,VisitSource} from '../../types/visitSheet'
test('来源编号大小写检索与真实匹配数',()=>{
 const sources=[{id:'record:a',code:'SRC-213',text:'观察',title:'皮肤',occurredAt:'2026-09-27'}] as VisitSource[]
 assert.equal(matchingSources(sources,'src-213').length,1)
 assert.equal(matchingSources(sources,'2026-09-27').length,1)
 assert.equal(matchingSources(sources,'无匹配').length,0)
})
test('默认医生重点不包含旧问题、历史报告、修订或无关计划',()=>{
 const report={member:{name:'合成人物',gender:'female',birthday:'2024-01-01'},dataAsOf:'2026-09-27T00:00:00Z',timezone:'Asia/Shanghai',version:1,scope:'当前可访问资料',focusSourceIds:['current'],questionSourceIds:[],complaint:'当前皮肤红点',question:'如何核对',chapters:[{id:'course',title:'病程',overview:{items:[{title:'当前皮肤红点',detail:'9/27记录',sourceIds:['current']},{title:'旧痒疹问题',detail:'历史',sourceIds:['old']}]}}],sources:[{id:'current',category:'course',code:'SRC-001'},{id:'old',category:'legacy',text:'历史私人位置',code:'SRC-002'}],gaps:[],changes:[{before:'历史编辑'}]} as unknown as VisitSheet
 const brief=doctorBriefText(report)
 assert.match(brief,/当前皮肤红点/);assert.match(brief,/SRC-001/);assert.doesNotMatch(brief,/旧痒疹问题|历史私人位置|历史编辑|SRC-002/)
})
