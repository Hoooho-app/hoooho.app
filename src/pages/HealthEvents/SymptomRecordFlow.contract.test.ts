import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('symptom entry is narrative-first, optional, compact and directly saveable', () => {
  assert.match(recorder, /category === 'symptom' \? 'symptom-form'/)
  const formSource = source.slice(source.indexOf('return <div className="symptom-record-page-layer"'))
  const labels = ['症状描述', '症状部位', '添加照片', '补充症状信息', '关联其他记录', '记录时间', '保存']
  let cursor = -1
  for (const label of labels) { const next = formSource.indexOf(label); assert.ok(next > cursor, `${label} should follow the prior field`); cursor = next }
  assert.match(source, /描述哪里不舒服、有什么变化/)
  assert.match(source, /已从描述中提取/)
  assert.match(source, /严重程度、诱因、变化、备注/)
  assert.doesNotMatch(source, /确认医学准确性|诊断/)
})

test('related records require concrete multi-selection and show exact counts', () => {
  assert.match(source, /linkedRecordIds/)
  assert.match(source, /aria-pressed=\{checked\}/)
  assert.match(source, /没有可关联的/)
  assert.match(source, /已关联 \$\{selectedCount/)
  assert.doesNotMatch(source, /supplementalCounts/)
})

test('symptom photos use an isolated six-photo draft and structured real save', () => {
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6, 'symptom'\)/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
  assert.match(source, /sessionStorage\.removeItem\(draftKey\(memberId\)\)/)
})
