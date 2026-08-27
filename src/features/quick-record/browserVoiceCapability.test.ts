import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateBrowserVoiceCapability } from './browserVoiceCapability.ts'

const supported = { hasGetUserMedia: true, hasMediaDevices: true, hasSpeechRecognition: true, isSecureContext: true }

test('Safari-like 和 Chrome-like 安全环境允许尝试语音', () => {
  for (const userAgent of [
    'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1',
    'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36'
  ]) assert.equal(evaluateBrowserVoiceCapability({ ...supported, userAgent }).availability, 'available')
})

test('微信环境直接进入文字降级，即使 WebView 暴露了部分媒体接口', () => {
  const result = evaluateBrowserVoiceCapability({ ...supported, hasGetUserMedia: false, userAgent: 'Mozilla/5.0 MicroMessenger/8.0' })
  assert.equal(result.availability, 'wechat_unsupported')
  assert.equal(result.canAttemptMicrophone, false)
})

test('普通不支持浏览器和非安全上下文使用不同状态', () => {
  assert.equal(evaluateBrowserVoiceCapability({ ...supported, hasMediaDevices: false, userAgent: 'Other' }).availability, 'browser_unsupported')
  assert.equal(evaluateBrowserVoiceCapability({ ...supported, isSecureContext: false, userAgent: 'Other' }).availability, 'insecure_context')
})
