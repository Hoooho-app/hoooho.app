import assert from 'node:assert/strict'
import test from 'node:test'
import { appendQuickRecordTranscript, formatRecordingDuration, needsNewQuickRecord, recognitionErrorMessage } from './quickRecordPresentation.ts'

test('快捷记录显示稳定的分钟和秒数', () => {
  assert.equal(formatRecordingDuration(0), '00:00')
  assert.equal(formatRecordingDuration(78), '01:18')
})

test('麦克风权限和无声音错误使用明确反馈', () => {
  assert.match(recognitionErrorMessage('not-allowed'), /允许麦克风权限/)
  assert.equal(recognitionErrorMessage('no-speech'), '没有听清，请再说一次')
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
