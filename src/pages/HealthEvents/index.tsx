import { Bell, ClipboardList, Filter, Plus } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Avatar, Button, Card } from '../../components/common'
import { emptyHealthEventFilters, HealthEventFilterSheet, HealthEventTimeline } from '../../components/health'
import type { HealthEventFilters } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { ApiRequestError } from '../../services/apiClient'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventListItemViewModel, HealthEventStage, Member } from '../../types'

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
    <div className="mx-4 mt-4 flex min-h-[86px] items-center gap-3 rounded-card border bg-surface px-4 py-3 shadow-card">
      <Avatar name={member?.name ?? '家庭成员'} src={member?.avatar} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-lg font-semibold tracking-tight">{member?.name ?? '家庭成员'}</p>
          {member?.relation === '本人' && <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">本人</span>}
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          {member && <span>{genderLabels[member.gender ?? '']} · {member.age}</span>}
          {!member && <span>健康数据加载中</span>}
        </p>
      </div>
      <button
        className="rounded-control border border-primary/25 px-3 py-2 text-sm font-semibold text-primary"
        type="button"
        onClick={() => navigate('/family')}
      >
        切换身份
      </button>
    </div>
  )
}

function hasActiveFilters(filters: HealthEventFilters) {
  return filters.range !== 'all' || filters.year !== null || filters.months.length > 0 || filters.statuses.length > 0 || filters.categories.length > 0
}

function filterEvents(events: HealthEventListItemViewModel[], filters: HealthEventFilters) {
  const now = new Date()
  return events.filter((event) => {
    const eventDate = new Date(event.startTime)
    if (filters.range === '7d' && eventDate < new Date(now.getTime() - 7 * 86_400_000)) return false
    if (filters.range === '30d' && eventDate < new Date(now.getTime() - 30 * 86_400_000)) return false
    if (filters.range === 'year' && eventDate.getFullYear() !== now.getFullYear()) return false
    if (filters.range === 'custom') {
      if (filters.customStart && event.startTime.slice(0, 10) < filters.customStart) return false
      if (filters.customEnd && event.startTime.slice(0, 10) > filters.customEnd) return false
    }
    if (filters.year !== null && eventDate.getFullYear() !== filters.year) return false
    if (filters.months.length > 0 && !filters.months.includes(eventDate.getMonth() + 1)) return false
    const displayStatus = event.status === 'handling' ? 'observing' : event.status
    if (filters.statuses.length > 0 && !filters.statuses.includes(displayStatus)) return false
    if (filters.categories.length > 0 && !filters.categories.includes(event.category)) return false
    return true
  })
}

