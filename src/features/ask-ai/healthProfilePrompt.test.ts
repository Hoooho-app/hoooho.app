import assert from 'node:assert/strict'
import test from 'node:test'
import { createHealthProfilePromptSections } from './healthProfilePrompt.ts'

test('health profile prompt adapter keeps only visible current-member fields and never emits attachment payloads', () => {
  const sections = createHealthProfilePromptSections([{ id: 'allergy', updatedAt: '2026-08-31', records: [{ _savedAt: '2026-08-31', confirmedAllergen: '花生', reaction: '皮疹', note: '', unknownInternalField: 'secret' }] }])
  assert.deepEqual(sections, [{ id: 'allergy', title: '过敏与不良反应', entries: [{ id: '1', lines: ['已明确过敏原：花生', '典型反应：皮疹'] }] }])

  const birth = createHealthProfilePromptSections([{ id: 'birth', updatedAt: '2026-08-31', records: [{ gestationalWeeks: 38, attachment: 'data:application/pdf;base64,secret' }] }])
  assert.match(birth[0].entries[0].lines.join('\n'), /需要在外部 AI 中手动上传/)
  assert.doesNotMatch(birth[0].entries[0].lines.join('\n'), /base64|secret/)
})
