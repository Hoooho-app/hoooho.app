import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const basic = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')
const records = readFileSync(new URL('./GrowthRecordsPage.tsx', import.meta.url), 'utf8')
const chart = readFileSync(new URL('./GrowthCurveChart.tsx', import.meta.url), 'utf8')
const reassurance = readFileSync(new URL('./GrowthReassurancePage.tsx', import.meta.url), 'utf8')

test('基础页只保留核心字段、单行血型和自动保存状态', () => {
  for (const copy of ['看看今天长到哪里了', '填写后自动保存', '保存失败，点击重试', '测量日期']) assert.match(basic, new RegExp(copy))
  for (const removed of ['头围', '腰围', '出生身长', '体脂率', '补充更多信息', '保存成长快照']) assert.doesNotMatch(basic, new RegExp(removed))
  assert.match(basic, /abo === value \? '' : value/)
  assert.match(basic, /selectRh\(''\)/)
})

test('成长记录包含历史 CRUD、双曲线和标准说明', () => {
  for (const copy of ['记录列表', '体重曲线', '世界卫生组织儿童生长标准', '原始测量数据不会改变']) assert.match(records, new RegExp(copy))
  assert.match(records, /growthMeasurementService\.delete/)
  assert.match(records, /growthMeasurementService\.update/)
  assert.match(records, /growthMeasurementService\.upsert/)
})

test('成长动效绑定真实 SVG 路径并尊重 reduced motion', () => {
  assert.match(chart, /animateMotion/)
  assert.match(chart, /path=\{model\.animationPath\}/)
  assert.match(chart, /prefers-reduced-motion/)
  assert.match(chart, /model\.points\.map/)
  assert.doesNotMatch(chart, /fake|mock/i)
})

test('安心解读先解释、确认测量、看轨迹，再关联真实健康记录', () => {
  for (const copy of ['位置偏下，不等于长得不好', '数据确认无误', '已关联的真实记录', '不替代医生判断']) assert.match(reassurance, new RegExp(copy))
  assert.match(reassurance, /event\.memberId === member\.id/)
})
