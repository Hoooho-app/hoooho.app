import { Archive, Bell, BookOpen, ChevronRight, ClipboardCheck, FileHeart, FileText, FolderOpen, HeartHandshake, Pause, Play, ShieldCheck, Thermometer, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { BottomSheetSurface, HohoButton, MedicalPrepButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath, makeMemberProfileOpenState } from '../../components/navigation/navigationState'
import type { NurseStationItem, NurseStationState } from '../../features/nurse-station/state'
import { readNurseStationState, reconcileNurseStationItems, writeNurseStationState } from '../../features/nurse-station/state'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { NurseNextAction, formatUpdatedAt } from '../HealthEvents/NurseNextAction'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { getNurseNextActionEventId } from '../HealthEvents/nurseNextActionContext'
import '../HealthEvents/TimeView.css'
import { MoreNurseBubbles, NurseBubble } from './NurseBubble'
import type { NurseBubbleModel, NurseBubbleType } from './nurseBubbles'
import { bubbleItemKey, buildNurseBubbles, isSafetyBubble, visibleNurseBubbles } from './nurseBubbles'
import { getArchivedTasks, sortActiveTasks, taskNextStep, taskStatus, taskTitle } from './nurseStationView'
import './nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type ServiceSheet = NurseBubbleType | 'archive' | 'all' | null

export function NurseStationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const authUser = useAppStore((value) => value.authUser)
  const currentMemberId = useAppStore((value) => value.currentMemberId)
  const cachedMembers = useAppStore((value) => value.members)
  const care = useSettingsStore((value) => value.care)
  const { state: listState, retry: retryEvents } = useHealthEventsList()
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const identityId = authUser?.id ?? 'unknown'
  const [station, setStation] = useState<NurseStationState>(() => readNurseStationState(identityId, currentMemberId))
  const [selected, setSelected] = useState<NurseStationItem | null>(null)
  const [serviceSheet, setServiceSheet] = useState<ServiceSheet>(null)
  const [animatingBubbleKey, setAnimatingBubbleKey] = useState('')
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionResult, setCompletionResult] = useState('已恢复')

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReducedMotion(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setStation(readNurseStationState(identityId, currentMemberId))
    setSelected(null); setServiceSheet(null); setNextActionOpen(false)
  }, [identityId, currentMemberId])

  const members = listState.status === 'success' ? listState.data.members : cachedMembers
  const member = members.find((item) => item.id === currentMemberId) ?? members[0] ?? null
  const events = listState.status === 'success' ? listState.data.events.filter((event) => event.memberId === member?.id) : []
  const nextActionEventId = getNurseNextActionEventId(events, currentMemberId)
  const recentPreparationEvent = events.filter((event) => event.medicalPreparation).sort((left, right) => (right.medicalPreparation?.updatedAt ?? '').localeCompare(left.medicalPreparation?.updatedAt ?? ''))[0] ?? null

  useEffect(() => {
    if (!member || listState.status !== 'success') return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id))
  }, [events, listState.status, member])
  useEffect(() => { if (member) writeNurseStationState(identityId, member.id, station) }, [identityId, member, station])

  const active = sortActiveTasks(station.items)
  const archived = getArchivedTasks(station.items)
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)
  const bubbles = useMemo(() => buildNurseBubbles({ handledKeys: station.handledBubbleKeys, items: station.items, medicalPrepEventId: nextActionEventId, tutorialAvailable: station.items.length > 0 && !station.tutorialSeen }), [nextActionEventId, station.handledBubbleKeys, station.items, station.tutorialSeen])
  const bubbleLayout = useMemo(() => visibleNurseBubbles(bubbles), [bubbles])

  useEffect(() => {
    if (!member || reducedMotion) return
    const next = bubbleLayout.visible.find((bubble) => !station.animatedBubbleKeys.includes(bubble.key))
    if (!next) return
    setAnimatingBubbleKey(next.key)
    const timeout = window.setTimeout(() => {
      setAnimatingBubbleKey('')
      setStation((previous) => ({ ...previous, animatedBubbleKeys: [...new Set([...previous.animatedBubbleKeys, next.key])] }))
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [bubbleLayout.visible, member, reducedMotion, station.animatedBubbleKeys])

  const updateItem = (id: string, changes: Partial<NurseStationItem>) => setStation((previous) => ({ ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) }))
  const closeTaskSheet = () => { setSelected(null); setCompletionOpen(false) }
  const handleBubbleKeys = (keys: string[]) => setStation((previous) => ({ ...previous, handledBubbleKeys: [...new Set([...previous.handledBubbleKeys, ...keys])] }))
  const startObservation = (item: NurseStationItem) => { updateItem(item.id, { status: 'active', confirmedAt: new Date().toISOString() }); handleBubbleKeys([bubbleItemKey(item)]); setServiceSheet(null) }
  const finishObservation = () => { if (selected) { updateItem(selected.id, { status: 'completed', completedAt: new Date().toISOString(), completionResult }); closeTaskSheet() } }
  const closeServiceSheet = () => {
    if (serviceSheet && serviceSheet !== 'archive') {
      const viewed = serviceSheet === 'all' ? bubbles.filter((bubble) => !isSafetyBubble(bubble)) : bubbles.filter((bubble) => bubble.type === serviceSheet && !isSafetyBubble(bubble))
      handleBubbleKeys(viewed.flatMap((bubble) => bubble.itemKeys))
    }
    setServiceSheet(null)
  }

  if (listState.status === 'success' && listState.data.entryState.familyMemberCount === 0) return (
    <main className="app-shell nurse-station-page">
      <MainAppHeader title="前台护士站" />
      <section className="nurse-station-empty-member">
        <div className="nurse-station-empty-member__copy">
          <p className="nurse-station-empty-member__eyebrow">欢迎来到 Hoooho</p>
          <h1>把孩子零散的健康变化，<span>整理成连续记录</span></h1>
          <p className="nurse-station-empty-member__description">记下症状、用药和就医经过，<span>自动整理成时间线和问诊摘要。</span></p>
        </div>
        <div className="nurse-station-empty-member__visual">
          <NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey="first-member" reducedMotion={reducedMotion} state="idle" />
        </div>
        <ol aria-label="Hoooho 健康记录流程" className="nurse-station-empty-member__steps">
          <li><FileText aria-hidden="true" /><span>随手记录</span></li>
          <ChevronRight aria-hidden="true" className="nurse-station-empty-member__arrow" />
          <li><FolderOpen aria-hidden="true" /><span>自动整理</span></li>
          <ChevronRight aria-hidden="true" className="nurse-station-empty-member__arrow" />
          <li><ClipboardCheck aria-hidden="true" /><span>就医时带走</span></li>
        </ol>
        <HohoButton fullWidth size="large" onClick={() => navigate('/family/new', { state: { firstUseEntry: { continueToRecord: false, returnTo: '/nurse-station' } } })}>添加第一个孩子</HohoButton>
        <p className="nurse-station-empty-member__note"><ShieldCheck aria-hidden="true" />添加后即可开始记录</p>
      </section>
    </main>
  )

  return <main className="app-shell nurse-station-page">
    <MainAppHeader title="前台护士站" />
    <div className="nurse-station-scroll">
      {member && <div className="nurse-station-member-row"><button className="nurse-station-member" onClick={() => { const returnTo = getCurrentPath(location.pathname, location.search, location.hash); navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) }) }} type="button"><Avatar name={member.name} src={member.avatar} size="sm" /><span className="nurse-station-member-copy"><strong>{member.name}</strong><em>{genderLabels[member.gender ?? '']} · {member.age}</em></span><ChevronRight size={19} /></button><MedicalPrepButton className="journal-subject-summary" disabled={!nextActionEventId} onClick={() => setNextActionOpen(true)} /></div>}
      <section aria-label="护士站消息" className="nurse-bubble-stage" data-has-bubbles={bubbleLayout.visible.length > 0}><div className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state="idle" /></div>{bubbleLayout.visible.length > 0 && <div className="nurse-bubble-stack">{bubbleLayout.visible.map((bubble) => <NurseBubble animate={animatingBubbleKey === bubble.key} bubble={bubble} key={bubble.key} onDismiss={() => isSafetyBubble(bubble) ? setServiceSheet(bubble.type) : handleBubbleKeys(bubble.itemKeys)} onOpen={() => setServiceSheet(bubble.type)} />)}{bubbleLayout.hiddenCount > 0 && <MoreNurseBubbles count={bubbleLayout.hiddenCount} onClick={() => setServiceSheet('all')} />}</div>}</section>
      {recentPreparationEvent?.medicalPreparation && <section className="recent-medical-preparation"><header><h2>最近的就医准备</h2><span>{formatUpdatedAt(recentPreparationEvent.medicalPreparation.updatedAt)}</span></header><article><FileHeart /><div><strong>{member?.name}的病情摘要</strong><small>{recentPreparationEvent.displayTitle}</small></div><button onClick={() => navigate(`/medical-preparation/${recentPreparationEvent.medicalPreparation?.shareToken}`)} type="button">打开病情摘要</button></article></section>}
      <section className="guardian-tasks"><header><div><h2>守护任务</h2><p>共 {active.length} 项守护任务</p></div><button onClick={() => setServiceSheet('archive')} type="button">已归档任务{archived.length > 0 && <span>{archived.length > 99 ? '99+' : archived.length}</span>}<ChevronRight /></button></header><div className="guardian-task-list">{active.length ? active.map((item) => <TaskCard item={item} key={item.id} onOpen={() => setSelected(item)} />) : <div className="guardian-task-empty"><HeartHandshake /><div><strong>暂无守护任务</strong><span>需要持续关注的事项会出现在这里</span></div></div>}</div></section>
    </div>
    <NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onChanged={retryEvents} onClose={() => setNextActionOpen(false)} open={nextActionOpen} />
    <BubbleBottomSheet archived={archived} bubbles={bubbles} onClose={closeServiceSheet} onDismissItem={(item) => { updateItem(item.id, { status: 'dismissed' }); handleBubbleKeys([bubbleItemKey(item)]) }} onHandle={(keys) => { handleBubbleKeys(keys); setServiceSheet(null) }} onLater={(bubble) => { bubble.items.forEach((item) => updateItem(item.id, { reminder: { at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), paused: false } })); handleBubbleKeys(bubble.itemKeys); setServiceSheet(null) }} onStart={startObservation} onSummary={() => { setServiceSheet(null); setNextActionOpen(true) }} onTutorialDone={() => { setStation((value) => ({ ...value, tutorialSeen: true, handledBubbleKeys: [...new Set([...value.handledBubbleKeys, 'tutorial:first-record'])] })); setServiceSheet(null) }} open={serviceSheet} />
    {selected && <TaskDetailSheet completionOpen={completionOpen} completionResult={completionResult} item={selected} onClose={closeTaskSheet} onComplete={finishObservation} onCompletionOpen={setCompletionOpen} onCompletionResult={setCompletionResult} onNavigate={() => navigate(`/health-events/${selected.sourceEventId}`)} onUpdate={(changes) => updateItem(selected.id, changes)} />}
  </main>
}

