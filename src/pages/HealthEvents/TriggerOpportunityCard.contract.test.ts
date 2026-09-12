import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('card remains one localized illustration-led surface with dismiss and prefilling', () => {
  const card = readFileSync(new URL('./TriggerOpportunityCard.tsx', import.meta.url), 'utf8')
  const view = readFileSync(new URL('./TimeView.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('./TimeView.css', import.meta.url), 'utf8')
  assert.match(card, /TriggerOpportunityIllustration/)
  assert.match(card, /triggerCopy\(config\.copyKey, locale\)/)
  assert.match(card, /onAction\(index as 0 \| 1\)/)
  assert.match(card, /暂时关闭此提醒/)
  assert.match(view, /prefill: optionIndex === undefined \? \{\} : selectedCard\.config\.prefill\[optionIndex\]/)
  assert.match(view, /relatedEventId: selectedCard\.prerequisiteEntry\?\.eventId/)
  assert.match(css, /@media \(max-width: 374px\)/)
  assert.match(css, /prefers-reduced-motion/)
  assert.doesNotMatch(css, /overflow-x:\s*visible/)
})
