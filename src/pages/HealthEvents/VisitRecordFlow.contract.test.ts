import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const flow = readFileSync(new URL('./VisitRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('visit entry opens a direct continuous form with the fixed field order', () => {
  assert.match(recorder, /category === 'visit' \? 'visit-form'/)
  assert.match(flow, /<h1>记录就医<\/h1>/)
  for (const label of ['怎么就医？', '为什么去？', '去了哪里？', '看了哪个科？', '就医结果与资料（选填）', '就医时间', '保存记录']) assert.ok(flow.includes(label), label)
  assert.ok(flow.indexOf('就医时间') < flow.lastIndexOf('保存记录'))
})

test('visit documents keep the requested factual safety boundary', () => {
  assert.match(flow, /limit=\{6\}/)
  assert.match(flow, /识别结果待核对/)
  assert.match(flow, /当前人物还没有可关联的症状记录/)
  assert.doesNotMatch(flow, /GPS|地图|推荐医院|推荐科室|AI已确认|诊断已核验|治疗建议/)
})

test('visit details stay scoped to allergy care without redundant fields', () => {
  for (const department of ['变态反应科', '儿科', '儿童皮肤科', '儿童呼吸科', '儿童消化科', '儿童耳鼻喉科', '儿童眼科', '其他', '不清楚']) assert.match(flow, new RegExp(`'${department}'`))
  for (const department of ['急诊科', '皮肤科', '呼吸科', '消化科', '耳鼻喉科', '眼科', '过敏相关门诊']) assert.doesNotMatch(flow, new RegExp(`'${department}'`))
  assert.match(flow, /医生怎么说？（医嘱）/)
  assert.doesNotMatch(flow, /医生姓名（选填）|从相册选择|备注（选填）/)
})
