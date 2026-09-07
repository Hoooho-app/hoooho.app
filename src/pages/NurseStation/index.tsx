import { Archive, Bell, BookOpen, ChevronRight, ClipboardCheck, FileText, FolderOpen, HeartHandshake, Lightbulb, Pause, Play, ShieldCheck, Sprout, Thermometer, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'
import { Avatar } from '../../components/common'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath, makeMemberProfileOpenState } from '../../components/navigation/navigationState'
import type { NurseStationItem, NurseStationItemType, NurseStationState } from '../../features/nurse-station/state'
import { readNurseStationState, reconcileNurseStationItems, writeNurseStationState } from '../../features/nurse-station/state'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { NurseNextAction } from '../HealthEvents/NurseNextAction'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { getNurseNextActionEventId } from '../HealthEvents/nurseNextActionContext'
import '../HealthEvents/TimeView.css'
import { NurseServiceCard } from './NurseServiceCard'
import { getArchivedTasks, getUnreadTips, sortActiveTasks, taskNextStep, taskStatus, taskTitle, tipKey } from './nurseStationView'
import './nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type ServiceSheet = 'tips' | 'attention' | 'tutorial' | 'archive' | null

const tipCopy: Partial<Record<NurseStationItemType, string>> = {
  symptom_observation: '按计划记录变化；如果症状明显加重，请及时联系专业医疗人员。',
  medication_reminder: '记录实际用药时间，避免因重复提醒造成重复用药。',
  record_connection: '把同一件事的后续记录放在一起，更容易看清变化。',
  family_sync: '同步前先确认记录对象，避免把健康信息记到其他家人名下。',
  follow_up: '只补充发生变化的关键信息，原始记录会继续保留。'
}

