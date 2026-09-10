import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./TimeView.css', import.meta.url), 'utf8')

test('activity is available while vaccination and visit announce their unavailable state', () => {
  assert.match(source, /\['vaccination', 'visit'\]/)
  assert.match(source, /aria-disabled=\{unavailable\}/)
  assert.match(source, /即将开放功能/)
  assert.match(source, /setSelected\(\[\]\)/)
  assert.match(styles, /\.journal-category-unavailable/)
})

test('available category and diet type cards navigate directly without a start footer', () => {
  assert.match(source, /setScreen\(categoryScreen\(category\)\)/)
  assert.match(source, /className="diet-type-direct-entry"/)
  assert.match(source, /setDietKind\(kind\); setScreen\('diet-form'\)/)
  assert.match(source, /footer=\{undefined\}/)
  assert.doesNotMatch(source, />开始记录<\/HohoButton>/)
})
