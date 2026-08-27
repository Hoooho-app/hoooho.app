import assert from 'node:assert/strict'
import test from 'node:test'
import { countVisibleSummaryTags } from './summaryTagLayout.ts'

test('摘要标签按容器实际宽度显示完整高优先级前缀', () => {
  assert.equal(countVisibleSummaryTags([56, 56, 72, 56], 200), 3)
  assert.equal(countVisibleSummaryTags([56, 56, 72, 56], 128), 2)
})

test('放不下的标签不会显示半个或通过滚动容纳', () => {
  assert.equal(countVisibleSummaryTags([140, 56], 120), 0)
  assert.equal(countVisibleSummaryTags([80, 80], 160), 1)
})
