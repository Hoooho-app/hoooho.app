import assert from 'node:assert/strict'
import test from 'node:test'
import type { JournalEntry } from './timeViewModel.ts'
import { triggerCardConfigs } from './triggerOpportunityConfig.ts'
import { triggerCopy } from './triggerOpportunityI18n.ts'
import { selectTriggerOpportunity } from './triggerOpportunitySelector.ts'

const at = (hour: number, minute = 0) => new Date(2026, 8, 13, hour, minute)
const select = (hour: number, entries: JournalEntry[] = [], hidden = () => false) => selectTriggerOpportunity(at(hour), '2026-09-13', '2026-09-13', entries, hidden)
const entry = (category: JournalEntry['categories'][number], occurredAt: Date, extra: Partial<JournalEntry> = {}): JournalEntry => ({ id:`${category}-1`,eventId:'event-1',content:category,occurredAt:occurredAt.toISOString(),createdAt:occurredAt.toISOString(),attachmentCount:0,status:'ongoing',categories:[category],timePrecision:'exact',...extra })

test('registers 21 unique i18n-backed trigger cards', () => {
  assert.equal(triggerCardConfigs.length, 21)
  assert.equal(new Set(triggerCardConfigs.map((item) => item.id)).size, 21)
  for (const config of triggerCardConfigs) {
    assert.ok(triggerCopy(config.copyKey, 'zh-CN').question)
    assert.ok(triggerCopy(config.copyKey, 'en').question)
  }
})

test('uses tonight before 06:00 and last night from 06:00', () => {
  const midnight = select(0)?.config
  assert.equal(midnight?.id, 'sleep-late')
  assert.match(triggerCopy(midnight!.copyKey, 'zh-CN').question, /今晚/)
  assert.doesNotMatch(triggerCopy(midnight!.copyKey, 'zh-CN').question, /昨晚/)
  assert.equal(select(6)?.config.id, 'sleep-morning')
  assert.match(triggerCopy(select(6)!.config.copyKey, 'zh-CN').question, /昨晚/)
})

test('never creates event follow-up cards without a matching prerequisite', () => {
  assert.notEqual(select(13)?.config.triggerType, 'event')
  const medication = entry('medication', at(11))
  assert.equal(select(13, [medication])?.config.id, 'medication-followup')
})

test('selects only one highest-priority card and respects a cycle dismissal', () => {
  const symptom = entry('symptom', at(10))
  const medication = entry('medication', at(11))
  assert.equal(select(13, [symptom, medication])?.config.id, 'medication-followup')
  assert.notEqual(select(13, [symptom, medication], (id) => id === 'medication-followup')?.config.id, 'medication-followup')
})

test('does not show daily card after the target category was recorded', () => {
  assert.equal(select(8)?.config.id, 'sleep-morning')
  assert.notEqual(select(8, [entry('sleep', at(7))])?.config.id, 'sleep-morning')
})
