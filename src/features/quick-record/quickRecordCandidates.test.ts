import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthFact, HealthRecordOrganizationPreviewApiDto } from '../../types/index.ts'
import { createQuickRecordCandidates } from './quickRecordCandidates.ts'

const fact = (id: string, type: HealthFact['type'], name: string, raw: string, resolvedStart: string, temperature?: number): HealthFact => ({
  id, type, name, bodyPart: null, sourceText: name, confidence: 0.95,
  time: { raw, resolvedStart, resolvedEnd: null, precision: 'exact', source: 'user_text' },
  ...(temperature ? { temperature: { min: temperature, max: temperature, unit: '℃' as const } } : {})
})

test('一句复合输入按事实拆成可独立编辑的多条记录候选', () => {
  const preview = {
    hasHealthFacts: true, intent: 'health_fact', provider: 'test',
    organizedHealthData: { symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: [] },
    healthAIOutput: {
      facts: [fact('medication', 'medication', '美林 5 毫升', '晚上九点', '2026-08-25T21:00:00+08:00'), fact('temperature', 'temperature', '38.5℃', '刚刚', '2026-08-25T21:05:00+08:00', 38.5)],
      confidence: 0.95, parserVersion: 'test', promptVersion: 'test', timeConflict: { hasConflict: false, conflict: null }
    }
  } satisfies HealthRecordOrganizationPreviewApiDto
  const candidates = createQuickRecordCandidates(preview, '2026-08-25T21:05:00.000Z')
  assert.equal(candidates.length, 2)
  assert.deepEqual(candidates.map((candidate) => candidate.type), ['medication', 'symptom'])
  assert.deepEqual(candidates.map((candidate) => candidate.content), ['美林 5 毫升', '体温 38.5℃'])
  assert.deepEqual(candidates.map((candidate) => candidate.sourceType), ['user_record', 'measurement'])
  assert.deepEqual(candidates.map((candidate) => candidate.fields.map((field) => field.value)), [
    ['晚上九点', '美林 5 毫升'],
    ['刚刚', '38.5℃']
  ])
})

test('未来解析时间回退到用户提交时刻', () => {
  const fallback = '2026-08-25T08:00:00.000Z'
  const preview = {
    hasHealthFacts: true, intent: 'health_fact', provider: 'test',
    organizedHealthData: { symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: [] },
    healthAIOutput: { facts: [fact('symptom', 'symptom', '咳嗽', '明天', '2099-01-01T12:00:00.000Z')], confidence: 0.9, parserVersion: 'test', promptVersion: 'test', timeConflict: { hasConflict: false, conflict: null } }
  } satisfies HealthRecordOrganizationPreviewApiDto
  assert.equal(createQuickRecordCandidates(preview, fallback)[0].occurredAt, fallback)
})
