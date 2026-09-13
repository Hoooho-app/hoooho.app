import { Bell, BookOpen, ChevronDown, ChevronRight, ClipboardCheck, FileText, Folder, FolderOpen, HeartHandshake, Languages, MapPin, Pause, Pill, Play, Plus, ShieldCheck, Syringe, Thermometer, Utensils, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HohoButton, MedicalPrepButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath, makeMemberProfileOpenState } from '../../components/navigation/navigationState'
import type { NurseStationItem, NurseStationState } from '../../features/nurse-station/state'
import { readNurseStationState, reconcileNurseStationItems, writeNurseStationState } from '../../features/nurse-station/state'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { quickRecordService } from '../../services/quickRecords'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { getNurseNextActionEventId } from '../HealthEvents/nurseNextActionContext'
import { useJournal } from '../HealthEvents/useJournal'
import '../HealthEvents/TimeView.css'
import { getArchivedTasks, getGuardedDays, sortActiveTasks, taskNextStep, taskStatus, taskTitle } from './nurseStationView'
import { NurseStationFactTypewriter } from './NurseStationFactTypewriter'
import './nurseStation.css'
import { MedicationActionSheet, MedicationReminderFlow } from './MedicationReminderFlow'
import { effectiveStatus, formatOccurrence, nextOccurrences, planLabel, routeLabel } from './medicationReminderLogic'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type TaskCategory = 'medication' | 'allergy' | 'vaccination'

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
  const [reminderFlow, setReminderFlow] = useState<NurseStationItem | true | null>(null)
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('medication')
  const [taskView, setTaskView] = useState<'active' | 'archive'>('active')
  const [taskViewOpen, setTaskViewOpen] = useState(false)
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
    setSelected(null); setReminderFlow(null)
  }, [identityId, currentMemberId])

  const members = listState.status === 'success' ? listState.data.members : cachedMembers
  const member = members.find((item) => item.id === currentMemberId) ?? members[0] ?? null
  const events = listState.status === 'success' ? listState.data.events.filter((event) => event.memberId === currentMemberId) : []
  const nextActionEventId = getNurseNextActionEventId(events, currentMemberId)

  useEffect(() => {
    if (!member || listState.status !== 'success') return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id, medicationJournal.entries))
  }, [events, listState.status, medicationJournal.entries, member])
  useEffect(() => { if (member) writeNurseStationState(identityId, member.id, station) }, [identityId, member, station])

  const active = sortActiveTasks(station.items)
  const archived = getArchivedTasks(station.items)
  const memberDto = listState.status === 'success' ? listState.data.memberDtos.find((item) => item.id === member?.id) : null
  const guardedDays = getGuardedDays(memberDto?.createdAt)
  const visibleTasks = (taskView === 'archive' ? archived : active).filter((item) => taskCategory === 'medication' ? item.type === 'medication_reminder' : false)
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)

  const updateItem = (id: string, changes: Partial<NurseStationItem>) => setStation((previous) => ({ ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) }))
  const closeTaskSheet = () => { setSelected(null); setCompletionOpen(false) }
  const finishObservation = () => { if (selected) { updateItem(selected.id, { status: 'completed', completedAt: new Date().toISOString(), completionResult }); closeTaskSheet() } }
  const saveMedicationPlan = (plan: NonNullable<NurseStationItem['medicationPlan']>) => {
    const now = new Date().toISOString()
    if (reminderFlow && reminderFlow !== true) updateItem(reminderFlow.id, { medicationPlan: plan, reminder: { at: plan.nextOccurrenceAt, paused: false }, status: 'active', title: plan.medicationName })
    else setStation((previous) => ({ ...previous, items: [...previous.items, { id: `med-reminder-${crypto.randomUUID()}`, memberId: currentMemberId, sourceEventId: '', relatedEventIds: [], type: 'medication_reminder', status: 'active', title: plan.medicationName, sourceLabel: '用药提醒', createdAt: now, updatedAt: now, medicationPlan: plan, reminder: { at: plan.nextOccurrenceAt, paused: false } }] }))
    setReminderFlow(null); setTaskCategory('medication'); setTaskView('active')
  }
  const handleMedicationAction = async (action: 'taken'|'snooze'|'skip'|'adjust'|'cancel_snooze'|'pause'|'resume'|'end', detail?: string) => {
    if (!selected?.medicationPlan) return
    const plan = selected.medicationPlan; const now = new Date(); const future = nextOccurrences(plan, new Date(Date.parse(plan.nextOccurrenceAt) + 60_000), 1)[0]
    if (action === 'taken') {
      if (!token || plan.confirmedOccurrenceKeys.includes(plan.occurrenceKey)) return
      const idempotencyKey = `medication-reminder-${selected.id}-${plan.occurrenceKey}`.replaceAll(/[^a-zA-Z0-9_-]/g, '')
      await quickRecordService.create({ memberId: currentMemberId, content: `已服用${plan.medicationName} ${plan.amount}${plan.unit}，${routeLabel(plan.route)}`, occurredAt: now.toISOString(), inputChannel: 'text', idempotencyKey, title: plan.medicationName, journal: { categories: ['medication'], medication: { medicationName: plan.medicationName, amountValue: plan.amount, amountUnit: plan.unit, administrationRoute: (['oral','topical','inhaled','nasal','ophthalmic','other'].includes(plan.route) ? plan.route : 'other') as 'oral', medications: [{ id: crypto.randomUUID(), medicationName: plan.medicationName, amountValue: plan.amount, amountUnit: plan.unit, dosageStep: 1 }] } } }, token)
      updateItem(selected.id, { status: future ? 'active' : 'completed', completedAt: future ? undefined : now.toISOString(), medicationPlan: { ...plan, lastTakenAt: now.toISOString(), nextOccurrenceAt: future?.toISOString() ?? plan.nextOccurrenceAt, occurrenceKey: future?.toISOString() ?? plan.occurrenceKey, confirmedOccurrenceKeys: [...plan.confirmedOccurrenceKeys, plan.occurrenceKey], snoozedUntil: undefined, originalOccurrenceAt: undefined } }); setSelected(null); return
    }
    if (action === 'snooze') { const until = new Date(now.getTime()+600_000).toISOString(); updateItem(selected.id,{status:'snoozed',medicationPlan:{...plan,originalOccurrenceAt:plan.originalOccurrenceAt??plan.nextOccurrenceAt,snoozedUntil:until,nextOccurrenceAt:until}}); setSelected(null); return }
    if (action === 'cancel_snooze') { const next=nextOccurrences(plan,now,1)[0]; updateItem(selected.id,{status:'active',medicationPlan:{...plan,nextOccurrenceAt:(next??now).toISOString(),snoozedUntil:undefined,originalOccurrenceAt:undefined}}); setSelected(null); return }
    if (action === 'skip') { updateItem(selected.id,{status:'skipped_current',medicationPlan:{...plan,skippedAt:now.toISOString(),skipReason:detail,nextOccurrenceAt:future?.toISOString()??plan.nextOccurrenceAt,occurrenceKey:future?.toISOString()??plan.occurrenceKey}}); setSelected(null); return }
    if (action === 'pause' || action === 'resume' || action === 'end') { updateItem(selected.id,{status:action==='pause'?'paused':action==='end'?'ended':'active'}); setSelected(null); return }
    setSelected(null); setReminderFlow(selected)
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
          <NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey="first-member" reducedMotion={reducedMotion} state="idle" stationIdleOnly />
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
      {member && <section className="nurse-station-hero"><div className="nurse-station-copy"><button className="nurse-station-identity" onClick={() => { const returnTo = getCurrentPath(location.pathname, location.search, location.hash); navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) }) }} type="button"><Avatar name={member.name} src={member.avatar} size="lg" /><span><strong>{member.name}</strong><em>{genderLabels[member.gender ?? '']} · {member.age}</em></span></button><p className="nurse-station-guarded">已守护 <strong>{guardedDays}</strong> 天</p><NurseStationFactTypewriter /></div><div className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state="idle" stationIdleOnly /></div></section>}
      <PrimaryEntries onJournal={() => navigate('/health-events')} onProfile={() => navigate('/health-profile')} />
      <MoreServices hasHealthData={events.length > 0} onMedicalPrep={() => nextActionEventId && navigate(`/visit-summary/${nextActionEventId}`)} />
      <section className="guardian-tasks"><header><button aria-expanded={taskViewOpen} className="guardian-task-view" onClick={() => setTaskViewOpen((value) => !value)} type="button">{taskView === 'active' ? '守护任务' : '已归档任务'}<ChevronDown /></button>{taskViewOpen && <div className="guardian-task-view-menu"><button onClick={() => { setTaskView('active'); setTaskViewOpen(false) }} type="button">守护任务</button><button onClick={() => { setTaskView('archive'); setTaskViewOpen(false) }} type="button">已归档任务</button></div>}</header><div className="guardian-task-tabs" role="tablist">{([['medication', '用药提醒'], ['allergy', '排敏测试'], ['vaccination', '疫苗提醒']] as const).map(([id, label]) => <button aria-selected={taskCategory === id} key={id} onClick={() => setTaskCategory(id)} role="tab" type="button">{label}</button>)}</div>{taskView === 'active' && <AddTaskCard category={taskCategory} onOpen={() => taskCategory === 'medication' ? setReminderFlow(true) : taskCategory === 'allergy' ? navigate('/health-profile/allergy') : undefined} />}<div className="guardian-task-list">{visibleTasks.length ? visibleTasks.map((item) => <TaskCard item={item} key={item.id} onOpen={() => setSelected(item)} />) : taskCategory !== 'medication' ? <div className="guardian-task-empty"><Bell/><div><strong>{taskCategory==='allergy'?'暂无排敏测试':'暂无疫苗提醒'}</strong><span>页签已保留，现有记录不会改变</span></div></div> : taskView === 'archive' ? <div className="guardian-task-empty"><HeartHandshake /><div><strong>暂无已归档任务</strong><span>结束的任务会保留在这里</span></div></div> : null}</div></section>
    </div>
    {reminderFlow && member && <MedicationReminderFlow initial={reminderFlow===true?undefined:reminderFlow} memberName={member.name} onClose={()=>setReminderFlow(null)} onSave={saveMedicationPlan}/>}<span hidden />
    {selected?.type==='medication_reminder' && selected.medicationPlan ? <MedicationActionSheet item={selected} onClose={()=>setSelected(null)} onAction={(action,detail)=>void handleMedicationAction(action,detail)}/> : selected && <TaskDetailSheet completionOpen={completionOpen} completionResult={completionResult} item={selected} onClose={closeTaskSheet} onComplete={finishObservation} onCompletionOpen={setCompletionOpen} onCompletionResult={setCompletionResult} onNavigate={() => navigate(`/health-events/${selected.sourceEventId}`)} onUpdate={(changes) => updateItem(selected.id, changes)} />}
  </main>
}

