import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
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
const nurseQuickRecordSource = readFileSync(new URL('./NurseQuickRecord.tsx', import.meta.url), 'utf8')
const quickRecordFlowSource = readFileSync(new URL('../HealthEventDetail/components/QuickVoiceRecordFlow.tsx', import.meta.url), 'utf8')
const idleVisualSource = readFileSync(new URL('./IdleNurseVisual.tsx', import.meta.url), 'utf8')
const idleSchedulerSource = readFileSync(new URL('./idleNurseAnimation.ts', import.meta.url), 'utf8')
const animationControllerSource = readFileSync(new URL('./nurseAnimationController.ts', import.meta.url), 'utf8')

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
  assert.match(pageSource, /viewMode === 'triage'[^]*<NurseQuickRecord/s)
  assert.match(nurseQuickRecordSource, /<QuickVoiceRecordFlow/)
  assert.match(nurseQuickRecordSource, /<QuickRecordTrigger/)
  assert.doesNotMatch(nurseQuickRecordSource, /开始说话/)
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
  assert.match(idleVisualSource, /window\.clearTimeout\(specialLoadTimerRef\.current\)/)
  assert.match(idleVisualSource, /removeEventListener\('ended'/)
  assert.match(nurseQuickRecordSource, /reducedMotion/)
  assert.match(pageStylesSource, /\.nurse-triage-desk\s*{[^}]*aspect-ratio:\s*1\s*\/\s*1/s)
})

