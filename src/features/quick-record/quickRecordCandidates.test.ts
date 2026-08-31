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
    ['晚上九点', '已陈述', '用户描述', '美林 5 毫升'],
    ['刚刚', '已陈述', '用户描述', '38.5℃']
  ])
})

test('否定事实作为待确认草稿显式呈现而不是反转为阳性', () => {
  const absent = { ...fact('absent', 'symptom', '呕吐', '今天', '2026-08-25T00:00:00+08:00'), polarity: 'negated' as const, status: 'not_applicable' as const }
  const preview = {
    hasHealthFacts: true, intent: 'health_fact', provider: 'test',
    organizedHealthData: { symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: [] },
    healthAIOutput: { facts: [absent], confidence: 0.95, parserVersion: 'test', promptVersion: 'test', timeConflict: { hasConflict: false, conflict: null } }
  } satisfies HealthRecordOrganizationPreviewApiDto
  const candidate = createQuickRecordCandidates(preview, '2026-08-25T08:00:00.000Z')[0]
  assert.equal(candidate.content, '呕吐：无')
  assert.equal(candidate.fields.some((field) => field.label === '事实状态' && field.value === '明确没有'), true)
  assert.equal(candidate.fields.some((field) => field.label === '来源' && field.value === '用户描述'), true)
})

test('机器 ISO 时间在草稿中转为本地可读时间', () => {
  const isoFact = fact('iso', 'symptom', '头痛', '2026-08-25T08:00:00.000Z', '2026-08-25T08:00:00.000Z')
  const preview = {
    hasHealthFacts: true, intent: 'health_fact', provider: 'test',
    organizedHealthData: { symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: [] },
    healthAIOutput: { facts: [isoFact], confidence: 0.95, parserVersion: 'test', promptVersion: 'test', timeConflict: { hasConflict: false, conflict: null } }
  } satisfies HealthRecordOrganizationPreviewApiDto
  assert.doesNotMatch(createQuickRecordCandidates(preview, isoFact.time.resolvedStart!)[0].fields[0].value, /^2026-08-25T/u)
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
