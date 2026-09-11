import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const editor = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')
const form = readFileSync(new URL('./growthCardForm.ts', import.meta.url), 'utf8')

test('健康档案首页提供成长身份卡和克制的过敏空态', () => {
  assert.match(home, /铸造成长身份卡/)
  assert.match(home, /更新成长数据/)
  assert.match(home, /暂无已知反应/)
  assert.match(home, /不确定过敏原也可以先记录症状/)
  assert.match(home, /记录第一次反应/)
  assert.doesNotMatch(home, /建议优先补充|搜索健康档案|重要健康事实/)
})

test('基础信息改为自动保存并保留失败重试', () => {
  assert.match(editor, /看看今天长到哪里了/)
  assert.match(editor, /保存中…/)
  assert.match(editor, /已保存/)
  assert.match(editor, /保存失败，点击重试/)
  assert.match(editor, /growthMeasurementService\.upsert/)
  assert.doesNotMatch(editor, /保存成长快照|补充更多信息|头围|腰围|体脂率/)
  assert.doesNotMatch(editor, /积分|签到|连续填写|超过.*用户/)
})

test('会员档案维持真实禁用语义且没有导航行为', () => {
  assert.match(home, /aria-disabled="true"/)
  assert.match(home, /className="health-profile-locked-row"/)
})
