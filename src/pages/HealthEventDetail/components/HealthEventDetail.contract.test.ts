import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const summarySource = readFileSync(new URL('./EventSummarySection.tsx', import.meta.url), 'utf8')
const recorderSource = readFileSync(new URL('./QuickVoiceRecordFlow.tsx', import.meta.url), 'utf8')
const firstRecordSource = readFileSync(new URL('./FirstRecordComposer.tsx', import.meta.url), 'utf8')
const headerSource = readFileSync(new URL('./EventHeader.tsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../../styles/index.css', import.meta.url), 'utf8')

test('紧凑摘要不再渲染旧说明和校对入口', () => {
  for (const removed of ['手动校对', '自动整理', '依据：', '系统会根据后续记录自动更新']) {
    assert.equal(summarySource.includes(removed), false)
  }
  assert.match(summarySource, /event-summary-tags/)
  assert.match(summarySource, /event-summary-description/)
  assert.match(stylesSource, /event-summary-tags[^}]*flex-nowrap/)
  assert.match(stylesSource, /-webkit-line-clamp:\s*2/)
})

test('详情页使用悬浮快捷记录且不保留说一句中间流程', () => {
  assert.match(pageSource, /quick-record-trigger/)
  assert.match(pageSource, />快捷记录</)
  assert.equal(pageSource.includes('继续说'), false)
  assert.equal(recorderSource.includes('说一句'), false)
  assert.match(stylesSource, /quick-record-trigger[^}]*fixed/)
  assert.match(stylesSource, /safe-area-inset-bottom/)
})

test('录音面板提供取消确认和防重复提交边界', () => {
  assert.match(recorderSource, />取消</)
  assert.match(recorderSource, /aria-label="确认快捷记录"/)
  assert.match(recorderSource, /submittingRef\.current/)
  assert.match(recorderSource, /stopSession\(true\)/)
  assert.match(stylesSource, /prefers-reduced-motion/)
})

test('首次记录使用紧凑表单、顶部保存和明确的选填文案', () => {
  assert.match(pageSource, /title=\{hasRecords \? '健康事件详情' : '记录情况'\}/)
  assert.match(headerSource, /aria-label="保存记录情况"/)
  assert.equal(firstRecordSource.includes('<h2'), false)
  assert.equal(firstRecordSource.includes('保存，自动整理'), false)
  assert.match(firstRecordSource, /身体部位（选填）/)
  assert.match(firstRecordSource, /buttonLabel="身体部位选择器"/)
  assert.match(firstRecordSource, /添加附件（选填）/)
  assert.match(firstRecordSource, /检查报告、处方、药品或身体部位照片/)
  assert.match(firstRecordSource, /placeholder="请描述发生了什么…"/)
})

test('首次记录快捷录音只追加描述，不直接保存整张表单', () => {
  assert.match(firstRecordSource, /appendQuickRecordTranscript/)
  assert.match(firstRecordSource, /setText\(\(current\) => appendQuickRecordTranscript/)
  assert.match(firstRecordSource, /first-record-quick-trigger/)
  assert.match(stylesSource, /first-record-description[^}]*120px/)
  assert.match(stylesSource, /first-record-attachments[^}]*overflow-x:\s*auto/)
})
