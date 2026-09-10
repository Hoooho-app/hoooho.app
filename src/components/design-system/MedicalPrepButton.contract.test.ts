import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const component = read('./MedicalPrepButton.tsx')
const styles = read('./MedicalPrepButton.css')

test('medical prep button keeps only the compact brand mark and label', () => {
  assert.match(component, /logoWhiteUrl/)
  assert.match(component, /height=\{14\}/)
  assert.match(component, />就医准备</)
  assert.doesNotMatch(component, /WandSparkles|soft-glow|light-band|brandMark/)
  assert.doesNotMatch(component, /setTimeout|setInterval|requestAnimationFrame|medical-prep-button--awake/)
})

test('medical prep button is centered and has no decorative effects', () => {
  assert.match(styles, /medical-prep-button \.hoho-button__content[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*gap: 4px;/)
  assert.match(styles, /medical-prep-button__icon[\s\S]*width: 14px;[\s\S]*height: 14px;[\s\S]*align-items: center;[\s\S]*justify-content: center;/)
  assert.match(styles, /medical-prep-button__icon img[\s\S]*width: 14px;[\s\S]*height: 14px;[\s\S]*object-fit: contain;/)
  assert.match(styles, /box-shadow: none;/)
  assert.match(styles, /transition: none;/)
  assert.match(styles, /transform: none;/)
  assert.match(styles, /filter: none;/)
  assert.doesNotMatch(styles, /animation|@keyframes|::after|radial-gradient|linear-gradient/)
})
