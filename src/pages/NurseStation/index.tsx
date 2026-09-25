import { Bell, BookOpen, ChevronDown, ChevronRight, ClipboardCheck, FileText, Folder, FolderOpen, HeartHandshake, Languages, MapPin, Pause, Pill, Play, Plus, ShieldCheck, Thermometer, Utensils, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { medicationReminderService, type MedicationReminderDto } from '../../services/medicationReminders'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { getNurseNextActionEventId } from '../HealthEvents/nurseNextActionContext'
import { useJournal } from '../HealthEvents/useJournal'
import '../HealthEvents/TimeView.css'
import { getArchivedTasks, getGuardedDays, sortActiveTasks, taskNextStep, taskStatus, taskTitle } from './nurseStationView'
import { NurseStationFactTypewriter } from './NurseStationFactTypewriter'
import './nurseStation.css'
import { MedicationReminderFlow } from './MedicationReminderFlow'
import { MedicationReminderCard } from './MedicationReminderCard'
import { effectiveStatus, formatOccurrence, planLabel, routeLabel } from './medicationReminderLogic'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type TaskCategory = 'medication' | 'allergy'

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
  const [stationMemberId, setStationMemberId] = useState(currentMemberId)
  const [selected, setSelected] = useState<NurseStationItem | null>(null)
  const [reminderFlow, setReminderFlow] = useState<NurseStationItem | true | null>(null)
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('medication')
  const [taskView, setTaskView] = useState<'active' | 'archive'>('active')
  const [taskViewOpen, setTaskViewOpen] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionResult, setCompletionResult] = useState('已恢复')
  const [savedItemId, setSavedItemId] = useState('')
  const [medicationReminders, setMedicationReminders] = useState<MedicationReminderDto[]>([])
  const [medicationStatus, setMedicationStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [medicationNotice, setMedicationNotice] = useState('')
  const [busyReminderId, setBusyReminderId] = useState('')
  const [openReminderId, setOpenReminderId] = useState('')
  const [deleteReminder, setDeleteReminder] = useState<MedicationReminderDto | null>(null)
  const [now, setNow] = useState(() => new Date())
  const migratingIds = useRef(new Set<string>())

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReducedMotion(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setStation(readNurseStationState(identityId, currentMemberId))
    setStationMemberId(currentMemberId)
    setSelected(null); setReminderFlow(null)
  }, [identityId, currentMemberId])

  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [])

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.medication-course-card')) setOpenReminderId('') }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    if (!medicationNotice) return
    const timer = window.setTimeout(() => setMedicationNotice(''), 2400)
    return () => window.clearTimeout(timer)
  }, [medicationNotice])

  useEffect(() => {
    let active = true
    setMedicationStatus('loading'); setMedicationReminders([]); setOpenReminderId(''); setDeleteReminder(null); migratingIds.current.clear()
    if (!token || !currentMemberId) return () => { active = false }
    void medicationReminderService.list(currentMemberId, token).then((items) => { if (active) { setMedicationReminders(items); setMedicationStatus('success') } }).catch(() => { if (active) setMedicationStatus('error') })
    return () => { active = false }
  }, [currentMemberId, token])

  const members = listState.status === 'success' ? listState.data.members : cachedMembers
  const member = members.find((item) => item.id === currentMemberId) ?? null
  const events = listState.status === 'success' ? listState.data.events.filter((event) => event.memberId === currentMemberId) : []
  const nextActionEventId = getNurseNextActionEventId(events, currentMemberId)

  useEffect(() => {
    if (!member || listState.status !== 'success' || stationMemberId !== member.id) return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id, medicationJournal.entries))
  }, [events, listState.status, medicationJournal.entries, member, stationMemberId])
  useEffect(() => { if (member && stationMemberId === member.id) writeNurseStationState(identityId, member.id, station) }, [identityId, member, station, stationMemberId])

  const stationIsCurrent = stationMemberId === currentMemberId
  const currentItems = stationIsCurrent ? station.items : []
  const active = sortActiveTasks(currentItems)
  const archived = getArchivedTasks(currentItems)
  const memberDto = listState.status === 'success' ? listState.data.memberDtos.find((item) => item.id === member?.id) : null
  const guardedDays = getGuardedDays(memberDto?.createdAt)
  const visibleTasks = (taskView === 'archive' ? archived : active).filter((item) => item.type !== 'medication_reminder')
  const visibleMedicationReminders = medicationReminders.filter((item) => taskView === 'archive' ? item.status === 'archived' : item.status === 'active')
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)

  const updateItem = (id: string, changes: Partial<NurseStationItem>) => setStation((previous) => ({ ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) }))
  const closeTaskSheet = () => { setSelected(null); setCompletionOpen(false) }
  const finishObservation = () => { if (selected) { updateItem(selected.id, { status: 'completed', completedAt: new Date().toISOString(), completionResult }); closeTaskSheet() } }
  useEffect(() => {
    if (medicationStatus !== 'success' || !token || !stationIsCurrent) return
    for (const item of station.items.filter((entry) => entry.type === 'medication_reminder' && entry.medicationPlan)) {
      if (medicationReminders.some((entry) => entry.clientId === item.id) || migratingIds.current.has(item.id)) continue
      migratingIds.current.add(item.id)
      void medicationReminderService.create(currentMemberId, item.medicationPlan!, token, item.id).then((created) => setMedicationReminders((current) => current.some((entry) => entry.id === created.id) ? current : [...current, created])).catch(() => setMedicationNotice('旧提醒同步失败，请稍后重试')).finally(() => migratingIds.current.delete(item.id))
    }
  }, [currentMemberId, medicationReminders, medicationStatus, station.items, stationIsCurrent, token])

  const saveMedicationPlan = async (plan: NonNullable<NurseStationItem['medicationPlan']>) => {
    if (!token || !stationIsCurrent) throw new Error('登录状态无效')
    const created = await medicationReminderService.create(currentMemberId, plan, token, `med-reminder-${crypto.randomUUID()}`)
    setMedicationReminders((current) => [...current, created])
    setSavedItemId(created.id); window.setTimeout(() => document.querySelector<HTMLElement>(`[data-reminder-id="${created.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0); window.setTimeout(() => setSavedItemId(current => current === created.id ? '' : current), 2400)
    setReminderFlow(null); setTaskCategory('medication'); setTaskView('active')
  }
  const replaceReminder = (updated: MedicationReminderDto) => setMedicationReminders((current) => current.map((item) => item.id === updated.id ? updated : item))
  const reminderAction = async (reminder: MedicationReminderDto, action: 'take' | 'undo' | 'archive' | 'delete') => {
    if (!token || busyReminderId) return
    setBusyReminderId(reminder.id); setMedicationNotice('')
    try {
      if (action === 'take') { if (!reminder.nextOccurrence) return; replaceReminder(await medicationReminderService.complete(reminder.id, reminder.nextOccurrence.id, authUser?.id ?? identityId, token)); setMedicationNotice('本次已记录') }
      else if (action === 'undo') { replaceReminder(await medicationReminderService.undo(reminder.id, token)); setMedicationNotice('已撤回最近一次记录') }
      else if (action === 'archive') { replaceReminder(await medicationReminderService.archive(reminder.id, token)); setOpenReminderId(''); setMedicationNotice('已归档') }
      else {
        await medicationReminderService.delete(reminder.id, token)
        setMedicationReminders((current) => current.filter((item) => item.id !== reminder.id))
        if (reminder.clientId) setStation((current) => {
          const next = { ...current, items: current.items.filter((item) => item.id !== reminder.clientId) }
          writeNurseStationState(identityId, currentMemberId, next)
          return next
        })
        setDeleteReminder(null); setOpenReminderId(''); setMedicationNotice('提醒及记录已删除')
      }
    } catch (error) { setMedicationNotice(error instanceof Error ? error.message : '操作没有完成，请重试') }
    finally { setBusyReminderId('') }
  }

  if (listState.status === 'success' && listState.data.entryState.familyMemberCount === 0) return (
    <main className="app-shell nurse-station-page">
      <MainAppHeader title="前台" />
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
    <MainAppHeader title="前台" />
    <div className="nurse-station-scroll">
      {listState.status === 'loading' ? <section aria-label="正在加载当前人物" className="nurse-station-hero nurse-station-hero--loading"><span/><span/></section> : listState.status === 'error' ? <section className="nurse-station-load-error"><p>当前人物资料加载失败，已保存内容没有改变。</p><button onClick={retryEvents} type="button">重新加载</button></section> : member && <section className="nurse-station-hero"><div className="nurse-station-copy"><button className="nurse-station-identity" onClick={() => { const returnTo = getCurrentPath(location.pathname, location.search, location.hash); navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) }) }} type="button"><Avatar name={member.name} src={member.avatar} size="lg" /><span><strong>{member.name}</strong><em>{genderLabels[member.gender ?? '']} · {member.age}</em></span></button><p className="nurse-station-guarded">已守护 <strong>{guardedDays}</strong> 天</p><NurseStationFactTypewriter /></div><div className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state="idle" stationIdleOnly /></div></section>}
      <PrimaryEntries onJournal={() => navigate('/health-events')} onProfile={() => navigate('/health-profile')} />
      <MoreServices hasHealthData={events.length > 0} loading={listState.status === 'loading'} onMedicalPrep={() => nextActionEventId && navigate(`/visit-summary/${nextActionEventId}`)} />
      <section aria-busy={listState.status === 'loading' || !stationIsCurrent} className="guardian-tasks">
        <header><div className="guardian-task-heading"><button aria-expanded={taskViewOpen} className="guardian-task-view" onClick={() => setTaskViewOpen((value) => !value)} type="button">{taskView === 'active' ? '守护任务' : '已归档任务'}<ChevronDown /></button></div>{taskViewOpen && <div className="guardian-task-view-menu"><button onClick={() => { setTaskView('active'); setTaskViewOpen(false) }} type="button">守护任务</button><button onClick={() => { setTaskView('archive'); setTaskViewOpen(false) }} type="button">已归档任务</button></div>}</header>
        <div className="guardian-task-tabs" role="tablist">{([['medication', '用药提醒'], ['allergy', '排敏测试']] as const).map(([id, label]) => <button aria-selected={taskCategory === id} key={id} onClick={() => setTaskCategory(id)} role="tab" type="button">{label}</button>)}</div>
        {(listState.status === 'loading' || !stationIsCurrent || medicationStatus === 'loading') && <div aria-live="polite" className="guardian-data-notice" role="status">正在同步当前人物的任务…</div>}
        {listState.status === 'error' && <div className="guardian-data-notice guardian-data-notice--error" role="alert"><span>最新数据加载失败，已保存任务仍会保留。</span><button onClick={retryEvents} type="button">重新加载</button></div>}
        {medicationStatus === 'error' && taskCategory === 'medication' && <div className="guardian-data-notice guardian-data-notice--error" role="alert"><span>用药提醒加载失败，请稍后重试。</span></div>}
        {taskView === 'active' && <AddTaskCard category={taskCategory} disabled={!stationIsCurrent} onOpen={() => taskCategory === 'medication' ? setReminderFlow(true) : taskCategory === 'allergy' ? navigate('/health-profile/allergy') : undefined} />}
        <div className="guardian-task-list">{taskCategory === 'medication' ? visibleMedicationReminders.length ? visibleMedicationReminders.map((reminder) => <MedicationReminderCard busy={busyReminderId === reminder.id} key={reminder.id} now={now} onArchive={() => void reminderAction(reminder, 'archive')} onDelete={() => { setDeleteReminder(reminder); setOpenReminderId('') }} onOpen={(value) => setOpenReminderId(value ? reminder.id : '')} onTake={() => void reminderAction(reminder, 'take')} onUndo={() => void reminderAction(reminder, 'undo')} open={openReminderId === reminder.id} reminder={reminder} />) : medicationStatus === 'loading' ? null : taskView === 'archive' ? <div className="guardian-task-empty"><HeartHandshake /><div><strong>暂无已归档任务</strong><span>归档后会保留计划与服用记录</span></div></div> : <div className="guardian-task-empty"><Pill/><div><strong>还没有用药提醒</strong><span>需要时可以从上方创建</span></div></div> : visibleTasks.length ? visibleTasks.map((item) => <TaskCard item={item} key={item.id} onOpen={() => setSelected(item)} />) : <div className="guardian-task-empty"><Bell/><div><strong>还没有排敏测试</strong><span>完成测试后，记录会显示在这里</span></div></div>}</div>
      </section>
    </div>
    {(savedItemId || medicationNotice) && <p aria-live="polite" className="nurse-station-save-notice" role="status">{medicationNotice || '用药提醒已保存'}</p>}{reminderFlow && member && <MedicationReminderFlow initial={reminderFlow===true?undefined:reminderFlow} memberName={member.name} onClose={()=>setReminderFlow(null)} onSave={saveMedicationPlan} recentPlans={medicationReminders.map(item=>item.plan)}/>}<span hidden />
    {selected && <TaskDetailSheet completionOpen={completionOpen} completionResult={completionResult} item={selected} onClose={closeTaskSheet} onComplete={finishObservation} onCompletionOpen={setCompletionOpen} onCompletionResult={setCompletionResult} onNavigate={() => navigate(`/health-events/${selected.sourceEventId}`)} onUpdate={(changes) => updateItem(selected.id, changes)} />}
    {deleteReminder && <div className="medication-delete-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyReminderId) setDeleteReminder(null) }} role="presentation"><section aria-labelledby="medication-delete-title" aria-modal="true" className="medication-delete-dialog" role="dialog"><h2 id="medication-delete-title">删除提醒？</h2><p>删除后，这条提醒和它生成的服用记录都会移除，无法恢复。</p><div><button disabled={Boolean(busyReminderId)} onClick={() => setDeleteReminder(null)} type="button">取消</button><button disabled={Boolean(busyReminderId)} onClick={() => void reminderAction(deleteReminder, 'delete')} type="button">{busyReminderId ? '删除中…' : '删除提醒'}</button></div></section></div>}
  </main>
}

function TaskCard({ item, onOpen }: { item: NurseStationItem; onOpen: () => void }) { const plan=item.medicationPlan; const status=plan?effectiveStatus(item.status,plan,'granted'):item.status; const label=({active:'进行中',pending_confirmation:'待提醒',due:'待处理',snoozed:'已推迟',skipped_current:'本次跳过',paused:'已暂停',completed:'已结束',ended:'已结束',notification_disabled:'通知未开启'} as Record<string,string>)[status]??taskStatus(item); const details=plan?getPlanDetails(plan):[]; return <button className="guardian-task-card" data-status={status} data-task-id={item.id} onClick={onOpen} type="button"><span className="guardian-task-icon">{item.type === 'medication_reminder' ? <Pill /> : <Thermometer />}</span><span className="guardian-task-copy"><span><strong>{plan?.medicationName??taskTitle(item)}</strong><em>{label}</em></span><small>{plan ? (status==='snoozed' ? `本次已推迟至 ${formatOccurrence(plan.nextOccurrenceAt)}；原计划 ${formatOccurrence(plan.originalOccurrenceAt??plan.nextOccurrenceAt)}` : `下次：${formatOccurrence(plan.nextOccurrenceAt)} · ${planLabel(plan)}`) : taskNextStep(item)}</small>{details.length>0&&<span className="guardian-plan-details">{details.map((detail)=><span key={detail}>{detail}</span>)}</span>}</span></button> }

function PrimaryEntries({ onJournal, onProfile }: { onJournal: () => void; onProfile: () => void }) { return <section aria-label="核心记录入口" className="nurse-primary-entries"><button onClick={onJournal} type="button"><span className="nurse-primary-entry-copy"><span className="nurse-primary-entry-title"><BookOpen aria-hidden="true" /><strong>健康事件记录</strong></span><small><span>健康事件记一下</span><span>日常喂养记一下</span><span>病症用药记一下</span></small></span></button><button onClick={onProfile} type="button"><span className="nurse-primary-entry-copy"><span className="nurse-primary-entry-title"><Folder aria-hidden="true" /><strong>健康档案</strong></span><small><span>补充基础信息</span><span>补充过敏史</span><span>补充家族史</span></small></span></button></section> }

function MoreServices({ hasHealthData, loading, onMedicalPrep }: { hasHealthData: boolean; loading: boolean; onMedicalPrep: () => void }) { const services = [{ id: 'allergy-card', label: '过敏出示', icon: Languages }, { id: 'food', label: '能不能吃', icon: Utensils }, { id: 'nearby', label: '附近就医', icon: MapPin }] as const; const unavailable=loading||!hasHealthData; return <section className="nurse-more-services"><h2>更多服务</h2><div><MedicalPrepButton aria-describedby={unavailable ? 'medical-prep-hint' : undefined} aria-label={loading?'就诊情况单，正在加载当前人物记录':'就诊情况单'} className="journal-subject-summary" disabled={unavailable} label="就诊情况单" onClick={onMedicalPrep} />{services.map(({ id, label, icon: Icon }) => <button aria-label={label + '，暂未开放'} className={'nurse-more-service nurse-more-service--unavailable nurse-more-service--' + id} disabled key={id} type="button"><span><Icon aria-hidden="true" /></span><strong>{label}</strong></button>)}</div>{unavailable && <span className="sr-only" id="medical-prep-hint">{loading?'正在加载当前人物记录':'记录健康情况后即可生成'}</span>}</section> }

function AddTaskCard({ category, disabled, onOpen }: { category: TaskCategory; disabled?: boolean; onOpen: () => void }) { const copy = category === 'medication' ? ['新增用药提醒', '创建下一次用药提醒'] : ['新增排敏测试', '前往过敏档案记录']; return <button className="guardian-task-card guardian-task-add" disabled={disabled} onClick={onOpen} type="button"><span className="guardian-task-icon"><Plus /></span><span className="guardian-task-copy"><strong>{copy[0]}</strong><small>{copy[1]}</small></span></button> }

function getPlanDetails(plan: NonNullable<NurseStationItem['medicationPlan']>) {
  const details: string[] = []
  if (Number.isFinite(plan.amount)) details.push(`每次 ${plan.amount}${plan.unit?.trim() ?? ''}`)
  if (plan.route) details.push(routeLabel(plan.route))
  if (plan.longTerm) details.push('长期使用')
  else if (plan.durationDays) details.push(`持续 ${plan.durationDays} 天`)
  else if (plan.endDate) details.push(`至 ${plan.endDate}`)
  return details
}

function TaskDetailSheet({ completionOpen, completionResult, item, onClose, onComplete, onCompletionOpen, onCompletionResult, onNavigate, onUpdate }: { completionOpen: boolean; completionResult: string; item: NurseStationItem; onClose: () => void; onComplete: () => void; onCompletionOpen: (value: boolean) => void; onCompletionResult: (value: string) => void; onNavigate: () => void; onUpdate: (changes: Partial<NurseStationItem>) => void }) {
  return <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-sheet"><button aria-label="关闭" className="sheet-close" onClick={onClose} type="button"><X /></button>{completionOpen ? <><h2>结束这次观察？</h2><div className="completion-options">{['已恢复', '已经就医', '不再继续记录', '其他'].map((result) => <label key={result}><input checked={completionResult === result} name="result" onChange={() => onCompletionResult(result)} type="radio" />{result}</label>)}</div><div className="sheet-actions"><HohoButton variant="secondary" onClick={() => onCompletionOpen(false)}>取消</HohoButton><HohoButton onClick={onComplete}>确定</HohoButton></div></> : <><Thermometer className="sheet-icon" size={24} /><h2>{taskTitle(item)}</h2><p className="sheet-source">来自健康随记：{item.sourceLabel}</p><div className="station-actions"><button onClick={onNavigate} type="button"><Play />补充最新情况</button><button onClick={() => onUpdate({ reminder: { at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paused: false } })} type="button"><Bell />设置提醒</button><button onClick={() => onUpdate({ status: item.status === 'paused' ? 'active' : 'paused' })} type="button"><Pause />{item.status === 'paused' ? '恢复提醒' : '暂停提醒'}</button><button onClick={() => onCompletionOpen(true)} type="button"><HeartHandshake />结束观察</button></div><p className="safety-note">如出现紧急情况，请及时联系专业医疗人员。</p></>}</div></div>
}
