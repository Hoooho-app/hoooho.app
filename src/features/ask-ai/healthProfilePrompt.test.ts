import assert from 'node:assert/strict'
import test from 'node:test'
import { createHealthProfilePromptSections } from './healthProfilePrompt.ts'

test('health profile prompt adapter keeps only visible current-member fields and never emits attachment payloads', () => {
  const sections = createHealthProfilePromptSections([{ id: 'allergy', updatedAt: '2026-08-31', records: [{ _savedAt: '2026-08-31', name: '花生', reaction: '皮疹', note: '', unknownInternalField: 'secret' }] }])
  assert.deepEqual(sections, [{ id: 'allergy', title: '过敏与不良反应', entries: [{ id: '1', lines: ['名称：花生', '出现过什么反应：皮疹'] }] }])

  const examination = createHealthProfilePromptSections([{ id: 'examination', updatedAt: '2026-08-31', records: [{ name: '血常规', attachment: 'data:application/pdf;base64,secret' }] }])
  assert.match(examination[0].entries[0].lines.join('\n'), /需要在外部 AI 中手动上传/)
  assert.doesNotMatch(examination[0].entries[0].lines.join('\n'), /base64|secret/)
})
