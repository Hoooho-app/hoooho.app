import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../styles/design-system.css', import.meta.url), 'utf8')
const pageStylesSource = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('../../components/health/HealthEventCard.tsx', import.meta.url), 'utf8')
const cardSurfaceSource = readFileSync(new URL('../../components/health/HealthEventCardSurface.tsx', import.meta.url), 'utf8')
const cardIconSource = readFileSync(new URL('../../components/health/HealthEventCardIcon.tsx', import.meta.url), 'utf8')
const filterSource = readFileSync(new URL('../../components/health/HealthEventFilterSheet.tsx', import.meta.url), 'utf8')
const firstUseSource = readFileSync(new URL('./FirstUseHome.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../Settings/index.tsx', import.meta.url), 'utf8')
const preferencesSource = readFileSync(new URL('../../features/settings/preferences.ts', import.meta.url), 'utf8')
const timelineSource = readFileSync(new URL('../../components/health/HealthEventTimeline.tsx', import.meta.url), 'utf8')
const helpSource = readFileSync(new URL('../../features/help/articles.ts', import.meta.url), 'utf8')
const nurseDeskSource = readFileSync(new URL('./NurseTriageDesk.tsx', import.meta.url), 'utf8')
const nurseQuickRecordSource = readFileSync(new URL('./NurseQuickRecord.tsx', import.meta.url), 'utf8')
const nurseQuickRecordStylesSource = readFileSync(new URL('./NurseQuickRecord.css', import.meta.url), 'utf8')
const nurseNextActionSource = readFileSync(new URL('./NurseNextAction.tsx', import.meta.url), 'utf8')
const nurseNextActionContextSource = readFileSync(new URL('./nurseNextActionContext.ts', import.meta.url), 'utf8')
const quickRecordFlowSource = readFileSync(new URL('../HealthEventDetail/components/QuickVoiceRecordFlow.tsx', import.meta.url), 'utf8')
const actionSheetSource = readFileSync(new URL('../HealthEventDetail/components/ActionSheet.tsx', import.meta.url), 'utf8')
const detailPageSource = readFileSync(new URL('../HealthEventDetail/index.tsx', import.meta.url), 'utf8')
const stickyHeaderSource = readFileSync(new URL('../HealthEventDetail/components/EventDetailStickyHeader.tsx', import.meta.url), 'utf8')
const idleVisualSource = readFileSync(new URL('./IdleNurseVisual.tsx', import.meta.url), 'utf8')

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

