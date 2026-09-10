import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('symptom category enters one continuous form with locator, optional details, time and save in order', () => {
  assert.match(recorder, /category === 'symptom' \? 'symptom-form'/)
  const formSource = source.slice(source.indexOf('return <div className="symptom-record-page-layer"'))
  const labels = ['主要怎么不舒服？', '不舒服的位置', '这里具体怎么了？', '现在大概到什么程度？', '拍下来更容易说明', '再补充一点', '记录时间', '保存记录']
  let cursor = -1
  for (const label of labels) { const next = formSource.indexOf(label); assert.ok(next > cursor, `${label} should follow the prior field`); cursor = next }
  assert.doesNotMatch(source, /疼痛.{0,20}1—10|确认医学准确性|诊断/)
})

test('symptom photos use an isolated six-photo draft and structured real save', () => {
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6, 'symptom'\)/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
  assert.match(source, /sessionStorage\.removeItem\(draftKey\(memberId\)\)/)
})