function TaskCard({ item, onOpen }: { item: NurseStationItem; onOpen: () => void }) { const plan=item.medicationPlan; const permission=typeof Notification==='undefined'?'unsupported':Notification.permission; const status=plan?effectiveStatus(item.status,plan,permission):item.status; const label=({active:'进行中',pending_confirmation:'待提醒',due:'待处理',snoozed:'已推迟',skipped_current:'本次跳过',paused:'已暂停',completed:'已结束',ended:'已结束',notification_disabled:'通知未开启'} as Record<string,string>)[status]??taskStatus(item); return <button className="guardian-task-card" data-status={status} onClick={onOpen} type="button"><span className="guardian-task-icon">{item.type === 'medication_reminder' ? <Pill /> : <Thermometer />}</span><span className="guardian-task-copy"><span><strong>{plan?.medicationName??taskTitle(item)}</strong><em>{label}</em></span><small>{plan ? (status==='snoozed' ? `本次已推迟至${formatOccurrence(plan.nextOccurrenceAt)} · 原计划${formatOccurrence(plan.originalOccurrenceAt??plan.nextOccurrenceAt)}` : `${formatOccurrence(plan.nextOccurrenceAt)} · ${planLabel(plan)}`) : taskNextStep(item)}</small>{plan&&<span className="guardian-plan-tags"><i>每次{plan.amount}{plan.unit}</i><i>{routeLabel(plan.route)}</i><i>{plan.longTerm?'长期':`剩${plan.durationDays??1}天`}</i></span>}</span></button> }

