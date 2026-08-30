import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../styles/design-system.css', import.meta.url), 'utf8')
const pageStylesSource = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('../../components/health/HealthEventCard.tsx', import.meta.url), 'utf8')
const cardSurfaceSource = readFileSync(new URL('../../components/health/HealthEventCardSurface.tsx', import.meta.url), 'utf8')
const filterSource = readFileSync(new URL('../../components/health/HealthEventFilterSheet.tsx', import.meta.url), 'utf8')
const firstUseSource = readFileSync(new URL('./FirstUseHome.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../Settings/index.tsx', import.meta.url), 'utf8')
const preferencesSource = readFileSync(new URL('../../features/settings/preferences.ts', import.meta.url), 'utf8')
const timelineSource = readFileSync(new URL('../../components/health/HealthEventTimeline.tsx', import.meta.url), 'utf8')
const helpSource = readFileSync(new URL('../../features/help/articles.ts', import.meta.url), 'utf8')
const nurseDeskSource = readFileSync(new URL('./NurseTriageDesk.tsx', import.meta.url), 'utf8')
const nurseRecorderSource = readFileSync(new URL('./NurseTriageRecorder.tsx', import.meta.url), 'utf8')
const idleVisualSource = readFileSync(new URL('./IdleNurseVisual.tsx', import.meta.url), 'utf8')
const idleSchedulerSource = readFileSync(new URL('./idleNurseAnimation.ts', import.meta.url), 'utf8')

