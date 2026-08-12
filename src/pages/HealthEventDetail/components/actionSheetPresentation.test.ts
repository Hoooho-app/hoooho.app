import assert from 'node:assert/strict'
import test from 'node:test'
import { actionCategoryLabels, actionCategoryOrder } from './actionSheetPresentation.ts'

test('health event actions keep the frozen mobile display order', () => {
  assert.deepEqual(
    actionCategoryOrder.map((category) => actionCategoryLabels[category]),
    ['AI问诊', '去医院', '重点观察', '求助'],
  )
})
