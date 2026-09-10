import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const component = read('./MedicalPrepButton.tsx')
const styles = read('./MedicalPrepButton.css')

test('medical prep button keeps the compact three-dot brand mark and label', () => {
  assert.match(component, /<svg[^>]*height="14"[^>]*viewBox="0 0 80 80"[^>]*width="14"/)
  assert.equal((component.match(/<circle /g) ?? []).length, 3)
  assert.match(component, /dot--bottom/)
  assert.match(component, /dot--middle/)
  assert.match(component, /dot--top/)
  assert.match(component, />就医准备</)
  assert.doesNotMatch(component, /WandSparkles|soft-glow|light-band|brandMark|<img/)
  assert.doesNotMatch(component, /setTimeout|setInterval|requestAnimationFrame|medical-prep-button--awake/)
})

test('only the three logo dots pulse from bottom to top while the button stays stable', () => {
  assert.match(styles, /medical-prep-button \.hoho-button__content[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*gap: 4px;/)
  assert.match(styles, /medical-prep-button__icon[\s\S]*width: 14px;[\s\S]*height: 14px;[\s\S]*align-items: center;[\s\S]*justify-content: center;/)
  assert.match(styles, /medical-prep-button__icon svg[\s\S]*width: 14px;[\s\S]*height: 14px;/)
  assert.match(styles, /medical-prep-button__dot[\s\S]*animation: medical-prep-logo-pulse 1\.8s ease-in-out infinite;/)
  assert.match(styles, /dot--middle[\s\S]*animation-delay: \.6s;/)
  assert.match(styles, /dot--top[\s\S]*animation-delay: 1\.2s;/)
  assert.match(styles, /16\.66%[\s\S]*opacity: 1;[\s\S]*transform: scale\(1\.3\);[\s\S]*drop-shadow/)
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*medical-prep-button__dot[\s\S]*animation: none;/)
  assert.match(styles, /box-shadow: none;/)
  assert.match(styles, /transition: none;/)
  assert.match(styles, /transform: none;/)
  assert.doesNotMatch(styles, /soft-glow|light-band|surface-breathe|radial-gradient|linear-gradient|::after/)
})
