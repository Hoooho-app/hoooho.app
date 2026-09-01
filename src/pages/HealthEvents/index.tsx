import { Bell, Check, ChevronDown, ClipboardList, Filter, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { EmptyState, HealthCard, HohoButton, ListSkeleton, StatusNotice, Typography } from '../../components/design-system'
import { emptyHealthEventFilters, HealthEventFilterSheet, HealthEventTimeline, RecordSubjectCard } from '../../components/health'
import type { HealthEventFilters } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { ApiRequestError } from '../../services/apiClient'
import { getHealthEventDefinitionTitleOptions } from '../../services/healthEventFilterOptions'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { getMemberHealthEvents } from '../../services/healthEventListPresentation'
import { healthEventService } from '../../services/healthEvents'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { healthRecordOrganizationService } from '../../services/healthRecordOrganization'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { FamilyMemberApiDto, HealthEventListItemViewModel, HealthEventStage, Member } from '../../types'
import { getLocalCalendarParts, getLocalDateKey } from '../../utils/localCalendarDate'
import { createQuickRecordCandidates } from '../../features/quick-record'
import { FirstUseHome } from './FirstUseHome'
import { NurseQuickRecord } from './NurseQuickRecord'
import { NurseNextAction } from './NurseNextAction'
import { getNurseNextActionEventId } from './nurseNextActionContext'
import { preloadNurseTriageAssets } from './NurseTriageDesk'
import {
  DEFAULT_HEALTH_EVENTS_VIEW_MODE,
  healthEventsViewLabels,
  shouldShowHealthEventFilters,
  type HealthEventsViewMode
} from './nurseTriageMachine'

function HeaderActions({ onMessages }: { onMessages: () => void }) {
  return (
    <button className="grid h-11 w-11 place-items-center rounded-full text-text-primary transition hover:bg-primary-soft" type="button" aria-label="消息中心" onClick={onMessages}>
      <Bell size={21} strokeWidth={1.8} />
    </button>
  )
}

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

function UserIdentity({ member }: { member: Member | null }) {
  const navigate = useNavigate()

  return (
    <div className="health-events-member mx-4 mt-3">
      <RecordSubjectCard
        action={<button className="rounded-control border border-primary/25 px-2.5 py-1.5 text-xs font-semibold text-primary" type="button" onClick={() => navigate('/family', {
          state: { familyEntry: { returnTo: '/health-events', reopenDrawer: false } }
        })}>切换人物</button>}
        age={member?.age ?? (member ? '' : '健康数据加载中')}
        avatar={member?.avatar}
        gender={member ? genderLabels[member.gender ?? ''] : ''}
        label="当前人物"
        name={member?.name ?? '家庭成员'}
      />
      <p className="care-term-explanation mt-2 px-1 text-xs leading-5 text-text-secondary">“健康事件”指一次不舒服、就诊或康复的完整过程。</p>
      <p className="care-action-hint mt-2 px-1 text-xs leading-5 text-text-secondary">需要新增记录时，点击右下角的加号按钮。</p>
    </div>
  )
}

function hasActiveFilters(filters: HealthEventFilters) {
  return filters.range !== 'all' || filters.year !== null || filters.months.length > 0 || filters.statuses.length > 0 || filters.definitionTitles.length > 0
}

const healthEventsViewOptions: HealthEventsViewMode[] = ['triage', 'list']

function HealthEventsViewSelect({ onChange, value }: { onChange: (view: HealthEventsViewMode) => void; value: HealthEventsViewMode }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const focusOption = (index: number) => optionRefs.current[index]?.focus()
  const openWithFocus = (index: number) => {
    setOpen(true)
    queueMicrotask(() => focusOption(index))
  }
  const selectView = (nextView: HealthEventsViewMode) => {
    if (nextView !== value) onChange(nextView)
    setOpen(false)
    triggerRef.current?.focus()
  }
  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openWithFocus(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openWithFocus(healthEventsViewOptions.length - 1)
    }
  }
  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption((index + 1) % healthEventsViewOptions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption((index - 1 + healthEventsViewOptions.length) % healthEventsViewOptions.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(healthEventsViewOptions.length - 1)
    }
  }

  return (
    <div
      className="health-events-view-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      ref={rootRef}
    >
      <button
        aria-controls="health-events-view-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="health-events-view-select__trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span>{healthEventsViewLabels[value]}</span>
        <ChevronDown aria-hidden="true" data-open={open} size={16} strokeWidth={1.8} />
      </button>
      {open && (
        <div aria-label="选择健康事件视图" className="health-events-view-select__menu" id="health-events-view-menu" role="menu">
          {healthEventsViewOptions.map((option, index) => {
            const selected = option === value
            return (
              <button
                aria-checked={selected}
                className="health-events-view-select__option"
                data-selected={selected}
                key={option}
                onClick={() => selectView(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                ref={(node) => { optionRefs.current[index] = node }}
                role="menuitemradio"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <span>{healthEventsViewLabels[option]}</span>
                <Check aria-hidden="true" size={15} strokeWidth={2} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function filterEvents(events: HealthEventListItemViewModel[], filters: HealthEventFilters, now = new Date()) {
  return events.filter((event) => {
    const eventDate = new Date(event.occurredAt)
    const localDate = getLocalCalendarParts(eventDate)
    const localDateKey = getLocalDateKey(eventDate)
    if (!localDate || !localDateKey) return false
    if (filters.range === '7d' && eventDate < new Date(now.getTime() - 7 * 86_400_000)) return false
    if (filters.range === '30d' && eventDate < new Date(now.getTime() - 30 * 86_400_000)) return false
    if (filters.range === 'year' && localDate.year !== now.getFullYear()) return false
    if (filters.range === 'custom') {
      if (filters.customStart && localDateKey < filters.customStart) return false
      if (filters.customEnd && localDateKey > filters.customEnd) return false
    }
    if (filters.year !== null && localDate.year !== filters.year) return false
    if (filters.months.length > 0 && !filters.months.includes(localDate.month)) return false
    const displayStatus = event.status === 'handling' ? 'observing' : event.status
    if (filters.statuses.length > 0 && !filters.statuses.includes(displayStatus)) return false
    if (filters.definitionTitles.length > 0 && !filters.definitionTitles.includes(event.definitionTitle)) return false
    return true
  })
}

export function HealthEventsPage() {
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const addMember = useAppStore((state) => state.addMember)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const carePreferences = useSettingsStore((state) => state.care)
  const { state, retry, updateEventStatus, deleteEvent } = useHealthEventsList()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<HealthEventFilters>(emptyHealthEventFilters)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<HealthEventsViewMode>(DEFAULT_HEALTH_EVENTS_VIEW_MODE)
  const [quickRecordOpen, setQuickRecordOpen] = useState(false)
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const pendingTriageEventRef = useRef<{ eventId: string; memberId: string; recordId?: string; transcript?: string } | null>(null)

  useEffect(() => {
    preloadNurseTriageAssets()
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setSystemReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (viewMode === 'triage') setFilterOpen(false)
  }, [viewMode])

  const currentMember = state.status === 'success'
    ? state.data.members.find((member) => member.id === currentMemberId) ?? null
    : null
  const currentMemberDto = state.status === 'success'
    ? state.data.memberDtos.find((member) => member.id === currentMember?.id) ?? null
    : null
  const memberEvents = state.status === 'success'
    ? getMemberHealthEvents(state.data.events, currentMemberDto?.id)
    : []
  const nextActionEventId = getNurseNextActionEventId(memberEvents, currentMemberId)
  const years = [...new Set(memberEvents
    .map((event) => getLocalCalendarParts(event.occurredAt)?.year)
    .filter((year): year is number => year !== undefined))]
    .sort((left, right) => right - left)
  const definitionTitles = getHealthEventDefinitionTitleOptions(memberEvents)
  const activeYear = selectedYear !== null && years.includes(selectedYear) ? selectedYear : years[0] ?? null
  const filteredEvents = filterEvents(memberEvents, filters)
  const visibleEvents = activeYear === null
    ? filteredEvents
    : filteredEvents.filter((event) => getLocalCalendarParts(event.occurredAt)?.year === activeYear)
  const reducedMotion = systemReducedMotion || (carePreferences.enabled && carePreferences.reduceMotion)

  const discardPendingTriageEvent = useCallback(() => {
    const pending = pendingTriageEventRef.current
    if (!pending || pending.recordId || !token) return
    pendingTriageEventRef.current = null
    void healthEventService.delete(pending.eventId, token).catch(() => undefined)
  }, [token])

  useEffect(() => {
    setQuickRecordOpen(false)
    setNextActionOpen(false)
    discardPendingTriageEvent()
  }, [currentMemberId, discardPendingTriageEvent, viewMode])

  useEffect(() => () => discardPendingTriageEvent(), [discardPendingTriageEvent])

  const selectYear = (year: number) => {
    setSelectedYear(year)
    if (filters.year !== null) setFilters((current) => ({ ...current, year: null }))
  }

  const applyFilters = (nextFilters: HealthEventFilters) => {
    setFilters(nextFilters)
    if (nextFilters.year !== null) setSelectedYear(nextFilters.year)
  }

  const createEmptyEvent = async (member = currentMemberDto) => {
    if (!token || !member || creating) return
    setCreating(true)
    setCreateError('')
    try {
      const created = await healthEventService.create({
        memberId: member.id,
        title: '',
        category: 'other'
      }, token)
      setCurrentMemberId(member.id)
      navigate(`/health-events/${created.id}`, { state: { allowFirstRecord: true } })
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        return
      }
      setCreateError(requestError instanceof Error ? requestError.message : '暂时无法开始记录，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  const beginNewRecord = () => {
    void createEmptyEvent()
  }

  const createSelfAndRecord = async () => {
    if (!token || creating) return
    setCreating(true)
    setCreateError('')
    try {
      const createdMember = await familyMemberService.createSelf({}, token)
      addMember(adaptFamilyMember(createdMember))
      const createdEvent = await healthEventService.create({ memberId: createdMember.id, title: '', category: 'other' }, token)
      setCurrentMemberId(createdMember.id)
      navigate(`/health-events/${createdEvent.id}`, { state: { allowFirstRecord: true } })
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        return
      }
      setCreateError(requestError instanceof Error ? requestError.message : '暂时无法开始记录，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  const changeEventStatus = async (eventId: string, status: HealthEventStage) => {
    setCreateError('')
    try {
      await updateEventStatus(eventId, status)
    } catch (requestError) {
      setCreateError(requestError instanceof Error ? requestError.message : '状态更新失败，请稍后重试')
    }
  }

  const removeEvent = async (eventId: string) => {
    setCreateError('')
    try {
      await deleteEvent(eventId)
    } catch (requestError) {
      setCreateError(requestError instanceof Error ? requestError.message : '删除失败，请稍后重试')
    }
  }

  const ensurePendingTriageEvent = async (transcript: string, occurredAt: string) => {
    if (!token || !currentMemberDto || currentMemberDto.id !== currentMemberId) throw new Error('当前人物信息尚未准备好，请稍后重试。')
    try {
      let pending = pendingTriageEventRef.current
      if (!pending || pending.memberId !== currentMemberDto.id) {
        const event = await healthEventService.create({
          memberId: currentMemberDto.id,
          title: normalizeHealthEventTitle('', transcript),
          category: 'other',
          startTime: occurredAt
        }, token)
        pending = { eventId: event.id, memberId: currentMemberDto.id }
        pendingTriageEventRef.current = pending
      }
      return pending
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        throw new Error('登录状态已失效，请重新登录。')
      }
      throw requestError
    }
  }

  // Preview requires an event id. Reuse the intelligent view's existing rule of
  // creating one event for the current member, then remove it if the user cancels.
  const previewTriageRecord = async (transcript: string, occurredAt: string) => {
    if (!token) throw new Error('登录状态已失效，请重新登录。')
    const pending = await ensurePendingTriageEvent(transcript, occurredAt)
    const preview = await healthRecordOrganizationService.preview(pending.eventId, transcript, token, { selectedOccurredAt: occurredAt })
    return createQuickRecordCandidates(preview, occurredAt)
  }

  const saveTriageRecord = async (transcript: string, occurredAt: string) => {
    if (!token) throw new Error('登录状态已失效，请重新登录。')
    const pending = await ensurePendingTriageEvent(transcript, occurredAt)
    try {
      if (!pending.recordId || pending.transcript !== transcript) {
        const record = await healthEventRecordService.create(pending.eventId, {
          type: 'note',
          content: transcript,
          occurredAt
        }, token)
        pending.recordId = record.id
        pending.transcript = transcript
      }
      let message = '已记录'
      try {
        const organization = await healthRecordOrganizationService.organize(pending.eventId, pending.recordId, token)
        if (organization.rawRecordOnly) message = '已保存原话，自动整理暂时不可用。'
        else if (organization.status !== 'completed') message = '原始记录已保存，暂未自动整理'
      } catch {
        message = '原始记录已保存，自动整理失败'
      }
      pendingTriageEventRef.current = null
      void retry()
      return message
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        throw new Error('登录状态已失效，请重新登录。')
      }
      throw requestError
    }
  }

  const closeQuickRecord = () => {
    setQuickRecordOpen(false)
    discardPendingTriageEvent()
  }

  if (state.status === 'success' && (state.data.entryState.familyMemberCount === 0 || !state.data.entryState.hasValidHealthRecord)) {
    return (
      <FirstUseHome
        creating={creating}
        error={createError}
        members={state.data.memberDtos}
        onAddFamily={(continueToRecord) => navigate('/family/new', {
          state: { firstUseEntry: { continueToRecord, returnTo: '/health-events' } }
        })}
        onCreateSelf={() => void createSelfAndRecord()}
        onOpenGuide={() => navigate('/guide')}
        onSelectMember={(member: FamilyMemberApiDto) => void createEmptyEvent(member)}
      />
    )
  }

  return (
    <main className="hoho-health-events-page app-shell relative flex flex-col overflow-hidden pb-0" data-view-mode={viewMode}>
      <MainAppHeader title="健康事件" action={<HeaderActions onMessages={() => navigate('/messages')} />} />
      <UserIdentity member={currentMember} />

      <div className={`health-events-content mt-5 min-h-0 flex-1 overscroll-contain px-4 ${viewMode === 'triage' ? 'health-events-content--triage overflow-hidden' : 'overflow-y-auto pb-24'}`}>
        <div className="health-events-toolbar mb-4 space-y-3">
          <div className={`flex min-h-11 items-center gap-2 ${viewMode === 'list' ? 'justify-between' : 'justify-end'}`}>
            {viewMode === 'list' && <Typography className="health-events-list-title" variant="sectionTitle">事件列表</Typography>}
            <div className="health-events-view-actions">
              {shouldShowHealthEventFilters(viewMode) && (
                <button
                  className={`relative flex min-h-10 items-center gap-1.5 rounded-control px-2.5 text-sm font-medium transition hover:bg-primary-soft ${hasActiveFilters(filters) ? 'bg-primary-soft text-primary' : 'text-text-secondary'}`}
                  type="button"
                  aria-label="筛选事件列表"
                  onClick={() => setFilterOpen(true)}
                >
                  <Filter size={17} strokeWidth={1.8} />
                  筛选
                  {hasActiveFilters(filters) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              )}
              <HealthEventsViewSelect onChange={setViewMode} value={viewMode} />
            </div>
          </div>

          {viewMode === 'list' && state.status === 'success' && years.length > 0 && (
            <div
              className="hoho-year-tabs health-events-year-tabs"
              role="tablist"
              aria-label="按年份切换健康事件"
            >
              {years.map((year) => {
                const selected = year === activeYear
                return (
                  <button
                    className="hoho-year-tabs__item"
                    data-selected={selected}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    key={year}
                    onClick={() => selectYear(year)}
                  >
                    {year}年
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {viewMode === 'list' && state.status === 'loading' && (
          <ListSkeleton rows={3} />
        )}

        {viewMode === 'list' && state.status === 'error' && (
          <StatusNotice action={<HohoButton size="small" variant="secondary" onClick={retry}>重新加载</HohoButton>} title="健康事件加载失败" tone="error">{state.message}</StatusNotice>
        )}

        {viewMode === 'list' && state.status === 'success' && memberEvents.length === 0 && (
          <HealthCard className="flex min-h-[360px] items-center justify-center">
            <EmptyState
              action={<HohoButton disabled={creating} onClick={beginNewRecord}>
              <Plus size={19} strokeWidth={1.8} />
              {creating ? '正在开始记录…' : '记录一次健康事件'}
              </HohoButton>}
              description={<><span className="care-standard-language">心慌、胸闷、咳嗽、受凉等不适<br />都可以记录下来</span><span className="care-plain-language">身体不舒服时，把发生的事记下来。</span></>}
              icon={<ClipboardList size={28} strokeWidth={1.6} />}
              title="不舒服？记一下"
            />
          </HealthCard>
        )}

        {viewMode === 'list' && state.status === 'success' && memberEvents.length > 0 && visibleEvents.length > 0 && (
          <HealthEventTimeline events={visibleEvents} onStatusChange={changeEventStatus} onDelete={removeEvent} />
        )}

        {viewMode === 'list' && state.status === 'success' && memberEvents.length > 0 && visibleEvents.length === 0 && (
          <HealthCard>
            <EmptyState
              action={<HohoButton variant="secondary" onClick={() => setFilters(emptyHealthEventFilters)}>重置筛选</HohoButton>}
              description="可以调整或重置筛选条件"
              title="没有符合条件的健康事件"
            />
          </HealthCard>
        )}
        {viewMode === 'triage' && (
          <NurseQuickRecord
            currentMemberId={currentMemberId}
            disabled={!token || !currentMemberDto}
            key={currentMemberId}
            nextActionDisabled={!nextActionEventId}
            nextActionOpen={nextActionOpen}
            onClose={closeQuickRecord}
            onConfirm={saveTriageRecord}
            onNextActionOpen={() => setNextActionOpen(true)}
            onOpen={() => setQuickRecordOpen(true)}
            onPreview={previewTriageRecord}
            open={quickRecordOpen}
            reducedMotion={reducedMotion}
          />
        )}
        {viewMode === 'list' && createError && <p className="mt-3 text-center text-xs text-danger">{createError}</p>}
      </div>

      {viewMode === 'list' && <button
        className="health-events-fab fixed z-20 grid h-14 w-14 place-items-center rounded-full bg-primary text-surface shadow-floating transition active:scale-95"
        type="button"
        aria-label="新增健康事件"
        disabled={creating || !currentMemberDto}
        onClick={beginNewRecord}
      >
        <Plus size={30} strokeWidth={1.8} />
      </button>}

      <HealthEventFilterSheet open={filterOpen} filters={filters} years={years} definitionTitles={definitionTitles} onClose={() => setFilterOpen(false)} onApply={applyFilters} />
      <NurseNextAction
        currentMemberId={currentMemberId}
        eventId={nextActionEventId}
        key={`${currentMemberId}:${nextActionEventId ?? 'none'}`}
        onClose={() => setNextActionOpen(false)}
        open={viewMode === 'triage' && nextActionOpen}
      />
    </main>
  )
}

export function CreateHealthEventPage() {
  return <Navigate to="/health-events" replace />
}
