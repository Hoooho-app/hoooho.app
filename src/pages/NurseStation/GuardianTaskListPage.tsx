import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EmptyState, HohoButton, StatusNotice } from '../../components/design-system'
import { WebPageHeader } from '../../components/common/WebPageHeader'
import { readNurseStationState, writeNurseStationState } from '../../features/nurse-station/state'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { desensitizationTestService, type DesensitizationTaskDto } from '../../services/desensitizationTests'
import { medicationReminderService, type MedicationReminderDto } from '../../services/medicationReminders'
import { useAppStore } from '../../store/useAppStore'
import { DesensitizationTaskCard } from './DesensitizationTaskCard'
import { DesensitizationTaskSheet } from './DesensitizationTaskSheet'
import { MedicationReminderCard } from './MedicationReminderCard'
import { MedicationReminderFlow } from './MedicationReminderFlow'
import './nurseStation.css'
import './desensitization.css'
import './guardianTasks.css'

type TaskKind = 'medication' | 'desensitization'
type TaskView = 'active' | 'archive'
type LoadStatus = 'loading' | 'success' | 'error'
type DesensitizationView = 'record' | 'trend' | 'history' | 'scope' | 'plan' | 'manage'

const pageMeta = {
  medication: { title: '用药提醒', add: '新增提醒', item: '提醒任务', empty: '还没有用药提醒', emptyArchive: '暂无已归档任务' },
  desensitization: { title: '排敏测试', add: '新增测试', item: '测试任务', empty: '还没有排敏测试', emptyArchive: '暂无已归档测试' }
} as const

function initialView(search: string): TaskView {
  return new URLSearchParams(search).get('view') === 'archive' ? 'archive' : 'active'
}