export function NurseStationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const authUser = useAppStore((value) => value.authUser)
  const currentMemberId = useAppStore((value) => value.currentMemberId)
  const cachedMembers = useAppStore((value) => value.members)
  const care = useSettingsStore((value) => value.care)
  const { state: listState } = useHealthEventsList()
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const identityId = authUser?.id ?? 'unknown'
  const [station, setStation] = useState<NurseStationState>(() => readNurseStationState(identityId, currentMemberId))
  const [selected, setSelected] = useState<NurseStationItem | null>(null)
  const [serviceSheet, setServiceSheet] = useState<ServiceSheet>(null)
  const [seenTipKeys, setSeenTipKeys] = useState<string[]>([])
  const [accentService, setAccentService] = useState<ServiceSheet>(null)
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
    setSelected(null); setServiceSheet(null); setNextActionOpen(false); setSeenTipKeys([])
  }, [identityId, currentMemberId])

  const members = listState.status === 'success' ? listState.data.members : cachedMembers
  const member = members.find((item) => item.id === currentMemberId) ?? members[0] ?? null
  const events = listState.status === 'success' ? listState.data.events.filter((event) => event.memberId === member?.id) : []
  const nextActionEventId = getNurseNextActionEventId(events, currentMemberId)

  useEffect(() => {
    if (!member || listState.status !== 'success') return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id))
  }, [events, listState.status, member])
  useEffect(() => { if (member) writeNurseStationState(identityId, member.id, station) }, [identityId, member, station])

  const pending = station.items.filter((item) => item.status === 'pending_confirmation')
  const active = sortActiveTasks(station.items)
  const archived = getArchivedTasks(station.items)
  const unreadTips = getUnreadTips(station.items, seenTipKeys)
  const tutorialCount = station.tutorialSeen ? 0 : 1
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)

  useEffect(() => {
    if (!member || reducedMotion) return
    const next: Exclude<ServiceSheet, null> | undefined = unreadTips.length ? 'tips' : pending.length ? 'attention' : tutorialCount ? 'tutorial' : undefined
    if (!next) return
    const key = `hoooho:nurse-service-accent:${member.id}:${next}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1'); setAccentService(next)
    const timeout = window.setTimeout(() => setAccentService(null), 900)
    return () => window.clearTimeout(timeout)
  }, [member, pending.length, reducedMotion, tutorialCount, unreadTips.length])

  const updateItem = (id: string, changes: Partial<NurseStationItem>) => setStation((previous) => ({ ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) }))
  const closeTaskSheet = () => { setSelected(null); setCompletionOpen(false) }
  const startObservation = (item: NurseStationItem) => { updateItem(item.id, { status: 'active', confirmedAt: new Date().toISOString() }); setServiceSheet(null) }
  const finishObservation = () => { if (selected) { updateItem(selected.id, { status: 'completed', completedAt: new Date().toISOString(), completionResult }); closeTaskSheet() } }
  const closeServiceSheet = () => {
    if (serviceSheet === 'tips') setSeenTipKeys((previous) => [...new Set([...previous, ...unreadTips.map(tipKey)])])
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
      {member && <div className="nurse-station-member-row"><button className="nurse-station-member" onClick={() => { const returnTo = getCurrentPath(location.pathname, location.search, location.hash); navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) }) }} type="button"><Avatar name={member.name} src={member.avatar} size="sm" /><span className="nurse-station-member-copy"><strong>{member.name}</strong><em>{genderLabels[member.gender ?? '']} · {member.age}</em></span><ChevronRight size={19} /></button><HohoButton className="journal-subject-summary" disabled={!nextActionEventId} onClick={() => setNextActionOpen(true)}><img alt="" height={20} src={logoUrl} width={20} />摘要生成</HohoButton></div>}
      <section aria-label="护士站服务" className="nurse-station-service-layout"><div className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state="idle" /></div><div className="nurse-station-services"><NurseServiceCard accent={accentService === 'tips'} count={unreadTips.length} icon={Lightbulb} label="护理小贴士" onClick={() => setServiceSheet('tips')} tone="cream" /><NurseServiceCard accent={accentService === 'attention'} count={pending.length} icon={Sprout} label="值得继续留意" onClick={() => setServiceSheet('attention')} tone="mint" /><NurseServiceCard accent={accentService === 'tutorial'} count={tutorialCount} icon={BookOpen} label="使用教程" onClick={() => setServiceSheet('tutorial')} tone="blue" /></div></section>
      <section className="guardian-tasks"><header><div><h2>守护任务</h2><p>共 {active.length} 项守护任务</p></div><button onClick={() => setServiceSheet('archive')} type="button">已归档任务{archived.length > 0 && <span>{archived.length > 99 ? '99+' : archived.length}</span>}<ChevronRight /></button></header><div className="guardian-task-list">{active.length ? active.map((item) => <TaskCard item={item} key={item.id} onOpen={() => setSelected(item)} />) : <div className="guardian-task-empty"><HeartHandshake /><div><strong>暂无守护任务</strong><span>需要持续关注的事项会出现在这里</span></div></div>}</div></section>
    </div>
    <NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onClose={() => setNextActionOpen(false)} open={nextActionOpen} />
    <ServiceBottomSheet archived={archived} onClose={closeServiceSheet} onDismiss={(item) => updateItem(item.id, { status: 'dismissed' })} onLater={(item) => { updateItem(item.id, { reminder: { at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), paused: false } }); setServiceSheet(null) }} onStart={startObservation} onTutorialDone={() => { setStation((value) => ({ ...value, tutorialSeen: true })); setServiceSheet(null) }} open={serviceSheet} pending={pending} tips={unreadTips} />
    {selected && <TaskDetailSheet completionOpen={completionOpen} completionResult={completionResult} item={selected} onClose={closeTaskSheet} onComplete={finishObservation} onCompletionOpen={setCompletionOpen} onCompletionResult={setCompletionResult} onNavigate={() => navigate(`/health-events/${selected.sourceEventId}`)} onUpdate={(changes) => updateItem(selected.id, changes)} />}
  </main>
}

function TaskCard({ item, onOpen }: { item: NurseStationItem; onOpen: () => void }) { return <button className="guardian-task-card" data-status={item.status} onClick={onOpen} type="button"><span className="guardian-task-icon"><Thermometer /></span><span className="guardian-task-copy"><span><strong>{taskTitle(item)}</strong><em>{taskStatus(item)}</em></span><small>{taskNextStep(item)}</small></span><ChevronRight /></button> }

function ServiceBottomSheet({ archived, onClose, onDismiss, onLater, onStart, onTutorialDone, open, pending, tips }: { archived: NurseStationItem[]; onClose: () => void; onDismiss: (item: NurseStationItem) => void; onLater: (item: NurseStationItem) => void; onStart: (item: NurseStationItem) => void; onTutorialDone: () => void; open: ServiceSheet; pending: NurseStationItem[]; tips: NurseStationItem[] }) {
  if (!open) return null
  const meta = open === 'tips' ? { label: '护理小贴士', icon: <Lightbulb /> } : open === 'attention' ? { label: '值得继续留意', icon: <Sprout /> } : open === 'tutorial' ? { label: '使用教程', icon: <BookOpen /> } : { label: '已归档任务', icon: <Archive /> }
  return <BottomSheetSurface className="nurse-service-sheet" label={meta.label} leading={meta.icon} onClose={onClose} open title={meta.label}>
    {open === 'tips' && <div className="nurse-sheet-list">{tips.length ? tips.map((item) => <article key={tipKey(item)}><strong>{item.type === 'symptom_observation' ? '观察变化' : item.type === 'medication_reminder' ? '用药记录' : '持续记录'}</strong><p>{tipCopy[item.type] ?? '保留关键变化和发生时间，便于之后回看。'}</p></article>) : <SheetEmpty text="暂时没有新的护理小贴士" />}</div>}
    {open === 'attention' && <div className="nurse-sheet-list">{pending.length ? pending.map((item) => <article key={item.id}><strong>{item.title}</strong><p>来自健康随记：{item.sourceLabel}</p><div className="nurse-sheet-actions"><HohoButton onClick={() => onStart(item)}>加入守护任务</HohoButton><button onClick={() => onLater(item)} type="button">稍后提醒</button><button onClick={() => onDismiss(item)} type="button">暂不需要</button></div></article>) : <SheetEmpty text="暂时没有需要确认的建议" />}</div>}
    {open === 'tutorial' && <div className="tutorial-steps"><p>当前推荐：如何查看守护任务</p><ol><li>从“值得继续留意”查看系统建议。</li><li>确认后选择“加入守护任务”。</li><li>在任务详情中补充记录、设置提醒或结束观察。</li></ol><HohoButton fullWidth onClick={onTutorialDone}>完成教程</HohoButton></div>}
    {open === 'archive' && <div className="nurse-sheet-list">{archived.length ? archived.map((item) => <article key={item.id}><strong>{taskTitle(item)}</strong><p>{item.completionResult ?? '已结束'} · {item.sourceLabel}</p></article>) : <SheetEmpty text="暂无已归档任务" />}</div>}
  </BottomSheetSurface>
}

function SheetEmpty({ text }: { text: string }) { return <div className="nurse-sheet-empty"><HeartHandshake /><span>{text}</span></div> }

function TaskDetailSheet({ completionOpen, completionResult, item, onClose, onComplete, onCompletionOpen, onCompletionResult, onNavigate, onUpdate }: { completionOpen: boolean; completionResult: string; item: NurseStationItem; onClose: () => void; onComplete: () => void; onCompletionOpen: (value: boolean) => void; onCompletionResult: (value: string) => void; onNavigate: () => void; onUpdate: (changes: Partial<NurseStationItem>) => void }) {
  return <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-sheet"><button aria-label="关闭" className="sheet-close" onClick={onClose} type="button"><X /></button>{completionOpen ? <><h2>结束这次观察？</h2><div className="completion-options">{['已恢复', '已经就医', '不再继续记录', '其他'].map((result) => <label key={result}><input checked={completionResult === result} name="result" onChange={() => onCompletionResult(result)} type="radio" />{result}</label>)}</div><div className="sheet-actions"><HohoButton variant="secondary" onClick={() => onCompletionOpen(false)}>取消</HohoButton><HohoButton onClick={onComplete}>确定</HohoButton></div></> : <><Thermometer className="sheet-icon" size={24} /><h2>{taskTitle(item)}</h2><p className="sheet-source">来自健康随记：{item.sourceLabel}</p><div className="station-actions"><button onClick={onNavigate} type="button"><Play />补充最新情况</button><button onClick={() => onUpdate({ reminder: { at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paused: false } })} type="button"><Bell />设置提醒</button><button onClick={() => onUpdate({ status: item.status === 'paused' ? 'active' : 'paused' })} type="button"><Pause />{item.status === 'paused' ? '恢复提醒' : '暂停提醒'}</button><button onClick={() => onCompletionOpen(true)} type="button"><HeartHandshake />结束观察</button></div><p className="safety-note">如出现紧急情况，请及时联系专业医疗人员。</p></>}</div></div>
}
