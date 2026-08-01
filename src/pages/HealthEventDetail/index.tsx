import { Clock3, FileText, Plus } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { Button, Card, Header, Tag } from '../../components/common'
import { MemberIdentityCard } from '../../components/health'
import { healthEvents } from '../../mock/events'
import { members } from '../../mock/members'
import { formatHealthDate } from '../../utils/formatDate'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const event = healthEvents.find((item) => item.id === eventId)
  if (!event) return <Navigate to="/health-events" replace />
  const member = members.find((item) => item.id === event.memberId) ?? members[0]

  return (
    <main className="app-shell pb-8">
      <Header title="健康事件详情" back />
      <div className="page-content">
        <MemberIdentityCard member={member} />
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{event.title}</h2>
            <Tag tone={event.status === 'ongoing' ? 'primary' : 'success'}>{event.status === 'ongoing' ? '持续中' : '已恢复'}</Tag>
          </div>
          <p className="text-sm text-text-secondary">创建于 {formatHealthDate(event.startedAt)}</p>
          <p className="text-sm leading-relaxed">{event.summary}</p>
        </Card>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">时间线</h2>
            <Button variant="ghost"><Plus size={16} /> 添加记录</Button>
          </div>
          {event.timeline.length ? event.timeline.map((entry) => (
            <Card key={entry.id} className="flex gap-3">
              <Clock3 className="mt-0.5 shrink-0 text-primary" size={18} />
              <div className="space-y-1">
                <time className="text-xs text-text-secondary">{formatHealthDate(entry.time)}</time>
                <p className="text-sm leading-relaxed">{entry.content}</p>
              </div>
            </Card>
          )) : <Card className="text-sm text-text-secondary">暂无时间线记录。</Card>}
        </section>

        <Card className="space-y-3">
          <div className="flex items-center gap-2"><FileText className="text-primary" size={18} /><h2 className="section-title">就诊信息整理</h2></div>
          <p className="text-sm leading-relaxed text-text-secondary">将事件摘要、时间线和健康档案整理在一起，便于就诊前查看。</p>
          <Button variant="secondary" fullWidth>查看整理摘要</Button>
        </Card>
      </div>
    </main>
  )
}
