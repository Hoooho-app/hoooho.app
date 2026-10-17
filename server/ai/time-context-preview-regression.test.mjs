import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TimeContextResolver } from './time-context-resolver.mjs'
import { AIService } from './ai-service.mjs'
import { HealthRecordOrganizationService } from './health-record-organization-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'

const now = new Date('2026-10-17T14:00:00Z')
const options = { referenceNow: now, timezone: 'Asia/Shanghai' }
const resolver = new TimeContextResolver()
const instants = [
  ['2026-01-01T10:01:59.123+05:45', '2026-01-01T04:16:59.123Z'],
  ['2026-01-01 10:01:59Z', '2026-01-01T10:01:59.000Z'],
  ['2026-01-01 10:01:59.123', '2026-01-01T02:01:59.123Z'],
  ['2026-01-01t10:01:59.123z', '2026-01-01T10:01:59.123Z'],
  ['2026-01-01T10:01:59.456-0330', '2026-01-01T13:31:59.456Z'],
  ['2026/1/1 10:01:59.123+05:45', '2026-01-01T04:16:59.123Z'],
  ['2026/1/1 1:01:59.456', '2025-12-31T17:01:59.456Z'],
]
for (const [stamp, expected] of instants) {
  test(`time context keeps the complete historical instant: ${stamp}`, () => {
    const sourceText = `宝宝${stamp}咳嗽`
    const contexts = resolver.resolveContexts(sourceText, options)
    assert.equal(contexts[0].expression, stamp)
    assert.equal(new Date(contexts[0].time.resolvedStart).toISOString(), expected)
    const output = resolver.resolveHealthAIOutput(sourceText, { facts: [{ sourceText, time: { raw: stamp } }] }, options)
    assert.equal(new Date(output.facts[0].time.resolvedStart).toISOString(), expected)
    assert.equal(output.facts[0].sourceText, sourceText)
  })
}
test('numeric full dates keep day precision, while Chinese dates and inherited clocks retain their meaning', () => {
  for (const stamp of ['2026-01-01', '2026/1/1']) {
    const result = resolver.resolveContexts(`宝宝${stamp}咳嗽`, options)[0]
    assert.equal(result.expression, stamp)
    assert.equal(result.time.precision, 'day')
    assert.equal(new Date(result.time.resolvedStart).toISOString(), '2025-12-31T16:00:00.000Z')
  }
  const chinese = resolver.resolveContexts('宝宝2026年1月1日上午10点咳嗽', options)[0]
  assert.equal(new Date(chinese.time.resolvedStart).toISOString(), '2026-01-01T02:00:00.000Z')
  const inherited = resolver.resolveContexts('宝宝2026-01-01T10:01:59.123+05:45咳嗽，晚上发热', options)
  assert.equal(new Date(inherited[1].time.resolvedStart).toISOString(), '2026-01-01T10:00:00.000Z')
})
test('numeric timestamps reach strict validation without truncating malformed dates or fractions to a clock', () => {
  for (const stamp of ['2026-02-30T10:00:00Z', '2026-01-01 25:00', '2026-01-01 10:00:00.xyzZ']) {
    assert.throws(() => resolver.resolveContexts(`宝宝${stamp}咳嗽`, options), { code: 'INVALID_OCCURRED_AT' })
  }
})

test('whitespace between a date, period and clock does not silently reduce exact time to a day', () => {
  for (const [text, expected] of [
    ['宝宝2026/1/1 上午10点咳嗽', '2026-01-01T02:00:00.000Z'],
    ['宝宝2026年1月1日 上午10点咳嗽', '2026-01-01T02:00:00.000Z'],
    ['宝宝今天 下午3点咳嗽', '2026-10-17T07:00:00.000Z'],
  ]) {
    const context = resolver.resolveContexts(text, options)[0]
    assert.equal(context.time.precision, 'exact')
    assert.equal(new Date(context.time.resolvedStart).toISOString(), expected)
  }
})

async function previewFixture(t, stamp) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-time-context-preview-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const accountId = 'synthetic-historical-preview'
  const member = await new FamilyMemberRepository(dataDirectory).create({ accountId, name: '宝宝', relationship: 'child' }, now)
  const event = await new HealthEventService({ dataDirectory }).create(accountId, { memberId: member.id, title: '历史咳嗽', category: 'other', startTime: '2026-10-01T00:00:00Z' }, now)
  // Only extraction is a fixture. The AIService time-context resolver, preview,
  // confirmation and persisted organizations use the real application path.
  const ai = new AIService({ primaryProvider: false, fallbackProvider: { name: 'local-extraction-fixture', organize: async raw => ({ facts: [{
    id: 'historical-cough', type: 'symptom', category: 'symptom', name: '咳嗽', concept: '咳嗽',
    originalText: raw, sourceText: raw, polarity: 'affirmed', temporality: 'current', status: 'active',
    subject: 'event_subject', source: 'user_report', time: { raw: stamp }, confidence: 1,
  }] }) } })
  return { accountId, event, service: new HealthRecordOrganizationService({ dataDirectory, structuredMode: 'enabled', ai }) }
}
for (const [stamp, expected] of [instants[0], instants[2], ['2026年1月1日上午10点', '2026-01-01T02:00:00.000Z']]) {
  test(`organization preview-confirm preserves the historical fact time: ${stamp}`, async t => {
    const f = await previewFixture(t, stamp), rawInput = `宝宝${stamp}咳嗽`
    const preview = await f.service.preview(f.accountId, f.event.id, { rawInput, timezone: options.timezone, selectedOccurredAt: now.toISOString() }, now)
    assert.equal(preview.hasHealthFacts, true)
    assert.equal(new Date(preview.healthAIOutput.facts[0].time.resolvedStart).toISOString(), expected)
    const saved = await f.service.confirm(f.accountId, f.event.id, { previewId: preview.previewId, idempotencyKey: 'time-context-confirm-001' }, now)
    assert.equal(new Date(saved.organization.healthAIOutput.facts[0].time.resolvedStart).toISOString(), expected)
    const persisted = await f.service.repository.findByEventId(f.event.id)
    assert.equal(new Date(persisted[0].healthAIOutput.facts[0].time.resolvedStart).toISOString(), expected)
    assert.equal(persisted[0].rawInput, rawInput)
  })
}