function GuardianTaskListPage({ kind }: { kind: TaskKind }) {
  const navigate = useNavigate()
  const location = useLocation()
  const member = useCurrentMember()
  const authUser = useAppStore((state) => state.authUser)
  const token = useAppStore((state) => state.authToken) ?? ''
  const identityId = authUser?.id ?? 'unknown'
  const [view, setView] = useState<TaskView>(() => initialView(location.search))
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [medicationReminders, setMedicationReminders] = useState<MedicationReminderDto[]>([])
  const [desensitizationTasks, setDesensitizationTasks] = useState<DesensitizationTaskDto[]>([])
  const [busyId, setBusyId] = useState('')
  const [openId, setOpenId] = useState('')
  const [deleteReminder, setDeleteReminder] = useState<MedicationReminderDto | null>(null)
  const [deleteDesensitization, setDeleteDesensitization] = useState<DesensitizationTaskDto | null>(null)
  const [reminderFlow, setReminderFlow] = useState(false)
  const [selectedDesensitization, setSelectedDesensitization] = useState<{ id: string; view: DesensitizationView } | null>(null)
  const [notice, setNotice] = useState<{ message: string; undo?: () => Promise<void> } | null>(null)
  const [now, setNow] = useState(() => new Date())
  const requestVersion = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const meta = pageMeta[kind]

  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setStatus('loading')
    setOpenId('')
    try {
      if (kind === 'medication') {
        const items = await medicationReminderService.list(member.id, token)
        if (version !== requestVersion.current) return
        setMedicationReminders(items)
      } else {
        const result = await desensitizationTestService.list(member.id, token)
        if (version !== requestVersion.current) return
        setDesensitizationTasks(result.tasks)
      }
      setStatus('success')
    } catch {
      if (version === requestVersion.current) setStatus('error')
    }
  }, [kind, member.id, token])

  useEffect(() => {
    setMedicationReminders([])
    setDesensitizationTasks([])
    setSelectedDesensitization(null)
    setDeleteReminder(null)
    setDeleteDesensitization(null)
    void load()
    return () => { requestVersion.current += 1 }
  }, [load])

  useEffect(() => {
    if (kind !== 'medication') return
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [kind])

  useEffect(() => {
    if (!notice || notice.undo) return
    const timer = window.setTimeout(() => setNotice(null), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (kind !== 'desensitization' || status !== 'success') return
    const requestedId = new URLSearchParams(location.search).get('desensitization')
    const routedNotice = (location.state as { desensitizationNotice?: string } | null)?.desensitizationNotice
    if (routedNotice) setNotice({ message: routedNotice })
    if (!requestedId) return
    const task = desensitizationTasks.find((item) => item.id === requestedId)
    if (task) {
      setView(task.status === 'archived' ? 'archive' : 'active')
      setSelectedDesensitization({ id: task.id, view: 'trend' })
    }
    navigate(location.pathname, { replace: true, state: null })
  }, [desensitizationTasks, kind, location.pathname, location.search, location.state, navigate, status])

  useEffect(() => {
    const key = `hoooho-task-scroll:${member.id}:${kind}`
    const node = scrollRef.current
    if (!node) return
    const saved = Number(sessionStorage.getItem(key) ?? 0)
    if (saved > 0) requestAnimationFrame(() => node.scrollTo({ top: saved }))
    return () => sessionStorage.setItem(key, String(node.scrollTop))
  }, [kind, member.id])

  const activeCount = kind === 'medication'
    ? medicationReminders.filter((item) => item.status === 'active').length
    : desensitizationTasks.filter((item) => item.status === 'active').length
  const archivedCount = kind === 'medication'
    ? medicationReminders.filter((item) => item.status === 'archived').length
    : desensitizationTasks.filter((item) => item.status === 'archived').length
  const visibleMedication = medicationReminders.filter((item) => view === 'archive' ? item.status === 'archived' : item.status === 'active')
  const visibleDesensitization = desensitizationTasks.filter((item) => view === 'archive' ? item.status === 'archived' : item.status === 'active')
  const visibleCount = kind === 'medication' ? visibleMedication.length : visibleDesensitization.length
  const selectedTask = selectedDesensitization ? desensitizationTasks.find((item) => item.id === selectedDesensitization.id) ?? null : null

  const chooseView = (next: TaskView) => {
    setView(next)
    setOpenId('')
    navigate(`${location.pathname}${next === 'archive' ? '?view=archive' : ''}`, { replace: true, state: null })
  }

  const replaceReminder = (updated: MedicationReminderDto) => setMedicationReminders((current) => current.map((item) => item.id === updated.id ? updated : item))
  const reminderAction = async (reminder: MedicationReminderDto, action: 'take' | 'undo' | 'archive' | 'delete') => {
    if (!token || busyId) return
    setBusyId(reminder.id)
    setNotice(null)
    try {
      if (action === 'take') {
        if (!reminder.nextOccurrence) return
        replaceReminder(await medicationReminderService.complete(reminder.id, reminder.nextOccurrence.id, authUser?.id ?? identityId, token))
        setNotice({ message: '本次已记录' })
      } else if (action === 'undo') {
        replaceReminder(await medicationReminderService.undo(reminder.id, token))
        setNotice({ message: '已撤回最近一次记录' })
      } else if (action === 'archive') {
        replaceReminder(await medicationReminderService.archive(reminder.id, token))
        setOpenId('')
        setNotice({ message: '已归档' })
      } else {
        await medicationReminderService.delete(reminder.id, token)
        setMedicationReminders((current) => current.filter((item) => item.id !== reminder.id))
        if (reminder.clientId) {
          const station = readNurseStationState(identityId, member.id)
          writeNurseStationState(identityId, member.id, { ...station, items: station.items.filter((item) => item.id !== reminder.clientId) })
        }
        setDeleteReminder(null)
        setOpenId('')
        setNotice({ message: '提醒及记录已删除' })
      }
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : '操作没有完成，请重试' })
    } finally {
      setBusyId('')
    }
  }

  const refreshDesensitization = useCallback(async () => {
    const version = ++requestVersion.current
    const result = await desensitizationTestService.list(member.id, token)
    if (version !== requestVersion.current) return
    setDesensitizationTasks(result.tasks)
    setStatus('success')
  }, [member.id, token])

  const desensitizationAction = async (task: DesensitizationTaskDto, action: 'archive' | 'restore' | 'delete') => {
    if (!token || busyId) return
    setBusyId(task.id)
    setNotice(null)
    try {
      if (action === 'archive') {
        const archivedTask = await desensitizationTestService.archive(task.id, task.version, token)
        setNotice({ message: '已归档，记录和医生安排仍会保留', undo: async () => {
          await desensitizationTestService.restore(task.id, archivedTask.version, token)
          await refreshDesensitization()
          setNotice({ message: '已撤销归档' })
        } })
      } else if (action === 'restore') {
        const restoredTask = await desensitizationTestService.restore(task.id, task.version, token)
        chooseView('active')
        setNotice({ message: '已恢复观察', undo: async () => {
          await desensitizationTestService.archive(task.id, restoredTask.version, token)
          await refreshDesensitization()
          setNotice({ message: '已撤销恢复' })
        } })
      } else {
        const deletedTask = await desensitizationTestService.delete(task.id, task.version, token)
        setNotice({ message: '排敏测试已删除，健康随记原记录未改变', undo: async () => {
          await desensitizationTestService.undoDelete(task.id, deletedTask.version, token)
          await refreshDesensitization()
          setNotice({ message: '已撤销删除' })
        } })
        setDeleteDesensitization(null)
      }
      setOpenId('')
      setSelectedDesensitization(null)
      await refreshDesensitization()
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : '操作没有完成，请重试' })
    } finally {
      setBusyId('')
    }
  }

  const add = () => {
    if (kind === 'medication') setReminderFlow(true)
    else navigate('/nurse-station/desensitization/new', { state: { returnTo: '/desensitization-tests' } })
  }

  const saveMedication = async (plan: Parameters<typeof medicationReminderService.create>[1]) => {
    const created = await medicationReminderService.create(member.id, plan, token, `med-reminder-${crypto.randomUUID()}`)
    setMedicationReminders((current) => [...current, created])
    setReminderFlow(false)
    chooseView('active')
    setNotice({ message: '用药提醒已保存' })
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-reminder-id="${created.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const list = useMemo(() => {
    if (status !== 'success') return null
    if (visibleCount === 0) return <EmptyState description={view === 'archive' ? '归档内容会保留原有记录。' : `点击右上角“${meta.add}”开始创建。`} title={view === 'archive' ? meta.emptyArchive : meta.empty} />
    if (kind === 'medication') return visibleMedication.map((reminder) => <MedicationReminderCard busy={busyId === reminder.id} key={reminder.id} now={now} onArchive={() => void reminderAction(reminder, 'archive')} onDelete={() => { setDeleteReminder(reminder); setOpenId('') }} onOpen={(value) => setOpenId(value ? reminder.id : '')} onTake={() => void reminderAction(reminder, 'take')} onUndo={() => void reminderAction(reminder, 'undo')} open={openId === reminder.id} reminder={reminder} />)
    return visibleDesensitization.map((task) => <DesensitizationTaskCard busy={busyId === task.id} key={task.id} onArchive={() => void desensitizationAction(task, 'archive')} onDelete={() => setDeleteDesensitization(task)} onOpen={(next) => setSelectedDesensitization({ id: task.id, view: next })} onRestore={() => void desensitizationAction(task, 'restore')} onToggle={(value) => setOpenId(value ? task.id : '')} open={openId === task.id} task={task} />)
  }, [busyId, kind, meta.add, meta.empty, meta.emptyArchive, now, openId, status, view, visibleCount, visibleDesensitization, visibleMedication])

  return <main className="app-shell guardian-task-page">
    <WebPageHeader action={<button className="guardian-task-page__add" disabled={status === 'loading'} onClick={add} type="button"><Plus aria-hidden="true" />{meta.add}</button>} fallback="/nurse-station" title={meta.title} />
    <div className="guardian-task-page__scroll" ref={scrollRef}>
      <div aria-label={`${meta.title}状态`} className="guardian-task-page__tabs" role="tablist">
        <button aria-selected={view === 'active'} onClick={() => chooseView('active')} role="tab" type="button">进行中 <span>{status === 'success' ? activeCount : '—'}</span></button>
        <button aria-selected={view === 'archive'} onClick={() => chooseView('archive')} role="tab" type="button">已归档 <span>{status === 'success' ? archivedCount : '—'}</span></button>
      </div>
      <div className="guardian-task-page__summary"><span>{status === 'success' ? `共 ${visibleCount} 个${meta.item}` : status === 'loading' ? '正在同步当前人物的任务…' : '任务数量暂时无法读取'}</span><small>点“管理”，或左滑卡片</small></div>
      {status === 'loading' && <div aria-live="polite" className="guardian-task-page__loading" role="status"><span /><span /><span /></div>}
      {status === 'error' && <StatusNotice action={<HohoButton onClick={() => void load()} size="small" variant="secondary">重新加载</HohoButton>} title={`${meta.title}加载失败`} tone="error">现有任务没有改变，请检查网络后重试。</StatusNotice>}
      <section aria-busy={status === 'loading'} aria-label={`${view === 'active' ? '进行中' : '已归档'}${meta.title}`} className="guardian-task-list guardian-task-page__list">{list}</section>
    </div>
    {notice && <p aria-live="polite" className="nurse-station-save-notice desensitization-notice" role="status"><span>{notice.message}</span>{notice.undo && <button onClick={() => { const undo = notice.undo; setNotice(null); void undo?.().catch((error) => setNotice({ message: error instanceof Error ? error.message : '撤销失败，请重试' })) }} type="button">撤销</button>}</p>}
    {reminderFlow && <MedicationReminderFlow memberName={member.name} onClose={() => setReminderFlow(false)} onSave={saveMedication} recentPlans={medicationReminders.map((item) => item.plan)} />}
    {selectedTask && selectedDesensitization && <DesensitizationTaskSheet initialView={selectedDesensitization.view} onArchive={() => void desensitizationAction(selectedTask, 'archive')} onClose={() => setSelectedDesensitization(null)} onDelete={() => setDeleteDesensitization(selectedTask)} onNotice={(message, undo) => { if (message !== '记录已保存，趋势已更新') setNotice({ message, undo }) }} onRefresh={refreshDesensitization} onRestore={() => void desensitizationAction(selectedTask, 'restore')} task={selectedTask} token={token} />}
    {deleteReminder && <div className="medication-delete-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setDeleteReminder(null) }} role="presentation"><section aria-labelledby="medication-delete-title" aria-modal="true" className="medication-delete-dialog" role="dialog"><h2 id="medication-delete-title">删除“{deleteReminder.plan.medicationName}”提醒？</h2><p>删除后，这条提醒和它生成的服用记录都会移除，无法恢复。</p><div><button disabled={Boolean(busyId)} onClick={() => setDeleteReminder(null)} type="button">取消</button><button disabled={Boolean(busyId)} onClick={() => void reminderAction(deleteReminder, 'delete')} type="button">{busyId ? '删除中…' : '删除提醒'}</button></div></section></div>}
    {deleteDesensitization && <div className="medication-delete-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setDeleteDesensitization(null) }} role="presentation"><section aria-labelledby="desensitization-delete-title" aria-modal="true" className="medication-delete-dialog" role="dialog"><h2 id="desensitization-delete-title">删除“{deleteDesensitization.displayName}”测试？</h2><p>这会删除排敏测试及其中记录；健康随记里的原始饮食记录不会删除。完成后可立即撤销。</p><div><button disabled={Boolean(busyId)} onClick={() => setDeleteDesensitization(null)} type="button">取消</button><button disabled={Boolean(busyId)} onClick={() => void desensitizationAction(deleteDesensitization, 'delete')} type="button">{busyId ? '删除中…' : '删除测试'}</button></div></section></div>}
  </main>
}

export function MedicationReminderListPage() { return <GuardianTaskListPage kind="medication" /> }
export function DesensitizationTestListPage() { return <GuardianTaskListPage kind="desensitization" /> }