test('健康事件页继承全局底板且不维护页面级颜色补丁', () => {
  assert.match(pageSource, /className="hoho-health-events-page app-shell/)
  assert.doesNotMatch(pageStylesSource, /\.app-shell\.hoho-health-events-page\s*{[^}]*background:/s)
})

test('双待机循环与趣味动作由单一控制器管理且最多只有一个可见播放器', () => {
  assert.match(idleVisualSource, /import idleVideoOneSource from '\.\.\/\.\.\/assets\/nurse-triage\/nurses-idle-loop-1\.mp4'/)
  assert.match(idleVisualSource, /import idleVideoTwoSource from '\.\.\/\.\.\/assets\/nurse-triage\/nurses-idle-loop-2\.mp4'/)
  assert.match(idleVisualSource, /const idlePlaylist = \[idleVideoOneSource, idleVideoTwoSource\] as const/)
  assert.match(idleSchedulerSource, /idle-blonde-chair-spin\.mp4/)
  assert.match(idleSchedulerSource, /idle-blonde-stretch\.mp4/)
  assert.match(idleSchedulerSource, /idle-blonde-water-plant\.mp4/)
  assert.equal(idleVisualSource.match(/<video/g)?.length, 2)
  assert.match(idleVisualSource, /autoPlay=\{idlePlayer === 0 && active && !reducedMotion\}/)
  assert.match(idleVisualSource, /preload="auto"/)
  assert.match(idleVisualSource, /loop=\{false\}/)
  assert.match(idleVisualSource, /onEnded=\{\(\) => handleIdleEnded\(idlePlayer\)\}/)
  assert.match(idleVisualSource, /onPlaying=\{\(\) => handleIdlePlaying\(idlePlayer\)\}/)
  assert.match(idleVisualSource, /muted/)
  assert.match(idleVisualSource, /playsInline/)
  assert.match(idleVisualSource, /disablePictureInPicture/)
  assert.match(idleVisualSource, /controls=\{false\}/)
  assert.match(idleVisualSource, /controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"/)
  assert.match(idleVisualSource, /tabIndex=\{-1\}/)
  assert.match(idleVisualSource, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(idleVisualSource, /addEventListener\('ended'/)
  assert.match(idleVisualSource, /addEventListener\('error'/)
  assert.match(idleVisualSource, /addEventListener\('abort'/)
  assert.match(idleVisualSource, /addEventListener\('stalled'/)
  assert.match(idleVisualSource, /specialPlaybackStartTimeoutMs = 5_000/)
  assert.match(idleVisualSource, /requestIdRef\.current = requestId \+ 1/)
  assert.match(animationControllerSource, /RETURN_TO_IDLE/)
  assert.match(animationControllerSource, /event\.requestId < current\.requestId/)
  assert.doesNotMatch(idleVisualSource, /createObjectURL|requestAnimationFrame|setInterval/)
  assert.doesNotMatch(idleVisualSource, /<img|poster=|staticSource/)
  const obsoleteIdleNames = [
    ['idle', 'video', 'first', 'frame'].join('-') + '.png',
    ['idle', 'working'].join('-') + '.png',
    'idle' + '.png'
  ]
  obsoleteIdleNames.forEach((name) => {
    assert.equal(idleVisualSource.includes(name), false)
    assert.equal(nurseDeskSource.includes(name), false)
  })
  assert.match(idleVisualSource, /onError=\{\(\) => retryIdleVideo\(idlePlayer\)\}/)
  assert.match(idleVisualSource, /(?:video|idleVideoRefs\.current\[player\]\?)\.load\(\)/)
  assert.match(pageStylesSource, /\.nurse-triage-desk\s*\{[^}]*background:\s*#fff[^}]*border:\s*0[^}]*outline:\s*0[^}]*box-shadow:\s*none[^}]*pointer-events:\s*none/s)
  assert.match(pageStylesSource, /\.nurse-triage-desk::after\s*\{[^}]*transparent 10px[^}]*#fff 100%/s)
  assert.match(pageStylesSource, /\.idle-nurse-visual__idle-video,[^}]*\.idle-nurse-visual__special-video\s*\{[^}]*pointer-events:\s*none[^}]*user-select:\s*none/s)
  assert.match(pageStylesSource, /\.idle-nurse-visual__special-video\s*{[^}]*opacity:\s*0/s)
  assert.match(pageStylesSource, /idle-video\[data-active='true'\][^}]*opacity:\s*1/s)
  assert.match(pageStylesSource, /data-mode='special'[^}]*opacity:\s*1/s)
  assert.match(pageStylesSource, /data-mode='special'[^}]*idle-video[^}]*opacity:\s*0/s)
})

test('双待机资产内容正确且旧静态素材已删除', () => {
  const idleVideoOne = new URL('../../assets/nurse-triage/nurses-idle-loop-1.mp4', import.meta.url)
  const idleVideoTwo = new URL('../../assets/nurse-triage/nurses-idle-loop-2.mp4', import.meta.url)
  const idleVideoOneHash = createHash('sha256').update(readFileSync(idleVideoOne)).digest('hex')
  const idleVideoTwoHash = createHash('sha256').update(readFileSync(idleVideoTwo)).digest('hex')
  assert.equal(idleVideoOneHash, '7b33746af4e7a2f1281c00b2c66ddabe0e834eac433135a9ec058ec07a243be1')
  assert.equal(idleVideoTwoHash, '5e533b30a78f901f5431004efd723bc624da3122fe3d749ea39efc3c6aca5082')

  const removedAssets = [
    ['nurses', 'idle', 'loop'].join('-') + '.mp4',
    ['idle', 'video', 'first', 'frame'].join('-') + '.png',
    ['idle', 'working'].join('-') + '.png',
    'idle' + '.png'
  ]
  removedAssets.forEach((name) => {
    const publicAsset = new URL(`../../../public/nurse-triage/${name}`, import.meta.url)
    assert.equal(existsSync(publicAsset), false)
  })
})

test('智能查看直接复用详情快捷记录并在完成后停留当前视图', () => {
  assert.match(quickRecordFlowSource, /getBrowserVoiceCapability/)
  assert.match(quickRecordFlowSource, /aria-label="确认快捷记录"/)
  assert.match(pageSource, /onPreview=\{previewTriageRecord\}/)
  assert.match(pageSource, /onConfirm=\{saveTriageRecord\}/)
  assert.doesNotMatch(nurseQuickRecordSource, /SpeechRecognition|setInterval|navigator\.mediaDevices/)
  assert.doesNotMatch(nurseQuickRecordSource, /setViewMode\('list'\)/)
})

test('智能查看快捷记录严格绑定当前人物、复用真实预览保存链路并刷新列表', () => {
  assert.match(pageSource, /currentMemberDto\.id !== currentMemberId/)
  assert.match(pageSource, /memberId: currentMemberDto\.id/)
  assert.match(pageSource, /healthRecordOrganizationService\.preview\(pending\.eventId/)
  assert.match(pageSource, /healthEventRecordService\.create\(pending\.eventId/)
  assert.match(pageSource, /healthRecordOrganizationService\.organize\(pending\.eventId/)
  assert.match(pageSource, /pendingTriageEventRef\.current = null/)
  assert.match(pageSource, /retry\(\)/)
})

test('智能查看使用动态视口单屏布局且快捷记录面板为键盘保留操作区', () => {
  assert.match(pageSource, /data-view-mode=\{viewMode\}/)
  assert.match(pageSource, /health-events-content--triage overflow-hidden/)
  assert.match(pageStylesSource, /data-view-mode='triage'[^}]*height:\s*100dvh[^}]*min-height:\s*0/s)
  assert.match(pageStylesSource, /health-events-content--triage[^}]*display:\s*flex[^}]*min-height:\s*0[^}]*flex-direction:\s*column/s)
  assert.match(pageStylesSource, /nurse-triage-visual-slot[^}]*min-height:\s*0/s)
  assert.match(pageStylesSource, /nurse-triage-recorder \.nurse-quick-record-trigger[^}]*position:\s*static[^}]*width:\s*100%/s)
  assert.match(quickRecordFlowSource, /window\.visualViewport/)
  assert.match(pageStylesSource, /quick-record-viewport-height/)
  assert.match(pageStylesSource, /quick-record-panel-review[^}]*flex-direction:\s*column/s)
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

test('列表移除日期轴并把弱化后的日期放入每张事件卡片', () => {
  assert.doesNotMatch(timelineSource, /HealthTimeline|hoho-timeline/)
  assert.match(timelineSource, /aria-label="按日期排序的健康事件"/)
  assert.match(timelineSource, /dateLabel=\{formatPlainMonthDay\(dateGroup\.date\)\}/)
  assert.match(timelineSource, /weekdayLabel=\{formatPlainWeekday\(dateGroup\.date\)\}/)
  assert.match(cardSource, /dateLabel=\{dateLabel\}/)
  assert.match(cardSurfaceSource, /health-event-list-card__date[^]*dateLabel[^]*weekdayLabel[^]*definitionTitle/)
  assert.match(pageSource, /className="hoho-year-tabs health-events-year-tabs"/)
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
