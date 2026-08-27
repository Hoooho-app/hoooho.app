import assert from 'node:assert/strict'
import test from 'node:test'
import { speechErrorMessage } from './speechInput'

test('speech failures explain permission recovery and preserve existing content', () => {
  assert.match(speechErrorMessage('not-allowed'), /网站设置.*允许麦克风/)
  assert.match(speechErrorMessage('no-speech'), /已有文字和图片不会丢失/)
  assert.match(speechErrorMessage('network'), /已有文字和图片不会丢失/)
})
