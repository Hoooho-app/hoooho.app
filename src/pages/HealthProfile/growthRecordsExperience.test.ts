import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const basic = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')
const records = readFileSync(new URL('./GrowthRecordsPage.tsx', import.meta.url), 'utf8')
const chart = readFileSync(new URL('./GrowthCurveChart.tsx', import.meta.url), 'utf8')
const reassurance = readFileSync(new URL('./GrowthReassurancePage.tsx', import.meta.url), 'utf8')

test('成长数据二级页以曲线为首并在同页完成录入与确定性解读', () => {
  for (const copy of ['成长数据', '身高曲线', '体重曲线', '最新记录', '记录本次测量', '保存本次更新', '成长解读', '记录列表']) assert.match(basic, new RegExp(copy))
  assert.match(basic, /<GrowthCurveChart measure=\{measure\}/)
  assert.match(basic, /buildGrowthInterpretation/)
  assert.match(basic, /heightTouched|weightTouched/)
  assert.match(basic, /sessionStorage/)
  assert.match(basic, /currentMemberId !== openedMemberId/)
  assert.doesNotMatch(basic, /基础信息|血型|今日成长落点|成长安心解读/)
})

test('未保存草稿不会伪装成曲线数据，保存后才替换记录集合', () => {
  assert.match(basic, /records=\{records\}/)
  assert.match(basic, /const nextRecords = \[saved,/)
  assert.match(basic, /setRecords\(nextRecords\)/)
  assert.match(basic, /heightTouched \? Number\(height\) : dateRecord\?\.heightCm \?\? null/)
  assert.match(basic, /weightTouched \? Number\(weightKg\) : dateRecord\?\.weightKg \?\? null/)
})

test('成长记录三级页保留 CRUD 且编辑删除直接可见', () => {
  assert.match(records, /title="记录列表"/)
  assert.match(records, /growth-record-actions/)
  assert.match(records, />编辑</)
  assert.match(records, />删除</)
  assert.match(records, /window\.confirm/)
  assert.match(records, /growthMeasurementService\.delete/)
  assert.match(records, /growthMeasurementService\.update/)
  assert.match(records, /growthMeasurementService\.upsert/)
  assert.match(records, /currentMemberId !== member\.id/)
  assert.doesNotMatch(records, /MoreHorizontal|growth-record-menu|role="tablist"/)
})

test('真实测量点和最新头像支持点击、键盘与同点关闭', () => {
  assert.match(chart, /growth-chart-hit/)
  assert.match(chart, /role="button" tabIndex=\{0\}/)
  assert.match(chart, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.match(chart, /current === id \? '' : id/)
  assert.match(chart, /growth-chart-tooltip/)
  assert.match(chart, /查看最新测量点/)
  assert.match(chart, /setSelectedId\(''\)/)
  assert.doesNotMatch(chart, /fake|mock/i)
})

test('旧解读路由兼容重定向到成长数据且不再保留矛盾文案', () => {
  assert.match(reassurance, /<Navigate replace/)
  assert.match(reassurance, /to="\/health-profile\/basic"/)
  assert.match(reassurance, /selectedMeasure/)
  assert.doesNotMatch(reassurance, /位置偏下|轨迹稳定|不用担心|发育正常/)
})
