import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./Feedback.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./ops-feedback.css', import.meta.url), 'utf8')

test('ops feedback is a queue, conversation and processing workbench', () => {
  assert.match(page, /ops-feedback-queue/)
  assert.match(page, /ops-feedback-conversation/)
  assert.match(page, /ops-feedback-processing/)
  assert.doesNotMatch(page, /ops-feedback-drawer-layer|<table>/)
  assert.match(css, /grid-template-columns: minmax\(320px, 360px\) minmax\(480px, 1fr\) 304px/)
  assert.match(css, /max-width: 1760px/)
})

test('ops feedback exposes primary and collapsible advanced filters', () => {
  for (const label of ['搜索摘要、正文、用户 ID、来源页面', '新反馈', '新回复', '待处理', '评估中', '改进中', '已采纳', '不采纳', '全部类型', '更多筛选', '清除筛选']) assert.match(page, new RegExp(label))
  assert.match(page, /advancedOpen &&/)
  assert.match(page, /advancedCount/)
})

test('ops feedback keeps reply visibility and processing validation explicit', () => {
  assert.match(page, /detail\.status === 'received' \? await updateOpsFeedback/)
  assert.match(page, /overview\?\.unreadSupplements/)
  assert.match(page, /Ctrl \/ ⌘ \+ Enter 发送/)
  assert.match(page, /管理员回复 · 用户可见/)
  assert.match(page, /内部备注 · 仅内部可见/)
  assert.match(page, /选择“不采纳”时必须填写用户可见的不采纳原因/)
  assert.match(page, /选择“已合并”时必须填写目标反馈 ID/)
  assert.match(page, /status === 'merged' &&/)
  assert.match(page, /status === 'not_planned' &&/)
})

test('ops feedback distinguishes unavailable, empty and loading states', () => {
  assert.match(page, /暂时无法读取反馈/)
  assert.match(page, /还没有用户反馈/)
  assert.match(page, /QueueSkeleton/)
  assert.match(page, /overview\?\.[a-zA-Z]+/)
  assert.doesNotMatch(page, /emptyOverview/)
})
