import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Header, Input } from '../../components/common'
import { HealthEventCard, MemberIdentityCard } from '../../components/health'
import { BottomNavigation } from '../../components/navigation'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { healthEvents } from '../../mock/events'

export function HealthEventsPage() {
  const navigate = useNavigate()
  const member = useCurrentMember()
  const events = healthEvents.filter((event) => event.memberId === member.id)

  return (
    <main className="app-shell">
      <Header title="健康事件" />
      <div className="page-content">
        <MemberIdentityCard member={member} />

        <Card className="space-y-2 bg-primary-soft">
          <p className="font-semibold">不舒服？记一下</p>
          <p className="text-sm leading-relaxed text-text-secondary">持续记录症状和变化，帮助就诊前更清楚地整理健康信息。</p>
          <Button className="mt-2" onClick={() => navigate('/health-events/new')}>
            <Plus size={17} /> 创建健康事件
          </Button>
        </Card>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">最近健康事件</h2>
            <span className="text-xs text-text-secondary">共 {events.length} 项</span>
          </div>
          {events.length ? events.map((event) => <HealthEventCard key={event.id} event={event} />) : (
            <Card className="py-10 text-center">
              <p className="font-medium">暂无健康事件</p>
              <p className="mt-2 text-sm text-text-secondary">记录一次健康事件，轻松管理健康变化。</p>
            </Card>
          )}
        </section>
      </div>
      <BottomNavigation />
    </main>
  )
}

export function CreateHealthEventPage() {
  const navigate = useNavigate()
  const member = useCurrentMember()

  return (
    <main className="app-shell pb-8">
      <Header title="创建健康事件" back />
      <div className="page-content">
        <MemberIdentityCard member={member} />
        <Card className="space-y-4">
          <Input label="事件名称" placeholder="例如：发烧、咳嗽、腹痛" />
          <Input label="开始时间" type="datetime-local" />
          <p className="text-xs leading-relaxed text-text-secondary">请记录实际观察到的情况。Hoooho 不提供诊断、开药建议或治疗方案。</p>
          <Button fullWidth onClick={() => navigate('/health-events')}>保存健康事件</Button>
        </Card>
      </div>
    </main>
  )
}