test('健康事件页默认前台视图并使用文字下拉切换', () => {
  assert.match(pageSource, /useState<HealthEventsViewMode>\(DEFAULT_HEALTH_EVENTS_VIEW_MODE\)/)
  assert.match(pageSource, /aria-haspopup="menu"/)
  assert.match(pageSource, /aria-expanded=\{open\}/)
  assert.match(pageSource, /role="menuitemradio"/)
  assert.match(pageSource, /healthEventsViewLabels\[value\]/)
  assert.match(pageSource, /healthEventsViewLabels\[option\]/)
  assert.match(pageSource, /document\.addEventListener\('pointerdown', closeOnOutsidePointer\)/)
  assert.match(pageSource, /document\.addEventListener\('keydown', closeOnEscape\)/)
  assert.match(pageSource, /event\.key !== 'Escape'/)
  assert.match(pageSource, /shouldShowHealthEventFilters\(viewMode\)/)
  assert.match(pageSource, /viewMode === 'list' && <Typography className="health-events-list-title"/)
  assert.match(pageSource, /viewMode === 'triage'[^]*<NurseQuickRecord/s)
  assert.match(nurseQuickRecordSource, /<QuickVoiceRecordFlow/)
  assert.match(nurseQuickRecordSource, /<QuickRecordTrigger/)
  assert.doesNotMatch(nurseQuickRecordSource, /开始说话/)
  assert.doesNotMatch(pageSource, /智能体模式|护士台模式|动态流模式|智能记录视图/)
  assert.doesNotMatch(pageSource, /health-events-view-switcher|aria-pressed=\{viewMode/)
})

test('护士记录严格绑定当前人物并走真实事件和记录保存接口', () => {
  assert.match(pageSource, /currentMemberDto\.id !== currentMemberId/)
  assert.match(pageSource, /memberId: currentMemberDto\.id/)
  assert.match(pageSource, /title: normalizeHealthEventTitle\('', transcript\)/)
  assert.match(pageSource, /healthEventRecordService\.create\(pending\.eventId/)
  assert.match(pageSource, /void retry\(\)/)
  assert.doesNotMatch(pageSource, /mock/i)
})

test('护士状态资产预加载、固定画框、双待机清理并支持 Reduced Motion', () => {
  assert.match(nurseDeskSource, /preloadNurseTriageAssets/)
  assert.match(nurseDeskSource, /Object\.values\(nurseTriageAssets\)/)
  assert.match(nurseDeskSource, /document\.addEventListener\('visibilitychange'/)
  assert.match(idleVisualSource, /idleRetryTimerRef\.current\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/)
  assert.doesNotMatch(idleVisualSource, /setInterval|requestAnimationFrame|createObjectURL/)
  assert.match(nurseQuickRecordSource, /reducedMotion/)
  assert.match(pageStylesSource, /\.nurse-triage-desk\s*{[^}]*aspect-ratio:\s*1\s*\/\s*1/s)
})

test('健康事件页继承全局底板且不维护页面级颜色补丁', () => {
  assert.match(pageSource, /className="hoho-health-events-page app-shell/)
  assert.doesNotMatch(pageStylesSource, /\.app-shell\.hoho-health-events-page\s*{[^}]*background:/s)
})

test('护士视频使用欢迎片与双待机显式白名单且切换期间最多只有一个可见播放器', () => {
  assert.match(idleVisualSource, /import idleIntroZeroSource from '\.\.\/\.\.\/assets\/nurse-triage\/nurses-idle-intro-0\.mp4'/)
  assert.match(idleVisualSource, /import idleVideoOneSource from '\.\.\/\.\.\/assets\/nurse-triage\/nurses-idle-loop-1\.mp4'/)
  assert.match(idleVisualSource, /import idleVideoTwoSource from '\.\.\/\.\.\/assets\/nurse-triage\/nurses-idle-loop-2\.mp4'/)
  const playlistMatch = idleVisualSource.match(/const idlePlaylist = \[([^\]]+)\] as const/)
  assert.ok(playlistMatch)
  assert.deepEqual(playlistMatch[1].split(',').map((item) => item.trim()), ['idleIntroZeroSource', 'idleVideoOneSource', 'idleVideoTwoSource'])
  assert.equal(idleVisualSource.match(/<video/g)?.length, 1)
  assert.match(idleVisualSource, /autoPlay=\{videoIndex === 0 && active && !reducedMotion\}/)
  assert.match(idleVisualSource, /preload="auto"/)
  assert.match(idleVisualSource, /loop=\{false\}/)
  assert.match(idleVisualSource, /onEnded=\{\(\) => handleIdleEnded\(videoIndex\)\}/)
  assert.match(idleVisualSource, /onPlaying=\{\(\) => handleIdlePlaying\(videoIndex\)\}/)
  assert.match(idleVisualSource, /muted/)
  assert.match(idleVisualSource, /playsInline/)
  assert.match(idleVisualSource, /disablePictureInPicture/)
  assert.match(idleVisualSource, /controls=\{false\}/)
  assert.match(idleVisualSource, /controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"/)
  assert.match(idleVisualSource, /tabIndex=\{-1\}/)
  assert.match(idleVisualSource, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.doesNotMatch(idleVisualSource, /createObjectURL|requestAnimationFrame|setInterval/)
  assert.doesNotMatch(idleVisualSource, /<img|poster=|staticSource|special|src=\{undefined\}|src=""/)
  assert.doesNotMatch(idleVisualSource, /import\.meta\.glob|Object\.values|includes\([^)]*idle/)
  const obsoleteIdleNames = [
    ['idle', 'video', 'first', 'frame'].join('-') + '.png',
    ['idle', 'working'].join('-') + '.png',
    'idle' + '.png'
  ]
  obsoleteIdleNames.forEach((name) => {
    assert.equal(idleVisualSource.includes(name), false)
    assert.equal(nurseDeskSource.includes(name), false)
  })
  assert.match(idleVisualSource, /onError=\{\(\) => retryIdleVideo\(videoIndex\)\}/)
  assert.match(idleVisualSource, /idleVideoRefs\.current\[videoIndex\]\?\.load\(\)/)
  assert.match(pageStylesSource, /\.nurse-triage-desk\s*\{[^}]*background:\s*#fff[^}]*border:\s*0[^}]*outline:\s*0[^}]*box-shadow:\s*none[^}]*pointer-events:\s*none/s)
  assert.match(pageStylesSource, /\.nurse-triage-desk::after\s*\{[^}]*transparent 10px[^}]*#fff 100%/s)
  assert.match(pageStylesSource, /\.idle-nurse-visual__idle-video\s*\{[^}]*pointer-events:\s*none[^}]*user-select:\s*none/s)
  assert.match(pageStylesSource, /idle-video\[data-active='true'\][^}]*opacity:\s*1/s)
  assert.doesNotMatch(pageStylesSource, /idle-nurse-visual__special-video|data-mode='special'/)
})

test('欢迎片与双待机资产内容正确且旧静态素材已删除', () => {
  const idleIntroZero = new URL('../../assets/nurse-triage/nurses-idle-intro-0.mp4', import.meta.url)
  const idleVideoOne = new URL('../../assets/nurse-triage/nurses-idle-loop-1.mp4', import.meta.url)
  const idleVideoTwo = new URL('../../assets/nurse-triage/nurses-idle-loop-2.mp4', import.meta.url)
  const idleIntroZeroHash = createHash('sha256').update(readFileSync(idleIntroZero)).digest('hex')
  const idleVideoOneHash = createHash('sha256').update(readFileSync(idleVideoOne)).digest('hex')
  const idleVideoTwoHash = createHash('sha256').update(readFileSync(idleVideoTwo)).digest('hex')
  assert.equal(idleIntroZeroHash, 'a50a8a14038cb16530bc5474b30f729012a6896398f3cc8aeba3b7fb22cc7b03')
  assert.equal(idleVideoOneHash, '7b33746af4e7a2f1281c00b2c66ddabe0e834eac433135a9ec058ec07a243be1')
  assert.equal(idleVideoTwoHash, '5e533b30a78f901f5431004efd723bc624da3122fe3d749ea39efc3c6aca5082')

  const removedAssets = [
    ['nurses', 'idle', 'loop'].join('-') + '.mp4',
    ['idle', 'video', 'first', 'frame'].join('-') + '.png',
    ['idle', 'working'].join('-') + '.png',
    'idle' + '.png',
    ['idle', 'blonde', 'chair', 'spin'].join('-') + '.mp4',
    ['idle', 'blonde', 'stretch'].join('-') + '.mp4',
    ['idle', 'blonde', 'water', 'plant'].join('-') + '.mp4'
  ]
  removedAssets.forEach((name) => {
    const publicAsset = new URL(`../../../public/nurse-triage/${name}`, import.meta.url)
    assert.equal(existsSync(publicAsset), false)
  })
})

test('前台视图直接复用详情快捷记录并在完成后停留当前视图', () => {
  assert.match(quickRecordFlowSource, /getBrowserVoiceCapability/)
  assert.match(quickRecordFlowSource, /aria-label="确认快捷记录"/)
  assert.match(pageSource, /onPreview=\{previewTriageRecord\}/)
  assert.match(pageSource, /onConfirm=\{saveTriageRecord\}/)
  assert.doesNotMatch(nurseQuickRecordSource, /SpeechRecognition|setInterval|navigator\.mediaDevices/)
  assert.doesNotMatch(nurseQuickRecordSource, /setViewMode\('list'\)/)
})

test('前台快捷记录在原锚点使用专用听写、核对和保存完成呈现', () => {
  assert.match(nurseQuickRecordSource, /className="nurse-quick-record-anchor"/)
  assert.match(nurseQuickRecordSource, /presentation="nurse-inline"/)
  assert.match(nurseQuickRecordSource, /<QuickRecordTrigger/)
  assert.equal(nurseQuickRecordSource.match(/<QuickRecordTrigger/g)?.length, 1)
  assert.match(quickRecordFlowSource, /<strong>正在听…<\/strong>/)
  assert.match(quickRecordFlowSource, />结束听写<\/HohoButton>/)
  assert.match(quickRecordFlowSource, /aria-label="核对原话"/)
  assert.match(quickRecordFlowSource, /aria-label="编辑识别原话"/)
  assert.match(quickRecordFlowSource, />重新说<\/button>/)
  assert.match(quickRecordFlowSource, />保存记录<\/HohoButton>/)
  assert.match(quickRecordFlowSource, /presentation === 'nurse-inline' \? '记录已保存'/)
  assert.doesNotMatch(quickRecordFlowSource, /开始听写|点击结束|<Square|<Pause/)
})

test('前台快捷记录保留真实保存、失败重试和资源清理边界', () => {
  assert.match(quickRecordFlowSource, /onConfirmRef\.current\(value, occurredAtRef\.current/)
  assert.match(quickRecordFlowSource, /presentation === 'nurse-inline' \? 'review' : 'text_entry'/)
  assert.match(quickRecordFlowSource, /stopSession\(true\)/)
  assert.match(quickRecordFlowSource, /window\.clearTimeout\(closeTimerRef\.current\)/)
  assert.match(nurseQuickRecordSource, /window\.clearTimeout\(noticeTimerRef\.current\)/)
  assert.match(pageSource, /setQuickRecordOpen\(false\)[^]*discardPendingTriageEvent\(\)/s)
  assert.match(pageSource, /healthEventRecordService\.create\(pending\.eventId/)
  assert.match(pageSource, /void retry\(\)/)
})

test('前台快捷记录局部覆盖不改变护士台网格和列表视图', () => {
  assert.match(nurseQuickRecordSource, /import '\.\/NurseQuickRecord\.css'/)
  assert.match(nurseQuickRecordStylesSource, /quick-record-panel--nurse[^}]*position:\s*absolute/s)
  assert.match(nurseQuickRecordStylesSource, /nurse-quick-record-anchor[^}]*min-height:\s*52px/s)
  assert.match(nurseQuickRecordStylesSource, /--hoho-color-primary/)
  assert.match(nurseQuickRecordStylesSource, /env\(safe-area-inset-bottom\)/)
  assert.doesNotMatch(nurseQuickRecordSource, /NurseTriageDesk[^]*state=(?!"idle")/s)
  assert.match(pageSource, /viewMode === 'list'[^]*<HealthEventTimeline/s)
})

test('前台 Logo 原位复用完整下一步且不触发快捷记录', () => {
  assert.match(nurseQuickRecordSource, /aria-label="打开当前健康事件的下一步"/)
  assert.match(nurseQuickRecordSource, /aria-pressed=\{nextActionOpen\}/)
  assert.match(nurseQuickRecordSource, /onClick=\{onNextActionOpen\}/)
  assert.equal(nurseQuickRecordSource.match(/className="nurse-next-action-trigger"/g)?.length, 1)
  assert.equal(nurseQuickRecordSource.match(/<QuickRecordTrigger/g)?.length, 1)
  assert.match(nurseQuickRecordSource, /onClick=\{openQuickRecord\}/)
  assert.doesNotMatch(nurseQuickRecordSource, /onNextActionOpen[^]*openQuickRecord\(\)/s)

  assert.match(nurseQuickRecordStylesSource, /nurse-quick-record-controls[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 52px/s)
  assert.match(nurseQuickRecordStylesSource, /nurse-next-action-trigger\s*\{[^}]*linear-gradient[^}]*color:\s*rgb\(var\(--hoho-color-surface\)\)/s)
  assert.match(nurseQuickRecordStylesSource, /nurse-next-action-trigger\[data-active='true'\][^}]*background:\s*rgb\(var\(--hoho-color-surface\)\)[^}]*color:\s*rgb\(var\(--hoho-color-primary\)\)/s)
  assert.match(nurseQuickRecordStylesSource, /quick-record-panel--nurse[^}]*right:\s*calc\(52px \+ var\(--hoho-space-3\)\)/s)

  assert.match(pageSource, /getNurseNextActionEventId\(memberEvents, currentMemberId\)/)
  assert.match(nurseNextActionContextSource, /filter\(\(event\) => event\.memberId === currentMemberId\)/)
  assert.match(nurseNextActionContextSource, /right\.createdAt\.localeCompare\(left\.createdAt\)/)
  assert.match(pageSource, /onNextActionOpen=\{\(\) => setNextActionOpen\(true\)\}/)
  assert.match(pageSource, /open=\{viewMode === 'triage' && nextActionOpen\}/)
  assert.match(pageSource, /setQuickRecordOpen\(false\)\s*setNextActionOpen\(false\)/s)
})

test('Logo 下一步宿主复用详情 ActionSheet 全部能力并保留详情页原入口', () => {
  assert.match(nurseNextActionSource, /useHealthEventDetail\(open \? eventId \?\? undefined : undefined\)/)
  assert.match(nurseNextActionSource, /state\.data\.eventDto\.memberId !== currentMemberId/)
  assert.match(nurseNextActionSource, /<ActionSheet/)
  assert.equal(nurseNextActionSource.match(/<ActionSheet/g)?.length, 1)
  assert.match(nurseNextActionSource, /attachments: state\.data\.attachments/)
  assert.match(nurseNextActionSource, /currentMemberId,/)
  assert.match(nurseNextActionSource, /organizations: state\.data\.organizations/)
  assert.match(nurseNextActionSource, /records: state\.data\.records/)
  assert.match(nurseNextActionSource, /relatedEvents: state\.data\.relatedEvents/)
  assert.match(nurseNextActionSource, /<ComingSoonPrompt/)
  assert.match(actionSheetSource, /actionCategoryOrder\.map/)
  assert.match(actionSheetSource, /<AskAIWorkspace context=\{context\}/)
  assert.match(actionSheetSource, /<ArrowLeft size=\{17\} \/>返回/)
  assert.match(actionSheetSource, /onClose=\{onClose\}/)

  assert.match(detailPageSource, /<EventDetailStickyHeader[^]*onAction=\{\(\) => setActionOpen\(true\)\}/s)
  assert.match(detailPageSource, /<ActionSheet[^]*open=\{actionOpen\}/s)
  assert.match(stickyHeaderSource, />下一步<ArrowRight/)
})

test('前台视图快捷记录严格绑定当前人物、复用真实预览保存链路并刷新列表', () => {
  assert.match(pageSource, /currentMemberDto\.id !== currentMemberId/)
  assert.match(pageSource, /memberId: currentMemberDto\.id/)
  assert.match(pageSource, /healthRecordOrganizationService\.preview\(pending\.eventId/)
  assert.match(pageSource, /healthEventRecordService\.create\(pending\.eventId/)
  assert.match(pageSource, /healthRecordOrganizationService\.organize\(pending\.eventId/)
  assert.match(pageSource, /pendingTriageEventRef\.current = null/)
  assert.match(pageSource, /retry\(\)/)
})

test('前台视图使用动态视口单屏布局且快捷记录面板为键盘保留操作区', () => {
  assert.match(pageSource, /data-view-mode=\{viewMode\}/)
  assert.match(pageSource, /health-events-content--triage overflow-hidden/)
  assert.match(pageStylesSource, /data-view-mode='triage'[^}]*height:\s*100dvh[^}]*min-height:\s*0/s)
  assert.match(pageStylesSource, /health-events-content--triage[^}]*display:\s*flex[^}]*min-height:\s*0[^}]*flex-direction:\s*column/s)
  assert.match(pageStylesSource, /nurse-triage-visual-slot[^}]*min-height:\s*0/s)
  assert.match(pageStylesSource, /nurse-triage-visual-slot \.nurse-triage-desk[^}]*width:\s*min\(76%, 340px\)[^}]*height:\s*auto/s)
  assert.match(pageStylesSource, /nurse-triage-recorder \.nurse-quick-record-trigger[^}]*position:\s*static[^}]*width:\s*100%/s)
  assert.match(quickRecordFlowSource, /window\.visualViewport/)
  assert.match(pageStylesSource, /quick-record-viewport-height/)
  assert.match(nurseQuickRecordStylesSource, /quick-record-viewport-height/)
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

