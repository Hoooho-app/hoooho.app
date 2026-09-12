import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const expectedAssets = {
  'sleep.lateNight': 'sleep-late-night.png',
  'sleep.morningReview': 'sleep-morning-review.png',
  'sleep.nap': 'sleep-nap.png',
  'sleep.evening': 'sleep-evening.png',
  'feeding.breakfast': 'feeding-breakfast.png',
  'feeding.newFood': 'feeding-new-food.png',
  'feeding.dinner': 'feeding-dinner.png',
  'feeding.waterSnack': 'feeding-water-snack.png',
  'bowel.morning': 'bowel-morning.png',
  'bowel.eveningReview': 'bowel-evening-review.png',
  'activity.outdoor': 'activity-outdoor.png',
  'activity.followUp': 'activity-follow-up.png',
  'body.change': 'body-change.png',
  'symptom.followUp': 'symptom-follow-up.png',
  'reaction.newFood': 'reaction-new-food.png',
  'reaction.contact': 'reaction-contact.png',
  'care.medicationFollowUp': 'care-medication-follow-up.png',
  'care.treatmentFollowUp': 'care-treatment-follow-up.png',
  'care.injury': 'care-injury.png',
  'care.vaccination': 'care-vaccination.png',
  'care.visitReport': 'care-visit-report.png',
} as const

test('all README illustration keys map to bundled PNG assets', () => {
  const source = readFileSync(new URL('./TriggerOpportunityIllustration.tsx', import.meta.url), 'utf8')
  assert.equal(Object.keys(expectedAssets).length, 21)
  for (const [key, filename] of Object.entries(expectedAssets)) {
    assert.match(source, new RegExp(`'${key}': \\w+`))
    assert.match(source, new RegExp(filename.replace('.', '\\.')))
    assert.ok(existsSync(new URL(`../../assets/trigger-cards/${filename}`, import.meta.url)), filename)
  }
  assert.doesNotMatch(source, /<svg|<path|<rect|asset-preview|reference-boards/)
})

test('illustrations use a stable responsive frame and neutral failure surface', () => {
  const source = readFileSync(new URL('./TriggerOpportunityIllustration.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('./TimeView.css', import.meta.url), 'utf8')
  assert.match(source, /<img alt="" src=/)
  assert.match(css, /aspect-ratio:\s*1\.65\s*\/\s*1/)
  assert.match(css, /object-fit:\s*cover/)
  assert.match(css, /object-position:\s*center/)
  assert.match(css, /background:\s*rgb\(var\(--hoho-color-primary-soft\)/)
})
