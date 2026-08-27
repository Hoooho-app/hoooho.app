import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const summarySource = readFileSync(new URL('./EventSummarySection.tsx', import.meta.url), 'utf8')
const recorderSource = readFileSync(new URL('./QuickVoiceRecordFlow.tsx', import.meta.url), 'utf8')
const timelineSource = readFileSync(new URL('./TimelineSection.tsx', import.meta.url), 'utf8')
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

test('微信说一句使用文字降级并复用现有预览和保存管线', () => {
  assert.match(recorderSource, /capability\.isWechat/)
  assert.match(recorderSource, /写下发生了什么/)
  assert.match(recorderSource, /自动整理/)
  assert.match(recorderSource, /微信内暂不支持语音记录/)
  assert.match(recorderSource, /如何在浏览器打开/)
  assert.match(recorderSource, /onPreviewRef\.current/)
  assert.match(pageSource, /createQuickRecordCandidates/)
  assert.match(pageSource, /onPreview=\{previewQuickRecord\}/)
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

test('时间线详情只在原地展开“发生了什么”和可选措施', () => {
  assert.match(timelineSource, /aria-expanded/)
  assert.match(timelineSource, /timeline-record-details/)
  assert.match(timelineSource, /发生了什么/)
  assert.match(timelineSource, /采取的措施/)
  assert.match(timelineSource, /展开详情/)
  assert.match(timelineSource, /收起详情/)
  assert.equal(timelineSource.includes('后续变化'), false)
  assert.match(stylesSource, /grid-template-rows:\s*0fr/)
  assert.match(stylesSource, /overflow-wrap:\s*anywhere/)
})

test('快捷记录预览明确一次输入只是一条记录', () => {
  assert.match(recorderSource, /识别到 1 条记录/)
  assert.equal(recorderSource.includes('识别到 {candidates.length} 条记录'), false)
})

test('自动整理无事实或失败时仍允许按原文确认保存', () => {
  assert.match(pageSource, /if \(!preview\.hasHealthFacts\) return \[\]/)
  assert.equal(pageSource.includes("throw new Error('暂未识别到健康记录"), false)
  assert.match(recorderSource, /暂未自动整理，可先按原文保存/)
  assert.match(recorderSource, /自动整理失败，可先按原文保存/)
  assert.match(recorderSource, /setState\('review'\)/)
  assert.match(recorderSource, /onConfirmRef\.current\(value/)
})

test('首次记录先保存完整原文且不再受 hasHealthFacts 硬阻断', () => {
  assert.match(pageSource, /content: recordText \|\| '图片记录'/)
  assert.match(pageSource, /原始记录已保存，暂未自动整理/)
  assert.match(pageSource, /commitRecord\(pending\.record\)/)
  assert.equal(pageSource.includes("throw new Error('暂未识别到健康相关信息"), false)
  assert.equal(firstRecordSource.includes('未识别到健康事件关键信息'), false)
})

test('降级保存保留空内容、未来时间和重复提交安全边界', () => {
  assert.match(firstRecordSource, /if \(!rawInput && !attachments\.length && !selectedLocations\.length\)/)
  assert.match(firstRecordSource, /isFutureOccurredAt\(occurredAt\)/)
  assert.match(firstRecordSource, /savingRef\.current/)
  assert.match(recorderSource, /submittingRef\.current/)
  assert.match(pageSource, /needsNewQuickRecord\(pending, transcript\)/)
  assert.match(pageSource, /pendingQuickRecordRef\.current = null/)
})

test('原文已保存后自动整理失败使用部分成功提示而不是整条保存失败', () => {
  assert.match(pageSource, /原始记录已保存，自动整理失败/)
  assert.match(recorderSource, /setSavedMessage\(message \|\| '已记录'\)/)
  assert.match(recorderSource, /state === 'saved' \? savedMessage/)
})
