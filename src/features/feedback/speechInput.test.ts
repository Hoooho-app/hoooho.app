import assert from 'node:assert/strict'
import test from 'node:test'
import { speechErrorMessage } from './speechInput'

test('speech failures use short recoverable feedback messages', () => {
  assert.equal(speechErrorMessage('not-allowed'), '无法使用麦克风，请检查浏览器权限')
  assert.equal(speechErrorMessage('no-speech'), '没有听清，请再试一次')
  assert.equal(speechErrorMessage('network'), '没有听清，请再试一次')
})
