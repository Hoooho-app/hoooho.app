import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

test('time-based reminder engine, state, illustrations and recorder prefill are removed', () => {
  for (const name of ['TriggerOpportunityCard.tsx', 'TriggerOpportunityIllustration.tsx', 'triggerOpportunityConfig.ts', 'triggerOpportunitySelector.ts', 'triggerOpportunityI18n.ts', 'triggerOpportunityState.ts']) assert.equal(existsSync(new URL(name, import.meta.url)), false, name)
  for (const name of ['TimeView.tsx', 'TimeView.css', 'JournalRecorder.tsx', 'index.tsx']) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /triggerOpportunity|TriggerOpportunity|trigger-opportunity|hoooho:journal-suggestion|hoooho:timeline-prompt/)
  }
})