test('健康事件首页始终使用当前人物范围、紧凑标题和左对齐年份导航', () => {
  assert.match(pageSource, /label="当前人物"/)
  assert.match(pageSource, /getMemberHealthEvents\(state\.data\.events, currentMemberDto\?\.id\)/)
  assert.match(pageSource, /state\.data\.members\.find\(\(member\) => member\.id === currentMemberId\) \?\? null/)
  assert.match(pageSource, /state: \{ familyEntry: \{ returnTo: '\/health-events'/)
  const obsoleteRuntimeNames = [
    ['viewing', 'All'].join(''),
    ['view', 'Scope'].join(''),
    ['member', 'Count'].join('')
  ]
  obsoleteRuntimeNames.forEach((name) => assert.equal(pageSource.includes(name), false))
  assert.equal(`${pageSource}\n${timelineSource}\n${cardSource}`.includes(['show', 'Member', 'Name'].join('')), false)
  assert.match(pageSource, /className="health-events-list-title" variant="sectionTitle">事件列表/)
  assert.match(pageSource, /className="hoho-year-tabs health-events-year-tabs"/)
  assert.match(stylesSource, /\.health-events-list-title\s*{[^}]*var\(--hoho-font-size-card-title\)/s)
  assert.match(stylesSource, /\.health-events-year-tabs \.hoho-year-tabs__item\s*{[^}]*flex-grow:\s*0[^}]*text-align:\s*left/s)
})

test('同一健康事件页提供纯 Icon 查看切换且智能记录视图隐藏筛选', () => {
  assert.match(pageSource, /aria-label="列表视图"/)
  assert.match(pageSource, /aria-label="智能记录视图"/)
  assert.match(pageSource, /shouldShowHealthEventFilters\(viewMode\)/)
  assert.match(pageSource, /viewMode === 'triage'[^]*<NurseTriageRecorder/s)
  assert.doesNotMatch(pageSource, /智能模式|护士模式|陪伴模式/)
})

test('护士记录严格绑定当前人物并走真实事件和记录保存接口', () => {
  assert.match(pageSource, /currentMemberDto\.id !== currentMemberId/)
  assert.match(pageSource, /memberId: currentMemberDto\.id/)
  assert.match(pageSource, /title: normalizeHealthEventTitle\('', transcript\)/)
  assert.match(pageSource, /healthEventRecordService\.create\(pending\.eventId/)
  assert.match(pageSource, /void retry\(\)/)
  assert.doesNotMatch(pageSource, /mock/i)
})

test('护士状态资产预加载、固定画框、待机调度清理并支持 Reduced Motion', () => {
  assert.match(nurseDeskSource, /preloadNurseTriageAssets/)
  assert.match(nurseDeskSource, /Object\.values\(nurseTriageAssets\)/)
  assert.match(nurseDeskSource, /document\.addEventListener\('visibilitychange'/)
  assert.match(idleSchedulerSource, /class IdleAnimationScheduler/)
  assert.match(idleSchedulerSource, /this\.clearPendingTimer\(\)/)
  assert.match(idleVisualSource, /clearVisualTimers/)
  assert.match(nurseRecorderSource, /prefers-reduced-motion|reducedMotion/)
  assert.match(pageStylesSource, /\.nurse-triage-desk\s*{[^}]*aspect-ratio:\s*498\s*\/\s*442/s)
})

test('待机动作复用三份视频且只渲染单一静音内联播放器', () => {
  assert.match(idleSchedulerSource, /idle-blonde-chair-spin\.mp4/)
  assert.match(idleSchedulerSource, /idle-blonde-stretch\.mp4/)
  assert.match(idleSchedulerSource, /idle-blonde-water-plant\.mp4/)
  assert.equal(idleVisualSource.match(/<video/g)?.length, 1)
  assert.match(idleVisualSource, /muted/)
  assert.match(idleVisualSource, /playsInline/)
  assert.match(idleVisualSource, /disablePictureInPicture/)
  assert.match(idleVisualSource, /controls=\{false\}/)
  assert.match(idleVisualSource, /playIdleVideoSafely\(\(\) => video\.play\(\)\)/)
  assert.doesNotMatch(idleVisualSource, /\bloop\b/)
  assert.doesNotMatch(idleVisualSource, /createObjectURL|requestAnimationFrame|setInterval/)
})

test('麦克风失败提供文字输入且保存成功后不自动切回列表', () => {
  assert.match(nurseRecorderSource, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(nurseRecorderSource, /aria-label="原始转写"/)
  assert.match(nurseRecorderSource, /move\('saveSucceeded'\)/)
  assert.doesNotMatch(nurseRecorderSource, /setViewMode\('list'\)/)
})

test('个性化设置不再提供跨人物首页范围且偏好层不再声明该字段', () => {
  const obsoleteSettingLabel = ['首页', '默认', '查看'].join('')
  const obsoleteAllLabel = ['全部', '家人'].join('')
  const obsoletePreference = ['home', 'Default', 'View'].join('')

  assert.equal(settingsSource.includes(obsoleteSettingLabel), false)
  assert.equal(settingsSource.includes(obsoleteAllLabel), false)
  assert.equal(settingsSource.includes(obsoletePreference), false)
  assert.equal(preferencesSource.includes(obsoletePreference), false)
})

test('普通健康事件页直接为当前人物创建记录且不再二次确认', () => {
  const obsoleteNames = [
    ['record', 'Subject', 'Open'].join(''),
    ['record', 'Subject', 'Behavior'].join(''),
    ['Record', 'Subject', 'Behavior'].join(''),
    ['确认', '记录对象'].join(''),
    ['这次', '为谁记录'].join(''),
    ['使用', '习惯'].join(''),
    ['新建', '记录时'].join(''),
    ['每次', '确认记录对象'].join(''),
    ['记住', '上次选择'].join(''),
    ['避免把健康记录', '记错人'].join('')
  ]

  obsoleteNames.forEach((name) => {
    assert.equal(pageSource.includes(name), false)
    assert.equal(settingsSource.includes(name), false)
    assert.equal(preferencesSource.includes(name), false)
  })
  assert.match(pageSource, /const createEmptyEvent = async \(member = currentMemberDto\)/)
  assert.match(pageSource, /memberId: member\.id/)
  assert.match(pageSource, /const beginNewRecord = \(\) => \{\s*void createEmptyEvent\(\)\s*\}/s)
  assert.doesNotMatch(pageSource, /<BottomSheetSurface|<HohoSurfaceRow/)
  assert.match(pageSource, /onClick=\{beginNewRecord\}/)
})

test('帮助说明指向顶部当前人物且首次使用页保留必要的起始对象选择', () => {
  assert.match(helpSource, /从健康事件首页为当前人物开始记录/)
  assert.match(helpSource, /确认顶部显示的是正确人物/)
  assert.doesNotMatch(helpSource, /选择记录对象并描述情况|确认记录对象并描述情况/)
  assert.match(firstUseSource, /title="这件事发生在谁身上？"/)
  assert.match(firstUseSource, /title="我自己"/)
  assert.match(firstUseSource, /title="家人"/)
})

test('新增健康事件按钮恢复主绿色单色样式', () => {
  assert.match(pageSource, /className="health-events-fab[^\"]*bg-primary[^\"]*shadow-floating/)
  assert.doesNotMatch(pageStylesSource, /\.health-events-fab\s*{[^}]*linear-gradient/s)
})

test('首次使用首页保留侧边栏导航且只展示指定行动与能力说明', () => {
  assert.match(firstUseSource, /<MainAppHeader title="Hoooho" \/>/)
  assert.match(firstUseSource, /今天想记录什么？/)
  assert.match(firstUseSource, /记录一件健康情况/)
  assert.match(firstUseSource, /添加家人/)
  assert.match(firstUseSource, /看看怎么使用/)
  assert.match(firstUseSource, /症状和变化/)
  assert.match(firstUseSource, /用药、检查与就诊/)
  assert.match(firstUseSource, /就诊前摘要/)
  assert.doesNotMatch(firstUseSource, /BottomNav|Bell|消息中心|个人中心/)
})

test('首次使用首页在 iPhone SE 使用紧凑但可触控的行动区', () => {
  assert.match(firstUseSource, /min-h-\[104px\]/)
  assert.equal(firstUseSource.match(/min-h-\[76px\]/g)?.length, 2)
  assert.match(firstUseSource, /min-h-\[54px\]/)
  assert.doesNotMatch(firstUseSource, /min-h-\[(?:148|112|72)px\]/)
})

test('事件定性标题与生命周期状态同行，速览为单行轻量文本', () => {
  assert.match(cardSource, /HealthEventCardSurface/)
  assert.match(cardSurfaceSource, /flex min-w-0 items-center gap-1\.5[^]*definitionTitle[^]*HealthTag[^]*statusPresentation\.label/)
  assert.doesNotMatch(cardSurfaceSource, /Typography className="min-w-0 flex-1 truncate"/)
  assert.match(stylesSource, /\.hoho-health-tag\[data-tone='info'\][^}]*--hoho-color-info/s)
  assert.match(cardSurfaceSource, /className="block truncate"[^]*quickFacts\.join\(' · '\)/)
  assert.doesNotMatch(cardSource, /event\.summary/)
  assert.doesNotMatch(cardSource, /<div><HealthTag/)
})

test('长标题和速览在箭头前截断且整张卡片保持单一点击入口', () => {
  assert.match(cardSurfaceSource, /Typography className="min-w-0 truncate"/)
  assert.match(cardSurfaceSource, /ChevronRight className="shrink-0/)
  assert.match(cardSource, /navigate\(`\/health-events\/\$\{event\.id\}`\)/)
})

test('已康复事件使用低饱和成功色卡片背景', () => {
  assert.match(cardSource, /health-event-list-card--recovered/)
  assert.match(pageStylesSource, /\.hoho-health-card\.health-event-list-card--recovered\s*{[^}]*--hoho-color-success[^}]*5%/s)
})

test('月份筛选以单行数字呈现且事件类型来自列表定性标题', () => {
  assert.match(filterSource, /health-events-month-row[^]*Array\.from\(\{ length: 12 \}/)
  assert.match(filterSource, />\{month\}<\/button>/)
  assert.doesNotMatch(filterSource, />\{`\$\{month\}月`\}<\/button>/)
  assert.match(pageStylesSource, /\.health-events-month-row\s*{[^}]*grid-template-columns:\s*repeat\(12,/s)
  assert.match(pageSource, /getHealthEventDefinitionTitleOptions\(memberEvents\)/)
  assert.match(pageSource, /filters\.definitionTitles\.includes\(event\.definitionTitle\)/)
  assert.doesNotMatch(filterSource, /\['fever', '发烧'\]/)
})
