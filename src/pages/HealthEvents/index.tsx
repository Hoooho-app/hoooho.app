import { Bell, ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Avatar, Button, Card } from '../../components/common'
import { HealthEventCard } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { ApiRequestError } from '../../services/apiClient'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'

function NotificationButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="relative grid h-11 w-11 place-items-center rounded-full text-text-primary transition hover:bg-primary-soft"
      type="button"
      aria-label="消息中心"
      onClick={onClick}
    >
      <Bell size={22} strokeWidth={1.8} />
    </button>
  )
}

function UserIdentity({ member }: { member: Member | null }) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[92px] items-center gap-4 px-5">
      <Avatar name={member?.name ?? '家庭成员'} src={member?.avatar} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold tracking-tight">{member?.name ?? '家庭成员'}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{member?.age ?? '健康数据加载中'}</p>
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

export function HealthEventsPage() {
  const navigate = useNavigate()
  const profile = useAppStore((state) => state.profile)
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const { state, retry } = useHealthEventsList()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  if (!profile) return <Navigate to="/onboarding/profile" replace />

  const currentMember = state.status === 'success'
    ? state.data.members.find((member) => member.id === currentMemberId) ?? state.data.members[0] ?? null
    : null
  const currentMemberDto = state.status === 'success'
    ? state.data.memberDtos.find((member) => member.id === currentMember?.id) ?? state.data.memberDtos[0] ?? null
    : null

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

  return (
    <main className="app-shell relative flex flex-col overflow-hidden pb-0">
      <MainAppHeader title="健康事件" action={<NotificationButton onClick={() => navigate('/messages')} />} />
      <UserIdentity member={currentMember} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24">
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

        {state.status === 'success' && state.data.events.length === 0 && (
          <Card className="flex min-h-[500px] w-full flex-col items-center justify-center px-8 py-12 text-center">
            <div className="relative grid h-32 w-32 place-items-center rounded-full bg-primary-soft">
              <ClipboardList className="text-primary" size={76} strokeWidth={1.45} />
              <span className="absolute bottom-3 right-1 grid h-10 w-10 place-items-center rounded-full bg-primary text-surface shadow-floating">
                <Plus size={25} strokeWidth={2} />
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">不舒服记一下</h2>
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

        {state.status === 'success' && state.data.events.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-title py-1">最近健康事件</h2>
            {state.data.events.map((event) => <HealthEventCard event={event} key={event.id} />)}
          </section>
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
    </main>
  )
}

export function CreateHealthEventPage() {
  return <Navigate to="/health-events" replace />
}
