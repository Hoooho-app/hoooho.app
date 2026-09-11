import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./HooohoIcon.tsx', import.meta.url), 'utf8')

test('HooohoIcon preserves the approved shared icon contract', () => {
  assert.match(source, /viewBox="0 0 24 24"/)
  assert.match(source, /stroke="currentColor"/)
  assert.match(source, /strokeLinecap="round"/)
  assert.match(source, /strokeLinejoin="round"/)
  assert.match(source, /strokeWidth="2"/)
  assert.match(source, /flexShrink: 0/)
  assert.match(source, /16 \| 20 \| 24 \| 32/)
  assert.match(source, /'default' \| 'selected' \| 'disabled' \| 'warning' \| 'pending' \| 'completed'/)
})

test('HooohoIcon keeps locked product semantics and the Figma vector paths', () => {
  assert.match(source, /case 'health-profile'[\s\S]*M20 20a2 2/)
  assert.match(source, /case 'health-record'[\s\S]*M4 19\.5v-15/)
  assert.match(source, /case 'service-station'[\s\S]*M4\.5 4\.5 6 3/)
  assert.match(source, /case 'medical-note'[\s\S]*M16 4h2/)
  assert.match(source, /case 'observation':[\s\S]*case 'symptom': return <path d="M12 5v14M5 12h14"/)
  assert.match(source, /case 'sleep': return <path d="M4 8h6l-6 8h6/)
})