export function HealthEventsPage() {
  const navigate = useNavigate()
  const profile = useAppStore((state) => state.profile)
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const { state, retry, updateEventStatus, deleteEvent } = useHealthEventsList()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<HealthEventFilters>(emptyHealthEventFilters)

  if (!profile) return <Navigate to="/onboarding/profile" replace />

  const currentMember = state.status === 'success'
    ? state.data.members.find((member) => member.id === currentMemberId) ?? state.data.members[0] ?? null
    : null
  const currentMemberDto = state.status === 'success'
    ? state.data.memberDtos.find((member) => member.id === currentMember?.id) ?? state.data.memberDtos[0] ?? null
    : null
  const memberEvents = state.status === 'success'
    ? state.data.events.filter((event) => (
        (!currentMemberDto || event.memberId === currentMemberDto.id)
        && event.title.trim().length > 0
      ))
    : []
  const visibleEvents = filterEvents(memberEvents, filters)
  const years = [...new Set(memberEvents.map((event) => new Date(event.startTime).getFullYear()))].sort((left, right) => right - left)

  const createEmptyEvent = async () => {
    if (!token || !currentMemberDto || creating) return
    setCreating(true)
    setCreateError('')
    try {
      const created = await healthEventService.create({
        memberId: currentMemberDto.id,
        title: '',
        category: 'other',
        startTime: new Date().toISOString()
      }, token)
      navigate(`/health-events/${created.id}`)
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

  return (
    <main className="app-shell relative flex flex-col overflow-hidden pb-0">
      <MainAppHeader title="健康事件" action={<HeaderActions onMessages={() => navigate('/messages')} />} />
      <UserIdentity member={currentMember} />

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24">
        <div className="mb-4 flex min-h-11 items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">事件列表</h2>
          <button
            className={`relative flex min-h-10 items-center gap-1.5 rounded-control px-3 text-sm font-medium transition hover:bg-primary-soft ${hasActiveFilters(filters) ? 'bg-primary-soft text-primary' : 'text-text-secondary'}`}
            type="button"
            aria-label="筛选事件列表"
            onClick={() => setFilterOpen(true)}
          >
            <Filter size={17} strokeWidth={1.8} />
            筛选
            {hasActiveFilters(filters) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        </div>
        {state.status === 'loading' && (
          <Card className="py-12 text-center">
            <p className="text-sm text-text-secondary">正在加载健康事件…</p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card className="py-10 text-center">
            <h2 className="font-semibold">健康事件加载失败</h2>
            <p className="mt-2 text-sm text-text-secondary">{state.message}</p>
            <Button className="mt-5" onClick={retry}>重新加载</Button>
          </Card>
        )}

        {state.status === 'success' && memberEvents.length === 0 && (
          <Card className="flex min-h-[500px] w-full flex-col items-center justify-center px-8 py-12 text-center">
            <div className="relative grid h-32 w-32 place-items-center rounded-full bg-primary-soft">
              <ClipboardList className="text-primary" size={76} strokeWidth={1.45} />
              <span className="absolute bottom-3 right-1 grid h-10 w-10 place-items-center rounded-full bg-primary text-surface shadow-floating">
                <Plus size={25} strokeWidth={2} />
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">不舒服？记一下！</h2>
            <p className="mt-3 text-sm leading-7 text-text-secondary">
              心慌、胸闷、咳嗽、受凉等疑似感冒
              <br />
              都可以记录下来
            </p>
            <Button className="mt-7 min-w-56 rounded-control" disabled={creating} type="button" onClick={() => void createEmptyEvent()}>
              <Plus size={19} strokeWidth={1.8} />
              {creating ? '正在开始记录…' : '记录一次健康事件'}
            </Button>
          </Card>
        )}

        {state.status === 'success' && memberEvents.length > 0 && visibleEvents.length > 0 && (
          <HealthEventTimeline events={visibleEvents} onStatusChange={changeEventStatus} onDelete={removeEvent} />
        )}

        {state.status === 'success' && memberEvents.length > 0 && visibleEvents.length === 0 && (
          <Card className="py-12 text-center">
            <h2 className="font-semibold">没有符合条件的健康事件</h2>
            <p className="mt-2 text-sm text-text-secondary">可以调整或重置筛选条件</p>
            <Button className="mt-5" variant="secondary" onClick={() => setFilters(emptyHealthEventFilters)}>重置筛选</Button>
          </Card>
        )}
        {createError && <p className="mt-3 text-center text-xs text-danger">{createError}</p>}
      </div>

      <button
        className="fixed z-20 grid h-14 w-14 place-items-center rounded-full bg-primary text-surface shadow-floating transition active:scale-95"
        style={{
          bottom: 'max(24px, env(safe-area-inset-bottom))',
          right: 'max(24px, calc((100vw - 402px) / 2 + 24px))'
        }}
        type="button"
        aria-label="新增健康事件"
        disabled={creating || !currentMemberDto}
        onClick={() => void createEmptyEvent()}
      >
        <Plus size={30} strokeWidth={1.8} />
      </button>

      <HealthEventFilterSheet open={filterOpen} filters={filters} years={years} onClose={() => setFilterOpen(false)} onApply={setFilters} />
    </main>
  )
}

export function CreateHealthEventPage() {
  return <Navigate to="/health-events" replace />
}
