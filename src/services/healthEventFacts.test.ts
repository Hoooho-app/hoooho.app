import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthAIOutput } from '../types/index.ts'
import { deriveHealthEventTitleFromFacts } from './healthEventFacts.ts'

function output(name: string, sourceText: string, bodyPart: string | null = null): HealthAIOutput {
  return {
    facts: [{
      id: 'fact-1', type: 'symptom', name, bodyPart, sourceText,
      time: { raw: null, resolvedStart: null, resolvedEnd: null, precision: 'unknown', source: 'selected_time' },
      confidence: 0.9
    }],
    confidence: 0.9,
    parserVersion: 'test',
    promptVersion: 'test',
    timeConflict: { hasConflict: false, conflict: null }
  }
}

test('标题生成把长句中的头部胀痛提炼为头痛', () => {
  assert.equal(
    deriveHealthEventTitleFromFacts(output('当时头上有点胀痛，而且有点冒汗', '当时头上有点胀痛，而且有点冒汗', '头')),
    '头痛'
  )
})

test('通用不适结合身体部位生成简短标题', () => {
  assert.equal(deriveHealthEventTitleFromFacts(output('颈部不舒服', '颈部不舒服', '颈')), '颈不适')
})
