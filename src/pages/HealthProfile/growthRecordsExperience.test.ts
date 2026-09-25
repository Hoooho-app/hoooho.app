import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const basic = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')
const records = readFileSync(new URL('./GrowthRecordsPage.tsx', import.meta.url), 'utf8')
const chart = readFileSync(new URL('./GrowthCurveChart.tsx', import.meta.url), 'utf8')
const reassurance = readFileSync(new URL('./GrowthReassurancePage.tsx', import.meta.url), 'utf8')

test('基础页只保留成长核心字段和明确保存状态', () => {
  for (const copy of ['基础信息', '更新成长数据', '保存本次更新', '测量日期']) assert.match(basic, new RegExp(copy))
  for (const removed of ['头围', '腰围', '出生身长', '体脂率', '补充更多信息', '保存成长快照', '血型', 'Rh血型']) assert.doesNotMatch(basic, new RegExp(removed))
  assert.match(basic, /体重减少0\.1千克/)
  assert.match(basic, /growthMeasurementService\.upsert/)
})

test('成长记录包含历史 CRUD 和双曲线', () => {
  for (const copy of ['记录列表', '体重曲线']) assert.match(records, new RegExp(copy))
  assert.match(records, /growthMeasurementService\.delete/)
  assert.match(records, /growthMeasurementService\.update/)
  assert.match(records, /growthMeasurementService\.upsert/)
})

test('成长动效绑定真实 SVG 路径并尊重 reduced motion', () => {
  assert.match(chart, /animateMotion/)
  assert.match(chart, /path=\{model\.animationPath\}/)
  assert.match(chart, /const animationPoints = \[\{ age: 0/)
  assert.match(chart, /animationDone && model\.points\.length/)
  assert.match(chart, /prefers-reduced-motion/)
  assert.match(chart, /model\.points\.map/)
  assert.doesNotMatch(chart, /sessionStorage|replayKey/)
  assert.doesNotMatch(chart, /fake|mock/i)
})

test('成长曲线标题显示身高数值并移除重播入口和状态说明卡', () => {
  assert.match(records, /`身高 \$\{latestHeight\?\.heightCm \?\? '—'\} cm`/)
  assert.doesNotMatch(records, /重看成长轨迹|重看轨迹|growth-current-reading|轨迹稳定|先看孩子自己的变化/)
})

test('身高和体重曲线把百分位并入标题并移除重复说明', () => {
  assert.match(records, /curvePosition\?\.percentileLabel/)
  assert.doesNotMatch(chart, /growth-chart-selected|selectedId|setSelectedId/)
  for (const removed of ['参考标准：', 'WHO Child Growth Standards', '单次位置不代表成长趋势']) assert.doesNotMatch(records, new RegExp(removed))
})

test('安心解读先解释、确认测量、看轨迹，再关联真实健康记录', () => {
  for (const copy of ['位置偏下，不等于长得不好', '数据确认无误', '已关联的真实记录', '不替代医生判断']) assert.match(reassurance, new RegExp(copy))
  assert.match(reassurance, /event\.memberId === member\.id/)
})
