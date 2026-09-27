import { ChevronRight, ClipboardCheck, FileText, FolderOpen, Pencil, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import desensitizationTestsImage from '../../assets/nurse-station/home-entries/desensitization-tests.png'
import dietaryCardImage from '../../assets/nurse-station/home-entries/dietary-card.png'
import healthDiaryImage from '../../assets/nurse-station/home-entries/health-diary.png'
import healthProfileImage from '../../assets/nurse-station/home-entries/health-profile.png'
import medicationRemindersImage from '../../assets/nurse-station/home-entries/medication-reminders.png'
import visitSummaryImage from '../../assets/nurse-station/home-entries/visit-summary.png'
import { Avatar } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath } from '../../components/navigation/navigationState'
import { formatBloodTypeDisplay } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { formatGrowthMeasurement, resolveCurrentGrowthMeasurements } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import type { NurseStationItem, NurseStationState } from '../../features/nurse-station/state'
import { readNurseStationState, reconcileNurseStationItems, writeNurseStationState } from '../../features/nurse-station/state'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { desensitizationTestService, type DesensitizationTaskDto } from '../../services/desensitizationTests'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { medicationReminderService, type MedicationReminderDto } from '../../services/medicationReminders'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { NurseTriageDesk } from '../HealthEvents/NurseTriageDesk'
import { useJournal } from '../HealthEvents/useJournal'
import { getGuardedDays } from './nurseStationView'
import { BloodTypeEditorSheet } from './BloodTypeEditorSheet'
import { NurseStationFactTypewriter } from './NurseStationFactTypewriter'
import './nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

type EntryStatus = 'loading' | 'success' | 'error'

