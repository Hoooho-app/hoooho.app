import { Archive, Bell, ChevronRight, ClipboardCheck, FileText, FolderOpen, HeartHandshake, Pause, Pill, Play, ShieldCheck, TestTube, Thermometer, Waypoints, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { NurseNextAction } from '../HealthEvents/NurseNextAction'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { getNurseNextActionEventId } from '../HealthEvents/nurseNextActionContext'
import { useJournal } from '../HealthEvents/useJournal'
import '../HealthEvents/TimeView.css'
import { getArchivedTasks, sortActiveTasks, taskNextStep, taskStatus, taskTitle } from './nurseStationView'
import './nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type ServiceSheet = 'reminders' | 'archive' | null

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
  const token = useAppStore((value) => value.authToken) ?? ''
  const medicationJournal = useJournal(currentMemberId, token, 0)
  const [station, setStation] = useState<NurseStationState>(() => readNurseStationState(identityId, currentMemberId))
  const [selected, setSelected] = useState<NurseStationItem | null>(null)
  const [serviceSheet, setServiceSheet] = useState<ServiceSheet>(null)
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

  useEffect(() => {
    if (!member || listState.status !== 'success') return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id, medicationJournal.entries))
  }, [events, listState.status, medicationJournal.entries, member])
  useEffect(() => { if (member) writeNurseStationState(identityId, member.id, station) }, [identityId, member, station])

  const active = sortActiveTasks(station.items)
  const archived = getArchivedTasks(station.items)
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)

  const updateItem = (id: string, changes: Partial<NurseStationItem>) => setStation((previous) => ({ ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) }))
  const closeTaskSheet = () => { setSelected(null); setCompletionOpen(false) }
  const finishObservation = () => { if (selected) { updateItem(selected.id, { status: 'completed', completedAt: new Date().toISOString(), completionResult }); closeTaskSheet() } }

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
      <section aria-label="护士站服务" className="nurse-service-stage"><div className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state="idle" /></div><NurseServices onReminderOpen={() => setServiceSheet('reminders')} /></section>
      <section className="guardian-tasks"><header><div><h2>守护任务</h2><p>共 {active.length} 项守护任务</p></div><button onClick={() => setServiceSheet('archive')} type="button">已归档任务{archived.length > 0 && <span>{archived.length > 99 ? '99+' : archived.length}</span>}<ChevronRight /></button></header><div className="guardian-task-list">{active.length ? active.map((item) => <TaskCard item={item} key={item.id} onOpen={() => setSelected(item)} />) : <div className="guardian-task-empty"><HeartHandshake /><div><strong>暂无守护任务</strong><span>需要持续关注的事项会出现在这里</span></div></div>}</div></section>
    </div>
    <NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onChanged={retryEvents} onClose={() => setNextActionOpen(false)} open={nextActionOpen} />
    <ServiceBottomSheet archived={archived} onClose={() => setServiceSheet(null)} onMedication={() => navigate('/health-events', { state: { nurseMedicationEntry: true } })} open={serviceSheet} />
    {selected && <TaskDetailSheet completionOpen={completionOpen} completionResult={completionResult} item={selected} onClose={closeTaskSheet} onComplete={finishObservation} onCompletionOpen={setCompletionOpen} onCompletionResult={setCompletionResult} onNavigate={() => navigate(`/health-events/${selected.sourceEventId}`)} onUpdate={(changes) => updateItem(selected.id, changes)} />}
  </main>
}

function TaskCard({ item, onOpen }: { item: NurseStationItem; onOpen: () => void }) { return <button className="guardian-task-card" data-status={item.status} onClick={onOpen} type="button"><span className="guardian-task-icon"><Thermometer /></span><span className="guardian-task-copy"><span><strong>{taskTitle(item)}</strong><em>{taskStatus(item)}</em></span><small>{taskNextStep(item)}</small></span><ChevronRight /></button> }