function TaskCard({ item, onOpen }: { item: NurseStationItem; onOpen: () => void }) { return <button className="guardian-task-card" data-status={item.status} onClick={onOpen} type="button"><span className="guardian-task-icon"><Thermometer /></span><span className="guardian-task-copy"><span><strong>{taskTitle(item)}</strong><em>{taskStatus(item)}</em></span><small>{taskNextStep(item)}</small></span><ChevronRight /></button> }

function BubbleBottomSheet({ archived, bubbles, onClose, onDismissItem, onHandle, onLater, onStart, onSummary, onTutorialDone, open }: { archived: NurseStationItem[]; bubbles: NurseBubbleModel[]; onClose: () => void; onDismissItem: (item: NurseStationItem) => void; onHandle: (keys: string[]) => void; onLater: (bubble: NurseBubbleModel) => void; onStart: (item: NurseStationItem) => void; onSummary: () => void; onTutorialDone: () => void; open: ServiceSheet }) {
  const [confirmSafetyIgnore, setConfirmSafetyIgnore] = useState(false)
  if (!open) return null
  const selectedBubbles = open === 'all' ? bubbles : bubbles.filter((bubble) => bubble.type === open)
  const title = open === 'archive' ? '已归档任务' : open === 'all' ? '护士消息' : selectedBubbles[0]?.title ?? '护士消息'
  const leading = open === 'archive' ? <Archive /> : open === 'tutorial' ? <BookOpen /> : open === 'safety' ? <ShieldCheck /> : <HeartHandshake />
  return <BottomSheetSurface className="nurse-service-sheet" label={title} leading={leading} onClose={onClose} open title={title}>
    {open === 'archive' && <div className="nurse-sheet-list">{archived.length ? archived.map((item) => <article key={item.id}><strong>{taskTitle(item)}</strong><p>{item.completionResult ?? '已结束'} · {item.sourceLabel}</p></article>) : <SheetEmpty text="暂无已归档任务" />}</div>}
    {open !== 'archive' && <div className="nurse-sheet-list">{selectedBubbles.map((bubble) => <article data-bubble-type={bubble.type} key={bubble.key}><strong>{bubble.title}{bubble.count > 1 && ` · ${bubble.count}项`}</strong>{bubble.items.length ? bubble.items.map((item) => <p key={item.id}>{item.sourceLabel}</p>) : <p>{bubble.type === 'tutorial' ? '用一分钟了解如何查看并建立守护任务。' : bubble.type === 'medical-prep' ? '现有记录可以整理成问诊摘要。' : '这是根据当前记录生成的护士提示。'}</p>}{(bubble.type === 'attention' || bubble.type === 'medication') && <div className="nurse-sheet-actions">{bubble.items.map((item) => <div className="nurse-sheet-action-group" key={item.id}><HohoButton onClick={() => onStart(item)}>加入守护任务</HohoButton><button onClick={() => onLater(bubble)} type="button">稍后提醒</button><button onClick={() => onDismissItem(item)} type="button">暂不需要</button></div>)}</div>}{bubble.type === 'tutorial' && <div className="nurse-sheet-actions"><HohoButton onClick={onTutorialDone}>开始教程</HohoButton><button onClick={onTutorialDone} type="button">跳过</button><button onClick={onTutorialDone} type="button">不再提示</button></div>}{bubble.type === 'medical-prep' && <div className="nurse-sheet-actions"><HohoButton onClick={onSummary}>生成问诊摘要</HohoButton><button onClick={() => onLater(bubble)} type="button">稍后</button></div>}{bubble.type === 'safety' && <div className="nurse-sheet-actions"><HohoButton onClick={() => onHandle(bubble.itemKeys)}>我知道了</HohoButton>{confirmSafetyIgnore ? <HohoButton variant="secondary" onClick={() => onHandle(bubble.itemKeys)}>确认忽略这条提醒</HohoButton> : <button onClick={() => setConfirmSafetyIgnore(true)} type="button">忽略这条提醒</button>}</div>}{!['attention', 'medication', 'tutorial', 'medical-prep', 'safety'].includes(bubble.type) && <div className="nurse-sheet-actions"><HohoButton onClick={() => onHandle(bubble.itemKeys)}>知道了</HohoButton><button onClick={() => onLater(bubble)} type="button">稍后看</button></div>}</article>)}</div>}
  </BottomSheetSurface>
}

