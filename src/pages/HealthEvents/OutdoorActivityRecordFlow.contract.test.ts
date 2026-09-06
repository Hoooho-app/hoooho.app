import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source = readFileSync(new URL('./OutdoorActivityRecordFlow.tsx', import.meta.url), 'utf8')
test('outdoor form preserves required content order, photo limit and draft', () => {
  for (const label of ['推车外出', '自由玩耍', '骑行或滑步车', '草木或花粉', '烟雾或明显气味', '摔倒或受伤', '没有特别发现']) assert.match(source, new RegExp(label))
  assert.ok(source.indexOf('<OutdoorPhotos') < source.indexOf('活动时的状态'))
  assert.ok(source.indexOf('label="记录时间"') < source.indexOf('保存记录'))
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6\)/)
  assert.match(source, /capture="environment"/)
  assert.match(source, /hoooho-outdoor-activity-draft:/)
  assert.doesNotMatch(source, /去了哪里|填写具体时长|具体时长小时|具体时长分钟/)
  assert.doesNotMatch(source, /热量|步数|配速|心率|GPS|过敏原|自动诊断/)
})
