import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const recorderSource = readFileSync(new URL('./QuickVoiceRecordFlow.tsx', import.meta.url), 'utf8')
const timelineSource = readFileSync(new URL('./TimelineSection.tsx', import.meta.url), 'utf8')
const recordSheetSource = readFileSync(new URL('./SymptomRecordSheet.tsx', import.meta.url), 'utf8')
const firstRecordSource = readFileSync(new URL('./FirstRecordComposer.tsx', import.meta.url), 'utf8')
const headerSource = readFileSync(new URL('./EventHeader.tsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8')
const quickRecordTriggerSource = readFileSync(new URL('../../../components/health/QuickRecordTrigger.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../../styles/index.css', import.meta.url), 'utf8')
const polishStylesSource = readFileSync(new URL('../../../styles/product-polish.css', import.meta.url), 'utf8')

test('详情页收敛为症状跟踪且移除旧摘要和体温图表', () => {
  assert.match(pageSource, /title=\{hasRecords \? '症状跟踪'/)
  assert.match(timelineSource, />症状跟踪</)
  assert.equal(pageSource.includes('<EventSummarySection'), false)
  assert.equal(pageSource.includes('<TemperatureChartSection'), false)
})

test('时间线从日期节点开始、时段使用空心节点且卡片位于时段下方', () => {
  assert.match(timelineSource, /timeline-groups/)
  assert.match(timelineSource, /timeline-date-group/)
  assert.match(timelineSource, /timeline-date-heading/)
  assert.match(timelineSource, /timeline-entry-time/)
  assert.match(timelineSource, /timeline-entry-marker/)
  assert.match(timelineSource, /dateGroup\.date/)
  assert.equal(timelineSource.includes('{yearGroup.year}年'), false)
  assert.match(stylesSource, /timeline-groups::before[^}]*border-l/)
  assert.match(stylesSource, /timeline-entry-marker[^}]*border-2[^}]*bg-background/)
  assert.match(stylesSource, /timeline-entry-row[^}]*space-y-3/)
  assert.equal(stylesSource.includes('grid-cols-[112px_minmax(0,1fr)]'), false)
})

test('时间线排序入口复用设计系统图标按钮', () => {
  assert.match(timelineSource, /<HohoButton/)
  assert.match(timelineSource, /size="icon"/)
  assert.match(timelineSource, /variant="ghost"/)
  assert.match(timelineSource, /strokeWidth=\{1\.7\}/)
})

test('详情页使用悬浮快捷记录且不保留说一句中间流程', () => {
  assert.match(pageSource, /<QuickRecordTrigger/)
  assert.match(quickRecordTriggerSource, /quick-record-trigger/)
  assert.match(quickRecordTriggerSource, /快捷记录/)
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

test('首次记录使用紧凑表单、顶部保存和症状优先的字段顺序', () => {
  assert.match(pageSource, /title=\{hasRecords \? '症状跟踪' : '记录情况'\}/)
  assert.match(headerSource, /aria-label="保存记录情况"/)
  assert.equal(firstRecordSource.includes('<h2'), false)
  assert.equal(firstRecordSource.includes('保存，自动整理'), false)
  assert.match(firstRecordSource, />开始时间</)
  assert.match(firstRecordSource, />描述症状</)
  assert.match(firstRecordSource, /症状部位（选填）/)
  assert.match(firstRecordSource, /buttonLabel="身体部位定位器"/)
  assert.match(firstRecordSource, /inputLike/)
  assert.match(firstRecordSource, /showEmptyState=\{false\}/)
  assert.match(firstRecordSource, /附件补充（选填）/)
  assert.match(firstRecordSource, />上传图片</)
  assert.match(firstRecordSource, /检查报告、处方、药品或身体部位照片/)
  assert.match(firstRecordSource, /placeholder="请描述发生了什么…"/)
  assert.ok(firstRecordSource.indexOf('描述症状') < firstRecordSource.indexOf('症状部位（选填）'))
  assert.match(polishStylesSource, /body-location-picker-row--input/)
})

test('首次记录快捷录音只追加描述，不直接保存整张表单', () => {
  assert.match(firstRecordSource, /appendQuickRecordTranscript/)
  assert.match(firstRecordSource, /setText\(\(current\) => appendQuickRecordTranscript/)
  assert.match(firstRecordSource, /first-record-quick-trigger/)
  assert.match(stylesSource, /first-record-description[^}]*120px/)
  assert.match(stylesSource, /first-record-attachments[^}]*overflow-x:\s*auto/)
})

test('症状记录使用轻量行、详情抽屉和左滑编辑删除', () => {
  assert.match(timelineSource, /symptom-record-row/)
  assert.match(timelineSource, /symptom-record-source/)
  assert.match(timelineSource, /SymptomRecordSheet/)
  assert.match(timelineSource, /onPointerMove/)
  assert.match(timelineSource, /编辑症状记录/)
  assert.match(timelineSource, /删除症状记录/)
  assert.match(recordSheetSource, /症状记录详情/)
  assert.match(recordSheetSource, /来源信息/)
  assert.match(recordSheetSource, /原始记录/)
  assert.match(recordSheetSource, /未说明/)
  assert.match(recordSheetSource, /发生时间/)
  assert.match(recordSheetSource, /测量设备/)
  assert.match(recordSheetSource, /测量方式/)
  assert.match(recordSheetSource, /备注（可选）/)
  assert.match(stylesSource, /symptom-record-swipe__actions/)
  assert.match(stylesSource, /overflow-wrap:\s*anywhere/)
})

test('快捷记录预览按识别结果展示多条独立记录', () => {
  assert.match(recorderSource, /识别到 \$\{candidates\.length\} 条症状记录/)
  assert.match(pageSource, /for \(const item of items\)/)
  assert.match(pageSource, /已整理为 \$\{items\.length\} 条症状记录/)
})

test('自动整理无事实或失败时仍允许按原文确认保存', () => {
  assert.match(pageSource, /if \(!preview\.hasHealthFacts\) return \[\]/)
  assert.equal(pageSource.includes("throw new Error('暂未识别到健康记录"), false)
  assert.match(recorderSource, /暂未自动整理，可先按原文保存/)
  assert.match(recorderSource, /自动整理失败，可先按原文保存/)
  assert.match(recorderSource, /setState\('review'\)/)
  assert.match(recorderSource, /onConfirmRef\.current\(value, occurredAtRef\.current \|\| new Date\(\)\.toISOString\(\), candidatesRef\.current\)/)
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
  assert.match(pageSource, /pending\.transcript !== transcript/)
  assert.match(pageSource, /pendingQuickRecordRef\.current = null/)
})

test('原文已保存后自动整理失败使用部分成功提示而不是整条保存失败', () => {
  assert.match(pageSource, /原始记录已保存，自动整理失败/)
  assert.match(recorderSource, /setSavedMessage\(message \|\| '已记录'\)/)
  assert.match(recorderSource, /state === 'saved' \? savedMessage/)
})
