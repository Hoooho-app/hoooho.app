import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const composer = readFileSync(new URL('./FeedbackComposer.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')

test('feedback keeps problem page and problem type as separate required submission fields', () => {
  assert.match(page, /problemPage/)
  assert.match(page, /problemType/)
  assert.match(page, /problemPage, problemType/)
  assert.match(page, /问题页面/)
  assert.match(page, /问题类型/)
})

test('voice feedback is click based and never uses press-and-hold pointer events', () => {
  assert.match(composer, /正在聆听 · 点击结束/)
  assert.match(composer, /正在整理…/)
  assert.match(composer, /onClick=/)
  assert.doesNotMatch(composer, /onPointerDown|onPointerUp|onPointerCancel|mousedown|touchstart|按住说话/)
})

test('feedback has one image entry and compact iPhone SE layout rules', () => {
  assert.equal((composer.match(/>上传图片</g) ?? []).length, 1)
  assert.doesNotMatch(composer, /拍照|选择图片/)
  assert.match(css, /\.feedback-textarea \{ height: 88px/)
  assert.match(css, /\.feedback-categories button \{ height: 32px/)
  assert.match(css, /\.feedback-page \{ min-height: 100dvh/)
})
