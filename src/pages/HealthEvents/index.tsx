import { ArrowUpDown, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HohoButton, MedicalPrepButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { quickRecordService } from '../../services/quickRecords'
import type { QuickRecordCreateInput, QuickRecordDuplicate } from '../../services/quickRecords'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'
import type { JournalCategory, JournalMetadata } from '../../types/journal'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import type { QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { JournalRecorder } from './JournalRecorder'
import { JournalRecordDetail } from './JournalRecordDetail'
import { ManualRecordButton } from './ManualRecordButton'
import { DuplicateRecordPrompt } from './DuplicateRecordPrompt'
import { NurseNextAction } from './NurseNextAction'
import { getNurseNextActionEventId } from './nurseNextActionContext'
import { TimeView } from './TimeView'
import type { JournalEntry } from './timeViewModel'
import './TimeView.css'
import { completeCurrentTriggerSuggestion } from './triggerOpportunityState'
import '../NurseStation/nurseStation.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
function UserIdentity({ member, onSummary, summaryDisabled }: { member: Member | null; onSummary: () => void; summaryDisabled: boolean }) { const meta = member ? [genderLabels[member.gender ?? ''], member.age].filter(Boolean).join(' · ') : ''; return <div className="health-events-member mx-4 mt-2" key={member?.id ?? 'empty'}><div className="journal-subject-row"><div className="journal-subject-card" aria-label="记录对象"><Avatar name={member?.name ?? ' '} src={member?.avatar} size="sm" /><span className="journal-subject-copy"><span className="journal-subject-name"><strong>{member?.name ?? ' '}</strong></span><span className="journal-subject-meta">{meta}</span></span></div><MedicalPrepButton aria-label="就诊情况单，孩子情况快速整理" className="journal-subject-summary" label="就诊情况单" onClick={onSummary} disabled={summaryDisabled} /></div></div> }
interface PendingDuplicate { duplicate: QuickRecordDuplicate; input: QuickRecordCreateInput; resolve: (message: string) => void; reject: (reason: unknown) => void }
interface SavedRecordFocus { recordId: string; day: string; revision: number; entry: JournalEntry }

export function HealthEventsPage() {
  const navigate = useNavigate(); const location = useLocation()
  const token = useAppStore((state) => state.authToken); const currentMemberId = useAppStore((state) => state.currentMemberId); const cachedMembers = useAppStore((state) => state.members)
  const { state, retry } = useHealthEventsList()
  const returnState = (location.state as { journalReturn?: { day?: string; scrollTop?: number } } | null)?.journalReturn
  const [today, setToday] = useState(() => getLocalDateKey(new Date())!); const [day, setDay] = useState(() => returnState?.day && parsePlainDate(returnState.day) ? returnState.day : getLocalDateKey(new Date())!); const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); const [recorderMode, setRecorderMode] = useState<'manual' | 'voice' | null>(null); const [selectedRecord, setSelectedRecord] = useState<{ eventId: string; recordId: string; correctSleep?: boolean } | null>(null); const [nextActionOpen, setNextActionOpen] = useState(false); const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null); const [journalContext, setJournalContext] = useState<{ memberId: string; eventId: string | null }>({ memberId: currentMemberId, eventId: null }); const [revision, setRevision] = useState(0); const [savedNotice, setSavedNotice] = useState(''); const [savedRecordFocus, setSavedRecordFocus] = useState<SavedRecordFocus | null>(null); const submissionKeyRef = useRef(''); const contentRef = useRef<HTMLDivElement>(null)
  const [recorderInitialCategory, setRecorderInitialCategory] = useState<JournalCategory | undefined>()
  const tutorial = Boolean((location.state as { nurseTutorial?: boolean } | null)?.nurseTutorial)
  const loadedMembers = state.status === 'success' ? state.data.members : []; const currentMember = loadedMembers.find((member) => member.id === currentMemberId) ?? cachedMembers.find((member) => member.id === currentMemberId) ?? loadedMembers[0] ?? cachedMembers[0] ?? null
  const nextActionEventId = getNurseNextActionEventId(state.status === 'success' ? state.data.events : [], currentMemberId) ?? (journalContext.memberId === currentMemberId ? journalContext.eventId : null)
  useEffect(() => { setNextActionOpen(false); setSelectedRecord(null) }, [currentMemberId])
  useEffect(() => {
    let interval = 0
    let timeout = 0
    const update = () => {
      const next = getLocalDateKey(new Date())!
      setToday((previous) => {
        if (previous === next) return previous
        setDay((current) => current === previous ? next : current)
        return next
      })
    }
    const schedule = () => {
      window.clearTimeout(timeout); window.clearInterval(interval)
      timeout = window.setTimeout(() => { update(); interval = window.setInterval(update, 60_000) }, 60_000 - Date.now() % 60_000 + 50)
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') { update(); schedule() } }
    schedule(); document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.clearTimeout(timeout); window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [])
  useEffect(() => {
    const entry = (location.state as { nurseMedicationEntry?: boolean; nurseRecordEntry?: 'symptom' } | null)
    if (!entry?.nurseMedicationEntry && !entry?.nurseRecordEntry) return
    submissionKeyRef.current = ''
    setRecorderMode('manual')
    const clearEntryState = window.setTimeout(() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null }), 0)
    return () => window.clearTimeout(clearEntryState)
  }, [location.pathname, location.search, location.state, navigate])
  useEffect(() => {
    const entry = (location.state as { nurseMedicationEntry?: boolean; nurseRecordEntry?: 'symptom' } | null)
    if (!entry?.nurseMedicationEntry && !entry?.nurseRecordEntry) return
    submissionKeyRef.current = ''
    setRecorderInitialCategory(entry.nurseRecordEntry ?? 'medication')
    setRecorderMode('manual')
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location.pathname, location.search, location.state, navigate])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const eventId = params.get('eventId')
    const recordId = params.get('recordId')
    if (eventId && recordId) setSelectedRecord({ eventId, recordId })
  }, [location.search])
  useEffect(() => {
    if (returnState?.scrollTop === undefined) return
    const target = returnState.scrollTop
    let timer = 0; let attempts = 0
    const restore = () => {
      const node = contentRef.current?.querySelector<HTMLElement>('.journal-scroll-region')
      if (node && (target === 0 || node.querySelector('.journal-record'))) {
        node.scrollTop = target
        if (attempts++ < 20) {
          timer = window.setTimeout(restore, 50)
        } else {
          navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
        }
        return
      }
      if (attempts++ < 100) timer = window.setTimeout(restore, 50)
    }
    restore()
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search, navigate, returnState?.scrollTop])
  useEffect(() => {
    const openPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ target: JournalCategory | 'other' }>).detail
      submissionKeyRef.current = ''
      sessionStorage.setItem('hoooho:journal-suggestion', JSON.stringify((event as CustomEvent).detail))
      setRecorderInitialCategory(detail.target === 'other' ? undefined : detail.target)
      setRecorderMode(detail.target === 'other' ? 'voice' : 'manual')
    }
    window.addEventListener('hoooho:timeline-prompt', openPrompt)
    return () => window.removeEventListener('hoooho:timeline-prompt', openPrompt)
  }, [])
  const finishSave = () => { completeCurrentTriggerSuggestion(); submissionKeyRef.current = ''; setRevision((value) => value + 1); void retry() }
  const saveJournalRecord = async (content: string, occurredAt: string, inputChannel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => {
    if (!token || !currentMember || currentMember.id !== currentMemberId) throw new Error('记录对象尚未准备好')
    if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    const input: QuickRecordCreateInput = { memberId: currentMemberId, content, occurredAt, inputChannel, title: normalizeHealthEventTitle('', content), idempotencyKey: submissionKeyRef.current, journal, ...(photos.photoIds.length ? { photoDraftId: photos.draftId, photoIds: photos.photoIds } : {}) }
    const { duplicate } = journal.sleep?.status === 'ongoing' ? { duplicate: null } : await quickRecordService.checkDuplicate(input, token)
    if (duplicate) return new Promise<string>((resolve, reject) => setPendingDuplicate({ duplicate, input, resolve, reject }))
    const saved = await quickRecordService.create(input, token)
    const savedDay = getLocalDateKey(new Date(occurredAt))!
    setSavedRecordFocus({ recordId: saved.recordId, day: savedDay, revision: Date.now(), entry: { ...journal, id: saved.recordId, eventId: saved.eventId, content, occurredAt, createdAt: new Date().toISOString(), attachmentCount: photos.photoIds.length, status: 'observing' } })
    setDay(savedDay); finishSave(); return '已记录'
  }
  const resolveDuplicate = async (action: 'update' | 'create', changeSummary?: string): Promise<void> => {
    if (!pendingDuplicate || !token) return
    const pending = pendingDuplicate; setPendingDuplicate(null)
    try {
      const saved = await quickRecordService.create({ ...pending.input, rawText: pending.input.content, content: action === 'update' && changeSummary ? changeSummary : pending.input.content, duplicateAction: action, duplicateEventId: pending.duplicate.eventId }, token)
      const savedDay = getLocalDateKey(new Date(pending.input.occurredAt))!
      setSavedRecordFocus({ recordId: saved.recordId, day: savedDay, revision: Date.now(), entry: { ...pending.input.journal, id: saved.recordId, eventId: saved.eventId, content: action === 'update' && changeSummary ? changeSummary : pending.input.content, occurredAt: pending.input.occurredAt, createdAt: new Date().toISOString(), attachmentCount: pending.input.photoIds?.length ?? 0, status: 'observing', categories: pending.input.journal?.categories ?? ['other'] } })
      setDay(savedDay); finishSave(); pending.resolve(action === 'update' ? '已补充到原来的记录' : '已新增一条记录')
    } catch (error) { pending.reject(error) }
  }
  const discardDuplicate = () => { if (!pendingDuplicate) return; const pending = pendingDuplicate; setPendingDuplicate(null); submissionKeyRef.current = ''; pending.resolve('已保留原来的记录') }
  const showJournalSavedNotice = () => setSavedNotice('已记下来')
  if (state.status === 'success' && state.data.entryState.familyMemberCount === 0) return <Navigate to="/nurse-station" replace />
  if (nextActionOpen && nextActionEventId) return <Navigate to={`/visit-summary/${nextActionEventId}`} />
  return <main className="hoho-health-events-page app-shell app-shell--wide relative flex flex-col overflow-hidden pb-0" data-view-mode="list"><MainAppHeader title="健康随记" /><UserIdentity member={currentMember} onSummary={() => setNextActionOpen(true)} summaryDisabled={!nextActionEventId} /><div className="health-events-content mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24" ref={contentRef}><div className="health-events-toolbar mb-2"><div className="journal-toolbar"><div className="journal-toolbar-actions"><HohoButton className="journal-toolbar-action" size="icon" variant="secondary" aria-label="搜索健康随身记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: contentRef.current?.scrollTop ?? 0 } } })}><Search size={18} /></HohoButton><HohoButton className="journal-toolbar-action" size="icon" variant="secondary" aria-label="切换记录顺序" onClick={() => setSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}><ArrowUpDown size={18} /></HohoButton></div></div></div><TimeView memberId={currentMemberId} token={token ?? ''} day={day} today={today} focusRecord={savedRecordFocus} onFocusHandled={() => setSavedRecordFocus(null)} onDayChange={(value) => { if (parsePlainDate(value) && value <= today) setDay(value) }} onRecordOpen={(eventId, recordId, options) => setSelectedRecord({ eventId, recordId, correctSleep: options?.correctSleep })} onRoutineRecorded={() => { setRevision((value) => value + 1); void retry() }} revision={revision} onContext={setJournalContext} sortOrder={sortOrder} /></div><footer className="journal-record-actions"><div><ManualRecordButton disabled={!token || currentMember?.id !== currentMemberId} onClick={() => { submissionKeyRef.current = ''; setRecorderInitialCategory(undefined); setRecorderMode('manual') }} /></div></footer>{selectedRecord && <JournalRecordDetail eventId={selectedRecord.eventId} recordId={selectedRecord.recordId} startSleepCorrection={selectedRecord.correctSleep} onChanged={() => { setSavedRecordFocus(null); setRevision((value) => value + 1); void retry() }} onClose={() => { setSelectedRecord(null); if (location.search) navigate('/health-events', { replace: true }) }} />}{recorderMode && <JournalRecorder initialCategory={recorderInitialCategory} key={`${currentMemberId}:${recorderInitialCategory ?? 'none'}`} mode={recorderMode} memberId={currentMemberId} selectedDay={day} today={today} token={token ?? ''} onClose={() => { setRecorderMode(null); setRecorderInitialCategory(undefined) }} onConfirm={saveJournalRecord} onSaved={(message) => { setSavedNotice(message); window.setTimeout(() => setSavedNotice(''), 1800) }} />}{pendingDuplicate && <DuplicateRecordPrompt duplicate={pendingDuplicate.duplicate} onCancel={discardDuplicate} onDiscard={discardDuplicate} onUpdate={(changeSummary) => resolveDuplicate('update', changeSummary)} onCreate={() => resolveDuplicate('create')} />}{savedNotice && <div className="journal-saved-toast" aria-live="polite" role="status">{savedNotice}</div>}{tutorial && <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-modal"><button aria-label="退出教程" className="sheet-close" onClick={() => navigate('/nurse-station', { replace: true })} type="button"><X /></button><h2>试着记录一次喂养</h2><p className="tutorial-example">宝宝刚喝了120ml配方奶</p><p>这是教程示例，不会保存为真实记录。</p><HohoButton fullWidth size="large" onClick={() => navigate('/nurse-station', { replace: true, state: { tutorialComplete: true } })}>使用示例</HohoButton><button className="sheet-secondary" onClick={() => navigate('/nurse-station', { replace: true })} type="button">跳过这一步</button></div></div>}<NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onClose={() => setNextActionOpen(false)} open={nextActionOpen} /></main>
}
export function CreateHealthEventPage() { return <Navigate to="/health-events" replace /> }
