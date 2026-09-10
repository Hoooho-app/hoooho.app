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