function PrimaryEntries({ onJournal, onProfile }: { onJournal: () => void; onProfile: () => void }) { return <section aria-label="核心记录入口" className="nurse-primary-entries"><button onClick={onJournal} type="button"><span className="nurse-primary-entry-copy"><span className="nurse-primary-entry-title"><BookOpen aria-hidden="true" /><strong>健康随记</strong></span><small><span>健康事件记一下</span><span>日常喂养记一下</span><span>病症用药记一下</span></small></span></button><button onClick={onProfile} type="button"><span className="nurse-primary-entry-copy"><span className="nurse-primary-entry-title"><Folder aria-hidden="true" /><strong>健康档案</strong></span><small><span>补充基础信息</span><span>补充过敏史</span><span>补充家族史</span></small></span></button></section> }

function MoreServices({ hasHealthData, onMedicalPrep }: { hasHealthData: boolean; onMedicalPrep: () => void }) { const [noticeKey, setNoticeKey] = useState(0); const services = [{ id: 'allergy-card', label: '过敏出示', icon: Languages }, { id: 'food', label: '能不能吃', icon: Utensils }, { id: 'nearby', label: '附近就医', icon: MapPin }] as const; useEffect(() => { if (!noticeKey) return; const timeout = window.setTimeout(() => setNoticeKey(0), 1800); return () => window.clearTimeout(timeout) }, [noticeKey]); return <section className="nurse-more-services"><h2>更多服务</h2><div><MedicalPrepButton aria-describedby={!hasHealthData ? 'medical-prep-hint' : undefined} className="journal-subject-summary" disabled={!hasHealthData} onClick={onMedicalPrep} />{services.map(({ id, label, icon: Icon }) => <button aria-label={label + '，功能即将开放'} className={'nurse-more-service nurse-more-service--unavailable nurse-more-service--' + id} key={id} onClick={() => setNoticeKey((value) => value + 1)} type="button"><span><Icon aria-hidden="true" /></span><strong>{label}</strong></button>)}</div>{!hasHealthData && <span className="sr-only" id="medical-prep-hint">记录健康情况后即可生成</span>}{noticeKey > 0 && <div aria-live="polite" className="nurse-more-service-notice" role="status">功能即将开放</div>}</section> }

