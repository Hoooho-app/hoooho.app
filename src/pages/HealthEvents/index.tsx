import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { quickRecordService } from '../../services/quickRecords'
import type { QuickRecordCreateInput, QuickRecordDuplicate } from '../../services/quickRecords'
import { useAppStore } from '../../store/useAppStore'
import type { JournalCategory, JournalMetadata, DietRecordKind } from '../../types/journal'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { useJournal } from './useJournal'
import { CalendarToolbar } from '../HealthCalendar/CalendarToolbar'
import { MonthView } from '../HealthCalendar/MonthView'
import { useCalendarNavigation, type CalendarReturnState } from '../HealthCalendar/useCalendarNavigation'
import '../HealthCalendar/unifiedCalendar.css'
import type { QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { JournalRecorder } from './JournalRecorder'
import { JournalRecordDetail } from './JournalRecordDetail'
import { RecordEntryActions } from './RecordEntryActions'
import { DuplicateRecordPrompt } from './DuplicateRecordPrompt'
import { NurseNextAction } from './NurseNextAction'
import { getNurseNextActionEventId } from './nurseNextActionContext'
import { TimeView } from './TimeView'
import type { JournalEntry } from './timeViewModel'
import './TimeView.css'
import './RecordForm.css'
import '../NurseStation/nurseStation.css'

interface PendingDuplicate { duplicate: QuickRecordDuplicate; input: QuickRecordCreateInput; resolve: (message: string) => void; reject: (reason: unknown) => void }
interface SavedRecordFocus { recordId: string; day: string; revision: number; entry?: JournalEntry }

export function HealthEventsPage() {
  const memberId = useAppStore(state => state.currentMemberId)
  const accountId = useAppStore(state => state.authUser?.id ?? '')
  return <HealthEventsContent key={`${accountId}:${memberId}`} />
}

function HealthEventsContent() {
  const navigate = useNavigate(); const location = useLocation()
  const token = useAppStore((state) => state.authToken); const currentMemberId = useAppStore((state) => state.currentMemberId); const cachedMembers = useAppStore((state) => state.members)
  const accountId = useAppStore(state=>state.authUser?.id ?? '')
  const identity = `${accountId}:${currentMemberId}`
  const { state, retry } = useHealthEventsList()
  const rawReturn = (location.state as { journalReturn?: CalendarReturnState } | null)?.journalReturn
  const returnState = !rawReturn?.identity || rawReturn.identity === identity ? rawReturn : undefined
  const [today, setToday] = useState(() => getLocalDateKey(new Date())!); const [recorderMode, setRecorderMode] = useState<'manual' | null>(null); const [selectedRecord, setSelectedRecord] = useState<{ eventId: string; recordId: string; correctSleep?: boolean } | null>(null); const [nextActionOpen, setNextActionOpen] = useState(false); const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null); const [journalContext, setJournalContext] = useState<{ memberId: string; eventId: string | null }>({ memberId: currentMemberId, eventId: null }); const [revision, setRevision] = useState(0); const [savedNotice, setSavedNotice] = useState(''); const [savedRecordFocus, setSavedRecordFocus] = useState<SavedRecordFocus | null>(null); const submissionKeyRef = useRef(''); const contentRef = useRef<HTMLDivElement>(null)
  const navigation = useCalendarNavigation(identity, today), calendar = navigation.state, day = calendar.day
  const previousToday = useRef(today)
  const setDay = (value: string) => navigation.change({ ...calendar, day: value, month: value.slice(0, 7) })
  const [settingsRequest, setSettingsRequest] = useState(0)
  const journal = useJournal(currentMemberId, token ?? '', revision)
  const filteredEntries = useMemo(() => journal.entries.filter(entry => !calendar.category || entry.categories?.includes(calendar.category as JournalCategory)), [journal.entries, calendar.category])
  const filteredJournal = { ...journal, entries: filteredEntries }
  useEffect(() => {
    const previous = previousToday.current; previousToday.current = today
    if (previous !== today && calendar.day === previous) navigation.change({ ...calendar, day: today, month: today.slice(0, 7) }, false)
  }, [today])
  const [recorderInitialCategory, setRecorderInitialCategory] = useState<JournalCategory | undefined>()
  const [recorderInitialDietKind, setRecorderInitialDietKind] = useState<DietRecordKind | undefined>()
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
    setRecorderInitialCategory(entry.nurseRecordEntry ?? 'medication')
    setRecorderMode('manual')
    navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...location.state, nurseMedicationEntry: undefined, nurseRecordEntry: undefined, calendarIdentity: identity } })
  }, [location.pathname, location.search, location.state, navigate])
  useEffect(() => {
    const owner = (location.state as { calendarIdentity?: string } | null)?.calendarIdentity
    if (owner && owner !== identity) return
    const params = new URLSearchParams(location.search)
    const eventId = params.get('eventId')
    const recordId = params.get('recordId')
    if (eventId && recordId) setSelectedRecord({ eventId, recordId })
  }, [location.search, identity, location.state])
  useEffect(() => {
    if (returnState?.scrollTop === undefined || calendar.view !== 'day') return
    const target = returnState.scrollTop
    let timer = 0; let attempts = 0
    const restore = () => {
      const node = contentRef.current?.querySelector<HTMLElement>('.journal-scroll-region')
      if (node && (target === 0 || node.querySelector('.journal-record'))) {
        node.scrollTop = target
        if (attempts++ < 20) {
          timer = window.setTimeout(restore, 50)
        } else {
          navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...location.state, journalReturn: undefined, calendarIdentity: identity } })
        }
        return
      }
      if (attempts++ < 100) timer = window.setTimeout(restore, 50)
    }
    restore()
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search, navigate, returnState?.scrollTop])
  useEffect(() => {
    const openManualRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ target: JournalCategory | 'other' }>).detail
      submissionKeyRef.current = ''
      setRecorderInitialCategory(detail.target === 'other' ? 'symptom' : detail.target)
      setRecorderInitialDietKind(undefined)
      setRecorderMode('manual')
    }
    window.addEventListener('hoooho:manual-record', openManualRecord)
    return () => window.removeEventListener('hoooho:manual-record', openManualRecord)
  }, [])
  const finishSave = () => { submissionKeyRef.current = ''; setRevision((value) => value + 1); void retry() }
  const saveJournalRecord = async (content: string, occurredAt: string, inputChannel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata, daily?: import('../../services/dailyRecords').DailyExtras) => {
    occurredAt = journalOccurrenceAt(journal, occurredAt)
    if (!token || !currentMember || currentMember.id !== currentMemberId) throw new Error('记录对象尚未准备好')
    if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    const input: QuickRecordCreateInput = { memberId: currentMemberId, content, occurredAt, inputChannel, title: normalizeHealthEventTitle('', content), idempotencyKey: submissionKeyRef.current, journal, ...daily, ...(photos.photoIds.length ? { photoDraftId: photos.draftId, photoIds: photos.photoIds } : {}) }
    const { duplicate } = journal.sleep?.status === 'ongoing' || journal.diet?.status === 'ongoing' ? { duplicate: null } : await quickRecordService.checkDuplicate(input, token)
    if (duplicate) return new Promise<string>((resolve, reject) => setPendingDuplicate({ duplicate, input, resolve, reject }))
    const saved = await quickRecordService.create(input, token)
    const savedDay = getLocalDateKey(new Date(occurredAt))!
    setSavedRecordFocus({ recordId: saved.recordId, day: savedDay, revision: Date.now(), entry: { ...journal, id: saved.recordId, eventId: saved.eventId, content, occurredAt, createdAt: new Date().toISOString(), attachmentCount: photos.photoIds.length, status: 'observing' } })
    navigation.change({ ...calendar, day: savedDay, month: savedDay.slice(0, 7), category: !calendar.category || journal.categories?.includes(calendar.category as JournalCategory) ? calendar.category : '' }); finishSave(); return '已记录'
  }
  const resolveDuplicate = async (action: 'update' | 'create', changeSummary?: string): Promise<void> => {
    if (!pendingDuplicate || !token) return
    const pending = pendingDuplicate; setPendingDuplicate(null)
    try {
      const saved = await quickRecordService.create({ ...pending.input, rawText: pending.input.content, content: action === 'update' && changeSummary ? changeSummary : pending.input.content, duplicateAction: action, duplicateEventId: pending.duplicate.eventId }, token)
      const savedDay = getLocalDateKey(new Date(pending.input.occurredAt))!
      setSavedRecordFocus({ recordId: saved.recordId, day: savedDay, revision: Date.now(), entry: { ...pending.input.journal, id: saved.recordId, eventId: saved.eventId, content: action === 'update' && changeSummary ? changeSummary : pending.input.content, occurredAt: pending.input.occurredAt, createdAt: new Date().toISOString(), attachmentCount: pending.input.photoIds?.length ?? 0, status: 'observing', categories: pending.input.journal?.categories ?? ['other'] } })
      navigation.change({ ...calendar, day: savedDay, month: savedDay.slice(0, 7), category: !calendar.category || pending.input.journal?.categories?.includes(calendar.category as JournalCategory) ? calendar.category : '' }); finishSave(); pending.resolve(action === 'update' ? '已补充到原来的记录' : '已新增一条记录')
    } catch (error) { pending.reject(error) }
  }
  const discardDuplicate = () => { if (!pendingDuplicate) return; const pending = pendingDuplicate; setPendingDuplicate(null); submissionKeyRef.current = ''; pending.resolve('已保留原来的记录') }
  const showJournalSavedNotice = () => setSavedNotice('已记下来')
  if (state.status === 'success' && state.data.entryState.familyMemberCount === 0) return <Navigate to="/nurse-station" replace />
  if (nextActionOpen && currentMemberId) return <Navigate to="/visit-summary" />
  return <main className="hoho-health-events-page unified-health-calendar app-shell app-shell--wide relative flex flex-col overflow-hidden pb-0" data-view-mode="list" data-calendar-view={calendar.view}>
    <MainAppHeader title="健康日历" showInstallApp={false} action={<HohoButton size="icon" variant="ghost" aria-label="搜索健康日历" onClick={() => navigate('/health-events/search', { state: { journalReturn: { ...calendar, identity, search: location.search, hash: location.hash, scrollTop: contentRef.current?.querySelector<HTMLElement>('.journal-scroll-region')?.scrollTop ?? 0 } } })}><Search size={20}/></HohoButton>}/>
    <CalendarToolbar state={calendar} today={today} onChange={navigation.change} onSettings={() => setSettingsRequest(value => value + 1)}/>
    <div className="unified-calendar-content" ref={contentRef}>
      <TimeView memberId={currentMemberId} token={token ?? ''} day={day} today={today} active={calendar.view === 'day'} category={calendar.category} identity={identity} journal={filteredJournal} settingsRequest={settingsRequest} focusRecord={savedRecordFocus} onFocusHandled={() => setSavedRecordFocus(null)} onRecordOpen={(eventId, recordId, options) => setSelectedRecord({ eventId, recordId, correctSleep: options?.correctSleep })} onRoutineRecorded={() => { setRevision(value => value + 1); void retry() }} revision={revision} onContext={setJournalContext} sortOrder={calendar.sort}/>
      {calendar.view === 'month' && <MonthView month={calendar.month} today={today} day={day} category={calendar.category} entries={filteredEntries} loading={journal.loading} error={journal.error} onRetry={journal.retry} onDay={value => navigation.change({ ...calendar, view: 'day', day: value, month: value.slice(0, 7) })}/>}
    </div>
    <footer className="journal-record-actions"><RecordEntryActions disabled={!token || currentMember?.id !== currentMemberId} identity={identity} onRecord={(category, kind) => { submissionKeyRef.current = ''; setRecorderInitialCategory(category); setRecorderInitialDietKind(kind); setRecorderMode('manual') }}/></footer>
    {selectedRecord && <JournalRecordDetail eventId={selectedRecord.eventId} recordId={selectedRecord.recordId} startSleepCorrection={selectedRecord.correctSleep} onChanged={changedDay => { if (changedDay) setDay(changedDay); setSavedRecordFocus(changedDay ? { recordId: selectedRecord.recordId, day: changedDay, revision: Date.now() } : null); setRevision(value => value + 1); void retry() }} onClose={() => { setSelectedRecord(null); const params = new URLSearchParams(location.search); if (params.has('recordId') || params.has('eventId')) { params.delete('recordId'); params.delete('eventId'); navigate(`${location.pathname}?${params}`, { replace: true, state: location.state }) } }}/ >}
    {recorderMode && <JournalRecorder initialDietKind={recorderInitialDietKind} initialCategory={recorderInitialCategory} key={`recorder:${identity}:${recorderInitialCategory ?? 'none'}`} memberId={currentMemberId} selectedDay={day} today={today} token={token ?? ''} onClose={() => { setRecorderMode(null); setRecorderInitialCategory(undefined); setRecorderInitialDietKind(undefined) }} onConfirm={saveJournalRecord} onSaved={message => { setSavedNotice(message); window.setTimeout(() => setSavedNotice(''), 1800) }}/ >}
    {pendingDuplicate && <DuplicateRecordPrompt duplicate={pendingDuplicate.duplicate} onCancel={discardDuplicate} onDiscard={discardDuplicate} onUpdate={changeSummary => resolveDuplicate('update', changeSummary)} onCreate={() => resolveDuplicate('create')}/>}
    {savedNotice && <div className="journal-saved-toast" aria-live="polite" role="status">{savedNotice}</div>}
    {tutorial && <div className="nurse-station-modal-layer" role="dialog" aria-modal="true"><div className="nurse-station-modal"><button aria-label="退出教程" className="sheet-close" onClick={() => navigate('/nurse-station', { replace: true })} type="button"><X/></button><h2>试着记录一次喂养</h2><p className="tutorial-example">宝宝刚喝了120ml配方奶</p><p>这是教程示例，不会保存为真实记录。</p><HohoButton fullWidth size="large" onClick={() => navigate('/nurse-station', { replace: true, state: { tutorialComplete: true } })}>使用示例</HohoButton><button className="sheet-secondary" onClick={() => navigate('/nurse-station', { replace: true })} type="button">跳过这一步</button></div></div>}
    <NurseNextAction currentMemberId={currentMemberId} eventId={nextActionEventId} key={`${currentMemberId}:${nextActionEventId ?? 'none'}`} onClose={() => setNextActionOpen(false)} open={nextActionOpen}/>
  </main>
}
export function CreateHealthEventPage() {
  const location = useLocation()
  return <Navigate to={`/health-events${location.search}${location.hash}`} state={location.state} replace />
}
