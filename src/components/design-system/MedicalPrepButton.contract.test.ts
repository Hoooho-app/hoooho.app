import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const component = read('./MedicalPrepButton.tsx')
const styles = read('./MedicalPrepButton.css')

test('medical prep motion uses the existing shared button with a continuous two-layer CSS glow', () => {
  assert.match(component, /<HohoButton/)
  assert.match(component, /medical-prep-button__soft-glow/)
  assert.match(component, /medical-prep-button__light-band/)
  assert.match(component, /WandSparkles[^>]*size=\{15\}[^>]*strokeWidth=\{1\.8\}/)
  assert.doesNotMatch(component, /setTimeout|setInterval|requestAnimationFrame|medical-prep-button--awake/)
  assert.match(styles, /medical-prep-soft-glow-rise 4s/)
  assert.match(styles, /medical-prep-light-band-pass 4s/)
  assert.match(styles, /medical-prep-surface-breathe 4s/)
  assert.doesNotMatch(styles, /12s|12_000/)
})

test('medical prep motion keeps its content stable and honors reduced motion', () => {
  assert.match(styles, /medical-prep-button \.hoho-button__content[^}]*gap: 5px[^}]*font-size: 12px[^}]*transform: translateX\(-3px\)/)
  assert.match(component, /wordmark \? <span className="medical-prep-button__wordmark">Hoooho</)
  assert.doesNotMatch(styles, /medical-prep-button__icon[^}]*animation/s)
  assert.doesNotMatch(styles, /medical-prep-button__label[^}]*animation/s)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /animation: none !important/)
  assert.match(styles, /medical-prep-button__soft-glow,[\s\S]*medical-prep-button__light-band \{ display: none; \}/)
})
