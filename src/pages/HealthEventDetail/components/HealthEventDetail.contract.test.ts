import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const summarySource = readFileSync(new URL('./EventSummarySection.tsx', import.meta.url), 'utf8')
const recorderSource = readFileSync(new URL('./QuickVoiceRecordFlow.tsx', import.meta.url), 'utf8')
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
