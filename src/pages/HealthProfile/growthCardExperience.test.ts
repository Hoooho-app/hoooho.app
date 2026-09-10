import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const editor = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')

test('健康档案首页提供成长身份卡和克制的过敏空态', () => {
  assert.match(home, /生成成长身份卡/)
  assert.match(home, /更新成长数据/)
  assert.match(home, /暂无已知反应/)
  assert.match(home, /不确定过敏原也可以先记录症状/)
  assert.match(home, /记录第一次反应/)
  assert.doesNotMatch(home, /建议优先补充|搜索健康档案|重要健康事实/)
})

test('首次建立与后续更新使用不同反馈并保留失败输入', () => {
  assert.match(editor, /基础档案已建立/)
  assert.match(editor, /成长数据已更新/)
  assert.match(editor, /继续补充出生信息/)
  assert.match(editor, /catch \(submitError\)/)
  assert.doesNotMatch(editor, /积分|签到|连续填写|超过.*用户/)
})

test('会员档案维持真实禁用语义且没有导航行为', () => {
  assert.match(home, /aria-disabled="true"/)
  assert.match(home, /className="health-profile-locked-row"/)
})
