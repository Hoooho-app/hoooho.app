import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const component = read('./MedicalPrepButton.tsx')
const styles = read('./MedicalPrepButton.css')

test('medical prep motion uses the existing shared button with one continuous CSS glow', () => {
  assert.match(component, /<HohoButton/)
  assert.match(component, /medical-prep-button__glow/)
  assert.doesNotMatch(component, /setTimeout|setInterval|requestAnimationFrame|medical-prep-button--awake/)
  assert.match(styles, /medical-prep-light-rise 4\.8s/)
  assert.match(styles, /medical-prep-breathe 4\.8s/)
  assert.doesNotMatch(styles, /12s|12_000/)
})

test('medical prep motion keeps its content stable and honors reduced motion', () => {
  assert.match(styles, /medical-prep-button \.hoho-button__content[^}]*font-size: 13px/)
  assert.doesNotMatch(styles, /medical-prep-button__icon[^}]*animation/s)
  assert.doesNotMatch(styles, /medical-prep-button__label[^}]*animation/s)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /animation: none !important/)
  assert.match(styles, /medical-prep-button__glow \{ display: none; \}/)
})
