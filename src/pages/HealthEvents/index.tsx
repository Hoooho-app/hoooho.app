import { ArrowDownNarrowWide, ArrowUpNarrowWide, Filter, Mic, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import logoUrl from '../../assets/logo.svg'
import { Avatar } from '../../components/common'
import { emptyHealthEventFilters, HealthEventFilterSheet } from '../../components/health'
import type { HealthEventFilters } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { ApiRequestError } from '../../services/apiClient'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { getMemberHealthEvents } from '../../services/healthEventListPresentation'
import { quickRecordService } from '../../services/quickRecords'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { Member } from '../../types'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import { TimeView } from './TimeView'
import { JournalRecorder } from './JournalRecorder'
import type { JournalCategory } from './timeViewModel'
import './TimeView.css'
import type { QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { FirstMemberFrontDesk } from './FirstMemberFrontDesk'
import { NurseQuickRecord } from './NurseQuickRecord'
import { NurseNextAction } from './NurseNextAction'
import { getNurseNextActionEventId } from './nurseNextActionContext'
import {
  DEFAULT_HEALTH_EVENTS_VIEW_MODE,
  healthEventsViewLabels,
  type HealthEventsViewMode
} from './nurseTriageMachine'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

function UserIdentity({ member, onSummary, summaryDisabled, triage }: { member: Member | null; onSummary: () => void; summaryDisabled: boolean; triage: boolean }) {
  const meta = member ? [genderLabels[member.gender ?? ''], member.age].filter(Boolean).join(' · ') : ''
  return (
    <div className="health-events-member mx-4 mt-2">
      <div className="journal-subject-row">
        <div className="journal-subject-card" aria-label="记录对象">
          <Avatar name={member?.name ?? ' '} src={member?.avatar} size="sm" />
          <span className="journal-subject-copy">
            <span className="journal-subject-name"><strong>{member?.name ?? ' '}</strong><span>记录对象</span></span>
            <span className="journal-subject-meta">{meta}</span>
          </span>
        </div>
        <HohoButton className="journal-subject-summary" variant="secondary" onClick={onSummary} disabled={summaryDisabled}><img src={logoUrl} width={20} height={20} alt="" />摘要生成</HohoButton>
      </div>
      {triage && <><p className="care-term-explanation mt-2 px-1 text-xs leading-5 text-text-secondary">“健康随记”记录一次不舒服、就诊或康复的完整过程。</p>
      <p className="care-action-hint mt-2 px-1 text-xs leading-5 text-text-secondary">需要新增记录时，留在前台直接点击“快速记录”。</p></>}
    </div>
  )
}

function hasActiveFilters(filters: HealthEventFilters) {
  return filters.range !== 'all' || filters.year !== null || filters.months.length > 0 || filters.statuses.length > 0 || filters.definitionTitles.length > 0
}

const healthEventsViewOptions: HealthEventsViewMode[] = ['triage', 'list']

function HealthEventsViewSelect({ onChange, value }: { onChange: (view: HealthEventsViewMode) => void; value: HealthEventsViewMode }) {
  return (
    <div aria-label="健康随记视图" className="health-events-view-switch" role="group">
      {healthEventsViewOptions.map((option) => <button
        aria-pressed={option === value}
        data-selected={option === value}
        key={option}
        onClick={() => onChange(option)}
        type="button"
      >{healthEventsViewLabels[option]}</button>)}
    </div>
  )
}

export function HealthEventsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const cachedMembers = useAppStore((state) => state.members)
  const carePreferences = useSettingsStore((state) => state.care)
  const { state, retry } = useHealthEventsList()
  const [today, setToday] = useState(() => getLocalDateKey(new Date())!)
  const [day, setDay] = useState(today)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<HealthEventFilters>(emptyHealthEventFilters)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [recorderMode, setRecorderMode] = useState<'manual' | 'voice' | null>(null)
  const [revision, setRevision] = useState(0)
  const [journalContext, setJournalContext] = useState<{ memberId: string; eventId: string | null }>({ memberId: '', eventId: null })
  const [viewMode, setViewMode] = useState<HealthEventsViewMode>(DEFAULT_HEALTH_EVENTS_VIEW_MODE)
  const [quickRecordOpen, setQuickRecordOpen] = useState(false)
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const submissionKeyRef = useRef('')

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setSystemReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    const refreshDay = () => {
      const currentDay = getLocalDateKey(new Date())!
      setToday((previous) => { if (currentDay !== previous) setDay((selected) => selected === previous ? currentDay : selected); return currentDay })
    }
    const timer = window.setInterval(refreshDay, 30_000)
    window.addEventListener('focus', refreshDay)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDay) }
  }, [])

  const loadedMembers = state.status === 'success' ? state.data.members : []
  const currentMember = loadedMembers.find((member) => member.id === currentMemberId)
    ?? cachedMembers.find((member) => member.id === currentMemberId)
    ?? loadedMembers[0]
    ?? cachedMembers[0]
    ?? null
  const currentMemberDto = state.status === 'success'
    ? state.data.memberDtos.find((member) => member.id === currentMember?.id) ?? null
    : null
  const memberEvents = state.status === 'success'
    ? getMemberHealthEvents(state.data.events, currentMemberDto?.id)
    : []
  const nextActionEventId = getNurseNextActionEventId(memberEvents, currentMemberId) ?? (viewMode === 'list' && journalContext.memberId === currentMemberId ? journalContext.eventId : null)
  const reducedMotion = systemReducedMotion || (carePreferences.enabled && carePreferences.reduceMotion)

  useEffect(() => {
    setQuickRecordOpen(false)
    setNextActionOpen(false)
    setRecorderMode(null)
    setFilterOpen(false)
    submissionKeyRef.current = ''
  }, [currentMemberId, viewMode])

  useEffect(() => {
    const openRequested = (location.state as { openQuickRecord?: boolean } | null)?.openQuickRecord
    if (!openRequested || !currentMember) return
    setViewMode('triage')
    setQuickRecordOpen(true)
    submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    navigate('/health-events', { replace: true })
  }, [currentMember, location.state, navigate])

  const openQuickRecord = () => {
    if (!currentMember) {
      navigate('/family/new', { state: { firstUseEntry: { continueToRecord: true, returnTo: '/health-events' } } })
      return
    }
    submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    setQuickRecordOpen(true)
  }

  const saveTriageRecord = async (transcript: string, occurredAt: string, inputChannel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload) => {
    if (!token || !currentMember) throw new Error('当前人物信息尚未准备好，请稍后重试。')
    if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    try {
      await quickRecordService.create({
        memberId: currentMember.id,
        content: transcript,
        occurredAt,
        inputChannel,
        idempotencyKey: submissionKeyRef.current,
        title: normalizeHealthEventTitle('', transcript),
        ...(photos.photoIds.length ? { photoDraftId: photos.draftId, photoIds: photos.photoIds } : {})
      }, token)
      submissionKeyRef.current = ''
      void retry()
      return '已记录'
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        throw new Error('登录状态已失效，请重新登录。')
      }
      throw requestError
    }
  }

  const saveJournalRecord = async (transcript: string, occurredAt: string, inputChannel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, categories: JournalCategory[]) => {
    if (!token || !currentMember || currentMember.id !== currentMemberId) throw new Error('记录对象尚未准备好')
    if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID().replaceAll('-', '')
    await quickRecordService.create({
      memberId: currentMemberId, content: transcript, occurredAt, inputChannel,
      title: normalizeHealthEventTitle('', transcript), idempotencyKey: submissionKeyRef.current,
      journal: { categories },
      ...(photos.photoIds.length ? { photoDraftId: photos.draftId, photoIds: photos.photoIds } : {})
    }, token)
    submissionKeyRef.current = ''
    setDay(getLocalDateKey(new Date())!)
    setRevision((value) => value + 1)
    void retry()
    return '已记录'
  }

  const closeQuickRecord = () => {
    setQuickRecordOpen(false)
  }

  if (state.status === 'success' && state.data.entryState.familyMemberCount === 0) {
    return (
      <FirstMemberFrontDesk
        onAddMember={() => navigate('/family/new', {
          state: { firstUseEntry: { continueToRecord: false, returnTo: '/health-events' } }
        })}
        reducedMotion={reducedMotion}
      />
    )
  }

  return (
    <main className="hoho-health-events-page app-shell app-shell--wide relative flex flex-col overflow-hidden pb-0" data-view-mode={viewMode}>
      <MainAppHeader title="健康随身记" />
      <UserIdentity member={currentMember} onSummary={() => setNextActionOpen(true)} summaryDisabled={!nextActionEventId} triage={viewMode === 'triage'} />

      <div className={`health-events-content mt-3 min-h-0 flex-1 overscroll-contain px-4 ${viewMode === 'triage' ? 'health-events-content--triage overflow-hidden' : 'overflow-y-auto pb-24'}`}>
        <div className="health-events-toolbar mb-2">
          <div className="journal-toolbar">
            <HealthEventsViewSelect onChange={setViewMode} value={viewMode} />
            {viewMode === 'list' && <div className="journal-toolbar-actions">
              <HohoButton className={hasActiveFilters(filters) ? 'journal-filter-active' : ''} size="icon" variant="secondary" aria-label="筛选健康随身记" onClick={() => setFilterOpen(true)}><Filter size={18} /></HohoButton>
              <HohoButton size="icon" variant="secondary" aria-label={sortOrder === 'desc' ? '当前最新在前，切换为从早到晚' : '当前从早到晚，切换为最新在前'} onClick={() => setSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}>{sortOrder === 'desc' ? <ArrowDownNarrowWide size={18} /> : <ArrowUpNarrowWide size={18} />}</HohoButton>
            </div>}
          </div>
        </div>
        {viewMode === 'list' && <TimeView memberId={currentMemberId} token={token ?? ''} day={day} today={today} onDayChange={(value) => { if (parsePlainDate(value) && value <= today) setDay(value) }} revision={revision} onContext={setJournalContext} filterOpen={filterOpen} filters={filters} onFilterClose={() => setFilterOpen(false)} onFilterApply={setFilters} sortOrder={sortOrder} />}
        {(
          <NurseQuickRecord
            active={viewMode === 'triage'}
            authToken={token ?? ''}
            currentMemberId={currentMemberId}
            disabled={!token || !currentMember}
            key={currentMemberId}
            nextActionDisabled={!nextActionEventId}
            nextActionOpen={nextActionOpen}
            onClose={closeQuickRecord}
            onConfirm={saveTriageRecord}
            onNextActionOpen={() => setNextActionOpen(true)}
            onOpen={openQuickRecord}
            open={quickRecordOpen}
            reducedMotion={reducedMotion}
          />
        )}
      </div>

      {viewMode === 'list' && <footer className="journal-record-actions"><div>
        <HohoButton size="large" disabled={!token || currentMember?.id !== currentMemberId} onClick={() => { submissionKeyRef.current = ''; setRecorderMode('manual') }}><PenLine size={20} />手动记录</HohoButton>
        <HohoButton size="large" variant="secondary" disabled={!token || currentMember?.id !== currentMemberId} onClick={() => { submissionKeyRef.current = ''; setRecorderMode('voice') }}><Mic size={20} />快捷记录</HohoButton>
      </div></footer>}
      {recorderMode && <JournalRecorder key={currentMemberId} mode={recorderMode} memberId={currentMemberId} token={token ?? ''} onClose={() => setRecorderMode(null)} onConfirm={saveJournalRecord} />}
      <NurseNextAction
        currentMemberId={currentMemberId}
        eventId={nextActionEventId}
        key={`${currentMemberId}:${nextActionEventId ?? 'none'}`}
        onClose={() => setNextActionOpen(false)}
        open={nextActionOpen}
      />
    </main>
  )
}

export function CreateHealthEventPage() {
  return <Navigate to="/health-events" replace />
}
