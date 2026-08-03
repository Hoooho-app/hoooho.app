import { Bell, BookOpen, ClipboardList, Plus, UserRound } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import { useAppStore } from '../../store/useAppStore'
import { MainAppHeader } from '../../components/navigation'
import { useCurrentMember } from '../../hooks/useCurrentMember'

function NotificationButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="relative grid h-11 w-11 place-items-center rounded-full text-text-primary transition hover:bg-primary-soft" type="button" aria-label="消息中心" onClick={onClick}>
      <Bell size={22} strokeWidth={1.8} />
      <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full border-2 border-surface bg-red-500" />
    </button>
  )
}

function UserIdentity() {
  const member = useCurrentMember()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[92px] items-center gap-4 px-5">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary-soft text-text-primary">
        <UserRound size={29} strokeWidth={1.7} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold tracking-tight">{member.name}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{member.age}</p>
      </div>
      <button className="rounded-control border border-primary/25 px-3 py-2 text-sm font-semibold text-primary" type="button" onClick={() => navigate('/family')}>
        切换身份
      </button>
    </div>
  )
}

export function HealthEventsPage() {
  const navigate = useNavigate()
  const profile = useAppStore((state) => state.profile)

  if (!profile) return <Navigate to="/onboarding/success" replace />

  return (
    <main className="app-shell relative flex flex-col overflow-hidden pb-0">
      <MainAppHeader title="健康事件" action={<NotificationButton onClick={() => navigate('/messages')} />} />

      <UserIdentity />

      <div className="flex flex-1 px-4 pb-5">
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
          <Button className="mt-7 min-w-56 rounded-control" type="button" onClick={() => navigate('/guide')}>
            <BookOpen size={19} strokeWidth={1.8} />
            使用说明，看一下
          </Button>
        </Card>
      </div>

      <button
        className="fixed z-20 grid h-14 w-14 place-items-center rounded-full bg-primary text-surface shadow-floating transition active:scale-95"
        style={{
          bottom: 'max(24px, env(safe-area-inset-bottom))',
          right: 'max(24px, calc((100vw - 402px) / 2 + 24px))'
        }}
        type="button"
        aria-label="新增健康事件"
        onClick={() => navigate('/health-events/new')}
      >
        <Plus size={30} strokeWidth={1.8} />
      </button>

    </main>
  )
}

export function CreateHealthEventPage() {
  return <Navigate to="/health-events/event-empty" replace />
}
