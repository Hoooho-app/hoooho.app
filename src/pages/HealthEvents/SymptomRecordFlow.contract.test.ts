import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('symptom entry is narrative-first, optional, compact and directly saveable', () => {
  assert.match(recorder, /category === 'symptom' \? 'symptom-form'/)
  const formSource = source.slice(source.indexOf('return <div className="symptom-record-page-layer"'), source.indexOf('export function RelatedRecordsSheet'))
  const labels = ['主要症状（主述）', '症状部位（选填）', '添加照片', '补充症状信息', '发生时间']
  let cursor = -1
  for (const label of labels) { const next = formSource.indexOf(label); assert.ok(next > cursor, `${label} should follow the prior field`); cursor = next }
  assert.match(source, /描述哪里不舒服、有什么变化/)
  assert.match(source, /正在整理症状描述/)
  assert.match(source, /symptomPreviewService\.preview/)
  assert.match(source, /onCompositionStart=/)
  assert.match(source, /previewVersionRef/)
  assert.match(source, /onBlur=\{\(\) => \{ if \(narrativeRef\.current\) narrativeRef\.current\.scrollTop = 0 \}\}/)
  assert.match(source, /请填写主要症状/)
  assert.doesNotMatch(source, /请填写具体部位，或使用定位/)
  assert.match(source, /暂未生成摘要，可直接保存原文/)
  assert.match(source, /暂时无法整理，可直接保存原文/)
  assert.match(source, /正在为：/)
  assert.match(source, /影响程度、触发或诱因/)
  assert.match(source, /轻微影响/)
  assert.match(source, /type="range"/)
  assert.doesNotMatch(formSource, /症状摘要（选填）|变化趋势|反复出现|<span>备注<\/span>|关联其他记录/)
  assert.doesNotMatch(source, /确认医学准确性|诊断/)
})

test('legacy related-record editor remains available outside the simplified create form', () => {
  assert.match(source, /linkedRecordIds/)
  assert.match(source, /aria-pressed=\{checked\}/)
  assert.match(source, /没有可关联的/)
  assert.doesNotMatch(source.slice(source.indexOf('return <div className="symptom-record-page-layer"'), source.indexOf('export function RelatedRecordsSheet')), /关联其他记录/)
})

test('symptom photos use an isolated six-photo draft and structured real save', () => {
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6, 'symptom'\)/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
  assert.match(source, /sessionStorage\.removeItem\(draftKey\(memberId\)\)/)
  assert.doesNotMatch(source, /添加照片.*拍照.*从相册选择/s)
})
