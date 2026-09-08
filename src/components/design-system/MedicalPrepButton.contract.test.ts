import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const component = read('./MedicalPrepButton.tsx')
const styles = read('./MedicalPrepButton.css')

test('medical prep motion uses cancellable quiet timing and lifecycle guards', () => {
  assert.match(component, /FIRST_WAKE_DELAY = 3_000/)
  assert.match(component, /REPEAT_WAKE_DELAY = 12_000/)
  assert.match(component, /WAKE_DURATION = 1_650/)
  assert.doesNotMatch(component, /setInterval/)
  assert.match(component, /visibilitychange/)
  assert.match(component, /prefers-reduced-motion: reduce/)
  assert.match(component, /clearTimers\(\)/)
})

test('medical prep motion keeps the label stable and limits movement to the icon', () => {
  assert.match(styles, /medical-prep-border-orbit/)
  assert.match(styles, /translate\(1\.5px, -1\.5px\) rotate\(-4deg\)/)
  assert.doesNotMatch(styles, /medical-prep-button__label[^}]*animation/s)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /animation: none !important/)
})
