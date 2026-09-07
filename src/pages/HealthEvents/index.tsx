import { ArrowUpDown, Filter, Mic, PenLine, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { emptyHealthEventFilters } from '../../components/health'
import type { HealthEventFilters } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import logoUrl from '../../assets/logo.svg'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { quickRecordService } from '../../services/quickRecords'
import type { QuickRecordCreateInput, QuickRecordDuplicate } from '../../services/quickRecords'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'
import type { JournalMetadata } from '../../types/journal'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import type { QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { JournalRecorder } from './JournalRecorder'
import { DuplicateRecordPrompt } from './DuplicateRecordPrompt'
import { NurseNextAction } from './NurseNextAction'
import { getNurseNextActionEventId } from './nurseNextActionContext'
import { TimeView } from './TimeView'
import './TimeView.css'
import '../NurseStation/nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
function UserIdentity({ member, onSummary, summaryDisabled }: { member: Member | null; onSummary: () => void; summaryDisabled: boolean }) { const meta = member ? [genderLabels[member.gender ?? ''], member.age].filter(Boolean).join(' · ') : ''; return <div className="health-events-member mx-4 mt-2"><div className="journal-subject-row"><div className="journal-subject-card" aria-label="记录对象"><Avatar name={member?.name ?? ' '} src={member?.avatar} size="sm" /><span className="journal-subject-copy"><span className="journal-subject-name"><strong>{member?.name ?? ' '}</strong></span><span className="journal-subject-meta">{meta}</span></span></div><HohoButton className="journal-subject-summary" onClick={onSummary} disabled={summaryDisabled}><img src={logoUrl} width={20} height={20} alt="" />就医准备</HohoButton></div></div> }
function hasActiveFilters(filters: HealthEventFilters) { return filters.range !== 'all' || filters.year !== null || filters.months.length > 0 || filters.statuses.length > 0 || filters.definitionTitles.length > 0 }
interface PendingDuplicate { duplicate: QuickRecordDuplicate; input: QuickRecordCreateInput; resolve: (message: string) => void; reject: (reason: unknown) => void }

export function HealthEventsPage() {
  const navigate = useNavigate(); const location = useLocation()
  const token = useAppStore((state) => state.authToken); const currentMemberId = useAppStore((state) => state.currentMemberId); const cachedMembers = useAppStore((state) => state.members)
  const { state, retry } = useHealthEventsList()
  const [today, setToday] = useState(() => getLocalDateKey(new Date())!); const [day, setDay] = useState(today); const [filterOpen, setFilterOpen] = useState(false); const [filters, setFilters] = useState<HealthEventFilters>(emptyHealthEventFilters); const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); const [recorderMode, setRecorderMode] = useState<'manual' | 'voice' | null>(null); const [nextActionOpen, setNextActionOpen] = useState(false); const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null); const [journalContext, setJournalContext] = useState<{ memberId: string; eventId: string | null }>({ memberId: currentMemberId, eventId: null }); const [revision, setRevision] = useState(0); const [savedNotice, setSavedNotice] = useState(''); const submissionKeyRef = useRef('')
  const tutorial = Boolean((location.state as { nurseTutorial?: boolean } | null)?.nurseTutorial)
  const loadedMembers = state.status === 'success' ? state.data.members : []; const currentMember = loadedMembers.find((member) => member.id === currentMemberId) ?? cachedMembers.find((member) => member.id === currentMemberId) ?? loadedMembers[0] ?? cachedMembers[0] ?? null
  const nextActionEventId = getNurseNextActionEventId(state.status === 'success' ? state.data.events : [], currentMemberId) ?? (journalContext.memberId === currentMemberId ? journalContext.eventId : null)
  useEffect(() => { setNextActionOpen(false) }, [currentMemberId])
  useEffect(() => { const timer = window.setInterval(() => { const next = getLocalDateKey(new Date())!; setToday((previous) => { if (next !== previous) setDay((selected) => selected === previous ? next : selected); return next }) }, 30_000); return () => window.clearInterval(timer) }, [])
  const finishSave = () => { submissionKeyRef.current = ''; setRevision((value) => value + 1); void retry() }
  const saveJournalRecord = async (content: string, occurredAt: string, inputChannel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => {
    if (!token || !currentMember || currentMember.id !== currentMemberId) throw new Error('记录对象尚未准备好')
    if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    const input: QuickRecordCreateInput = { memberId: currentMemberId, content, occurredAt, inputChannel, title: normalizeHealthEventTitle('', content), idempotencyKey: submissionKeyRef.current, journal, ...(photos.photoIds.length ? { photoDraftId: photos.draftId, photoIds: photos.photoIds } : {}) }
    const { duplicate } = await quickRecordService.checkDuplicate(input, token)
    if (duplicate) return new Promise<string>((resolve, reject) => setPendingDuplicate({ duplicate, input, resolve, reject }))
    await quickRecordService.create(input, token)
    setDay(getLocalDateKey(new Date(occurredAt))!); finishSave(); return '已记录'
  }
  const resolveDuplicate = async (action: 'update' | 'create', changeSummary?: string): Promise<void> => {
    if (!pendingDuplicate || !token) return
    const pending = pendingDuplicate; setPendingDuplicate(null)
    try {
      await quickRecordService.create({ ...pending.input, rawText: pending.input.content, content: action === 'update' && changeSummary ? changeSummary : pending.input.content, duplicateAction: action, duplicateEventId: pending.duplicate.eventId }, token)
      setDay(getLocalDateKey(new Date(pending.input.occurredAt))!); finishSave(); pending.resolve(action === 'update' ? '已补充到原来的记录' : '已新增一条记录')
    } catch (error) { pending.reject(error) }
  }
  const discardDuplicate = () => { if (!pendingDuplicate) return; const pending = pendingDuplicate; setPendingDuplicate(null); submissionKeyRef.current = ''; pending.resolve('已保留原来的记录') }
  const showJournalSavedNotice = () => setSavedNotice('已记下来')
  if (state.status === 'success' && state.data.entryState.familyMemberCount === 0) return <Navigate to="/nurse-station" replace />
  return <main className="hoho-health-events-page app-shell app-shell--wide relative flex flex-col overflow-hidden pb-0" data-view-mode="list"><MainAppHeader title="健康随身记" /><UserIdentity member={currentMember} onSummary={() => setNextActionOpen(true)} summaryDisabled={!nextActionEventId} /><div className="health-events-content mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24"><div className="health-events-toolbar mb-2"><div className="journal-toolbar"><div className="journal-toolbar-actions"><HohoButton className={hasActiveFilters(filters) ? 'journal-filter-active' : ''} size="icon" variant="secondary" aria-label="筛选健康随身记" onClick={() => setFilterOpen(true)}><Filter size={18} /></HohoButton><HohoButton size="icon" variant="secondary" aria-label="切换记录顺序" onClick={() => setSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}><ArrowUpDown size={18} /></HohoButton></div></div></div><TimeView memberId={currentMemberId} token={token ?? ''} day={day} today={today} onDayChange={(value) => { if (parsePlainDate(value) && value <= today) setDay(value) }} revision={revision} onContext={setJournalContext} filterOpen={filterOpen} filters={filters} onFilterClose={() => setFilterOpen(false)} onFilterApply={setFilters} sortOrder={sortOrder} /></div><footer className="journal-record-actions"><div><HohoButton size="large" variant="secondary" disabled={!token || currentMember?.id !== currentMemberId} onClick={() => { submissionKeyRef.current = ''; setRecorderMode('manual') }}><PenLine size={20} />手动记录</HohoButton><HohoButton size="large" variant="secondary" disabled={!token || currentMember?.id !== currentMemberId} onClick={() => { submissionKeyRef.current = ''; setRecorderMode('voice') }}><Mic size={20} />快捷记录</HohoButton></div></footer>{recorderMode && <JournalRecorder key={currentMemberId} mode={recorderMode} memberId={currentMemberId} token={token ?? ''} onClose={() => setRecorderMode(null)} onConfirm={saveJournalRecord} onSaved={(message) => { setSavedNotice(message); window.setTimeout(() => setSavedNotice(''), 1800) }} />}{pendingDuplicate && <DuplicateRecordPrompt duplicate={pendingDuplicate.duplicate} onCancel={discardDuplicate} onDiscard={discardDuplicate} onUpdate={(changeSummary) => resolveDuplicate('update', changeSummary)} onCreate={() => resolveDuplicate('create')} />}{savedNotice && <div className="journal-saved-toast" aria-live="polite" role="status">{savedNotice}</div>}{tutorial && <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-modal"><button aria-label="退出教程" className="sheet-close" onClick={() => navigate('/nurse-station', { replace: true })} type="button"><X /></button><h2>试着记录一次喂养</h2><p className="tutorial-example">宝宝刚喝了120ml配方奶</p><p>这是教程示例，不会保存为真实记录。</p><HohoButton fullWidth size="large" onClick={() => navigate('/nurse-station', { replace: true, state: { tutorialComplete: true } })}>使用示例</HohoButton><button className="sheet-secondary" onClick={() => navigate('/nurse-station', { replace: true })} type="button">跳过这一步</button></div></div>}<NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onClose={() => setNextActionOpen(false)} open={nextActionOpen} /></main>
}
export function CreateHealthEventPage() { return <Navigate to="/health-events" replace /> }
