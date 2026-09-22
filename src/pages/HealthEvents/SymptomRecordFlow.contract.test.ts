import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const relations = readFileSync(new URL('./RecordRelationSection.tsx', import.meta.url), 'utf8')
const detailEditor = readFileSync(new URL('../HealthEventDetail/components/SymptomRecordSheet.tsx', import.meta.url), 'utf8')

test('symptom flow is narrative first and keeps automatic facts editable', () => {
  const formSource = source.slice(source.indexOf('return <div className="symptom-record-page-layer"'))
  const labels = ['症状描述', '根据描述自动带出', '症状摘要', '症状部位', '补充信息', '记录时间', '保存记录']
  let cursor = -1
  for (const label of labels) { const next = formSource.indexOf(label); assert.ok(next > cursor, label); cursor = next }
  assert.match(source, /未识别到有效信息/)
  assert.match(source, /summaryManuallyEdited/)
  assert.match(source, /locationManuallyEdited/)
  assert.match(source, /extractionVersionRef/)
  assert.doesNotMatch(source, /是否加重或减轻|症状备注/)
  const editorSource = detailEditor.slice(detailEditor.indexOf('{editing ? ('), detailEditor.indexOf(') : (', detailEditor.indexOf('{editing ? (')))
  assert.doesNotMatch(editorSource, /是否加重或减轻|症状备注/)
})

test('voice failure preserves text and linked backfills use stable record ids', () => {
  assert.match(source, /已保留现有文字/)
  assert.match(source, /recognitionRef\.current\?\.stop/)
  assert.match(source, /linkedBackfill\.recordId/)
  assert.match(relations, /全部带入/)
  assert.match(relations, /补充没记过的内容/)
  assert.match(relations, /entry\.occurredAt/)
})

test('symptom photos use an isolated six-photo draft and structured save', () => {
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6, 'symptom'\)/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
})