function NurseServices({ onReminderOpen }: { onReminderOpen: () => void }) {
  const services = [
    { label: '提醒执行', icon: Bell, enabled: true },
    { label: '守护观察', icon: ShieldCheck, enabled: false },
    { label: '排敏测试', icon: TestTube, enabled: false },
    { label: '医嘱跟进', icon: ClipboardCheck, enabled: false },
    { label: '冲突提醒', icon: Waypoints, enabled: false }
  ] as const
  return <div className="nurse-service-list">{services.map(({ label, icon: Icon, enabled }) => <button aria-disabled={!enabled} className="nurse-service-entry" data-enabled={enabled} disabled={!enabled} key={label} onClick={enabled ? onReminderOpen : undefined} type="button"><Icon aria-hidden="true" /><span>{label}</span><ChevronRight aria-hidden="true" /></button>)}</div>
}

function ServiceBottomSheet({ archived, onClose, onMedication, open }: { archived: NurseStationItem[]; onClose: () => void; onMedication: () => void; open: ServiceSheet }) {
  if (!open) return null
  const title = open === 'archive' ? '已归档任务' : '提醒执行'
  const leading = open === 'archive' ? <Archive /> : <Bell />
  return <BottomSheetSurface className="nurse-service-sheet" label={title} leading={leading} onClose={onClose} open title={title}>
    {open === 'archive' && <div className="nurse-sheet-list">{archived.length ? archived.map((item) => <article key={item.id}><strong>{taskTitle(item)}</strong><p>{item.completionResult ?? '已结束'} · {item.sourceLabel}</p></article>) : <SheetEmpty text="暂无已归档任务" />}</div>}
    {open === 'reminders' && <button className="medication-reminder-entry" onClick={onMedication} type="button"><span><Pill aria-hidden="true" /></span><span><strong>用药提醒</strong><small>按计划提醒用药，并记录是否已经完成</small></span><ChevronRight aria-hidden="true" /></button>}
  </BottomSheetSurface>
}

function SheetEmpty({ text }: { text: string }) { return <div className="nurse-sheet-empty"><HeartHandshake /><span>{text}</span></div> }

function TaskDetailSheet({ completionOpen, completionResult, item, onClose, onComplete, onCompletionOpen, onCompletionResult, onNavigate, onUpdate }: { completionOpen: boolean; completionResult: string; item: NurseStationItem; onClose: () => void; onComplete: () => void; onCompletionOpen: (value: boolean) => void; onCompletionResult: (value: string) => void; onNavigate: () => void; onUpdate: (changes: Partial<NurseStationItem>) => void }) {
  return <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-sheet"><button aria-label="关闭" className="sheet-close" onClick={onClose} type="button"><X /></button>{completionOpen ? <><h2>结束这次观察？</h2><div className="completion-options">{['已恢复', '已经就医', '不再继续记录', '其他'].map((result) => <label key={result}><input checked={completionResult === result} name="result" onChange={() => onCompletionResult(result)} type="radio" />{result}</label>)}</div><div className="sheet-actions"><HohoButton variant="secondary" onClick={() => onCompletionOpen(false)}>取消</HohoButton><HohoButton onClick={onComplete}>确定</HohoButton></div></> : <><Thermometer className="sheet-icon" size={24} /><h2>{taskTitle(item)}</h2><p className="sheet-source">来自健康随记：{item.sourceLabel}</p><div className="station-actions"><button onClick={onNavigate} type="button"><Play />补充最新情况</button><button onClick={() => onUpdate({ reminder: { at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paused: false } })} type="button"><Bell />设置提醒</button><button onClick={() => onUpdate({ status: item.status === 'paused' ? 'active' : 'paused' })} type="button"><Pause />{item.status === 'paused' ? '恢复提醒' : '暂停提醒'}</button><button onClick={() => onCompletionOpen(true)} type="button"><HeartHandshake />结束观察</button></div><p className="safety-note">如出现紧急情况，请及时联系专业医疗人员。</p></>}</div></div>
}
