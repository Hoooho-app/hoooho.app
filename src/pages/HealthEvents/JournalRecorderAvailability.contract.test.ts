import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./TimeView.css', import.meta.url), 'utf8')

test('the primary record hub exposes four real paths and daily details are second level', () => {
  assert.match(source, /记录症状/)
  assert.match(source, /记录日常/)
  assert.match(source, /记录就医/)
  assert.match(source, /记录用药/)
  assert.match(source, /screen === 'daily-types'/)
  assert.match(source, /dailyFeedingImage/)
  assert.match(source, /dailySleepImage/)
  assert.match(source, /dailyBowelImage/)
  assert.match(source, /dailyActivityImage/)
  assert.match(source, /journal-entry-hub--daily journal-entry-hub--illustrated/)
  assert.doesNotMatch(source, /即将开放功能|aria-disabled=\{unavailable\}/)
  assert.match(styles, /\.journal-entry-hub/)
})

test('available category and diet type cards navigate directly without a start footer', () => {
  assert.match(source, /navigateScreen\(categoryScreen\(category\)\)/)
  assert.match(source, /className="diet-type-direct-entry"/)
  assert.match(source, /navigateScreen\('diet-form', kind\)/)
  assert.match(source, /footer=\{undefined\}/)
  assert.match(source, /initialCategory \? closeRecorder/)
  assert.doesNotMatch(source, />开始记录<\/HohoButton>/)
})
