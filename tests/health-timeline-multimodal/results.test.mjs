import test from 'node:test'
import assert from 'node:assert/strict'
import { requiredCaseFields } from './cases.mjs'
import { results } from './results-2026-08-31.mjs'

test('专项结果覆盖全部52案且只使用允许的结果状态', () => {
  assert.equal(results.length, 52)
  const allowed = new Set(['PASS', 'PARTIAL', 'FAIL', 'BLOCKED'])
  for (const result of results) {
    for (const field of requiredCaseFields) assert.ok(field in result, `${result.caseId} missing ${field}`)
    assert.ok(allowed.has(result.result), `${result.caseId} invalid result ${result.result}`)
    assert.ok(result.evidence.length > 0, `${result.caseId} missing evidence`)
  }
})

test('受控音频与多模态阻塞不能伪装成语音转写通过', () => {
  for (const result of results.filter((item) => item.modality === 'controlled_audio' || item.modality === 'photo_plus_audio')) {
    assert.equal(result.result, 'BLOCKED')
    assert.equal(result.actualTranscript, null)
  }
})
