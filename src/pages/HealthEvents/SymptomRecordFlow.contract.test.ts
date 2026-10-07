import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SymptomRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')

test('symptom entry is narrative-first, optional, compact and directly saveable', () => {
  assert.match(recorder, /category === 'symptom' \? 'symptom-form'/)
  const formSource = source.slice(source.indexOf('const form ='), source.indexOf('export function RelatedRecordsSheet'))
  const cardSource=formSource.slice(formSource.indexOf('symptom-narrative'))
  const labels = ['症状描述', '症状部位', '补充信息', '发生时间', '拍照', '选照片', '语音输入', 'AI 护士']
  let cursor = -1
  for (const label of labels) { const next = cardSource.indexOf(label); assert.ok(next > cursor, `${label} should follow the prior field`); cursor = next }
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
  assert.match(source, /SymptomVoiceSheet/)
  assert.match(source, /symptom-record-toolbar/)
  assert.doesNotMatch(formSource.split('symptom-record-save')[0], /记录输入方式/)
  assert.doesNotMatch(formSource, /aria-label="关闭"/)
  assert.match(source, /placeholder="例如：左肘窝"/)
  assert.match(source, /buttonLabel=\{draft\.locations\.length \? '修改' : '选择部位'\}/)
  assert.doesNotMatch(formSource, /尚未选择部位|手动补充部位/)
  assert.match(formSource, /symptom-location-entry/)
  assert.match(source, /完成并返回症状记录/)
  assert.doesNotMatch(formSource, /symptom-supplement-summary/)
  assert.match(source, /\['little', '轻度'\].*\['some', '中度'\].*\['clear', '重度'\]/)
  assert.doesNotMatch(formSource, /触发或诱因|症状变化|还有什么需要补充/)
  assert.match(source, /aria-pressed=\{draft\.impactLevel === value\}/)
  assert.doesNotMatch(source, /type="range"/)
  assert.doesNotMatch(formSource, /症状摘要（选填）|反复出现|关联其他记录/)
  assert.doesNotMatch(source, /确认医学准确性|诊断/)
})

test('legacy related-record editor remains available outside the simplified create form', () => {
  assert.match(source, /linkedRecordIds/)
  assert.match(source, /aria-pressed=\{checked\}/)
  assert.match(source, /没有可关联的/)
  assert.doesNotMatch(source.slice(source.indexOf('return createPortal('), source.indexOf('export function RelatedRecordsSheet')), /关联其他记录/)
})

test('symptom photos use an isolated six-photo draft and structured real save', () => {
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6, draftScope === memberId \? 'symptom' : `symptom:\$\{draftScope\}`, true\)/)
  assert.doesNotMatch(source, /照片与附件/)
  assert.match(source, /videoInputRef/)
  assert.match(source, /photos\.payload\(\)/)
  assert.match(source, /categories: \['symptom'\], symptom: details/)
  assert.match(source, /sessionStorage\.removeItem\(draftKey\(draftScope\)\)/)
  assert.doesNotMatch(source, /附件.*拍照.*从相册选择/s)
})
