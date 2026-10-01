import test from 'node:test'
import assert from 'node:assert/strict'
import { consultationPrompt,doctorQuestionTemplates } from './consultationPrompt.ts'
import { desensitizationSummary } from './desensitizationSummary.ts'
import type { VisitSheet } from '../../types/visitSheet.ts'
import type { DesensitizationTaskDto } from '../../services/desensitizationTests.ts'
test('问诊提示词只含本次来源与显式关联资料，未知不编造，分诊仅向外部提出',()=>{
  const report={member:{gender:null,birthday:null},dataAsOf:'2026-09-30',timezone:'Asia/Shanghai',complaint:'皮疹',question:'如何复诊',focusSourceIds:['current'],questionSourceIds:[],complaintSourceId:'current',sources:[{id:'current',title:'当前',text:'未发热',occurredAt:null,createdAt:'2026-09-30',relatedSourceIds:['history']},{id:'history',title:'既往',text:'已记录牛奶过敏',occurredAt:'2026-01-01'},{id:'unrelated',title:'无关',text:'不应发送的睡眠'}]} as unknown as VisitSheet
  const result=consultationPrompt(report)
  assert.match(result,/未发热/);assert.match(result,/已记录牛奶过敏/);assert.match(result,/发生：未明确/);assert.match(result,/性别：未提供/);assert.doesNotMatch(result,/不应发送/);assert.match(result,/Hoooho 本身不输出分诊结论/)
  assert.equal(doctorQuestionTemplates.length,5)
})
test('排敏事实摘要区分方案执行未知、无症状；排除草稿撤回，不调整方案',()=>{
  const task={displayName:'鸡蛋',progressionPaused:true,currentPlan:null,records:[{id:'known',status:'effective',withdrawnAt:null,occurredAt:'2026-09-29',actualFood:'鸡蛋',amount:'1 g',symptomAnswer:'absent',exposureAnswer:'eaten',symptoms:[],note:'观察',planVersion:1},{id:'unknown',status:'effective',withdrawnAt:null,occurredAt:'2026-09-30',actualFood:'鸡蛋',amount:'',symptomAnswer:null,exposureAnswer:null,symptoms:[],note:'',planVersion:null},{id:'draft',status:'draft'},{id:'withdrawn',status:'effective',withdrawnAt:'2026-09-30'}],linkedRecords:[]} as unknown as DesensitizationTaskDto
  const result=desensitizationSummary(task)
  assert.match(result,/本地事实/);assert.match(result,/明确记录无症状/);assert.match(result,/症状 未确认/);assert.match(result,/数量 未知/);assert.match(result,/标记暂停/);assert.doesNotMatch(result,/记录 draft|记录 withdrawn/);assert.match(result,/不调整方案/)
})
