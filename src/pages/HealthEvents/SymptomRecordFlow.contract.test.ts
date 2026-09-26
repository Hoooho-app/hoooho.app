import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('symptom entry is narrative-first, optional, compact and directly saveable', () => {
  assert.match(recorder, /category === 'symptom' \? 'symptom-form'/)
  const formSource = source.slice(source.indexOf('return <div className="symptom-record-page-layer"'), source.indexOf('export function RelatedRecordsSheet'))
  const labels = ['哪里不舒服？', '症状部位', '照片与附件', '补充信息', '发生时间']
  let cursor = -1
  for (const label of labels) { const next = formSource.indexOf(label); assert.ok(next > cursor, `${label} should follow the prior field`); cursor = next }
  assert.match(source, /描述症状和变化，例如：左肘窝发红、发痒/)
  assert.match(source, /正在整理症状描述/)
  assert.match(source, /symptomPreviewService\.preview/)
  assert.match(source, /onCompositionStart=/)
  assert.match(source, /previewVersionRef/)
  assert.match(source, /onBlur=\{\(\) => \{ if \(narrativeRef\.current\) narrativeRef\.current\.scrollTop = 0 \}\}/)
  assert.match(source, /请填写哪里不舒服/)
  assert.doesNotMatch(source, /请填写具体部位，或使用定位/)
  assert.match(source, /暂未生成摘要，可直接保存原文/)
  assert.match(source, /暂时无法整理，可直接保存原文/)
  assert.doesNotMatch(source, /正在为：|symptom-record-member|autoFocus/)
  assert.doesNotMatch(source, /语音输入症状|SpeechRecognition|webkitSpeechRecognition/)
  assert.match(source, /placeholder="例如：左肘窝"/)
  assert.match(source, /buttonLabel=\{draft\.locations\.length \? '修改' : '选择部位'\}/)
  assert.match(source, /尚未选择部位/)
  assert.match(source, /完成并返回症状记录/)
  assert.match(source, /严重程度、诱因、变化、备注/)
  assert.match(source, /\['little', '轻度'\].*\['some', '中度'\].*\['clear', '重度'\]/)
  assert.match(source, /\['improving', '减轻'\].*\['same', '无明显变化'\].*\['more_noticeable', '加重'\]/)
  assert.match(source, /placeholder="还有什么需要补充？"/)
  assert.match(source, /aria-pressed=\{draft\.impactLevel === value\}/)
  assert.match(source, /aria-pressed=\{draft\.trend === value\}/)
  assert.doesNotMatch(source, /type="range"/)
  assert.doesNotMatch(formSource, /症状摘要（选填）|反复出现|关联其他记录/)
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
  assert.match(source, /照片与附件/)
  assert.match(source, /\$\{photos\.photos\.length\} 张照片/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
  assert.match(source, /sessionStorage\.removeItem\(draftKey\(memberId\)\)/)
  assert.doesNotMatch(source, /附件.*拍照.*从相册选择/s)
})