export function NurseStationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const authUser = useAppStore((value) => value.authUser)
  const currentMemberId = useAppStore((value) => value.currentMemberId)
  const cachedMembers = useAppStore((value) => value.members)
  const token = useAppStore((value) => value.authToken) ?? ''
  const care = useSettingsStore((value) => value.care)
  const { state: listState, retry: retryEvents } = useHealthEventsList()
  const medicationJournal = useJournal(currentMemberId, token, 0)
  const identityId = authUser?.id ?? 'unknown'
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const [station, setStation] = useState<NurseStationState>(() => readNurseStationState(identityId, currentMemberId))
  const [stationMemberId, setStationMemberId] = useState(currentMemberId)
  const [medicationReminders, setMedicationReminders] = useState<MedicationReminderDto[]>([])
  const [medicationStatus, setMedicationStatus] = useState<EntryStatus>('loading')
  const [medicationMemberId, setMedicationMemberId] = useState('')
  const [desensitizationTasks, setDesensitizationTasks] = useState<DesensitizationTaskDto[]>([])
  const [desensitizationStatus, setDesensitizationStatus] = useState<EntryStatus>('loading')
  const [desensitizationMemberId, setDesensitizationMemberId] = useState('')
  const [growthMeasurements, setGrowthMeasurements] = useState<Awaited<ReturnType<typeof growthMeasurementService.list>>>([])
  const [growthStatus, setGrowthStatus] = useState<EntryStatus>('loading')
  const [growthMemberId, setGrowthMemberId] = useState('')
  const [bloodEditorMemberId, setBloodEditorMemberId] = useState('')
  const migratingIds = useRef(new Set<string>())
  const member = cachedMembers.find((item) => item.id === currentMemberId)
    ?? (listState.status === 'success' ? listState.data.members.find((item) => item.id === currentMemberId) : null)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setStation(readNurseStationState(identityId, currentMemberId))
    setStationMemberId(currentMemberId)
  }, [identityId, currentMemberId])

  useEffect(() => {
    let active = true
    setMedicationStatus('loading')
    setMedicationMemberId('')
    setMedicationReminders([])
    migratingIds.current.clear()
    if (!token || !currentMemberId || !member) return () => { active = false }
    void medicationReminderService.list(currentMemberId, token)
      .then((items) => {
        if (!active) return
        setMedicationReminders(items)
        setMedicationMemberId(currentMemberId)
        setMedicationStatus('success')
      })
      .catch(() => {
        if (!active) return
        setMedicationMemberId(currentMemberId)
        setMedicationStatus('error')
      })
    return () => { active = false }
  }, [currentMemberId, member, token])

  useEffect(() => {
    let active = true
    setDesensitizationStatus('loading')
    setDesensitizationMemberId('')
    setDesensitizationTasks([])
    if (!token || !currentMemberId || !member) return () => { active = false }
    void desensitizationTestService.list(currentMemberId, token)
      .then((result) => {
        if (!active) return
        setDesensitizationTasks(result.tasks)
        setDesensitizationMemberId(currentMemberId)
        setDesensitizationStatus('success')
      })
      .catch(() => {
        if (!active) return
        setDesensitizationMemberId(currentMemberId)
        setDesensitizationStatus('error')
      })
    return () => { active = false }
  }, [currentMemberId, member, token])

  useEffect(() => {
    const controller = new AbortController()
    setGrowthStatus('loading')
    setGrowthMemberId('')
    setGrowthMeasurements([])
    if (!token || !currentMemberId || !member) return () => controller.abort()
    void growthMeasurementService.list(currentMemberId, token, controller.signal)
      .then((items) => {
        if (controller.signal.aborted || useAppStore.getState().currentMemberId !== currentMemberId) return
        setGrowthMeasurements(items)
        setGrowthMemberId(currentMemberId)
        setGrowthStatus('success')
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        setGrowthMemberId(currentMemberId)
        setGrowthStatus('error')
      })
    return () => controller.abort()
  }, [currentMemberId, member, token])

  useEffect(() => {
    if (bloodEditorMemberId && bloodEditorMemberId !== currentMemberId) setBloodEditorMemberId('')
  }, [bloodEditorMemberId, currentMemberId])

  const events = listState.status === 'success' ? listState.data.events.filter((event) => event.memberId === currentMemberId) : []

  useEffect(() => {
    if (!member || listState.status !== 'success' || stationMemberId !== member.id) return
    setStation((previous) => reconcileNurseStationItems(previous, events, member.id, medicationJournal.entries))
  }, [events, listState.status, medicationJournal.entries, member, stationMemberId])

  useEffect(() => {
    if (member && stationMemberId === member.id) writeNurseStationState(identityId, member.id, station)
  }, [identityId, member, station, stationMemberId])

  useEffect(() => {
    if (medicationStatus !== 'success' || !token || stationMemberId !== currentMemberId) return
    for (const item of station.items.filter((entry) => entry.type === 'medication_reminder' && entry.medicationPlan)) {
      if (medicationReminders.some((entry) => entry.clientId === item.id) || migratingIds.current.has(item.id)) continue
      migratingIds.current.add(item.id)
      void medicationReminderService.create(currentMemberId, item.medicationPlan!, token, item.id)
        .then((created) => setMedicationReminders((current) => current.some((entry) => entry.id === created.id) ? current : [...current, created]))
        .catch(() => undefined)
        .finally(() => migratingIds.current.delete(item.id))
    }
  }, [currentMemberId, medicationReminders, medicationStatus, station.items, stationMemberId, token])

  const memberDto = listState.status === 'success' ? listState.data.memberDtos.find((item) => item.id === member?.id) : null
  const guardedDays = getGuardedDays(memberDto?.createdAt)
  const reducedMotion = systemReducedMotion || (care.enabled && care.reduceMotion)
  const medicationCount = medicationMemberId === currentMemberId
    ? medicationReminders.filter((item) => item.status === 'active').length
    : null
  const desensitizationCount = desensitizationMemberId === currentMemberId
    ? desensitizationTasks.filter((item) => item.status === 'active').length
    : null
  const growth = growthStatus === 'success' && growthMemberId === currentMemberId && member
    ? resolveCurrentGrowthMeasurements(member, growthMeasurements, currentMemberId)
    : null
  const growthValue = (value: number | null | undefined) => {
    if (growthStatus === 'loading' || growthMemberId !== currentMemberId) return '读取中'
    if (growthStatus === 'error') return '加载失败'
    return formatGrowthMeasurement(value ?? null) || '未记录'
  }
  const openGrowthData = () => navigate('/health-profile/basic', {
    state: { returnTo: getCurrentPath(location.pathname, location.search, location.hash) },
  })

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

  return (
    <main className="app-shell nurse-station-page">
      <MainAppHeader title="前台" />
      <div className="nurse-station-scroll">
        {listState.status === 'loading' ? (
          <section aria-label="正在加载当前人物" className="nurse-station-hero nurse-station-hero--loading"><span /><span /></section>
        ) : listState.status === 'error' ? (
          <section className="nurse-station-load-error"><p>当前人物资料加载失败，已保存内容没有改变。</p><button onClick={retryEvents} type="button">重新加载</button></section>
        ) : member ? (
          <section className="nurse-station-hero">
            <button aria-label={`查看${member.name}的成长数据`} className="nurse-station-hero__main" onClick={openGrowthData} type="button">
              <span className="nurse-station-copy" role="presentation">
              <span className="nurse-station-identity">
                <Avatar name={member.name} src={member.avatar} size="lg" />
                <span><strong>{member.name}</strong><em>{genderLabels[member.gender ?? '']} · {member.age}</em></span>
              </span>
              <span className="nurse-station-guarded">已守护 <strong>{guardedDays}</strong> 天</span>
              <NurseStationFactTypewriter />
              </span>
              <span className="nurse-station-visual"><NurseTriageDesk audioLevel={0} idleActive idleAnimationResetKey={currentMemberId} reducedMotion={reducedMotion} state="idle" stationIdleOnly /></span>
            </button>
            <div aria-label={`${member.name}的成长数据摘要`} className="nurse-station-growth-data">
              <button aria-label={`身高，${growthValue(growth?.heightCm)}，查看成长数据`} onClick={openGrowthData} type="button"><small>身高</small><strong>{growthValue(growth?.heightCm)}</strong>{growth?.heightCm != null && <em>cm</em>}</button>
              <button aria-label={`体重，${growthValue(growth?.weightKg)}，查看成长数据`} onClick={openGrowthData} type="button"><small>体重</small><strong>{growthValue(growth?.weightKg)}</strong>{growth?.weightKg != null && <em>kg</em>}</button>
              <button aria-label={`血型，${formatBloodTypeDisplay(member.bloodType, member.rhBloodType) || '未填写'}，编辑`} onClick={() => setBloodEditorMemberId(member.id)} type="button"><small>血型</small><span><strong>{formatBloodTypeDisplay(member.bloodType, member.rhBloodType) || '未填写'}</strong><Pencil aria-hidden="true" /></span></button>
            </div>
          </section>
        ) : null}
        <HomeEntries
          desensitizationCount={desensitizationCount}
          desensitizationStatus={desensitizationStatus}
          medicationCount={medicationCount}
          medicationStatus={medicationStatus}
        />
      </div>
      {member && bloodEditorMemberId === member.id && <BloodTypeEditorSheet member={member} onClose={() => setBloodEditorMemberId('')} onSaved={() => setBloodEditorMemberId('')} token={token} />}
    </main>
  )
}

