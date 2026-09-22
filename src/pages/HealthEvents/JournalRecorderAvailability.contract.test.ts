import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./TimeView.css', import.meta.url), 'utf8')

test('record entry exposes exactly the four approved real flows', () => {
  for (const label of ['记录症状', '记录日常', '记录就医', '记录用药']) assert.match(source, new RegExp(label))
  assert.equal((source.match(/category: '[a-z]+'/g) ?? []).length, 4)
  assert.doesNotMatch(source, /即将开放功能|journal-category-unavailable|记录疫苗|记录活动/)
  assert.match(styles, /\.journal-record-entry-grid/)
})

test('daily entry exposes only the eight approved concrete types', () => {
  for (const label of ['饮食', '母乳亲喂', '配方奶', '瓶喂母乳', '辅食', '营养补剂', '睡眠', '排便']) assert.match(source, new RegExp(`title: '${label}'`))
  assert.equal((source.match(/key: '[a-z]+'/g) ?? []).length, 8)
  assert.match(source, /initialFeedingMethod=/)
  assert.match(source, /linkedBackfill=/)
})

test('timeline diet prompts keep their direct prefilled form entry', () => {
  assert.match(source, /initialScreenFor\(initialCategory, mode === 'voice', suggestedDietKind\)/)
  assert.match(source, /category === 'diet'\) return isDietKind\(suggestedDietKind\) \? 'diet' : 'daily'/)
  assert.match(source, /suggestedFeedingMethod/)
})
