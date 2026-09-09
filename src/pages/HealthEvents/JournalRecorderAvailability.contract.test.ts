import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./TimeView.css', import.meta.url), 'utf8')

test('activity, vaccination and visit stay visible but announce their unavailable state', () => {
  assert.match(source, /\['activity', 'vaccination', 'visit'\]/)
  assert.match(source, /aria-disabled=\{unavailable\}/)
  assert.match(source, /即将开放功能/)
  assert.match(source, /setSelected\(\[\]\)/)
  assert.match(styles, /\.journal-category-unavailable/)
})
