import assert from 'node:assert/strict'
import test from 'node:test'
import { isSafeFeedbackReturn, resolveFeedbackSource } from './navigation'

test('feedback return accepts product pages and rejects auth, self, ops and external routes', () => {
  assert.equal(isSafeFeedbackReturn('/help?q=upload'), true)
  assert.equal(isSafeFeedbackReturn('/health-events/event-1'), true)
  for (const value of ['/feedback', '/feedback/submitted', '/login', '/onboarding/profile', '/ops', '//outside.example', 'https://outside.example']) assert.equal(isSafeFeedbackReturn(value), false)
})

test('direct entry falls back to my page while refresh can retain a safe source', () => {
  assert.equal(resolveFeedbackSource(null, { path: '/help', name: '帮助中心' }, false).path, '/settings')
  assert.equal(resolveFeedbackSource(null, { path: '/help', name: '帮助中心' }, true).path, '/help')
  assert.equal(resolveFeedbackSource({ feedbackSource: { path: '/feedback', name: '循环' } }, null, false).path, '/settings')
})