test('列表卡片使用两行结构且事件标题与生命周期状态同行', () => {
  assert.match(cardSource, /HealthEventCardSurface/)
  assert.match(cardSurfaceSource, /health-event-list-card__subject-copy[^]*displayTitle[^]*HealthTag[^]*statusPresentation\.label/)
  assert.match(stylesSource, /\.hoho-health-tag\[data-tone='info'\][^}]*--hoho-color-info/s)
  assert.match(cardSurfaceSource, /!dateLabel && summaryFragments\.length > 0/)
  assert.doesNotMatch(cardSurfaceSource, /\{dateLabel && summaryFragments\.length > 0/)
  assert.doesNotMatch(cardSource, /event\.summary(?:\W|$)/)
})

test('列表移除日期轴并把开始日期与持续时间放入每张事件卡片首行', () => {
  assert.doesNotMatch(timelineSource, /HealthTimeline|hoho-timeline/)
  assert.match(timelineSource, /aria-label="按日期排序的健康事件"/)
  assert.match(timelineSource, /dateLabel=\{formatHealthEventDate\(event\.startTime\)/)
  assert.match(cardSource, /dateLabel=\{dateLabel\}/)
  assert.match(cardSurfaceSource, /health-event-list-card__date[^]*dateLabel[^]*durationLabel[^]*displayTitle/)
  assert.match(cardSurfaceSource, /health-event-list-card__time-divider/)
  assert.match(pageStylesSource, /health-event-list-card__time-divider[^}]*width:\s*1px[^}]*height:\s*17px/s)
  assert.doesNotMatch(cardSurfaceSource, />\|</)
  assert.match(pageSource, /className="hoho-year-tabs health-events-year-tabs"/)
})

test('部位图标、长标题、状态和垂直居中箭头共享稳定卡片布局', () => {
  assert.match(cardSurfaceSource, /HealthEventCardIcon presentation=\{icon\}/)
  assert.match(cardSurfaceSource, /title=\{displayTitle\} variant="cardTitle"/)
  assert.match(cardSurfaceSource, /HealthEventCardChevron[^]*health-event-list-card__chevron/)
  assert.match(cardIconSource, /PersonStanding[^]*health-event-card-icon__marker/)
  assert.match(pageStylesSource, /health-event-list-card__subject[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\)/s)
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
