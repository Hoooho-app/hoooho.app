import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const composer = readFileSync(new URL('./FeedbackComposer.tsx', import.meta.url), 'utf8')
const myCard = readFileSync(new URL('./MyFeedbackCard.tsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../../services/feedback.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')

test('feedback removes manual page classification and offers exactly ten optional problem types', () => {
  assert.doesNotMatch(page, />问题页面</)
  assert.match(page, /problemPage: null/)
  assert.match(page, /feedbackCategoryOptions/)
  assert.match(page, /MainAppHeader compact title="反馈意见"/)
})

test('my feedback uses inline expansion, persistent unread replies and inline supplements', () => {
  assert.match(page, /expandedId/)
  assert.match(page, /markFeedbackRead/)
  assert.match(page, /fallback="\/feedback"/)
  assert.match(myCard, /继续回复/)
  assert.match(myCard, /showVoice=\{false\}/)
  assert.match(myCard, /unreadReplyCount/)
  assert.match(myCard, /我的反馈/)
  assert.match(myCard, /Hoooho 回复/)
  assert.match(myCard, /我的补充/)
  assert.doesNotMatch(myCard, /statusHistory|处理状态|my-feedback-card-latest|my-feedback-card-text/)
})

test('feedback status contract exposes every user-facing workflow state', () => {
  for (const status of ['received', 'reviewing', 'needs_more_info', 'planned', 'in_progress', 'improved', 'not_planned', 'merged']) assert.match(service, new RegExp(status))
})

test('voice feedback is click based and never uses press-and-hold pointer events', () => {
  assert.match(composer, /正在聆听 · 点击结束/)
  assert.match(composer, /正在转成文字…/)
  assert.match(composer, /onClick=/)
  assert.doesNotMatch(composer, /onPointerDown|onPointerUp|onPointerCancel|mousedown|touchstart|按住说话/)
})

test('feedback has one image entry and compact iPhone SE layout rules', () => {
  assert.equal((composer.match(/<strong>上传图片<\/strong>/g) ?? []).length, 1)
  assert.doesNotMatch(composer, /拍照|选择图片/)
  assert.match(css, /\.feedback-textarea \{ height: 140px/)
  assert.match(css, /grid-template-columns: repeat\(5/)
  assert.match(css, /\.feedback-page \{ min-height: 100dvh/)
})