function SheetEmpty({ text }: { text: string }) { return <div className="nurse-sheet-empty"><HeartHandshake /><span>{text}</span></div> }

function TaskDetailSheet({ completionOpen, completionResult, item, onClose, onComplete, onCompletionOpen, onCompletionResult, onNavigate, onUpdate }: { completionOpen: boolean; completionResult: string; item: NurseStationItem; onClose: () => void; onComplete: () => void; onCompletionOpen: (value: boolean) => void; onCompletionResult: (value: string) => void; onNavigate: () => void; onUpdate: (changes: Partial<NurseStationItem>) => void }) {
  return <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-sheet"><button aria-label="关闭" className="sheet-close" onClick={onClose} type="button"><X /></button>{completionOpen ? <><h2>结束这次观察？</h2><div className="completion-options">{['已恢复', '已经就医', '不再继续记录', '其他'].map((result) => <label key={result}><input checked={completionResult === result} name="result" onChange={() => onCompletionResult(result)} type="radio" />{result}</label>)}</div><div className="sheet-actions"><HohoButton variant="secondary" onClick={() => onCompletionOpen(false)}>取消</HohoButton><HohoButton onClick={onComplete}>确定</HohoButton></div></> : <><Thermometer className="sheet-icon" size={24} /><h2>{taskTitle(item)}</h2><p className="sheet-source">来自健康随记：{item.sourceLabel}</p><div className="station-actions"><button onClick={onNavigate} type="button"><Play />补充最新情况</button><button onClick={() => onUpdate({ reminder: { at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paused: false } })} type="button"><Bell />设置提醒</button><button onClick={() => onUpdate({ status: item.status === 'paused' ? 'active' : 'paused' })} type="button"><Pause />{item.status === 'paused' ? '恢复提醒' : '暂停提醒'}</button><button onClick={() => onCompletionOpen(true)} type="button"><HeartHandshake />结束观察</button></div><p className="safety-note">如出现紧急情况，请及时联系专业医疗人员。</p></>}</div></div>
}
