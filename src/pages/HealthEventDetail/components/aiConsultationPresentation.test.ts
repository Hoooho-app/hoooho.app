import assert from 'node:assert/strict'
import test from 'node:test'
import { aiConsultationConcernSuggestions, aiConsultationDraftSections } from './aiConsultationPresentation.ts'

test('AI consultation V0 keeps one concise concern prompt without triage content', () => {
  assert.deepEqual(aiConsultationConcernSuggestions, [
    '是不是很严重',
    '可能是什么原因',
    '需不需要及时处理',
    '接下来要注意什么',
  ])
  assert.equal(aiConsultationConcernSuggestions.includes('应该挂什么科' as never), false)
})

test('AI consultation result remains an explicitly provisional presentation draft', () => {
  assert.deepEqual(aiConsultationDraftSections.map(({ title }) => title), [
    '基本情况',
    '这次发生了什么',
    '症状与变化',
    '已经采取的处理',
  ])
})
