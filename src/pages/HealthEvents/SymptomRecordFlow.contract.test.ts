import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('symptom entry is narrative-first, optional, compact and directly saveable', () => {
  assert.match(recorder, /category === 'symptom' \? 'symptom-form'/)
  const formSource = source.slice(source.indexOf('return <div className="symptom-record-page-layer"'))
  const labels = ['主要症状（主述）', '症状部位', '添加照片', '补充更多', '记录时间', '保存']
  let cursor = -1
  for (const label of labels) { const next = formSource.indexOf(label); assert.ok(next > cursor, `${label} should follow the prior field`); cursor = next }
  assert.match(source, /请描述哪里不舒服、有什么变化/)
  assert.match(source, /已从主述填写/)
  assert.doesNotMatch(source, /程度|严重|确认医学准确性|诊断/)
})

test('symptom photos use an isolated six-photo draft and structured real save', () => {
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6, 'symptom'\)/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
  assert.match(source, /sessionStorage\.removeItem\(draftKey\(memberId\)\)/)
})
