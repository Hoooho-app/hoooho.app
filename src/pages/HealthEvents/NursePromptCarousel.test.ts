import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canScheduleNursePromptAdvance,
  nextNursePromptIndex,
  nursePromptHoldDuration,
  nursePromptMessages,
  nursePromptReducedTransitionDuration,
  nursePromptTransitionDuration
} from './nursePromptMessages.ts'

test('护士提示严格使用指定五句并从第一句开始', () => {
  assert.deepEqual(nursePromptMessages, [
    '不舒服就记下来',
    '不用一次说完，有空了再补上',
    '症状加重还是减轻，我们帮你记清',
    '把重要信息整理清楚，去医院不慌',
    '让AI或医生一分钟看懂发生了什么'
  ])
})

test('护士提示按照固定顺序循环且没有随机分支', () => {
  const sequence = [0]
  for (let index = 0; index < 6; index += 1) sequence.push(nextNursePromptIndex(sequence.at(-1)!))
  assert.deepEqual(sequence, [0, 1, 2, 3, 4, 0, 1])
})

test('护士提示使用两秒停留和克制的切换时长', () => {
  assert.equal(nursePromptHoldDuration, 2000)
  assert.equal(nursePromptTransitionDuration, 320)
  assert.equal(nursePromptReducedTransitionDuration, 120)
})

test('听写、切换中和后台状态都不会安排下一次轮播', () => {
  assert.equal(canScheduleNursePromptAdvance(false, true, false), true)
  assert.equal(canScheduleNursePromptAdvance(true, true, false), false)
  assert.equal(canScheduleNursePromptAdvance(false, false, false), false)
  assert.equal(canScheduleNursePromptAdvance(false, true, true), false)
})
