import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateHealthImageDimensions } from './prepareHealthImage.ts'

test('健康图片按最长边等比缩放并避免放大小图', () => {
  assert.deepEqual(calculateHealthImageDimensions(8000, 4000), { width: 2560, height: 1280 })
  assert.deepEqual(calculateHealthImageDimensions(1200, 900), { width: 1200, height: 900 })
})
