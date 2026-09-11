import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const component = read('./MedicalPrepButton.tsx')
const styles = read('./MedicalPrepButton.css')

test('medical prep button uses the approved shared report-sheet icon and label', () => {
  assert.match(component, /<HooohoIcon[^>]*name="medical-note"[^>]*size=\{24\}/)
  assert.match(component, /<strong>就诊情况单<\/strong>/)
  assert.match(component, /<small>孩子情况快速整理<\/small>/)
  assert.doesNotMatch(component, /<circle |WandSparkles|soft-glow|light-band|brandMark|<img/)
  assert.doesNotMatch(component, /setTimeout|setInterval|requestAnimationFrame|medical-prep-button--awake/)
})

test('report icon matches the two-line copy height and the group remains centered', () => {
  assert.match(styles, /medical-prep-button \.hoho-button__content[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*gap: 6px;/)
  assert.match(styles, /medical-prep-button__icon[\s\S]*width: 24px;[\s\S]*height: 24px;[\s\S]*flex: 0 0 24px;[\s\S]*align-items: center;[\s\S]*justify-content: center;/)
  assert.match(styles, /medical-prep-button__icon svg[\s\S]*width: 24px;[\s\S]*height: 24px;/)
  assert.match(styles, /medical-prep-button__label[\s\S]*display: grid;[\s\S]*text-align: left;/)
  assert.match(styles, /box-shadow: none;/)
  assert.match(styles, /transition: none;/)
  assert.match(styles, /transform: none;/)
  assert.doesNotMatch(styles, /soft-glow|light-band|surface-breathe|radial-gradient|linear-gradient|::after/)
})
