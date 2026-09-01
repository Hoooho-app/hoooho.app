import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldTriggerNurseSaveSuccess } from './nurseSaveSuccess.ts'

test('只有新的语音保存成功会触发 OK 手势', () => {
  assert.equal(shouldTriggerNurseSaveSuccess('voice', 1, -1), true)
  assert.equal(shouldTriggerNurseSaveSuccess('text', 1, -1), false)
  assert.equal(shouldTriggerNurseSaveSuccess('voice', 1, 1), false)
})

test('下一次独立语音保存成功可以再次触发', () => {
  assert.equal(shouldTriggerNurseSaveSuccess('voice', 2, 1), true)
})
