import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const editor = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')

test('健康档案首页提供成长身份卡和克制的过敏空态', () => {
  assert.match(home, /铸造成长身份卡/)
  assert.match(home, /更新成长数据/)
  assert.match(home, /暂无过敏信息/)
  assert.match(home, /怀疑过的，也可以先记下来/)
  assert.match(home, /记录过敏信息/)
  assert.doesNotMatch(home, /建议优先补充|搜索健康档案|重要健康事实/)
})

test('基础信息使用明确保存、克制入口和成长记录联动', () => {
  assert.match(editor, /title="基础信息"/)
  assert.match(editor, /growth-record-entry/)
  assert.match(editor, /查看记录与成长曲线/)
  assert.match(editor, /保存本次更新/)
  assert.match(editor, /已保存，并加入成长记录/)
  assert.match(editor, /growthMeasurementService\.upsert/)
  assert.doesNotMatch(editor, /今日成长落点|填写后自动保存|查看完整成长曲线|头围|腰围|体脂率/)
  assert.doesNotMatch(editor, /积分|签到|连续填写|超过.*用户/)
})

test('会员档案维持真实禁用语义且没有导航行为', () => {
  assert.match(home, /aria-disabled="true"/)
  assert.match(home, /className="health-profile-locked-row"/)
  assert.match(home, /检查 \/ 体检报告/)
  assert.match(home, /慢性病史/)
  assert.match(home, /手术史/)
  assert.match(home, /住院 \/ 急诊史/)
  assert.match(home, /家族遗传史/)
  assert.doesNotMatch(home, /心理与情绪健康|视力与听力|口腔与牙齿|疫苗接种史|长期用药|输血史/)
})
