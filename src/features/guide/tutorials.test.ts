import assert from 'node:assert/strict'
import test from 'node:test'
import { getGuideTutorial, guideTutorials, searchGuideTutorials } from './tutorials.ts'

test('教程搜索匹配自然语言、关键词和标点差异', () => {
  assert.equal(searchGuideTutorials('怎么记录体温')[0]?.id, 'create-event')
  assert.equal(searchGuideTutorials('怎么，给家人记录？')[0]?.id, 'add-family-member')
  assert.equal(searchGuideTutorials('准备问医生')[0]?.id, 'prepare-doctor')
  assert.equal(searchGuideTutorials('修改识别不准确的内容')[0]?.id, 'correct-recognition')
})

test('场景筛选只返回对应教程', () => {
  const family = searchGuideTutorials('', 'family')
  assert.ok(family.length >= 4)
  assert.ok(family.every((tutorial) => tutorial.filterIds.includes('family')))
})

test('所有教程跳转到真实站内路径且核心教程都有媒体', () => {
  assert.ok(guideTutorials.every((tutorial) => tutorial.actionTo.startsWith('/') && !tutorial.actionTo.startsWith('//')))
  assert.equal(guideTutorials.filter((tutorial) => tutorial.core && tutorial.media).length, 3)
  assert.equal(getGuideTutorial('prepare-doctor')?.actionTo, '/health-events')
})
