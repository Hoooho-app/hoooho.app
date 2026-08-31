import assert from 'node:assert/strict'
import test from 'node:test'
import type { EventAttachmentPreviewApiDto, HealthFact } from '../../types/index.ts'
import { findMultimodalConflicts } from './multimodalConflict.ts'

const temperature = (value: number, source: HealthFact['source']): HealthFact => ({
  id: `${source}-${value}`, type: 'temperature', name: `${value}℃`, bodyPart: null, sourceText: `${value}℃`, source,
  polarity: 'affirmed', time: { raw: null, resolvedStart: null, resolvedEnd: null, precision: 'unknown', source: source === 'measurement' ? 'document' : 'user_text' },
  confidence: 0.95, temperature: { min: value, max: value, unit: '℃' }
})
const draft = (fact: HealthFact): EventAttachmentPreviewApiDto => ({ status: 'completed', canConfirm: true, contentHash: 'hash', width: 100, height: 100,
  analysis: { status: 'completed', category: 'temperature', summary: fact.name, extractedFacts: [fact], provider: 'fixture', analyzedAt: '2026-08-31T00:00:00Z' } })

test('图片和文字同值不产生冲突，不同值必须进入确认状态', () => {
  assert.deepEqual(findMultimodalConflicts([temperature(38.2, 'user_report')], [draft(temperature(38.2, 'measurement'))]), [])
  assert.deepEqual(findMultimodalConflicts([temperature(39.2, 'user_report')], [draft(temperature(38.2, 'measurement'))])[0], {
    concept: '体温', textValue: '39.2', imageValue: '38.2', textSource: '用户描述', imageSource: '图片识别'
  })
})