function AddTaskCard({ category, onOpen }: { category: TaskCategory; onOpen: () => void }) { const copy = category === 'medication' ? ['新增用药提醒', '创建下一次用药提醒'] : category === 'allergy' ? ['新增排敏测试', '创建新的排敏记录'] : ['新增疫苗提醒', '本轮暂不新增业务流程']; return <button className="guardian-task-card guardian-task-add" disabled={category==='vaccination'} onClick={onOpen} type="button"><span className="guardian-task-icon">{category==='vaccination'?<Syringe/>:<Plus />}</span><span className="guardian-task-copy"><strong>{copy[0]}</strong><small>{copy[1]}</small></span></button> }

function TaskDetailSheet({ completionOpen, completionResult, item, onClose, onComplete, onCompletionOpen, onCompletionResult, onNavigate, onUpdate }: { completionOpen: boolean; completionResult: string; item: NurseStationItem; onClose: () => void; onComplete: () => void; onCompletionOpen: (value: boolean) => void; onCompletionResult: (value: string) => void; onNavigate: () => void; onUpdate: (changes: Partial<NurseStationItem>) => void }) {
  return <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-sheet"><button aria-label="关闭" className="sheet-close" onClick={onClose} type="button"><X /></button>{completionOpen ? <><h2>结束这次观察？</h2><div className="completion-options">{['已恢复', '已经就医', '不再继续记录', '其他'].map((result) => <label key={result}><input checked={completionResult === result} name="result" onChange={() => onCompletionResult(result)} type="radio" />{result}</label>)}</div><div className="sheet-actions"><HohoButton variant="secondary" onClick={() => onCompletionOpen(false)}>取消</HohoButton><HohoButton onClick={onComplete}>确定</HohoButton></div></> : <><Thermometer className="sheet-icon" size={24} /><h2>{taskTitle(item)}</h2><p className="sheet-source">来自健康随记：{item.sourceLabel}</p><div className="station-actions"><button onClick={onNavigate} type="button"><Play />补充最新情况</button><button onClick={() => onUpdate({ reminder: { at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paused: false } })} type="button"><Bell />设置提醒</button><button onClick={() => onUpdate({ status: item.status === 'paused' ? 'active' : 'paused' })} type="button"><Pause />{item.status === 'paused' ? '恢复提醒' : '暂停提醒'}</button><button onClick={() => onCompletionOpen(true)} type="button"><HeartHandshake />结束观察</button></div><p className="safety-note">如出现紧急情况，请及时联系专业医疗人员。</p></>}</div></div>
}
