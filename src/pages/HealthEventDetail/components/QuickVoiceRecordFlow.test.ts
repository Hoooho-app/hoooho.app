import assert from 'node:assert/strict'
import test from 'node:test'
import { appendQuickRecordTranscript, classifyMicrophoneFailure, formatRecordingDuration, isEmbeddedBrowserUserAgent, isValidVoiceRecording, needsNewQuickRecord, recognitionErrorMessage } from './quickRecordPresentation.ts'

test('快捷记录显示稳定的分钟和秒数', () => {
  assert.equal(formatRecordingDuration(0), '00:00')
  assert.equal(formatRecordingDuration(78), '01:18')
})

test('麦克风权限和无声音错误使用明确反馈', () => {
  assert.match(recognitionErrorMessage('not-allowed'), /没有获得麦克风权限/)
  assert.match(recognitionErrorMessage('no-speech'), /录音启动失败/)
})

test('录音错误分类覆盖权限、设备占用、无设备和不支持环境', () => {
  assert.equal(classifyMicrophoneFailure('NotAllowedError').kind, 'permission_denied')
  assert.equal(classifyMicrophoneFailure('NotFoundError').kind, 'device_unavailable')
  assert.equal(classifyMicrophoneFailure('NotReadableError').kind, 'device_busy')
  assert.equal(classifyMicrophoneFailure('unsupported').kind, 'unsupported_environment')
  assert.equal(classifyMicrophoneFailure('unsupported').canRetry, false)
  assert.equal(classifyMicrophoneFailure('network').kind, 'recording_failed')
})

test('只用轻量 UA 判断改善内置浏览器失败提示', () => {
  assert.equal(isEmbeddedBrowserUserAgent('Mozilla/5.0 MicroMessenger/8.0'), true)
  assert.equal(isEmbeddedBrowserUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148'), true)
  assert.equal(isEmbeddedBrowserUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), false)
})

test('只有已经录音、有转录且超过一秒才允许完成', () => {
  assert.equal(isValidVoiceRecording(0, '体温 38 度', true), false)
  assert.equal(isValidVoiceRecording(1, '', true), false)
  assert.equal(isValidVoiceRecording(1, '体温 38 度', false), false)
  assert.equal(isValidVoiceRecording(1, '体温 38 度', true), true)
})

test('整理重试复用已保存记录，文本变化才创建新记录', () => {
  const pending = { recordId: 'record-1', transcript: '今天体温下降了' }
  assert.equal(needsNewQuickRecord(pending, '今天体温下降了'), false)
  assert.equal(needsNewQuickRecord(pending, '今天精神好一些'), true)
  assert.equal(needsNewQuickRecord(null, '今天体温下降了'), true)
})

test('表单快捷记录追加转录且不会重复插入同一段', () => {
  assert.equal(appendQuickRecordTranscript('', ' 下午开始发热。 '), '下午开始发热。')
  assert.equal(appendQuickRecordTranscript('上午有点咳嗽。', '下午开始发热。'), '上午有点咳嗽。\n下午开始发热。')
  assert.equal(appendQuickRecordTranscript('上午有点咳嗽。\n下午开始发热。', '下午开始发热。'), '上午有点咳嗽。\n下午开始发热。')
})
