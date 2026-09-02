import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('./index.tsx')
const firstMember = read('./FirstMemberFrontDesk.tsx')
const nurse = read('./NurseQuickRecord.tsx')
const trigger = read('../../components/health/QuickRecordTrigger.tsx')
const desk = read('./NurseTriageDesk.tsx')
const idleVisual = read('./IdleNurseVisual.tsx')
const flow = read('../HealthEventDetail/components/QuickVoiceRecordFlow.tsx')
const family = read('../Family/index.tsx')
const login = read('../Login/index.tsx')
const router = read('../../app/router.tsx')
const styles = read('../../styles/index.css')

test('前台视图成为默认主入口并保留显式列表切换', () => {
  assert.match(router, /path: '\/', element: <Navigate to="\/health-events" replace/)
  assert.match(page, /DEFAULT_HEALTH_EVENTS_VIEW_MODE/)
  assert.match(page, /health-events-view-switch/)
  assert.match(page, /\['triage', 'list'\]/)
  assert.doesNotMatch(page, /FirstUseHome|health-events-view-select__menu/)
})

test('零成员在前台内分流且不会预先创建空健康事件', () => {
  assert.match(firstMember, /先添加一位需要记录健康情况的人/)
  assert.match(firstMember, /可以是你自己，也可以是家人/)
  assert.match(firstMember, /添加第一个家人/)
  assert.match(firstMember, /我是为自己记录/)
  assert.match(page, /entryState\.familyMemberCount === 0/)
  assert.doesNotMatch(page, /!state\.data\.entryState\.hasValidHealthRecord/)
  assert.doesNotMatch(page, /healthEventService\.create|pendingTriageEventRef|ensurePendingTriageEvent/)
  assert.match(family, /state: \{ openQuickRecord: true \}/)
  assert.doesNotMatch(family, /healthEventService\.create/)
})

test('快速记录留在前台核对并只在确认保存时调用原子接口', () => {
  assert.match(trigger, /快速记录/)
  assert.match(flow, /if \(!onPreviewRef\.current\)[\s\S]*setState\('review'\)/)
  assert.match(flow, />确认保存</)
  assert.match(flow, /继续核对/)
  assert.match(flow, />结束听写</)
  assert.match(page, /quickRecordService\.create/)
  assert.match(page, /idempotencyKey: submissionKeyRef\.current/)
  assert.match(page, /已为 \$\{currentMember\.name\} 保存/)
  assert.doesNotMatch(nurse, /onPreview=/)
})

test('护士视觉由业务状态驱动并只请求当前图片', () => {
  assert.match(nurse, /onActivityChange=\{setActivity\}/)
  assert.match(nurse, /state=\{triageState\}/)
  assert.match(desk, /\{activeAsset && <img/)
  assert.doesNotMatch(desk, /allNurseTriageAssets\.map|preloadNurseTriageAssets/)
  assert.match(idleVisual, /idle-nurse-visual__poster/)
  assert.match(idleVisual, /fetchPriority="high"/)
  assert.match(idleVisual, /preload=\{videoIndex === 0 \? 'metadata' : 'none'\}/)
  assert.match(idleVisual, /preload="none"/)
})

test('底部只保留完整宽度主动作，下一步入口有文字标签', () => {
  assert.match(nurse, /nurse-next-action-link/)
  assert.match(nurse, /查看当前事件下一步/)
  assert.doesNotMatch(nurse, /nurse-next-action-trigger|<svg/)
  assert.match(styles, /health-events-content--triage[\s\S]*min-height:\s*0/)
})

test('登录等待反馈只在服务端成功后开始并支持返回邮箱后的聚焦', () => {
  assert.match(login, /const result = await authService\.sendEmailCode[\s\S]*setCountdown\(result\.retryAfter\)/)
  assert.match(login, /autoComplete="one-time-code"/)
  assert.match(login, /visibilitychange/)
  assert.match(login, /18_000/)
  assert.match(login, /检查垃圾邮件/)
  assert.match(login, /navigate\('\/health-events', \{ replace: true \}\)/)
  assert.match(login, /preload="metadata"/)
})