const fixedHomeEntries = [
  { id: 'diary', title: '健康随记', subtitle: '记录日常与身体变化', image: healthDiaryImage, to: '/health-events' },
  { id: 'profile', title: '健康档案', subtitle: '整理家人的健康信息', image: healthProfileImage, to: '/health-profile' },
  { id: 'visit', title: '就诊情况单', subtitle: '就诊前，一页理清病情', image: visitSummaryImage, to: '/visit-summary' },
  { id: 'dietary', title: '忌口出示卡', subtitle: '哪些不能吃，出示就懂', image: dietaryCardImage, to: '/dietary-card' },
] as const

type HomeEntry = { id: string; title: string; subtitle: string; image: string; to: string }

function HomeEntryContent({ entry }: { entry: HomeEntry }) {
  return <><span className="nurse-home-entry__copy"><strong>{entry.title}</strong><small>{entry.subtitle}</small></span><span aria-hidden="true" className="nurse-home-entry__visual"><img alt="" decoding="async" height="384" onError={(event) => { event.currentTarget.hidden = true }} src={entry.image} width="384" /></span></>
}

function taskCountLabel(status: EntryStatus, count: number | null, noun: '提醒' | '测试') {
  if (status === 'error') return '加载失败，点此重试'
  if (count === null) return '正在同步任务…'
  return `${count} 个${noun}任务`
}

function HomeEntries({ desensitizationCount, desensitizationStatus, medicationCount, medicationStatus }: {
  desensitizationCount: number | null
  desensitizationStatus: EntryStatus
  medicationCount: number | null
  medicationStatus: EntryStatus
}) {
  const entries: HomeEntry[] = [
    ...fixedHomeEntries,
    {
      id: 'medication',
      title: '用药提醒',
      subtitle: taskCountLabel(medicationStatus, medicationCount, '提醒'),
      image: medicationRemindersImage,
      to: '/medication-reminders',
    },
    {
      id: 'desensitization',
      title: '排敏测试',
      subtitle: taskCountLabel(desensitizationStatus, desensitizationCount, '测试'),
      image: desensitizationTestsImage,
      to: '/desensitization-tests',
    },
  ]

  return <section aria-label="首页服务入口" className="nurse-home-entries">{entries.map((entry) => (
    <Link aria-label={`${entry.title}，${entry.subtitle}`} className={`nurse-home-entry nurse-home-entry--${entry.id}`} key={entry.id} to={entry.to}><HomeEntryContent entry={entry} /></Link>
  ))}</section>
}
